import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIEngine } from './engine';
import { QiitaArticle } from '../types/qiita';

// Mock Anthropic SDK
const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class {
      messages = {
        create: mockCreate
      };
    }
  };
});

describe('AIEngine', () => {
  let engine: AIEngine;
  const mockArticle: QiitaArticle & { metaScore: number } = {
    id: '1',
    title: 'Test Article',
    url: 'https://qiita.com/test/items/1',
    body: 'Content',
    likes_count: 10,
    stocks_count: 5,
    comments_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    tags: [{ name: 'Tag', versions: [] }],
    user: {
      id: 'user1',
      name: 'User',
      profile_image_url: 'url',
      items_count: 1,
      followers_count: 1
    },
    metaScore: 30
  };

  beforeEach(() => {
    engine = new AIEngine('fake-key');
    mockCreate.mockReset();
  });

  describe('evaluateBatch', () => {
    it('should evaluate articles and return results', async () => {
      const mockResponse = {
        content: [{
          type: 'text',
          text: '```json\n[{"article_id": "1", "total_score": 40, "recommended": true, "reasoning": "Good"}]\n```'
        }],
        usage: {
          input_tokens: 100,
          output_tokens: 50
        }
      };
      mockCreate.mockResolvedValue(mockResponse);

      const result = await engine.evaluateBatch([mockArticle]);

      expect(result.evaluations).toHaveLength(1);
      expect(result.evaluations[0].total_score).toBe(40);
      expect(result.total_tokens).toBe(150);
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('should throw error if JSON parsing fails', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Invalid JSON' }],
        usage: { input_tokens: 10, output_tokens: 10 }
      });

      await expect(engine.evaluateBatch([mockArticle])).rejects.toThrow('Failed to parse AI response');
    });
  });

  describe('generateTweetContent', () => {
    it('should generate tweet content', async () => {
      const mockResponse = {
        content: [{
          type: 'text',
          text: '```json\n{"text": "Tweet text", "hashtags": ["tag"], "estimated_engagement": 80}\n```'
        }],
        usage: { input_tokens: 100, output_tokens: 50 }
      };
      mockCreate.mockResolvedValue(mockResponse);

      const result = await engine.generateTweetContent(mockArticle, 40);

      expect(result.text).toBe('Tweet text');
      expect(result.hashtags).toContain('tag');
    });
  });
});
