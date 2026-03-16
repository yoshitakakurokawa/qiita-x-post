import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { QiitaArticle } from '../types/qiita';
import { AIEngine } from './engine';

// Mock Anthropic SDK
const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class {
      messages = {
        create: mockCreate,
      };
    },
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
      followers_count: 1,
    },
    metaScore: 30,
  };

  beforeEach(() => {
    engine = new AIEngine('fake-key');
    mockCreate.mockReset();
  });

  describe('evaluateBatch', () => {
    it('should evaluate articles and return results', async () => {
      const mockResponse = {
        content: [
          {
            type: 'text',
            text: '```json\n[{"article_id": "1", "total_score": 40, "recommended": true, "reasoning": "Good"}]\n```',
          },
        ],
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      };
      mockCreate.mockResolvedValue(mockResponse);

      const result = await engine.evaluateBatch([mockArticle]);

      expect(result.evaluations).toHaveLength(1);
      expect(result.evaluations[0].total_score).toBe(40);
      expect(result.total_tokens).toBe(150);
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('should use fallback evaluation criteria when fallback=true', async () => {
      const mockResponse = {
        content: [
          {
            type: 'text',
            text: '```json\n[{"article_id": "1", "total_score": 25, "recommended": true, "reasoning": "OK"}]\n```',
          },
        ],
        usage: { input_tokens: 80, output_tokens: 40 },
      };
      mockCreate.mockResolvedValue(mockResponse);

      const result = await engine.evaluateBatch([mockArticle], 'haiku', true);

      expect(result.evaluations[0].recommended).toBe(true);
      // fallbackモードではプロンプトに「最低1件推薦」の文言が含まれる
      const calledPrompt = mockCreate.mock.calls[0][0].messages[0].content as string;
      expect(calledPrompt).toContain('最低1件');
    });

    it('should throw error if JSON parsing fails', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Invalid JSON' }],
        usage: { input_tokens: 10, output_tokens: 10 },
      });

      await expect(engine.evaluateBatch([mockArticle])).rejects.toThrow(
        'Failed to parse AI response'
      );
    });
  });

  describe('generateTweetContent', () => {
    const tweetMockResponse = {
      content: [
        {
          type: 'text',
          text: '```json\n{"comment": "参考になりました", "text": "Tweet text", "hashtags": ["Qiita", "TypeScript"], "estimated_engagement": 80}\n```',
        },
      ],
      usage: { input_tokens: 100, output_tokens: 50 },
    };

    it('should generate tweet content with comment field', async () => {
      mockCreate.mockResolvedValue(tweetMockResponse);

      const result = await engine.generateTweetContent(mockArticle, 40);

      expect(result.text).toBe('Tweet text');
      expect(result.comment).toBe('参考になりました');
      expect(result.hashtags).toContain('Qiita');
    });

    it('should handle response without comment field (optional)', async () => {
      mockCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: '```json\n{"text": "Tweet text", "hashtags": ["tag"], "estimated_engagement": 80}\n```',
          },
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const result = await engine.generateTweetContent(mockArticle, 40);

      expect(result.text).toBe('Tweet text');
      expect(result.comment).toBe('');
    });

    it('should include "昨日公開" label for 1-day-old article', async () => {
      mockCreate.mockResolvedValue(tweetMockResponse);
      const yesterday = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

      await engine.generateTweetContent({ ...mockArticle, created_at: yesterday }, 40);

      const prompt = mockCreate.mock.calls[0][0].messages[0].content as string;
      expect(prompt).toContain('昨日公開');
    });

    it('should include "X日前に公開" label for 2-7 day old article', async () => {
      mockCreate.mockResolvedValue(tweetMockResponse);
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

      await engine.generateTweetContent({ ...mockArticle, created_at: fiveDaysAgo }, 40);

      const prompt = mockCreate.mock.calls[0][0].messages[0].content as string;
      expect(prompt).toContain('日前に公開');
    });

    it('should include "X週間前に公開" label for 8-30 day old article', async () => {
      mockCreate.mockResolvedValue(tweetMockResponse);
      const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();

      await engine.generateTweetContent({ ...mockArticle, created_at: fifteenDaysAgo }, 40);

      const prompt = mockCreate.mock.calls[0][0].messages[0].content as string;
      expect(prompt).toContain('週間前に公開');
    });

    it('should include "Xヶ月前に公開" label for 31-365 day old article', async () => {
      mockCreate.mockResolvedValue(tweetMockResponse);
      const twoMonthsAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

      await engine.generateTweetContent({ ...mockArticle, created_at: twoMonthsAgo }, 40);

      const prompt = mockCreate.mock.calls[0][0].messages[0].content as string;
      expect(prompt).toContain('ヶ月前に公開');
    });

    it('should include "X年前に公開" label for article older than 1 year', async () => {
      mockCreate.mockResolvedValue(tweetMockResponse);
      const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString();

      await engine.generateTweetContent({ ...mockArticle, created_at: twoYearsAgo }, 40);

      const prompt = mockCreate.mock.calls[0][0].messages[0].content as string;
      expect(prompt).toContain('年前に公開');
    });
  });
});
