import type { QiitaArticle } from './schemas';

export type { QiitaArticle, QiitaTag, QiitaUser } from './schemas';

export interface QiitaAPIResponse {
  articles: QiitaArticle[];
}
