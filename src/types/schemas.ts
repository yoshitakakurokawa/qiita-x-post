import { z } from 'zod';

export const QiitaUserSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  profile_image_url: z.string(),
  items_count: z.number(),
  followers_count: z.number()
});

export const QiitaTagSchema = z.object({
  name: z.string(),
  versions: z.array(z.string()).optional()
});

export const QiitaArticleSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  body: z.string(),
  likes_count: z.number(),
  stocks_count: z.number(),
  comments_count: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  tags: z.array(QiitaTagSchema),
  user: QiitaUserSchema
});

export const ArticleEvaluationSchema = z.object({
  article_id: z.string(),
  total_score: z.number(),
  recommended: z.boolean(),
  reasoning: z.string()
});

export const BatchEvaluationResultSchema = z.object({
  evaluations: z.array(ArticleEvaluationSchema),
  total_tokens: z.number(),
  model_used: z.string()
});

export const TweetContentSchema = z.object({
  text: z.string(),
  hashtags: z.array(z.string()),
  estimated_engagement: z.number()
});

export type QiitaUser = z.infer<typeof QiitaUserSchema>;
export type QiitaTag = z.infer<typeof QiitaTagSchema>;
export type QiitaArticle = z.infer<typeof QiitaArticleSchema>;
export type ArticleEvaluation = z.infer<typeof ArticleEvaluationSchema>;
export type BatchEvaluationResult = z.infer<typeof BatchEvaluationResultSchema>;
export type TweetContent = z.infer<typeof TweetContentSchema>;
