# Code Style Rules

## General Guidelines

- **Language**: TypeScript (strict mode enabled)
- **Runtime**: Cloudflare Workers with Hono framework
- **Package Manager**: Bun (use `bun` commands, not `npm` or `yarn`)

## Biome Configuration

This project uses **Biome** (50-100x faster than ESLint/Prettier). Always run `bun run check` before commits.

### Formatting

- **Indentation**: 2 spaces
- **Line width**: 100 characters
- **Quote style**: Single quotes (`'`)
- **Semicolons**: Always required
- **Trailing commas**: ES5 style
- **Arrow parentheses**: Always use parentheses

### Linting Rules

**Enforce:**
- No `any` types (`noExplicitAny: error`)
- No `==` or `!=`, use `===` and `!==` (`noDoubleEquals: error`)
- No debugger statements (`noDebugger: error`)
- Use `import type` for type-only imports (`useImportType: error`)
- Use `const` for non-reassigned variables (`useConst: error`)
- No unused variables or imports (`noUnusedVariables`, `noUnusedImports: error`)

**Warnings:**
- No `console.*` except `console.log` (`noConsole: warn`)
- Avoid non-null assertions (`noNonNullAssertion: warn`)
- Use template literals over concatenation (`useTemplate: warn`)

## Naming Conventions

### Variables & Functions

```typescript
// camelCase for variables and functions
const articleScore = 42;
function evaluateArticle() {}

// UPPER_CASE for constants
const MAX_SCORE = 45;
const DEFAULT_THRESHOLD = 25;

// Prefix boolean variables with is/has/should
const isPublished = true;
const hasLikes = false;
const shouldPost = true;
```

### Classes & Types

```typescript
// PascalCase for classes and interfaces
class ArticleService {}
interface PostedArticle {}
type ArticleScore = number;

// Suffix schemas with 'Schema'
const ArticleSchema = v.object({...});
const TweetSchema = v.object({...});
```

### Files

- **Services**: `{name}Service.ts` (e.g., `articleService.ts`)
- **Clients**: `{name}Client.ts` (e.g., `xapiClient.ts`)
- **Types**: Descriptive names (e.g., `common.ts`, `qiita.ts`, `ai.ts`)
- **Tests**: `{name}.test.ts` (colocated with source)
- **Utils**: Descriptive function names (e.g., `scoring.ts`, `tokens.ts`)

## Import Organization

Biome auto-organizes imports. Order should be:

1. External dependencies (`@anthropic-ai/sdk`, `hono`, etc.)
2. Type imports (`import type { ... }`)
3. Internal modules (relative imports)

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { Hono } from 'hono';
import type { Env } from './types/common';
import { ArticleService } from './services/articleService';
```

## Code Structure

### Prefer explicit over implicit

```typescript
// Good: Explicit return type
function calculateScore(article: Article): number {
  return article.likes + article.stocks;
}

// Avoid: Implicit return type (unless trivial)
function calculateScore(article: Article) {
  return article.likes + article.stocks;
}
```

### Avoid unnecessary complexity

- Don't create abstractions for one-time operations
- Don't add error handling for scenarios that can't happen
- Don't refactor code unless explicitly needed
- Keep solutions simple and focused

### Comments

- Only add comments where logic isn't self-evident
- Prefer self-documenting code over comments
- Don't add docstrings unless part of public API
- Don't add comments to code you didn't change

## Cloudflare Workers Specific

### Environment Variables

Always use the `Env` interface for type-safe access:

```typescript
interface Env {
  QIITA_TOKEN: string;
  ANTHROPIC_API_KEY: string;
  KV: KVNamespace;
  DB: D1Database;
  AI: Ai;
  VECTORIZE: VectorizeIndex;
}
```

### Bindings

Access resources through `env` parameter:

```typescript
async function handler(c: Context<{ Bindings: Env }>) {
  const lastRun = await c.env.KV.get('last_post_run');
  const result = await c.env.DB.prepare('SELECT * FROM posts').all();
}
```

## Error Handling

- Use `try/catch` for async operations
- Log errors to D1 via `logExecution()`
- Return graceful JSON responses
- Optional: Send to Slack via `SlackClient`

```typescript
try {
  const result = await service.process();
  return c.json({ success: true, data: result });
} catch (error) {
  await logExecution(env.DB, 'process', 'failed', (error as Error).message);
  return c.json({ success: false, error: 'Processing failed' }, 500);
}
```

## Pre-commit Checklist

Always run before committing:

```bash
bun run ci  # Runs: typecheck + lint + format:check + test:coverage
```
