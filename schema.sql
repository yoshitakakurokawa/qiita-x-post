-- 投稿履歴テーブル
CREATE TABLE IF NOT EXISTS posts (
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

CREATE INDEX IF NOT EXISTS idx_posts_article_id ON posts(article_id);
CREATE INDEX IF NOT EXISTS idx_posts_posted_at ON posts(posted_at);
CREATE INDEX IF NOT EXISTS idx_posts_engagement_rate ON posts(engagement_rate DESC);

-- トークン使用量テーブル
CREATE TABLE IF NOT EXISTS token_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id TEXT NOT NULL,
  operation TEXT NOT NULL, -- 'evaluation' or 'summarization'
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd REAL NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_token_usage_created_at ON token_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_token_usage_operation ON token_usage(operation);

-- キャッシュ統計テーブル
CREATE TABLE IF NOT EXISTS cache_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cache_key TEXT NOT NULL,
  hit BOOLEAN NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cache_stats_created_at ON cache_stats(created_at);

-- 重複除外ログテーブル
CREATE TABLE IF NOT EXISTS deduplication_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id TEXT NOT NULL,
  similar_to_article_id TEXT NOT NULL,
  similarity_score REAL NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dedup_article_id ON deduplication_log(article_id);
CREATE INDEX IF NOT EXISTS idx_dedup_created_at ON deduplication_log(created_at);

-- 学習パターンテーブル
CREATE TABLE IF NOT EXISTS learning_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern_type TEXT NOT NULL, -- 'hashtags', 'posting_time', 'content_style'
  pattern_data TEXT NOT NULL, -- JSON
  performance_score REAL NOT NULL,
  sample_size INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_learning_pattern_type ON learning_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_learning_expires_at ON learning_patterns(expires_at);

-- 実行ログテーブル（デバッグ用）
CREATE TABLE IF NOT EXISTS execution_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_type TEXT NOT NULL, -- 'post' or 'metrics_update'
  status TEXT NOT NULL, -- 'success', 'error', 'partial'
  message TEXT,
  articles_processed INTEGER,
  articles_posted INTEGER,
  total_cost_usd REAL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_execution_created_at ON execution_logs(created_at);
