# アーキテクチャドキュメント

## システム構成

### 技術スタック

```
Runtime:      Cloudflare Workers
Framework:    Hono v4
Language:     TypeScript v5.7.3
Package Mgr:  Bun v1.1.42
AI:           Anthropic Claude API v0.71.0
  - Claude Sonnet 4: 高品質記事評価
  - Claude Haiku: 中品質記事評価
Validation:   Valibot v1.0.2 (95% lighter than Zod)
Linter:       Biome v2.3.8 (50-100x faster than ESLint)
Testing:      Vitest v4.0.14

Storage:
  - KV:        キャッシュ・履歴
  - D1:        メトリクス・投稿履歴
  - Vectorize: 記事ベクトル検索（重複検出）
  - Workers AI: 埋め込み生成 (@cf/baai/bge-m3)

APIs:
  - Qiita API v2
  - X (Twitter) API v2
  - Anthropic Claude API
  - Slack Webhooks (オプション)
```

---

## システムアーキテクチャ図

```
┌─────────────────────────────────────────────────────────────┐
│                     Cloudflare Workers                      │
│                                                             │
│  ┌──────────────┐    ┌─────────────┐    ┌──────────────┐  │
│  │ Cron Trigger │───▶│ Hono Router │◀───│ HTTP Request │  │
│  └──────────────┘    └─────────────┘    └──────────────┘  │
│         │                   │                              │
│         ▼                   ▼                              │
│  ┌──────────────────────────────────────────────────────┐ │
│  │              Core Services Layer                     │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │ │
│  │  │   Article    │  │     Post     │  │  Metrics   │ │ │
│  │  │   Service    │  │   Service    │  │  Service   │ │ │
│  │  └──────────────┘  └──────────────┘  └────────────┘ │ │
│  └──────────────────────────────────────────────────────┘ │
│         │                   │                   │         │
│         ▼                   ▼                   ▼         │
│  ┌──────────────────────────────────────────────────────┐ │
│  │               External APIs Layer                    │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │ │
│  │  │  Qiita   │  │    X     │  │  Anthropic       │  │ │
│  │  │   API    │  │   API    │  │  Claude API      │  │ │
│  │  └──────────┘  └──────────┘  └──────────────────┘  │ │
│  └──────────────────────────────────────────────────────┘ │
│         │                   │                   │         │
│         ▼                   ▼                   ▼         │
│  ┌──────────────────────────────────────────────────────┐ │
│  │                Storage Layer                         │ │
│  │  ┌──────┐  ┌──────┐  ┌───────────┐  ┌───────────┐  │ │
│  │  │  KV  │  │  D1  │  │ Vectorize │  │ Workers   │  │ │
│  │  │      │  │      │  │           │  │    AI     │  │ │
│  │  └──────┘  └──────┘  └───────────┘  └───────────┘  │ │
│  └──────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 処理フロー

### 1. 記事投稿処理 (`/cron/post-articles`)

実行タイミング: 月・木 9:00 JST (UTC 0:00)

```
1. ArticleService.getNewArticles()
   ├─ Qiita APIから記事取得（ORG_MEMBERS指定）
   ├─ 前回実行時刻以降の記事のみフィルタ（KV: last_post_run）
   ├─ メタスコアリング（likes, stocks, tags, etc.）
   │  └─ スコア < DEFAULT_SCORE_THRESHOLD → 除外
   ├─ D1から投稿済み記事を除外
   └─ VectorServiceで類似記事を除外
      └─ 類似度 ≥ 0.8 → 除外（重複とみなす）

2. PostService.selectAndPostArticle()
   ├─ 記事が0件 → 終了
   ├─ メタスコアでソート（降順）
   ├─ 上位10件を選択
   ├─ AIEngine.evaluateBatch()
   │  ├─ トークン圧縮（compressForEvaluation）
   │  ├─ バッチ評価（1回のAPI呼び出し）
   │  ├─ スコア ≥35 → Sonnet 4
   │  ├─ スコア 20-34 → Haiku
   │  └─ スコア <20 → スキップ
   ├─ AIスコア最高の記事を選択
   ├─ AIEngine.generateTweetContent()
   │  └─ 投稿文生成（最適化済み記事から）
   ├─ XAPIClient.postTweet()
   └─ D1に投稿記録を保存
      └─ token_usage, posts テーブル

3. KVに実行時刻を記録（last_post_run）
```

### 2. メトリクス更新処理 (`/cron/update-metrics`)

実行タイミング: 毎日 2:00 JST (UTC 17:00)

```
1. MetricsService.updateMetrics()
   ├─ D1から最近の投稿を取得（過去30日）
   ├─ 各投稿のエンゲージメントを取得
   │  └─ XAPIClient.getTweetMetrics()
   │      └─ impressions, likes, retweets, replies
   ├─ D1のpostsテーブルを更新
   └─ learning_patternsテーブルに学習データを記録
      └─ 将来の投稿最適化に使用予定
```

### 3. 統計情報取得 (`/stats`)

```
1. D1から集計データを取得
   ├─ 総投稿数（COUNT）
   ├─ 総トークンコスト（SUM）
   ├─ 平均エンゲージメント率（AVG）
   └─ 最近の投稿履歴
2. JSONレスポンスを返す
```

---

## コスト最適化戦略

### 1. メタスコアフィルタリング

AI評価前に機械的スコアで低品質記事を除外。

**スコアリング基準** (`src/utils/scoring.ts`)

| 項目 | 最大スコア | 計算方法 |
|------|-----------|---------|
| いいね数 | 10 | `min(likes * 2, 10)` |
| ストック数 | 10 | `min(stocks * 2, 10)` |
| 鮮度 | 10 | 新しいほど高スコア（30日で減衰） |
| プレミアムタグ | 5 | 人気タグ存在で加点 |
| コメント数 | 5 | `min(comments, 5)` |
| 記事の充実度 | 5 | 本文長、コードブロック数で評価 |

**フィルタリング**:
- スコア < `DEFAULT_SCORE_THRESHOLD` (デフォルト: 25) → AI評価せず除外

**削減効果**: 約80%の記事を事前除外（200記事 → 40記事）

### 2. バッチ評価

複数記事を1回のAPI呼び出しでまとめて評価。

**実装** (`src/ai/engine.ts:evaluateBatch`)

```typescript
// 従来: N記事 × N回のAPI呼び出し
for (const article of articles) {
  await evaluateArticle(article);  // コスト: N回
}

// バッチ: N記事 × 1回のAPI呼び出し
await evaluateBatch(articles);  // コスト: 1回
```

**削減効果**: API呼び出し回数を90%削減（10記事の場合）

### 3. トークン圧縮

記事内容を圧縮してトークン消費を削減。

**圧縮技術** (`src/utils/tokens.ts`)

| 手法 | 削減率 | 実装 |
|------|--------|------|
| コードブロック圧縮 | 50-70% | `compressCodeBlocks()` |
| 画像URLの簡略化 | 100% | `[Image: description]` に置き換え |
| 重複セクション削除 | 20-30% | 類似段落の検出・除外 |
| キーセクション抽出 | 40-60% | 重要な段落のみ抽出 |

**削減効果**: 記事あたり平均73%のトークン削減（22,500 → 6,075トークン）

### 4. 動的モデル選択

記事の品質スコアに応じてAIモデルを使い分け。

| メタスコア | モデル | コスト倍率 | 用途 |
|-----------|--------|-----------|------|
| ≥35 | Sonnet 4 | 1.0x | 高品質記事の精密評価 |
| 20-34 | Haiku | 0.2x | 中品質記事の高速評価 |
| <20 | なし | 0x | 評価スキップ |

**削減効果**: 平均コストを60%削減

### 5. 差分処理

前回実行時刻以降の記事のみを処理。

**実装**:
- KVに `last_post_run` を記録
- Qiita API呼び出し時に `since` パラメータで絞り込み

**削減効果**: 処理対象記事を75%削減（200記事 → 50記事）

---

## データモデル

### KV Namespace

| Key | Type | Description |
|-----|------|-------------|
| `last_post_run` | string (ISO timestamp) | 最後の記事投稿処理実行時刻 |
| `article_cache:{id}` | JSON | 記事キャッシュ（重複検出用） |

### D1 Database

#### `posts` テーブル

```sql
CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  qiita_article_id TEXT NOT NULL,
  qiita_url TEXT NOT NULL,
  tweet_id TEXT,
  tweet_url TEXT,
  tweet_content TEXT NOT NULL,
  ai_score REAL,
  meta_score REAL,
  impressions INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  retweets INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0,
  posted_at TEXT NOT NULL,
  updated_at TEXT
);
```

#### `token_usage` テーブル

```sql
CREATE TABLE token_usage (
  id TEXT PRIMARY KEY,
  operation_type TEXT NOT NULL,  -- 'evaluation' or 'generation'
  model TEXT NOT NULL,            -- 'sonnet-4' or 'haiku'
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd REAL NOT NULL,
  article_count INTEGER DEFAULT 1,
  created_at TEXT NOT NULL
);
```

#### `learning_patterns` テーブル

```sql
CREATE TABLE learning_patterns (
  id TEXT PRIMARY KEY,
  pattern_type TEXT NOT NULL,     -- 'engagement', 'content', 'timing'
  pattern_data TEXT NOT NULL,     -- JSON
  engagement_rate REAL,
  sample_count INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT
);
```

#### `execution_logs` テーブル

```sql
CREATE TABLE execution_logs (
  id TEXT PRIMARY KEY,
  operation TEXT NOT NULL,        -- 'post', 'metrics', 'error'
  status TEXT NOT NULL,           -- 'success', 'error', 'partial'
  message TEXT,
  metadata TEXT,                  -- JSON
  created_at TEXT NOT NULL
);
```

#### `deduplication_log` テーブル

```sql
CREATE TABLE deduplication_log (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL,
  similar_article_id TEXT NOT NULL,
  similarity_score REAL NOT NULL,
  action TEXT NOT NULL,           -- 'skip' or 'post'
  created_at TEXT NOT NULL
);
```

### Vectorize Index

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Qiita記事ID |
| `values` | float[] | 768次元埋め込みベクトル |
| `metadata` | object | `{title, url, posted_at}` |

---

## API仕様

### エンドポイント

#### `GET /`

ヘルスチェックエンドポイント。

**レスポンス**:
```json
{
  "status": "ok",
  "message": "Qiita to X Auto Poster is running"
}
```

#### `GET /stats`

統計情報を取得。

**レスポンス**:
```json
{
  "total_posts": 42,
  "total_cost_usd": 0.156,
  "average_engagement_rate": 3.2,
  "recent_posts": [
    {
      "qiita_url": "https://qiita.com/...",
      "tweet_url": "https://twitter.com/...",
      "ai_score": 8.5,
      "impressions": 1200,
      "likes": 45,
      "posted_at": "2024-11-28T09:00:00Z"
    }
  ]
}
```

#### `GET /cron/post-articles`

記事評価・投稿処理を実行。

**トリガー**: Cron (月・木 9:00 JST)

**レスポンス**:
```json
{
  "success": true,
  "message": "Posted article",
  "article_id": "abc123",
  "tweet_url": "https://twitter.com/..."
}
```

#### `GET /cron/update-metrics`

投稿メトリクスを更新。

**トリガー**: Cron (毎日 2:00 JST)

**レスポンス**:
```json
{
  "success": true,
  "updated_count": 10
}
```

---

## セキュリティ

### 機密情報の管理

- **Secrets**: Wrangler Secretsで管理（環境変数には含めない）
- **API Keys**: リポジトリにコミットしない
- **Rate Limiting**: Cloudflare Workers標準機能で保護

### アクセス制御

- Cronエンドポイントは外部からアクセス可能だが、Cloudflare Workers内部からのみ実行推奨
- 本番環境では適切なアクセス制御（IP制限、認証など）を推奨

---

## パフォーマンス

### レスポンスタイム

| エンドポイント | 平均レスポンス時間 |
|---------------|------------------|
| `GET /` | 10ms |
| `GET /stats` | 50-100ms (D1クエリ) |
| `GET /cron/post-articles` | 5-15秒 (AI評価含む) |
| `GET /cron/update-metrics` | 2-5秒 (X API呼び出し) |

### リソース使用量

- **CPU Time**: 平均5秒/実行（無料枠: 10万リクエスト/日）
- **Memory**: 平均50MB（最大128MB）
- **KV Operations**: 10-20回/実行（無料枠: 10万読込/日）
- **D1 Operations**: 20-50回/実行（無料枠: 100万行読込/日）

---

## 将来の拡張予定

### 1. 学習機能の実装

`learning_patterns` テーブルを活用したエンゲージメント予測。

- 過去の投稿データから高エンゲージメントパターンを学習
- AI評価時に学習データを参考情報として追加
- 投稿タイミング最適化

### 2. A/Bテスト

複数の投稿文候補を生成し、エンゲージメント予測でベストを選択。

### 3. マルチアカウント対応

複数のXアカウントへの同時投稿。

### 4. Slack通知の拡充

エラー通知だけでなく、投稿成功時にも通知を送信。

---

## 参考資料

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Hono Framework](https://hono.dev/)
- [Anthropic Claude API](https://docs.anthropic.com/)
- [Qiita API v2](https://qiita.com/api/v2/docs)
- [X API v2](https://developer.twitter.com/en/docs/twitter-api)
