# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Qiita to X Auto Poster with AI: An automated system that evaluates Qiita articles using Claude AI and posts quality content to X (Twitter). Optimized for ultra-low-cost operation (~$1/month) with 99%+ token reduction through intelligent filtering and batching.

**Runtime**: Cloudflare Workers with Hono framework
**AI**: Anthropic Claude API v0.71.0 (Sonnet 4 / Haiku)
**Validation**: Valibot (95% lighter than Zod, tree-shakable)
**Code Quality**: Biome v2.3.8 (50-100x faster than ESLint/Prettier)
**Testing**: Vitest v4.0.14 with coverage
**Storage**: KV (cache), D1 (metrics/history), Vectorize (deduplication)

## Commands

### Development
```bash
# Install dependencies
bun install

# Start local dev server
bun run dev

# Manually test cron endpoints
curl http://localhost:8787/cron/post-articles
curl http://localhost:8787/cron/update-metrics

# Check system stats
curl http://localhost:8787/stats
```

### Code Quality
```bash
# Lint and format with Biome (50-100x faster than ESLint)
bun run lint              # Check for issues
bun run lint:fix          # Auto-fix issues
bun run format            # Format code
bun run format:check      # Check formatting
bun run check             # Lint + format + organize imports

# Type checking
bun run typecheck         # Run TypeScript compiler checks
```

### Testing
```bash
# Run all tests
bun test

# Run tests with coverage
bun run test:coverage

# Watch mode
bun test --watch

# Run with UI
bun run test:ui

# Run specific test file
bun test src/utils/scoring.test.ts
```

### CI/CD
```bash
# Run all checks (CI pipeline locally)
bun run ci               # typecheck + lint + format + test with coverage
```

### Deployment
```bash
# Deploy to production
wrangler deploy

# View live logs
wrangler tail

# Create Cloudflare resources
wrangler kv:namespace create KV
wrangler d1 create qiita-bot-db
wrangler d1 execute qiita-bot-db --file=./schema.sql
wrangler vectorize create article-embeddings --dimensions=1024 --metric=cosine

# Set secrets
wrangler secret put QIITA_TOKEN
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put TWITTER_API_KEY
# ... (see README for full list)
```

## Architecture

### Endpoints

- `GET /`: Health check endpoint
- `GET /stats`: Returns aggregated statistics (total posts, costs, engagement rates) from D1
- `GET /cron/post-articles`: Article evaluation and posting workflow (triggered by cron)
- `GET /cron/update-metrics`: Updates engagement metrics from X API (triggered by cron)

### Core Processing Pipeline

The system follows a multi-stage filtering pipeline to minimize AI costs:

1. **ArticleService** (`src/services/articleService.ts`)
   - Fetches new/updated articles from Qiita API
   - Applies meta-scoring filter (likes, stocks, tags, freshness → max 45 points)
     - Likes: max 10pt, Stocks: max 10pt, Freshness: max 10pt, Premium tags: max 5pt, Comments: max 5pt, Completeness: max 5pt
   - Filters out already-posted articles from D1
   - Checks similarity with VectorService to avoid duplicates (threshold: 0.8)

2. **PostService** (`src/services/postService.ts`)
   - Evaluates filtered articles using AIEngine
   - Selects best article based on AI scores
   - Generates tweet content with Claude
   - Posts to X via XAPIClient
   - Logs token usage to D1

3. **MetricsService** (`src/services/metricsService.ts`)
   - Updates engagement metrics (impressions, engagements) from X API
   - Tracks learning patterns for future optimization

### Cost Optimization Strategy

The system achieves 99%+ cost reduction through:

- **Meta-score filtering** (`src/utils/scoring.ts`): Pre-filter low-quality articles before AI evaluation
- **Batch evaluation** (`AIEngine.evaluateBatch`): Evaluate multiple articles in single API call
- **Token compression** (`src/utils/tokens.ts`): Compress code blocks, simplify images, extract key sections
- **Dynamic model selection**: Use Sonnet for high-quality (score ≥35), Haiku for medium (≥20), skip for low (<20)
- **Differential processing**: Only process articles since last run (tracked in KV)

### AI Engine (`src/ai/engine.ts`)

**AIEngine class** handles all Claude API interactions:
- `evaluateBatch()`: Batch evaluation of articles with compressed content
- `generateTweetContent()`: Create tweet text from article
- `generateTweetWithExamples()`: Learning-enhanced generation (future feature)
- `calculateCost()`: Track token usage and costs

Uses Zod schemas for structured output validation (`src/types/schemas.ts`).

### Data Storage

**KV Namespace** (cache):
- `last_post_run`: Timestamp of last execution
- Article cache for deduplication

**D1 Database** (`schema.sql`):
- `posts`: Posted article history with engagement metrics
- `token_usage`: AI token consumption tracking
- `learning_patterns`: Engagement learning data
- `execution_logs`: System run history
- `deduplication_log`: Similarity checks

**Vectorize** (implemented):
- Article embeddings for semantic similarity checking
- Uses `VectorService` (`src/utils/vector.ts`) with Workers AI `@cf/baai/bge-m3` model (multilingual support)
- Deduplication threshold: 0.8 similarity score

### Type System

All types use **Valibot** for runtime validation (95% lighter than Zod):
- `src/types/common.ts`: Core interfaces (Env, ArticleScore, PostedArticle, etc.)
- `src/types/schemas.ts`: Valibot schemas for AI responses and Qiita data
- `src/types/qiita.ts`: Qiita API response types
- `src/types/ai.ts`: AI evaluation types

**Valibot usage**: Use `v.parse(schema, data)` for validation. Types are inferred with `v.InferOutput<typeof Schema>`.

### Cron Schedule

Defined in `wrangler.toml`:
- **Post articles**: Monday & Thursday at 9:00 JST (`0 9 * * 1,4`)
- **Update metrics**: Daily at 2:00 JST (`0 2 * * *`)

The `handleScheduled()` function in `src/index.ts` maps UTC hours to operations:
- `hour === 0` (UTC) → Calls `/cron/post-articles`
- `hour === 17` (UTC) → Calls `/cron/update-metrics`

Note: Cron triggers fire based on the schedule, and the handler routes to the appropriate endpoint based on UTC time.

## Important Patterns

### Dependency Injection
Services use constructor injection with `Env` object:
```typescript
const articleService = new ArticleService(env);
const postService = new PostService(env);
```

### Error Handling
- Use `try/catch` with logging via `logExecution()` to D1
- Optional Slack notifications via `SlackClient`
- Return graceful JSON responses from Hono endpoints

### Code Quality & Testing

**Biome** (replaces ESLint + Prettier):
- Configuration: `biome.json`
- 50-100x faster than ESLint
- Integrated formatter and linter
- Auto-organize imports
- Run `bun run check` before commits

**Vitest**:
- Configuration: `vitest.config.ts`
- Test files colocated with source: `*.test.ts`
- Coverage thresholds: 70% for lines/functions/branches/statements
- Focus on critical logic: scoring, token optimization, AI prompts
- Use `bun run test:coverage` for coverage reports

### Token Optimization Functions
When modifying AI prompts or article processing, always use:
- `compressCodeBlocks()`: Reduce code block size while preserving structure
- `compressForEvaluation()`: Optimize for batch evaluation
- `optimizeForSummarization()`: Optimize for tweet generation
- `estimateTokens()`: Calculate approximate token count

## Configuration

### Environment Variables (wrangler.toml)
- `ORG_MEMBERS`: Comma-separated Qiita user IDs to monitor
- `DEFAULT_SCORE_THRESHOLD`: Meta-score threshold (default: 25)

### Secrets (via wrangler secret put)
- Qiita: `QIITA_TOKEN`
- Anthropic: `ANTHROPIC_API_KEY`
- X/Twitter: `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_SECRET`, `TWITTER_BEARER_TOKEN`
- Optional: `SLACK_WEBHOOK_URL`

### Resource Bindings
- `KV`: KVNamespace for caching
- `DB`: D1Database for persistence
- `AI`: Workers AI for embeddings
- `VECTORIZE`: VectorizeIndex for similarity search

## Modern Tech Stack Highlights

This project uses cutting-edge tools for optimal performance:

- **Biome**: Rust-based linter/formatter, 50-100x faster than ESLint/Prettier
- **Valibot**: Modular validation library, 95% lighter than Zod with tree-shaking
- **Vitest v4**: Latest testing framework with native TypeScript support
- **Wrangler v4**: Latest Cloudflare Workers CLI
- **Anthropic SDK v0.71.0**: Latest Claude AI integration

## Future Extensions

The codebase has placeholder directories for planned features:
- `src/learning/`: Engagement-based learning patterns (empty, planned)
- `src/optimization/`: Additional optimization strategies (empty, planned)

The `AIEngine.generateTweetWithExamples()` method supports learning-enhanced tweet generation, designed to use historical engagement data from the `learning_patterns` table.

## CI/CD

GitHub Actions workflow (`.github/workflows/ci.yml`):
- Runs on push to `main` and pull requests
- Steps: typecheck → lint → format check → test with coverage
- Auto-deploys to Cloudflare Workers on successful main branch builds
- Coverage reports uploaded to Codecov
