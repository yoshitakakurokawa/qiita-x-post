import type { QiitaArticle } from '../types/qiita';

export class QiitaAPIClient {
  private baseUrl = 'https://qiita.com/api/v2';
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  /**
   * 指定したユーザーの記事を取得
   */
  async getUserArticles(userId: string, perPage = 20, page = 1): Promise<QiitaArticle[]> {
    const url = `${this.baseUrl}/users/${userId}/items?page=${page}&per_page=${perPage}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Qiita API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * 複数のユーザーの記事を取得
   */
  async getOrgMembersArticles(memberIds: string[]): Promise<QiitaArticle[]> {
    const allArticles: QiitaArticle[] = [];

    for (const userId of memberIds) {
      try {
        const articles = await this.getUserArticles(userId);
        allArticles.push(...articles);
      } catch (_error) {}
    }

    return allArticles;
  }

  /**
   * 指定した日時以降に更新された記事のみを抽出
   */
  filterArticlesSince(articles: QiitaArticle[], sinceDate: Date): QiitaArticle[] {
    return articles.filter((article) => {
      const updatedAt = new Date(article.updated_at);
      return updatedAt > sinceDate;
    });
  }

  /**
   * 記事を更新日時の新しい順にソート
   */
  sortArticlesByDate(articles: QiitaArticle[]): QiitaArticle[] {
    return articles.sort((a, b) => {
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }
}
