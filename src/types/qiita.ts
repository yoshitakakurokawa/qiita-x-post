import { z } from 'zod';
import { QiitaArticleSchema, QiitaUserSchema, QiitaTagSchema } from './schemas';

export type QiitaArticle = z.infer<typeof QiitaArticleSchema>;
export type QiitaUser = z.infer<typeof QiitaUserSchema>;
export type QiitaTag = z.infer<typeof QiitaTagSchema>;

export interface QiitaAPIResponse {
  articles: QiitaArticle[];
}
