# Qiita記事自動投稿システム - Claude Code引き継ぎドキュメント

## プロジェクト概要

### 目的
自社メンバーが投稿したQiita記事を、AIで評価・要約してX(Twitter)に自動投稿するシステムを構築する。

### ビジネス要件
1. **極力コストがかからないこと** (目標: 月額$1以下)
2. **モダンでイケてる実装** (技術記事化を前提)
3. **運用負荷ゼロ** (完全自動化)
4. **高品質な投稿** (AI評価で記事を選定)

### 技術的目標
- AIトークンコストを99%以上削減
- 重複投稿の防止
- エンゲージメント学習による継続的改善

---

## システムアーキテクチャ

### 技術スタック（確定）

```
Runtime: Cloudflare Workers (エッジコンピューティング)
Framework: Hono (軽量Webフレームワーク)
AI: Anthropic Claude API (Sonnet 4 / Haiku)
Storage: 
  - KV Storage (キャッシュ・履歴)
  - D1 Database (メトリクス)
  - Vectorize (ベクトル検索)
External APIs:
  - Qiita API (記事取得)
  - X API v2 (投稿)
  - Workers AI (埋め込み生成)
```

### アーキテクチャ図

```
[Qiita API] 
    ↓ 記事取得
[差分処理] → 新規・更新記事のみ
    ↓
[メタデータ拡張] → トレンドスコア、著者スコア等
    ↓
[メタスコアフィルタ] → 閾値以下を除外（AI不使用）
    ↓
[ベクトル重複除去] → 過去投稿と類似記事を除外
    ↓
[バッチAI評価] → 複数記事をまとめて評価
    ↓
[動的モデル選択] → スコアに応じてSonnet/Haiku使い分け
    ↓
[投稿文生成] → プロンプト最適化 + Few-Shot Learning
    ↓
[X API投稿]
    ↓
[メトリクス記録] → 学習データとして蓄積
```

---

## 最適化戦略（10段階）

### 1. 差分処理（Incremental Processing）
- 前回実行時刻以降の記事のみを取得
- 全記事を毎回評価しない
- **効果**: API呼び出し削減、処理時間短縮

### 2. メタスコアフィルタリング
- AI評価前に機械的スコアリング
- いいね数、ストック数、鮮度、タグ等で評価
- **効果**: 低品質記事を早期除外（AIコスト削減）

### 3. メタデータ拡張
記事に以下の情報を付与:
- トレンドスコア (タグのトレンド度)
- 著者スコア (過去実績)
- 鮮度スコア (投稿からの経過日数)
- 完成度スコア (見出し、コード例、画像の有無)
- SEOスコア (タイトル最適化度)

### 4. ベクトル重複除去
- Workers AIで記事の埋め込み生成（無料）
- 過去50投稿との類似度計算
- 80%以上類似なら除外
- **効果**: 類似内容の繰り返し投稿防止

### 5. トークン最適化（記事評価用）
記事本文の圧縮:
- コードブロック: 長いコードは要約（最初10行+最後5行）
- 画像: `![alt](url)` → `[画像: alt]`
- 構造解析: 重要セクションのみ抽出
- **効果**: 22,500 tokens → 6,000 tokens (73%削減)

### 6. トークン最適化（投稿文生成用）
記事要約の圧縮:
- 核心ポイント抽出（タイトル、導入、結論）
- フック要素抽出（数値、比較、問題提起）
- **効果**: 15,000 tokens → 3,000 tokens (80%削減)

### 7. バッチ処理
- 複数記事を1回のAPI呼び出しで評価
- 5記事まとめて処理
- **効果**: API呼び出し回数削減、レイテンシ削減

### 8. 多層キャッシュ戦略
```
L1: メモリキャッシュ (Worker内、1分)
L2: KV Storage (グローバル、動的TTL)
動的TTL: 人気記事ほど長期キャッシュ
```
- **効果**: 重複AI呼び出し防止

### 9. 動的モデル選択
- 高スコア記事(35+): Claude Sonnet (高品質)
- 中スコア記事(20-34): Claude Haiku (効率)
- 低スコア記事(<20): AI評価スキップ
- **効果**: コスト最適化とバランス

### 10. エンゲージメント学習
- 投稿後のインプレッション・エンゲージメント取得
- 成功パターンを分析
- Few-Shot Examplesとしてプロンプトに活用
- **効果**: 投稿品質の継続的改善

---

## 処理フロー（詳細）

### Cron実行（月・木 9:00）

```typescript
1. 差分記事取得
   - Qiita API: 前回実行時刻以降の記事
   - 例: 20記事/月

2. メタデータ拡張
   - 各記事に拡張スコア付与
   - 処理: 20記事 → 20記事（全通過）

3. メタスコアフィルタ
   - 閾値25点以上のみ通過
   - 処理: 20記事 → 8記事（AI評価候補）

4. ベクトル重複除去
   - Workers AIで埋め込み生成
   - 過去50投稿と類似度計算
   - 80%以上類似を除外
   - 処理: 8記事 → 5記事（ユニーク記事）

5. バッチAI評価
   - 5記事を1回のAPI呼び出しで評価
   - 各記事300文字に圧縮
   - 総トークン: 1,500 tokens × 1回
   - スコア35点以上を推奨記事として抽出

6. 最高スコア記事選定
   - 推奨記事の中から最高スコアを選択

7. 投稿文生成
   - 記事を3,000 tokensに最適化
   - 過去の成功事例をFew-Shot Examplesとして使用
   - モデル: Haiku (通常) / Sonnet (重要記事)

8. X投稿実行
   - 投稿文 + URL + ハッシュタグ

9. 履歴保存
   - KV: 投稿済みフラグ
   - D1: メトリクス（スコア、モデル、トークン数）
   - Vectorize: 埋め込み保存

10. Slack通知
    - 投稿完了を通知
```

### Cron実行（毎日 2:00）

```typescript
1. エンゲージメント更新
   - X APIから過去7日の投稿メトリクス取得
   - D1を更新 (impressions, engagements)

2. パターン学習
   - 高エンゲージメント投稿の分析
   - 最適投稿時間、効果的ハッシュタグ、成功パターン抽出

3. インサイト保存
   - KVに学習結果を保存（7日間）
```

---

## ディレクトリ構造

```
qiita-x-bot/
├── src/
│   ├── index.ts                 # メインエントリポイント
│   ├── types/
│   │   ├── qiita.ts            # Qiita API型定義
│   │   ├── openai.ts           # OpenAI型定義
│   │   └── common.ts           # 共通型定義
│   ├── api/
│   │   ├── qiita.ts            # Qiita API クライアント
│   │   ├── x.ts                # X API クライアント
│   │   └── slack.ts            # Slack通知
│   ├── ai/
│   │   └── engine.ts           # AI評価・要約エンジン
│   ├── optimization/
│   │   ├── evaluator.ts        # 記事評価用最適化
│   │   ├── summarizer.ts       # 投稿文用最適化
│   │   ├── cache-strategy.ts  # キャッシュ戦略
│   │   ├── vector-dedup.ts     # ベクトル重複除去
│   │   ├── batch-processor.ts  # バッチ処理
│   │   ├── prompt-optimizer.ts # プロンプト最適化
│   │   ├── metadata-enricher.ts # メタデータ拡張
│   │   ├── incremental.ts      # 差分処理
│   │   └── model-selector.ts   # 動的モデル選択
│   ├── learning/
│   │   └── engagement-learner.ts # エンゲージメント学習
│   └── utils/
│       ├── scoring.ts          # スコアリング関数
│       └── tokens.ts           # トークン推定
├── schema.sql                   # D1 データベーススキーマ
├── wrangler.toml               # Cloudflare Workers設定
├── package.json
└── tsconfig.json
```

---

## データベーススキーマ

```sql
-- 投稿履歴
CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id TEXT NOT NULL UNIQUE,
  article_title TEXT NOT NULL,
  article_url TEXT NOT NULL,
  author_id TEXT NOT NULL,
  tweet_id TEXT NOT NULL,
  tweet_text TEXT NOT NULL,
  hashtags TEXT, -- JSON array
  score INTEGER NOT NULL,
  meta_score INTEGER,
  ai_model TEXT,
  posted_at TEXT NOT NULL,
  impressions INTEGER DEFAULT 0,
  engagements INTEGER DEFAULT 0,
  engagement_rate REAL GENERATED ALWAYS AS (
    CASE WHEN impressions > 0 
    THEN (engagements * 100.0 / impressions)
    ELSE 0 END
  ) VIRTUAL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_posted_at ON posts(posted_at);
CREATE INDEX idx_engagement_rate ON posts(engagement_rate DESC);

-- トークン使用量
CREATE TABLE token_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd REAL NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_token_usage_date ON token_usage(created_at);

-- キャッシュ統計
CREATE TABLE cache_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cache_key TEXT NOT NULL,
  hit BOOLEAN NOT NULL,
  created_at TEXT NOT NULL
);

-- 重複除外ログ
CREATE TABLE deduplication_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id TEXT NOT NULL,
  similar_to_article_id TEXT NOT NULL,
  similarity_score REAL NOT NULL,
  created_at TEXT NOT NULL
);

-- 学習パターン
CREATE TABLE learning_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern_type TEXT NOT NULL,
  pattern_data TEXT NOT NULL, -- JSON
  performance_score REAL NOT NULL,
  sample_size INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
```

---

## 環境変数・Secrets

### wrangler.toml

```toml
name = "qiita-x-bot"
main = "src/index.ts"
compatibility_date = "2025-11-07"

[triggers]
crons = [
  "0 9 * * 1,4",  # 記事投稿: 月・木 9:00
  "0 2 * * *"     # メトリクス更新: 毎日 2:00
]

[ai]
binding = "AI"

[[kv_namespaces]]
binding = "KV"
id = "your_kv_namespace_id"

[[d1_databases]]
binding = "DB"
database_name = "qiita-bot-db"
database_id = "your_d1_database_id"

[[vectorize]]
binding = "VECTORIZE"
index_name = "article-embeddings"

[vars]
ORG_MEMBERS = "member1,member2,member3"
DEFAULT_SCORE_THRESHOLD = "35"
```

### Secrets（wrangler secret put）
- `QIITA_TOKEN`: Qiita APIトークン
- `ANTHROPIC_API_KEY`: Anthropic Claude APIキー
- `TWITTER_BEARER_TOKEN`: X API Bearer Token
- `SLACK_WEBHOOK_URL`: Slack Webhook URL

---

## コア実装例

### メタスコア計算

```typescript
function calculateMetaScore(article: QiitaArticle): number {
  let score = 0;
  
  // いいね数(最大10点)
  score += Math.min(10, article.likes_count / 5);
  
  // ストック数(最大10点)
  score += Math.min(10, article.stocks_count / 3);
  
  // 鮮度(最大10点)
  const daysOld = (Date.now() - new Date(article.updated_at).getTime()) / (1000 * 60 * 60 * 24);
  if (daysOld < 7) score += 10;
  else if (daysOld < 30) score += 7;
  else if (daysOld < 90) score += 5;
  else if (daysOld < 365) score += 3;
  else score += 1;
  
  // タグの質(最大5点)
  const premiumTags = ['TypeScript', 'React', 'AWS', 'Python', 'Next.js', 'Claude', 'AI'];
  const matchingTags = article.tags.filter(t => 
    premiumTags.some(pt => pt.toLowerCase() === t.name.toLowerCase())
  ).length;
  score += Math.min(5, matchingTags * 2);
  
  return Math.round(score);
}
```

### トークン最適化（コードブロック圧縮）

```typescript
function compressCodeBlocks(markdown: string): string {
  return markdown.replace(/```(\w+)?\n([\s\S]+?)```/g, (match, lang, code) => {
    const lines = code.trim().split('\n');
    
    // 15行以下ならそのまま
    if (lines.length <= 15) return match;
    
    // 重要行を抽出
    const important = [
      ...lines.slice(0, 8),  // 最初8行
      `// ... (${lines.length - 13}行省略)`,
      ...lines.slice(-5)     // 最後5行
    ];
    
    return `\`\`\`${lang || ''}\n${important.join('\n')}\n\`\`\``;
  });
}
```

### バッチAI評価

```typescript
async function evaluateBatch(
  articles: QiitaArticle[],
  env: Env
): Promise<Map<string, ArticleScore>> {
  
  // 各記事を300文字に圧縮
  const compressed = articles.map(a => ({
    id: a.id,
    summary: `[${a.id}] ${a.title}\nタグ: ${a.tags.map(t => t.name).join(',')}\n${a.body.slice(0, 200)}...`
  }));
  
  const prompt = `以下の${articles.length}件の記事を評価してください。

${compressed.map((c, i) => `## 記事${i + 1}\n${c.summary}`).join('\n\n')}

各記事について、JSON配列で評価してください:
\`\`\`json
[
  {
    "article_id": "記事ID",
    "total_score": 35,
    "recommended": true,
    "reasoning": "評価理由(50文字以内)"
  },
  ...
]
\`\`\``;

  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }]
  });
  
  const jsonMatch = message.content[0].text.match(/```json\n([\s\S]+?)\n```/);
  const scores = JSON.parse(jsonMatch[1]);
  
  return new Map(scores.map(s => [s.article_id, s]));
}
```

---

## コスト試算

### 最適化前
```
記事評価: 200記事 × 22,500 tokens = $13.50/月
投稿文生成: 8回 × 15,000 tokens = $0.36/月
合計: $13.86/月 = $166/年
```

### 最適化後
```
記事評価: 5記事 × 1,500 tokens (バッチ) = $0.02/月
投稿文生成: 8回 × 2,000 tokens = $0.017/月
合計: $0.037/月 = $0.44/年

削減率: 99.7%
削減額: $165.56/年
```

---

## 実装の段階的アプローチ

### Phase 1: MVP（最小限の動作確認）
実装内容:
- Qiita API記事取得
- メタスコア計算
- 単純なAI評価（最適化なし）
- X投稿

目標: 基本動作の確認

### Phase 2: 最適化レイヤー追加
実装内容:
- トークン最適化
- キャッシュ戦略
- バッチ処理

目標: コスト削減の実証

### Phase 3: 高度な機能
実装内容:
- ベクトル重複除去
- エンゲージメント学習
- ダッシュボード

目標: システムの完成度向上

### Phase 4: 本番運用・記事化
実装内容:
- テスト・デバッグ
- モニタリング設定
- 技術記事執筆

---

## テスト戦略

### 単体テスト
- メタスコア計算の正確性
- トークン最適化の圧縮率
- バッチ処理のロジック

### 統合テスト
- Qiita API → メタスコア → AI評価の流れ
- キャッシュヒット率の測定
- コスト計測

### 本番前テスト
- Cron実行のシミュレーション
- エラーハンドリング
- Slack通知

---

## 技術記事ネタ

### 記事1: 「AI APIコスト99%削減した話」
- トークン最適化の手法
- バッチ処理の効果
- 実際のコスト比較

### 記事2: 「Cloudflare Workersでゼロ運用bot構築」
- エッジコンピューティングの活用
- Cron TriggersとKV/D1の使い方
- Workers AIの実践

### 記事3: 「LLMプロンプトエンジニアリング実践」
- Few-Shot Learningの活用
- プロンプト最適化の手法
- バッチ評価のプロンプト設計

### 記事4: 「ベクトル検索で重複排除」
- Vectorizeの使い方
- 埋め込み生成とコサイン類似度
- 実運用での効果

---

## 次のアクション（Claude Codeでの実装開始）

### Step 1: プロジェクト初期化
```bash
npm create cloudflare@latest qiita-x-bot
cd qiita-x-bot
```

### Step 2: 依存関係インストール
```bash
npm install hono @anthropic-ai/sdk
npm install -D @types/node
```

### Step 3: 基本構造の実装
- `src/index.ts`: メインルーティング
- `src/types/`: 型定義
- `src/api/qiita.ts`: Qiita API実装

### Step 4: メタスコア実装
- `src/utils/scoring.ts`: スコアリング関数
- 単体テスト

### Step 5: AI評価エンジン実装
- `src/ai/engine.ts`: Claude API連携
- トークン最適化の実装

### Step 6: テスト・デプロイ
- ローカルテスト
- Cloudflareにデプロイ
- Cron設定

---

## 重要な注意事項

### 1. Secrets管理
- `.env`ファイルは`.gitignore`に追加
- `wrangler secret put`でSecrets設定

### 2. レート制限
- Qiita API: 1時間60リクエスト
- X API: プランに応じて
- Claude API: レート制限に注意

### 3. エラーハンドリング
- API呼び出し失敗時のリトライ
- Slack通知
- ログ記録

### 4. モニタリング
- `wrangler tail`でリアルタイムログ
- D1でメトリクス集計
- ダッシュボードで可視化

---

## 参考情報

### Cloudflare Workers
- Docs: https://developers.cloudflare.com/workers/
- KV: https://developers.cloudflare.com/kv/
- D1: https://developers.cloudflare.com/d1/
- Vectorize: https://developers.cloudflare.com/vectorize/

### Anthropic Claude API
- Docs: https://docs.anthropic.com/
- Pricing: https://www.anthropic.com/pricing

### Qiita API
- Docs: https://qiita.com/api/v2/docs

### X API v2
- Docs: https://developer.twitter.com/en/docs/twitter-api

---

## まとめ

このプロジェクトは以下の学びを提供します:
- エッジコンピューティングの実践
- LLMコスト最適化の技術
- データ駆動の意思決定
- 自動化システムの設計

組織にとっての価値:
- 技術広報の自動化
- メンバーのスキル向上
- 採用ブランディング
- 実践的なAI活用事例

**このドキュメントをClaude Codeに読み込ませ、実装を開始してください。**

Phase 1から段階的に進めることを推奨します。
