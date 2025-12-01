import type { Ai, VectorizeIndex } from '@cloudflare/workers-types';
import type { QiitaArticle } from '../types/qiita';

// Use a multilingual model for better Japanese support
const EMBEDDING_MODEL = '@cf/baai/bge-m3';

export class VectorService {
  private ai: Ai;
  private index: VectorizeIndex;

  constructor(ai: Ai, index: VectorizeIndex) {
    this.ai = ai;
    this.index = index;
  }

  /**
   * Generate embedding for text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const response = (await this.ai.run(EMBEDDING_MODEL, {
      text: [text],
    })) as { data: number[][] };
    return response.data[0];
  }

  /**
   * Generate embedding for an article
   * Uses title and tags for semantic representation
   */
  async generateArticleEmbedding(article: QiitaArticle): Promise<number[]> {
    const text = `${article.title} ${article.tags.map((t) => t.name).join(' ')}`;
    return this.generateEmbedding(text);
  }

  /**
   * Find similar articles
   */
  async findSimilarArticles(embedding: number[], threshold: number = 0.8, topK: number = 3) {
    const matches = await this.index.query(embedding, {
      topK,
      returnMetadata: true,
    });

    return matches.matches.filter((match) => match.score >= threshold);
  }

  /**
   * Insert article embedding
   */
  async insertArticle(article: QiitaArticle, embedding: number[]) {
    await this.index.insert([
      {
        id: article.id,
        values: embedding,
        metadata: {
          title: article.title,
          url: article.url,
          created_at: article.created_at,
        },
      },
    ]);
  }
}
