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

  /**
   * 投稿済み記事を除外（改善版：クールダウン期間を考慮）
   * @param articles 記事リスト
   * @param allowRepost 再投稿を許可するか（trueの場合、クールダウン期間を過ぎた記事は再投稿可能）
   * @returns 未投稿記事リスト
   */
  async getUnpostedArticles(
    articles: Array<QiitaArticle & { metaScore: number }>,
    allowRepost = false
  ): Promise<Array<QiitaArticle & { metaScore: number }>> {
    const cooldownDays = parseInt(
      this.env.RECENT_POST_COOLDOWN_DAYS || '7',
      10
    );
    const cooldownDate = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000);

    const unpostedArticles = [];
    for (const article of articles) {
      const posted = await this.env.DB.prepare(
        'SELECT id, posted_at FROM posts WHERE article_id = ? ORDER BY posted_at DESC LIMIT 1'
      )
        .bind(article.id)
        .first<{ id: number; posted_at: string } | undefined>();

      if (!posted) {
        // 一度も投稿されていない記事
        unpostedArticles.push(article);
      } else if (allowRepost) {
        // 再投稿を許可する場合、クールダウン期間を過ぎていれば再投稿可能
        const postedDate = new Date(posted.posted_at);
        if (postedDate < cooldownDate) {
          unpostedArticles.push(article);
        }
      }
      // クールダウン期間内の記事は除外
    }
    return unpostedArticles;
  }

  /**
   * 最近投稿された類似記事をチェック
   * @param article チェック対象の記事
   * @returns 最近投稿された類似記事があるか
   */
  async checkRecentSimilarPosts(
    article: QiitaArticle
  ): Promise<{ hasRecentSimilar: boolean; similarArticleId?: string; score?: number }> {
    const cooldownDays = parseInt(
      this.env.SIMILAR_POST_COOLDOWN_DAYS || '3',
      10
    );
    const cooldownDate = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000);

    if (!this.vectorService) return { hasRecentSimilar: false };

    try {
      const embedding = await this.vectorService.generateArticleEmbedding(article);
      const similarArticles = await this.vectorService.findSimilarArticles(embedding, 0.8);

      if (similarArticles.length === 0) {
        return { hasRecentSimilar: false };
      }

      // 最近投稿された類似記事があるかチェック
      for (const similar of similarArticles) {
        const posted = await this.env.DB.prepare(
          'SELECT id, posted_at FROM posts WHERE article_id = ? AND posted_at > ? ORDER BY posted_at DESC LIMIT 1'
        )
          .bind(similar.id, cooldownDate.toISOString())
          .first<{ id: number; posted_at: string } | undefined>();

        if (posted) {
          return {
            hasRecentSimilar: true,
            similarArticleId: similar.id,
            score: similar.score,
          };
        }
      }
    } catch (_e) {
      // エラーが発生した場合は類似記事なしとして扱う
    }

    return { hasRecentSimilar: false };
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
