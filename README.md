# Qiita to X Auto Poster with AI

Qiita記事をAIで評価・要約してX (Twitter)に自動投稿するシステム。
**月額$1以下**で運用でき、AIトークンコストを**99%以上削減**する最適化を実装。

## 特徴

### コスト最適化
- **メタスコアフィルタリング**: AI評価前に機械的スコアで低品質記事を除外
- **バッチ処理**: 複数記事を1回のAPI呼び出しでまとめて評価
- **トークン圧縮**: コードブロック圧縮、画像簡略化などで73%削減
- **動的モデル選択**: スコアに応じてSonnet/Haikuを使い分け
- **差分処理**: 前回実行時刻以降の記事のみを処理

### 高品質投稿
- Claude AIによる記事評価（技術的価値、内容の質、シェア価値）
- 自動要約・投稿文生成
- エンゲージメント学習機能（計画中）

### 完全自動化
- Cloudflare Workers Cron Triggers
- 月・木 9:00に記事投稿
- 毎日 2:00にメトリクス更新
- 運用負荷ゼロ

## アーキテクチャ

```
Runtime: Cloudflare Workers
Framework: Hono
AI: Anthropic Claude API (Sonnet 4 / Haiku)
Storage:
  - KV: キャッシュ・履歴
  - D1: メトリクス・投稿履歴
  - Vectorize: ベクトル検索（計画中）
APIs:
  - Qiita API (記事取得)
  - X API v2 (投稿)
```

## セットアップ

### 0. Bunのインストール（未インストールの場合）

```bash
curl -fsSL https://bun.sh/install | bash
```

### 1. 依存パッケージのインストール

```bash
bun install
```

### 2. Cloudflareリソースの作成

```bash
# KV Namespace
wrangler kv:namespace create KV

# D1 Database
wrangler d1 create qiita-bot-db

# データベーススキーマの適用
wrangler d1 execute qiita-bot-db --file=./schema.sql

# Vectorize Index (オプション)
wrangler vectorize create article-embeddings --dimensions=768 --metric=cosine
```

### 3. wrangler.tomlの設定

`wrangler.toml`を編集して、作成したリソースのIDを設定:

```toml
[[kv_namespaces]]
binding = "KV"
id = "your_kv_namespace_id"  # 手順2で取得したID

[[d1_databases]]
binding = "DB"
database_id = "your_d1_database_id"  # 手順2で取得したID

[vars]
ORG_MEMBERS = "your_qiita_id_1,your_qiita_id_2"  # Qiita IDをカンマ区切りで指定
```

### 4. Secretsの設定

```bash
# Qiita API Token
wrangler secret put QIITA_TOKEN

# Anthropic API Key
wrangler secret put ANTHROPIC_API_KEY

# X (Twitter) API Credentials
wrangler secret put TWITTER_API_KEY
wrangler secret put TWITTER_API_SECRET
wrangler secret put TWITTER_ACCESS_TOKEN
wrangler secret put TWITTER_ACCESS_SECRET
wrangler secret put TWITTER_BEARER_TOKEN

# Slack Webhook (オプション)
wrangler secret put SLACK_WEBHOOK_URL
```

### 5. APIキーの取得方法

#### Qiita API Token
1. https://qiita.com/settings/tokens にアクセス
2. 「新しくトークンを発行する」をクリック
3. スコープ: `read_qiita` を選択

#### Anthropic API Key
1. https://console.anthropic.com/ にアクセス
2. API Keysから新しいキーを作成

#### X (Twitter) API
1. https://developer.twitter.com/ にアクセス
2. Appを作成し、OAuth 1.0a認証情報を取得
3. Read and Write権限を付与

#### Slack Webhook (オプション)
1. https://api.slack.com/apps にアクセス
2. Incoming Webhooksを有効化

## デプロイ

```bash
# 本番デプロイ
wrangler deploy

# ログ確認
wrangler tail
```

## 開発

```bash
# ローカル開発サーバー起動
bun run dev

# 手動でCronジョブをテスト
curl http://localhost:8787/cron/post-articles
```

## エンドポイント

- `GET /`: ヘルスチェック
- `GET /stats`: 統計情報（投稿数、コスト、エンゲージメント率）
- `GET /cron/post-articles`: 記事投稿処理（Cron用）
- `GET /cron/update-metrics`: メトリクス更新（Cron用）

## プロジェクト構造

```
qiita-x-bot/
├── src/
│   ├── index.ts              # メインエントリポイント
│   ├── types/
│   │   ├── qiita.ts         # Qiita型定義
│   │   ├── ai.ts            # AI型定義
│   │   └── common.ts        # 共通型定義
│   ├── api/
│   │   ├── qiita.ts         # Qiita APIクライアント
│   │   ├── x.ts             # X APIクライアント
│   │   └── slack.ts         # Slack通知
│   ├── ai/
│   │   └── engine.ts        # AI評価・要約エンジン
│   └── utils/
│       ├── scoring.ts       # スコアリング関数
│       └── tokens.ts        # トークン最適化
├── schema.sql               # D1データベーススキーマ
├── wrangler.toml            # Cloudflare Workers設定
└── package.json
```

## コスト試算

### 最適化前
- 記事評価: 200記事 × 22,500 tokens = **$13.50/月**
- 投稿文生成: 8回 × 15,000 tokens = **$0.36/月**
- **合計: $13.86/月 = $166/年**

### 最適化後
- 記事評価: 5記事 × 1,500 tokens (バッチ) = **$0.02/月**
- 投稿文生成: 8回 × 2,000 tokens = **$0.017/月**
- **合計: $0.037/月 = $0.44/年**

**削減率: 99.7%**
**削減額: $165.56/年**

## ライセンス

MIT
