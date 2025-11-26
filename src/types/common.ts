export interface Env {
  // Secrets
  QIITA_TOKEN: string;
  ANTHROPIC_API_KEY: string;
  TWITTER_BEARER_TOKEN: string;
  TWITTER_API_KEY: string;
  TWITTER_API_SECRET: string;
  TWITTER_ACCESS_TOKEN: string;
  TWITTER_ACCESS_SECRET: string;
  SLACK_WEBHOOK_URL?: string;

  // Bindings
  KV: KVNamespace;
  DB: D1Database;
  AI: Ai;
  VECTORIZE: VectorizeIndex;

  // Environment variables
  ORG_MEMBERS: string;
  DEFAULT_SCORE_THRESHOLD: string;
}

export interface ArticleScore {
  article_id: string;
  total_score: number;
  meta_score: number;
  recommended: boolean;
  reasoning: string;
}

export interface PostedArticle {
  id: number;
  article_id: string;
  article_title: string;
  article_url: string;
  author_id: string;
  tweet_id: string;
  tweet_text: string;
  hashtags: string[];
  score: number;
  meta_score: number;
  ai_model: string;
  posted_at: string;
  impressions: number;
  engagements: number;
}

export interface TokenUsage {
  article_id: string;
  operation: 'evaluation' | 'summarization';
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  created_at: string;
}

export interface LearningPattern {
  pattern_type: 'hashtags' | 'posting_time' | 'content_style';
  pattern_data: Record<string, unknown>;
  performance_score: number;
  sample_size: number;
  created_at: string;
  expires_at: string;
}
