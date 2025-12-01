import { QiitaAPIClient } from '../api/qiita';
import type { Env } from '../types/common';
import type { QiitaArticle } from '../types/qiita';
import { filterByMetaScore } from '../utils/scoring';
import { VectorService } from '../utils/vector';

export class ArticleService {
  private env: Env;
  private qiitaClient: QiitaAPIClient;
  private vectorService?: VectorService;

  constructor(env: Env) {
    this.env = env;
    this.qiitaClient = new QiitaAPIClient(env.QIITA_TOKEN);
    if (env.AI && env.VECTORIZE) {
      this.vectorService = new VectorService(env.AI, env.VECTORIZE);
    }
  }

  async fetchNewArticles(since: Date): Promise<QiitaArticle[]> {
    const orgMembers = this.env.ORG_MEMBERS.split(',').map((m) => m.trim());
    const allArticles = await this.qiitaClient.getOrgMembersArticles(orgMembers);
    return this.qiitaClient.filterArticlesSince(allArticles, since);
  }

  async filterArticles(
    articles: QiitaArticle[]
  ): Promise<Array<QiitaArticle & { metaScore: number }>> {
    const threshold = parseInt(this.env.DEFAULT_SCORE_THRESHOLD || '25', 10);
    return filterByMetaScore(articles, threshold);
  }

  async getUnpostedArticles(
    articles: Array<QiitaArticle & { metaScore: number }>
  ): Promise<Array<QiitaArticle & { metaScore: number }>> {
    const unpostedArticles = [];
    for (const article of articles) {
      const posted = await this.env.DB.prepare('SELECT id FROM posts WHERE article_id = ?')
        .bind(article.id)
        .first();

      if (!posted) {
        unpostedArticles.push(article);
      }
    }
    return unpostedArticles;
  }

  async checkSimilarity(
    article: QiitaArticle
  ): Promise<{ isSimilar: boolean; similarArticleId?: string; score?: number }> {
    if (!this.vectorService) return { isSimilar: false };

    try {
      const embedding = await this.vectorService.generateArticleEmbedding(article);
      const similarArticles = await this.vectorService.findSimilarArticles(embedding, 0.95);

      if (similarArticles.length > 0) {
        return {
          isSimilar: true,
          similarArticleId: similarArticles[0].id,
          score: similarArticles[0].score,
        };
      }
    } catch (_e) {}

    return { isSimilar: false };
  }
}
