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

## クイックスタート

```bash
# 1. 依存パッケージのインストール
bun install

# 2. ローカル開発サーバー起動
bun run dev

# 3. テスト実行
bun test
```

## デプロイ

詳細なデプロイ手順は **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** を参照してください。

### 簡易手順

```bash
# 1. Cloudflareリソースの作成
npx wrangler kv:namespace create KV
npx wrangler d1 create qiita-bot-db
npx wrangler d1 execute qiita-bot-db --file=./schema.sql
npx wrangler vectorize create article-embeddings --dimensions=1024 --metric=cosine

# 2. wrangler.toml を編集（リソースIDを設定）

# 3. Secretsの設定
npx wrangler secret put QIITA_TOKEN
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put TWITTER_API_KEY
# ... (その他のSecrets)

# 4. デプロイ
npx wrangler deploy
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
