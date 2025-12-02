# Qiita to X Auto Poster with AI

Qiita記事をAIで評価・要約してX (Twitter)に自動投稿するシステム。
AIトークンコストを**99%以上削減**する最適化により、**超低コスト**での運用を実現。

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

## 技術スタック

### ランタイム・フレームワーク
- **Cloudflare Workers**: エッジコンピューティング環境
- **Hono**: 高速な軽量Webフレームワーク
- **Bun**: 高速なJavaScriptランタイム

### AI・API
- **Anthropic Claude API v0.71.0**: Sonnet 4 / Haiku を動的選択
- **Qiita API**: 記事取得
- **X API v2**: 投稿・エンゲージメント取得

### データ管理
- **Valibot**: 軽量バリデーション（Zodより95%小さい、tree-shakable）
- **Cloudflare KV**: キャッシュ・履歴管理
- **Cloudflare D1**: メトリクス・投稿履歴
- **Cloudflare Vectorize**: 記事の類似度検索（重複排除）
- **Workers AI**: 埋め込みベクトル生成（@cf/baai/bge-m3）

### 開発ツール
- **TypeScript**: 型安全な開発
- **Biome v2.3.8**: 超高速Linter/Formatter（ESLint/Prettierより50-100x速い）
- **Vitest v4.0.14**: 最新テストフレームワーク
- **Wrangler v4**: Cloudflare Workers CLI

## アーキテクチャ

```
Runtime: Cloudflare Workers + Hono
AI: Anthropic Claude API (Sonnet 4 / Haiku)
Storage:
  - KV: キャッシュ・実行履歴
  - D1: メトリクス・投稿履歴・学習データ
  - Vectorize: 記事の埋め込みベクトル（重複排除）
APIs:
  - Qiita API (記事取得)
  - X API v2 (投稿・メトリクス)
  - Workers AI (ベクトル生成)
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
wrangler kv:namespace create KV
wrangler d1 create qiita-bot-db
wrangler d1 execute qiita-bot-db --file=./schema.sql
wrangler vectorize create article-embeddings --dimensions=1024 --metric=cosine

# 2. wrangler.toml を編集（リソースIDを設定）

# 3. Secretsの設定
wrangler secret put QIITA_TOKEN
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put TWITTER_API_KEY
# ... (その他のSecrets)

# 4. デプロイ
wrangler deploy
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
qiita-x-post/
├── src/
│   ├── index.ts              # メインエントリポイント（Hono app）
│   ├── types/
│   │   ├── common.ts         # 共通型定義（Env, ArticleScore等）
│   │   ├── schemas.ts        # Valibotスキーマ定義
│   │   ├── qiita.ts          # Qiita API型定義
│   │   └── ai.ts             # AI評価型定義
│   ├── services/
│   │   ├── articleService.ts # 記事取得・フィルタリング
│   │   ├── postService.ts    # 投稿処理オーケストレーション
│   │   └── metricsService.ts # エンゲージメント更新
│   ├── api/
│   │   ├── qiita.ts          # Qiita APIクライアント
│   │   ├── x.ts              # X APIクライアント
│   │   └── slack.ts          # Slack通知
│   ├── ai/
│   │   └── engine.ts         # AI評価・要約エンジン
│   └── utils/
│       ├── scoring.ts        # メタスコアリング関数
│       ├── tokens.ts         # トークン圧縮・最適化
│       ├── vector.ts         # Vectorize操作（VectorService）
│       └── db.ts             # D1データベース操作
├── schema.sql                # D1データベーススキーマ
├── wrangler.toml             # Cloudflare Workers設定
├── biome.json                # Biome設定
├── vitest.config.ts          # Vitest設定
└── package.json
```

## コスト試算（推定値）

> **注意**: 以下は理論的な試算であり、実際の運用コストは記事数や内容によって変動します。

### 最適化前（想定）
- 記事評価: 200記事 × 22,500 tokens ≈ **$13.50/月**
- 投稿文生成: 8回 × 15,000 tokens ≈ **$0.36/月**
- **合計: 約$14/月**

### 最適化後（想定）
- メタスコアフィルタリングで評価対象を **97%削減**（200記事 → 5記事）
- バッチ処理とトークン圧縮で **73%削減**（22,500 tokens → 1,500 tokens）
- 記事評価: 5記事 × 1,500 tokens ≈ **$0.02/月**
- 投稿文生成: 8回 × 2,000 tokens ≈ **$0.02/月**
- **合計: 約$0.04/月**

**推定削減率: 99%以上**

### コスト削減の仕組み
1. **メタスコアフィルタリング**: AI評価前にスコアリングで低品質記事を除外
2. **バッチ評価**: 複数記事を1回のAPI呼び出しで処理
3. **トークン圧縮**: コードブロック圧縮、画像簡略化、要約抽出
4. **動的モデル選択**: スコアに応じてSonnet/Haikuを使い分け
5. **ベクトル重複排除**: Vectorizeで類似記事を事前除外
6. **差分処理**: 前回実行以降の新規記事のみ処理

## ライセンス

MIT
