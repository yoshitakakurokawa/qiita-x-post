# Testing Rules

## Test Framework

- **Framework**: Vitest v4.0.14
- **Coverage**: @vitest/coverage-v8
- **Configuration**: `vitest.config.ts`

## Coverage Requirements

Enforce minimum coverage thresholds:

```typescript
coverage: {
  lines: 70,
  functions: 70,
  branches: 70,
  statements: 70,
}
```

Run coverage checks: `bun run test:coverage`

## Test File Organization

**Colocate tests with source files:**

```
src/
├── services/
│   ├── articleService.ts
│   └── articleService.test.ts
├── utils/
│   ├── scoring.ts
│   └── scoring.test.ts
└── ai/
    ├── engine.ts
    └── engine.test.ts
```

**Naming convention**: `{module}.test.ts`

## Test Priorities

Focus testing efforts on **critical business logic**:

### High Priority (Must Test)

1. **Meta-scoring** (`src/utils/scoring.test.ts`)
   - `calculateMetaScore()` with various article inputs
   - Edge cases (0 likes, negative values, missing fields)
   - Score threshold boundaries

2. **Token optimization** (`src/utils/tokens.test.ts`)
   - `compressCodeBlocks()` reduction ratio
   - `compressForEvaluation()` output format
   - `estimateTokens()` accuracy (±10% tolerance)

3. **AI prompts** (prompt engineering tests)
   - Structured output validation with Valibot schemas
   - Batch evaluation format
   - Model selection logic

4. **Similarity checking** (`src/utils/vector.test.ts`)
   - `findSimilar()` threshold behavior
   - Embedding generation consistency
   - Deduplication logic

### Medium Priority (Should Test)

5. **Service integration**
   - `ArticleService.fetchNewArticles()`
   - `PostService.selectBestArticle()`
   - Error handling and retry logic

6. **Data validation**
   - Valibot schema parsing
   - Type guards and runtime checks

### Low Priority (Optional)

7. **API clients**
   - Mock external APIs (Qiita, X, Anthropic)
   - Focus on error handling, not HTTP details

8. **Database queries**
   - Use in-memory D1 for unit tests
   - Test query logic, not SQL syntax

## Testing Patterns

### Unit Tests

Test pure functions in isolation:

```typescript
import { describe, it, expect } from 'vitest';
import { calculateMetaScore } from './scoring';

describe('calculateMetaScore', () => {
  it('should calculate score for high-quality article', () => {
    const article = {
      likes_count: 50,
      stocks_count: 30,
      created_at: new Date().toISOString(),
      tags: [{ name: 'TypeScript' }],
      comments_count: 10,
      body: 'A'.repeat(2000),
    };

    const score = calculateMetaScore(article);
    expect(score).toBeGreaterThan(35); // Should use Sonnet
  });

  it('should return low score for poor article', () => {
    const article = {
      likes_count: 0,
      stocks_count: 0,
      created_at: new Date('2020-01-01').toISOString(),
      tags: [],
      comments_count: 0,
      body: 'Short',
    };

    const score = calculateMetaScore(article);
    expect(score).toBeLessThan(20); // Should skip AI
  });

  it('should handle edge cases', () => {
    expect(calculateMetaScore({ likes_count: -5 })).toBe(0);
    expect(calculateMetaScore({})).toBeDefined();
  });
});
```

### Integration Tests

Test service interactions with mocks:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { ArticleService } from './articleService';

describe('ArticleService', () => {
  it('should filter already-posted articles', async () => {
    const mockEnv = {
      DB: {
        prepare: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({
            results: [{ article_id: 'already-posted' }]
          }),
        }),
      },
      QIITA_TOKEN: 'test-token',
    };

    const service = new ArticleService(mockEnv as any);
    const filtered = await service.filterPostedArticles([
      { id: 'already-posted', title: 'Test 1' },
      { id: 'new-article', title: 'Test 2' },
    ]);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('new-article');
  });
});
```

### Token Optimization Tests

Verify compression effectiveness:

```typescript
import { describe, it, expect } from 'vitest';
import { compressCodeBlocks, estimateTokens } from './tokens';

describe('Token Compression', () => {
  it('should reduce code block size by 60%+', () => {
    const original = `
      // This is a comment
      function myLongFunctionName(parameterOne, parameterTwo) {
        const myVariable = parameterOne + parameterTwo;

        // Another comment
        return myVariable;
      }
    `;

    const compressed = compressCodeBlocks(original);
    const reductionRatio = 1 - (compressed.length / original.length);

    expect(reductionRatio).toBeGreaterThan(0.6); // 60%+ reduction
  });

  it('should preserve code structure', () => {
    const code = 'function test() { return 42; }';
    const compressed = compressCodeBlocks(code);

    expect(compressed).toContain('function');
    expect(compressed).toContain('return');
  });

  it('should estimate tokens within 10% accuracy', () => {
    const text = 'This is a test string with multiple words';
    const estimated = estimateTokens(text);
    const expected = text.split(/\s+/).length * 1.3; // Rough estimate

    expect(Math.abs(estimated - expected) / expected).toBeLessThan(0.1);
  });
});
```

### Schema Validation Tests

Test Valibot schemas with valid and invalid data:

```typescript
import { describe, it, expect } from 'vitest';
import * as v from 'valibot';
import { ArticleSchema } from './schemas';

describe('ArticleSchema', () => {
  it('should validate correct article', () => {
    const article = {
      id: 'abc123',
      title: 'Test Article',
      body: 'Content here',
      created_at: '2025-01-01T00:00:00Z',
      likes_count: 10,
      stocks_count: 5,
    };

    expect(() => v.parse(ArticleSchema, article)).not.toThrow();
  });

  it('should reject invalid article', () => {
    const invalid = {
      id: 'abc123',
      // Missing required fields
    };

    expect(() => v.parse(ArticleSchema, invalid)).toThrow();
  });
});
```

## Mocking External Services

### Anthropic API

```typescript
import { vi } from 'vitest';

const mockAnthropicResponse = {
  content: [{ text: JSON.stringify({ score: 85, reasoning: 'Great article' }) }],
  usage: { input_tokens: 100, output_tokens: 50 },
};

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue(mockAnthropicResponse),
    },
  })),
}));
```

### Cloudflare Bindings

```typescript
const mockEnv: Env = {
  QIITA_TOKEN: 'test-token',
  ANTHROPIC_API_KEY: 'test-key',
  KV: {
    get: vi.fn(),
    put: vi.fn(),
  } as any,
  DB: {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({ results: [] }),
      run: vi.fn().mockResolvedValue({ success: true }),
    }),
  } as any,
  AI: {} as any,
  VECTORIZE: {} as any,
};
```

## Test Commands

```bash
# Run all tests
bun test

# Run with coverage
bun run test:coverage

# Watch mode (during development)
bun test --watch

# UI mode (interactive)
bun run test:ui

# Run specific test file
bun test src/utils/scoring.test.ts

# Run tests matching pattern
bun test --grep "calculateMetaScore"
```

## CI Pipeline

All tests run in GitHub Actions (`.github/workflows/ci.yml`):

```yaml
- name: Run tests
  run: bun run test:coverage

- name: Upload coverage
  uses: codecov/codecov-action@v3
```

## Test Quality Checklist

Before committing tests:

- [ ] Tests cover happy path and edge cases
- [ ] Error conditions are tested
- [ ] Mocks are used for external dependencies
- [ ] Tests are isolated (no shared state)
- [ ] Test names clearly describe what is being tested
- [ ] Coverage meets 70% threshold
- [ ] Tests run quickly (< 1 second per test)
- [ ] No hardcoded secrets or credentials
- [ ] Tests pass in CI pipeline

## Performance Testing

For token optimization, measure performance:

```typescript
import { describe, it, expect } from 'vitest';
import { performance } from 'perf_hooks';

describe('Performance', () => {
  it('should compress 1000 articles in < 1 second', () => {
    const articles = generateMockArticles(1000);

    const start = performance.now();
    articles.forEach(a => compressForEvaluation(a.body));
    const end = performance.now();

    expect(end - start).toBeLessThan(1000); // < 1 second
  });
});
```

## Debugging Tests

If tests fail:

1. **Run in watch mode**: `bun test --watch`
2. **Use `console.log`**: Add temporary logging
3. **Check mock data**: Verify mock responses match expected format
4. **Isolate test**: Run single test with `it.only()`
5. **Review coverage**: `bun run test:coverage` → open `coverage/index.html`
