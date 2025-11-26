import { describe, it, expect } from 'vitest';
import { calculateMetaScore, filterByMetaScore, selectAIModel, estimateTokens } from './scoring';
import { QiitaArticle } from '../types/qiita';

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
    tags: [{ name: 'TypeScript', versions: [] }, { name: 'React', versions: [] }],
    user: {
      id: 'user1',
      name: 'Test User',
      profile_image_url: 'https://example.com/image.png',
      items_count: 10,
      followers_count: 100
    }
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
        body: 'Short content'
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
  });

  describe('filterByMetaScore', () => {
    it('should filter articles below threshold', () => {
      const articles = [
        { ...mockArticle, id: '1' }, // Score 38
        { ...mockArticle, id: '2', likes_count: 0, stocks_count: 0, updated_at: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(), tags: [], body: '' } // Score 1
      ];
      const filtered = filterByMetaScore(articles, 25);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('1');
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
