// src/index.js
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const RSS = require('rss');

// 設定ファイル読み込み
const sitesConfig = require('../config/sites.json');

// 汎用スクレイパークラス
class GenericScraper {
  constructor(siteConfig) {
    this.config = siteConfig;
  }

  async scrape() {
    try {
      console.log(`Scraping ${this.config.name}...`);
      
      // ページを取得
      const response = await axios.get(this.config.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RSS-Generator/1.0; +https://github.com/MarchMD03/rss-generator)'
        },
        timeout: 30000
      });

      const $ = cheerio.load(response.data);
      const items = [];

      // 記事データを抽出
      $(this.config.scraping.itemSelector).each((index, element) => {
        const item = {};
        
        // 各フィールドを抽出
        Object.entries(this.config.scraping.fields).forEach(([key, fieldConfig]) => {
          let $el = $(element).find(fieldConfig.selector);
          
          // セレクターが隣接セレクターを使用している場合の特別処理
          if (fieldConfig.selector.startsWith('+ p')) {
            $el = $(element).next('p').find(fieldConfig.selector.replace('+ p ', ''));
          }
          
          let value = '';

          // 複数の値を取得する場合
          if (fieldConfig.multiple) {
            const values = [];
            $el.each((i, el) => {
              values.push($(el).text().trim());
            });
            value = values;
          } else {
            // 単一の値を取得
            switch (fieldConfig.attribute) {
              case 'text':
                value = $el.text().trim();
                break;
              case 'href':
                value = $el.attr('href');
                if (fieldConfig.prefix && value && !value.startsWith('http')) {
                  value = fieldConfig.prefix + value;
                }
                break;
              default:
                value = $el.attr(fieldConfig.attribute);
            }
          }

          // データ変換処理
          if (fieldConfig.transform) {
            value = this.transformData(value, fieldConfig.transform);
          }

          item[key] = value;
        });

        // 基本的な検証
        if (item.title && item.link) {
          items.push(item);
        }
      });

      console.log(`Found ${items.length} items for ${this.config.name}`);
      return items;

    } catch (error) {
      console.error(`Error scraping ${this.config.name}:`, error.message);
      return [];
    }
  }

  // データ変換関数
  transformData(value, transformType) {
    switch (transformType) {
      case 'parseQiitaDate':
        // Qiitaの日付形式を処理 (例: "2023年12月01日")
        if (value) {
          const match = value.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
          if (match) {
            return new Date(`${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`);
          }
        }
        return new Date();
      case 'extractLikes':
        // いいね数を抽出 (例: ":like: +290" → "290")
        if (value) {
          const match = value.match(/\+(\d+)/);
          return match ? parseInt(match[1]) : 0;
        }
        return 0;
      case 'createDescription':
        // タイトルを元に説明を生成
        return value ? `${value}` : '';
      default:
        return value;
    }
  }
}

// RSS生成クラス
class RSSGenerator {
  constructor(siteConfig) {
    this.config = siteConfig;
  }

  generate(items) {
    // GitHub PagesのURLを設定
    const baseUrl = process.env.GITHUB_PAGES_URL || 'https://marchmd03.github.io/rss-generator';
    
    const rssConfig = {
      ...this.config.rssConfig,
      feed_url: `${baseUrl}/${this.config.outputFile}`,
      generator: 'Generic RSS Generator',
      managingEditor: 'RSS Generator',
      webMaster: 'RSS Generator',
      language: this.config.rssConfig.language || 'ja',
      pubDate: new Date(),
      ttl: this.config.rssConfig.ttl || 60
    };

    const feed = new RSS(rssConfig);

    // 記事をRSSに追加
    items.forEach((item, index) => {
      // 詳細な説明を生成
      let description = item.description || item.title;
      if (item.author) {
        description += ` by ${item.author}`;
      }
      if (item.tags && Array.isArray(item.tags) && item.tags.length > 0) {
        description += ` | タグ: ${item.tags.join(', ')}`;
      }
      if (item.likes && item.likes > 0) {
        description += ` | ${item.likes} いいね`;
      }

      feed.item({
        title: item.title,
        description: description,
        url: item.link,
        author: item.author || 'Qiita',
        date: item.pubDate || new Date(),
        // カスタムフィールド
        custom_elements: [
          { 'qiita:likes': item.likes || 0 },
          { 'qiita:author_link': item.authorLink || '' },
          { 'qiita:tags': (item.tags || []).join(',') }
        ]
      });
    });

    return feed.xml();
  }
}

// メイン実行関数
async function main() {
  try {
    // 出力ディレクトリを作成
    await fs.ensureDir('./dist');

    // 各サイトを処理
    for (const [siteKey, siteConfig] of Object.entries(sitesConfig)) {
      console.log(`\n=== Processing ${siteKey} ===`);
      
      // スクレイピング実行
      const scraper = new GenericScraper(siteConfig);
      const items = await scraper.scrape();

      if (items.length === 0) {
        console.log(`No items found for ${siteKey}, skipping RSS generation`);
        continue;
      }

      // RSS生成
      const rssGenerator = new RSSGenerator(siteConfig);
      const rssXml = rssGenerator.generate(items);

      // ファイル保存（前回と内容が同じならスキップ）
      const outputPath = path.join('./dist', siteConfig.outputFile);
      let shouldWrite = true;
      if (fs.existsSync(outputPath)) {
        const prevXml = await fs.readFile(outputPath, 'utf8');
        // pubDateや最終更新日など可変部分を除外して比較（簡易: <item>部分のみ比較）
        const stripDynamic = xml => xml.replace(/<pubDate>.*?<\/pubDate>/g, '').replace(/<lastBuildDate>.*?<\/lastBuildDate>/g, '');
        if (stripDynamic(prevXml) === stripDynamic(rssXml)) {
          console.log(`No change detected for ${siteKey}, skipping overwrite.`);
          shouldWrite = false;
        }
      }
      if (shouldWrite) {
        await fs.writeFile(outputPath, rssXml, 'utf8');
        console.log(`RSS saved to ${outputPath}`);
      }
    }

    // インデックスページ作成
    await generateIndexPage();
    
    console.log('\n=== RSS generation completed ===');

  } catch (error) {
    console.error('Error in main process:', error);
    process.exit(1);
  }
}

// インデックスページ生成
async function generateIndexPage() {
  const feeds = Object.entries(sitesConfig).map(([key, config]) => ({
    name: config.name,
    description: config.description,
    file: config.outputFile,
    url: config.url
  }));

  const html = `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RSS Feeds</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .feed { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .feed h3 { margin: 0 0 10px 0; }
        .rss-link { display: inline-block; background: #ff6600; color: white; padding: 5px 10px; text-decoration: none; border-radius: 3px; }
        .source-link { margin-left: 10px; }
        .updated { font-size: 0.9em; color: #666; }
    </style>
</head>
<body>
    <h1>RSS Feeds</h1>
    <div class="updated">最終更新: ${new Date().toLocaleString('ja-JP')}</div>
    
    ${feeds.map(feed => `
    <div class="feed">
        <h3>${feed.name}</h3>
        <p>${feed.description}</p>
        <a href="${feed.file}" class="rss-link">RSS</a>
        <a href="${feed.url}" class="source-link" target="_blank">元サイト</a>
    </div>
    `).join('')}
    
    <footer style="margin-top: 50px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #666;">
        <p>Generated by <a href="https://github.com/yourusername/your-repo-name">RSS Generator</a></p>
    </footer>
</body>
</html>
`;

  await fs.writeFile('./dist/index.html', html, 'utf8');
  console.log('Index page generated');
}

// 実行
if (require.main === module) {
  main();
}

module.exports = { GenericScraper, RSSGenerator };