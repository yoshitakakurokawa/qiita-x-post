import { describe, expect, it } from 'vitest';
import type { QiitaArticle } from '../types/qiita';
import { calculateMetaScore, estimateTokens, filterByMetaScore, selectAIModel } from './scoring';

describe('scoring', () => {
  const mockArticle: QiitaArticle = {
    id: '1',
    title: 'Test Article',
    url: 'https://qiita.com/test/items/1',
    likes_count: 100,
    stocks_count: 50,
    comments_count: 5,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    body: '# Heading\n\nContent\n\n```javascript\nconsole.log("test");\n```\n\n```python\nprint("test")\n```',
    tags: [
      { name: 'TypeScript', versions: [] },
      { name: 'React', versions: [] },
    ],
    user: {
      id: 'user1',
      name: 'Test User',
      profile_image_url: 'https://example.com/image.png',
      items_count: 10,
      followers_count: 100,
    },
  };

  describe('calculateMetaScore', () => {
    it('should calculate score correctly for a high quality article', () => {
      const score = calculateMetaScore(mockArticle);
      // Likes: 100/5 = 20 -> max 10
      // Stocks: 50/3 = 16 -> max 10
      // Freshness: < 7 days -> 10
      // Tags: 2 premium tags * 2 = 4 -> max 5
      // Comments: 5/2 = 2.5 -> 2
      // Completeness: 2 code blocks (2) + 1 heading (0) + length < 1500 (0) = 2
      // Total: 10 + 10 + 10 + 4 + 2 + 2 = 38
      expect(score).toBe(38);
    });

    it('should calculate score correctly for a low quality article', () => {
      const lowQualityArticle: QiitaArticle = {
        ...mockArticle,
        likes_count: 0,
        stocks_count: 0,
        comments_count: 0,
        updated_at: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(), // > 1 year old
        tags: [{ name: 'Diary', versions: [] }],
        body: 'Short content',
      };
      const score = calculateMetaScore(lowQualityArticle);
      // Likes: 0
      // Stocks: 0
      // Freshness: > 365 days -> 1
      // Tags: 0
      // Comments: 0
      // Completeness: 0
      // Total: 1
      expect(score).toBe(1);
    });

    it('should give 7 freshness points for 7-30 day old article', () => {
      const article: QiitaArticle = {
        ...mockArticle,
        updated_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      };
      const score = calculateMetaScore(article);
      // Freshness: 7-30 days -> 7
      expect(score).toBeGreaterThanOrEqual(7);
    });

    it('should give 5 freshness points for 30-90 day old article', () => {
      const article: QiitaArticle = {
        ...mockArticle,
        updated_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      };
      const score = calculateMetaScore(article);
      // Freshness: 30-90 days -> 5
      expect(score).toBeGreaterThanOrEqual(5);
    });

    it('should give 3 freshness points for 90-365 day old article', () => {
      const article: QiitaArticle = {
        ...mockArticle,
        updated_at: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
      };
      const score = calculateMetaScore(article);
      // Freshness: 90-365 days -> 3
      expect(score).toBeGreaterThanOrEqual(3);
    });

    it('should give 2 completeness points for body >= 3000 chars', () => {
      const article: QiitaArticle = {
        ...mockArticle,
        likes_count: 0,
        stocks_count: 0,
        comments_count: 0,
        tags: [],
        updated_at: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(),
        body: 'a'.repeat(3000),
      };
      const score = calculateMetaScore(article);
      // Freshness: 1, Completeness body: 2 -> total 3
      expect(score).toBe(3);
    });

    it('should give 1 completeness point for body 1500-2999 chars', () => {
      const article: QiitaArticle = {
        ...mockArticle,
        likes_count: 0,
        stocks_count: 0,
        comments_count: 0,
        tags: [],
        updated_at: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(),
        body: 'a'.repeat(1500),
      };
      const score = calculateMetaScore(article);
      // Freshness: 1, Completeness body: 1 -> total 2
      expect(score).toBe(2);
    });

    it('should give 1 completeness point for exactly 1 code block', () => {
      const article: QiitaArticle = {
        ...mockArticle,
        likes_count: 0,
        stocks_count: 0,
        comments_count: 0,
        tags: [],
        updated_at: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(),
        body: 'Content\n\n```js\nconsole.log("hi");\n```',
      };
      const score = calculateMetaScore(article);
      // Freshness: 1, Completeness code: 1 -> total 2
      expect(score).toBe(2);
    });

    it('should give 1 completeness point for 3+ headings', () => {
      const article: QiitaArticle = {
        ...mockArticle,
        likes_count: 0,
        stocks_count: 0,
        comments_count: 0,
        tags: [],
        updated_at: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(),
        body: '# H1\n\n## H2\n\n### H3\n\nContent',
      };
      const score = calculateMetaScore(article);
      // Freshness: 1, Completeness headings: 1 -> total 2
      expect(score).toBe(2);
    });
  });

  describe('filterByMetaScore', () => {
    it('should filter articles below threshold', () => {
      const articles = [
        { ...mockArticle, id: '1' }, // Score 38
        {
          ...mockArticle,
          id: '2',
          likes_count: 0,
          stocks_count: 0,
          updated_at: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(),
          tags: [],
          body: '',
        }, // Score 1
      ];
      const filtered = filterByMetaScore(articles, 25);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('1');
    });

    it('should sort multiple passing articles by score descending', () => {
      const highScore = { ...mockArticle, id: 'high', likes_count: 100, stocks_count: 50 };
      const midScore = {
        ...mockArticle,
        id: 'mid',
        likes_count: 10,
        stocks_count: 5,
        updated_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      };
      const filtered = filterByMetaScore([midScore, highScore], 5);
      expect(filtered).toHaveLength(2);
      expect(filtered[0].metaScore).toBeGreaterThanOrEqual(filtered[1].metaScore);
    });

    it('should return empty array when no articles pass threshold', () => {
      const filtered = filterByMetaScore(
        [{ ...mockArticle, likes_count: 0, stocks_count: 0, tags: [] }],
        100
      );
      expect(filtered).toHaveLength(0);
    });
  });

  describe('selectAIModel', () => {
    it('should return sonnet for high scores', () => {
      expect(selectAIModel(35)).toBe('sonnet');
      expect(selectAIModel(40)).toBe('sonnet');
    });

    it('should return haiku for medium scores', () => {
      expect(selectAIModel(20)).toBe('haiku');
      expect(selectAIModel(34)).toBe('haiku');
    });

    it('should return skip for low scores', () => {
      expect(selectAIModel(19)).toBe('skip');
      expect(selectAIModel(0)).toBe('skip');
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens correctly for English', () => {
      expect(estimateTokens('Hello World')).toBe(3); // 11 chars / 4 = 2.75 -> 3
    });

    it('should estimate tokens correctly for Japanese', () => {
      expect(estimateTokens('こんにちは')).toBe(8); // 5 chars * 1.5 = 7.5 -> 8
    });
  });
});
