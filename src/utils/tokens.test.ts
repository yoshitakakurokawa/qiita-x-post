import { describe, expect, it } from 'vitest';
import {
  compressCodeBlocks,
  compressForEvaluation,
  getByteSize,
  optimizeForSummarization,
} from './tokens';

describe('tokens', () => {
  describe('compressCodeBlocks', () => {
    it('should not compress short code blocks', () => {
      const code = `\`\`\`js\n${'line\n'.repeat(10)}\`\`\``;
      expect(compressCodeBlocks(code)).toBe(code);
    });

    it('should compress long code blocks', () => {
      const code = `\`\`\`js\n${'line\n'.repeat(20)}\`\`\``;
      const compressed = compressCodeBlocks(code);
      expect(compressed).toContain('// ... (7行省略)');
      expect(compressed.split('\n').length).toBeLessThan(20);
    });
  });

  describe('compressForEvaluation', () => {
    it('should compress article for evaluation', () => {
      const article = {
        id: '1',
        title: 'Title',
        body: 'Content '.repeat(50),
        tags: [{ name: 'Tag' }],
      };
      const compressed = compressForEvaluation(article);
      expect(compressed).toContain('[1] Title');
      expect(compressed).toContain('タグ: Tag');
      expect(compressed.length).toBeLessThan(article.body.length + 100);
    });
  });

  describe('optimizeForSummarization', () => {
    it('should optimize article for summarization', () => {
      const article = {
        title: 'Title',
        body: `# Heading\n${'Content '.repeat(100)}\n\`\`\`js\ncode\n\`\`\``,
      };
      const optimized = optimizeForSummarization(article);
      expect(optimized).toContain('# Heading');
      expect(optimized).toContain('```js');
      expect(optimized.length).toBeLessThan(3005);
    });
  });

  describe('getByteSize', () => {
    it('should return correct byte size', () => {
      expect(getByteSize('a')).toBe(1);
      expect(getByteSize('あ')).toBe(3); // UTF-8 Japanese char is usually 3 bytes
    });
  });
});
