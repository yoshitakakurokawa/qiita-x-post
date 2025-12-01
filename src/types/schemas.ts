import * as v from 'valibot';

export const QiitaUserSchema = v.object({
  id: v.string(),
  name: v.optional(v.string()),
  profile_image_url: v.string(),
  items_count: v.number(),
  followers_count: v.number(),
});

export const QiitaTagSchema = v.object({
  name: v.string(),
  versions: v.optional(v.array(v.string())),
});

export const QiitaArticleSchema = v.object({
  id: v.string(),
  title: v.string(),
  url: v.string(),
  body: v.string(),
  likes_count: v.number(),
  stocks_count: v.number(),
  comments_count: v.number(),
  created_at: v.string(),
  updated_at: v.string(),
  tags: v.array(QiitaTagSchema),
  user: QiitaUserSchema,
});

export const ArticleEvaluationSchema = v.object({
  article_id: v.string(),
  total_score: v.number(),
  recommended: v.boolean(),
  reasoning: v.string(),
});

export const BatchEvaluationResultSchema = v.object({
  evaluations: v.array(ArticleEvaluationSchema),
  total_tokens: v.number(),
  model_used: v.string(),
});

export const TweetContentSchema = v.object({
  text: v.string(),
  hashtags: v.array(v.string()),
  estimated_engagement: v.number(),
});

export type QiitaUser = v.InferOutput<typeof QiitaUserSchema>;
export type QiitaTag = v.InferOutput<typeof QiitaTagSchema>;
export type QiitaArticle = v.InferOutput<typeof QiitaArticleSchema>;
export type ArticleEvaluation = v.InferOutput<typeof ArticleEvaluationSchema>;
export type BatchEvaluationResult = v.InferOutput<typeof BatchEvaluationResultSchema>;
export type TweetContent = v.InferOutput<typeof TweetContentSchema>;
