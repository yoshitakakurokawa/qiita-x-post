export type { ArticleEvaluation, BatchEvaluationResult, TweetContent } from './schemas';

export interface AIModelConfig {
  model: 'claude-sonnet-4-6' | 'claude-haiku-4-5-20251001';
  max_tokens: number;
  temperature: number;
}

export const MODEL_CONFIGS: Record<string, AIModelConfig> = {
  sonnet: {
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    temperature: 0.7,
  },
  haiku: {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    temperature: 0.7,
  },
};

export const PRICING = {
  'claude-sonnet-4-6': {
    input: 3.0 / 1_000_000, // $3 per million tokens
    output: 15.0 / 1_000_000, // $15 per million tokens
  },
  'claude-haiku-4-5-20251001': {
    input: 0.8 / 1_000_000, // $0.80 per million tokens
    output: 4.0 / 1_000_000, // $4 per million tokens
  },
};
