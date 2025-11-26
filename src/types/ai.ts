import { z } from 'zod';
import { ArticleEvaluationSchema, BatchEvaluationResultSchema, TweetContentSchema } from './schemas';

export type ArticleEvaluation = z.infer<typeof ArticleEvaluationSchema>;
export type BatchEvaluationResult = z.infer<typeof BatchEvaluationResultSchema>;
export type TweetContent = z.infer<typeof TweetContentSchema>;

export interface AIModelConfig {
  model: 'claude-sonnet-4-20250514' | 'claude-3-5-haiku-20241022';
  max_tokens: number;
  temperature: number;
}

export const MODEL_CONFIGS: Record<string, AIModelConfig> = {
  sonnet: {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    temperature: 0.7
  },
  haiku: {
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 1500,
    temperature: 0.7
  }
};

export const PRICING = {
  'claude-sonnet-4-20250514': {
    input: 3.0 / 1_000_000,  // $3 per million tokens
    output: 15.0 / 1_000_000  // $15 per million tokens
  },
  'claude-3-5-haiku-20241022': {
    input: 1.0 / 1_000_000,   // $1 per million tokens
    output: 5.0 / 1_000_000   // $5 per million tokens
  }
};
