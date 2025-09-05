# 汎用スクレイピングRSS生成システム

GitHub Actions + GitHub Pagesを使用した、無料で動作する汎用的なRSS生成システムです。

## 概要

- **目的**: WebサイトをスクレイピングしてRSSフィードを自動生成
- **実行環境**: GitHub Actions（無料）
- **公開方法**: GitHub Pages（無料）
- **実行頻度**: 毎日午前6時（JST）
- **特徴**: 設定ファイルベースで新サイトを簡単追加可能
  - 前日とRSS内容が同じ場合はファイルを更新しません（無駄な更新・デプロイを抑制）

## 動的スクレイピングについて

一部のサイト（例：TechFeed）は、JavaScriptで動的にHTMLが生成されるため、通常の静的スクレイピング（axios + cheerio）では記事情報を取得できません。

このような場合は、[Puppeteer](https://pptr.dev/) を利用してブラウザを自動操作し、ページのレンダリング後のHTMLから情報を取得します。

### 設定方法

`config/sites.json` の対象サイト設定に `"usePuppeteer": true` を追加してください。

```json
{
   "techfeed": {
      "url": "https://techfeed.io/feeds/daily-ranking/{YYYY}/{M}/{D}",
      "usePuppeteer": true,
      ...
   }
}
```

### 注意事項

- PuppeteerはChromeを自動操作するため、実行環境によっては追加の依存（ライブラリ等）が必要な場合があります。
- サイトによっては動的要素の取得に待機処理（waitForSelector等）が必要です。
- スクレイピング対象のサイト構造が変わると、設定やコードの修正が必要になる場合があります。

## ディレクトリ構成

```
project-root/
├── .github/
│   └── workflows/
│       └── generate-rss.yml    # GitHub Actions設定
├── config/
│   └── sites.json              # サイト設定ファイル
├── src/
│   └── index.js                # メインスクレイピング処理
├── dist/                       # 生成されるRSSファイル（自動作成）
├── package.json                # 依存関係定義
└── README.md                   # このファイル
```

## 初回セットアップ

### 1. GitHubリポジトリ設定

1. 新しいリポジトリを作成
2. 上記ファイル構成でコードを配置
3. **Settings** → **Pages** → **Source**: Deploy from a branch → **Branch**: `gh-pages`
4. **Settings** → **Actions** → **General** → **Workflow permissions**: Read and write permissions

### 2. 設定ファイル更新

`src/index.js`の以下箇所を自分の環境に更新：

```javascript
// GitHub PagesのURLを設定
const baseUrl = process.env.GITHUB_PAGES_URL || 'https://yourusername.github.io/your-repo-name';

// User-Agentも更新推奨
'User-Agent': 'Mozilla/5.0 (compatible; RSS-Generator/1.0; +https://github.com/yourusername/rss-generator)'
```

### 3. 手動テスト実行

1. **Actions**タブ → **Generate RSS Feeds** → **Run workflow**
2. 成功すると`https://yourusername.github.io/your-repo-name/`でRSSが確認可能

## システム構成

### メインコンポーネント

1. **GenericScraper クラス** (`src/index.js`)
   - 汎用スクレイピング処理
   - 設定ファイルベースの柔軟な抽出

2. **RSSGenerator クラス** (`src/index.js`)
   - RSS XML生成
   - カスタム要素対応

3. **設定ファイル** (`config/sites.json`)
   - サイト別スクレイピング設定
   - RSS出力設定

### 実行フロー

```
GitHub Actions起動
↓
Node.js環境セットアップ
↓
依存関係インストール (npm install)
↓
各サイトをスクレイピング
↓
RSS XML生成
↓
【前日と内容が同じ場合はスキップ】
↓
GitHub Pagesにデプロイ
```

## 新サイト追加方法

### 1. サイトのHTML構造調査

対象ページで開発者ツールを開き、以下を特定：

- 記事一覧の親要素セレクター
- タイトル、リンク、作者などの子要素セレクター
- 特別な処理が必要なデータ形式

### 2. 設定追加

`config/sites.json`に新サイト設定を追加：

```json
{
  "existing-site": { /* 既存設定 */ },
  "new-site-key": {
    "name": "サイト表示名",
    "description": "サイトの説明",
    "url": "https://example.com/articles",
    "outputFile": "new-site.xml",
    "scraping": {
      "itemSelector": ".article-item",
      "fields": {
        "title": {
          "selector": ".title",
          "attribute": "text"
        },
        "link": {
          "selector": ".title a",
          "attribute": "href",
          "prefix": "https://example.com"  // 相対URLの場合
        },
        "author": {
          "selector": ".author",
          "attribute": "text"
        }
      }
    },
    "rssConfig": {
      "title": "RSS フィード名",
      "description": "RSS の説明",
      "site_url": "https://example.com",
      "language": "ja",
      "ttl": 60
    }
  }
}
```

### 3. テスト実行

手動実行で動作確認後、本番環境にプッシュ

## メンテナンス

### 定期メンテナンス項目

1. **HTMLセレクター確認**（月1回推奨）
   - サイトデザイン変更でセレクターが無効になる可能性
   - Actionsログでエラーがないか確認

2. **依存関係更新**（3ヶ月に1回）
   ```bash
   npm update
   ```

3. **利用規約確認**（半年に1回）
   - 対象サイトのスクレイピング規約変更チェック

### トラブルシューティング

#### Actions実行失敗

1. **権限エラー**
   - Settings → Actions → General → Workflow permissions確認

2. **スクレイピングエラー**
   - 対象サイトのHTML構造変更
   - セレクター設定を再調査・更新

3. **GitHub Pages表示されない**
   - Pages設定で`gh-pages`ブランチ選択確認
   - Actions完了後、数分待機

#### RSS生成されない

1. **セレクター無効**
   ```javascript
   // デバッグ用コード追加
   console.log('Found elements:', $(this.config.scraping.itemSelector).length);
   ```

2. **データ抽出失敗**
   - 各フィールドセレクターを個別確認
   - ブラウザの開発者ツールで要素存在確認

#### ローカルテスト方法

```bash
# 依存関係インストール
npm install

# ローカル実行
npm run dev

# 生成結果確認
# dist/フォルダ内にXMLファイルが作成される
```

## 設定例集

### よくあるサイト構造パターン

#### パターン1: シンプルなリスト

```json
"scraping": {
  "itemSelector": "article",
  "fields": {
    "title": { "selector": "h2", "attribute": "text" },
    "link": { "selector": "h2 a", "attribute": "href" },
    "author": { "selector": ".author", "attribute": "text" }
  }
}
```

#### パターン2: 複雑な構造

```json
"scraping": {
  "itemSelector": ".post-item",
  "fields": {
    "title": { "selector": ".post-title a", "attribute": "text" },
    "link": { "selector": ".post-title a", "attribute": "href" },
    "date": { 
      "selector": ".post-date", 
      "attribute": "text"
    },
    "author": { "selector": ".author", "attribute": "text" }
  }
}
```

#### パターン3: 隣接要素取得（Qiitaパターン）

```json
"scraping": {
  "itemSelector": "h3",
  "fields": {
    "title": { "selector": "a", "attribute": "text" },
    "author": { 
      "selector": "+ p .author", 
      "attribute": "text" 
    }
  }
}
```

## セキュリティ考慮事項

1. **User-Agent設定**
   - 適切なUser-Agentでアクセス元を明示

2. **アクセス頻度制限**
   - 現在: 毎日（午前6時 JST）
   - 過度なアクセスは避ける

3. **エラーハンドリング**
   - タイムアウト設定（30秒）
   - 失敗時の適切なログ出力

4. **利用規約遵守**
   - 各サイトのrobots.txt確認
   - スクレイピング許可範囲の確認

## GitHub Actions設定詳細

### cron設定解説

```yaml
schedule:
  # 毎日 6:00 JST = 毎日 21:00 UTC
  - cron: '0 21 * * *'
```

### 実行頻度変更

週1回に変更する場合：
```yaml
schedule:
  # 毎週日曜日 6:00 JST
  - cron: '0 21 * * 0'
```

## 仕様補足

- RSSファイルは毎日生成処理を行いますが、前日と内容が同じ場合はファイルを上書きしません。
  - これにより、無駄なGitHub Pagesのデプロイや不要な更新を防ぎます。
  - 差分判定は `<pubDate>` や `<lastBuildDate>` などの可変部分を除外し、実質的な内容が変わった場合のみ上書きします。
- この仕様は `src/index.js` の「ファイル保存（前回と内容が同じならスキップ）」ロジックで実現しています。

## 拡張可能性

### 将来の機能拡張アイデア

1. **通知機能**
   - Discord/Slack通知
   - 実行結果をWebhookで送信

2. **データベース連携**
   - 重複記事の除外
   - 履歴データの保持

3. **多言語対応**
   - 英語サイト対応
   - 文字エンコーディング対応

4. **高度なスクレイピング**
   - Puppeteer導入でJavaScript対応
   - 画像取得・リサイズ

### プログラム改修時の注意点

1. **後方互換性**
   - 設定ファイル形式変更時は移行ガイド作成

2. **エラーハンドリング強化**
   - 部分的な失敗でも他サイトは継続実行

3. **パフォーマンス**
   - 同時実行数制限
   - メモリ使用量監視

## ライセンス・免責事項

- MITライセンス
- 各サイトの利用規約は利用者が確認・遵守すること
- スクレイピングによるサイトへの負荷は利用者の責任

---

**作成者向けメモ**: このREADMEは将来の自分が迷わないよう、実装詳細とメンテナンス手順を詳細に記載しました。新サイト追加時は必ずテスト実行を行い、正常動作確認後に本番反映してください。