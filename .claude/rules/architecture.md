# Architecture Rules

## Core Principles

1. **Cost optimization first**: Every architectural decision should minimize AI token usage
2. **Dependency injection**: Services receive `Env` via constructor
3. **Single responsibility**: Each service handles one domain
4. **Type safety**: Use Valibot schemas for runtime validation

## Project Structure

```
src/
├── index.ts              # Hono app entry point
├── ai/
│   └── engine.ts         # AIEngine class (Claude API wrapper)
├── services/
│   ├── articleService.ts # Fetch & filter articles
│   ├── postService.ts    # Evaluate & post articles
│   └── metricsService.ts # Update engagement metrics
├── clients/
│   ├── qiitaClient.ts    # Qiita API client
│   ├── xapiClient.ts     # X (Twitter) API client
│   └── slackClient.ts    # Slack webhook client
├── types/
│   ├── common.ts         # Core interfaces (Env, ArticleScore, etc.)
│   ├── schemas.ts        # Valibot schemas
│   ├── qiita.ts          # Qiita API types
│   └── ai.ts             # AI evaluation types
└── utils/
    ├── scoring.ts        # Meta-scoring functions
    ├── tokens.ts         # Token compression utilities
    ├── vector.ts         # VectorService (embeddings)
    └── db.ts             # D1 query helpers
```

## Service Layer Pattern

### Dependency Injection

All services use constructor injection with the `Env` object:

```typescript
export class ArticleService {
  constructor(private env: Env) {}

  async fetchNewArticles(): Promise<Article[]> {
    // Access env.QIITA_TOKEN, env.DB, env.KV, etc.
  }
}

// Usage
const articleService = new ArticleService(env);
const postService = new PostService(env);
```

### Service Responsibilities

**ArticleService** (`src/services/articleService.ts`):
- Fetch articles from Qiita API
- Apply meta-scoring filter (max 45 points)
- Filter out already-posted articles from D1
- Check semantic similarity with VectorService (threshold: 0.8)
- Return filtered articles ready for AI evaluation

**PostService** (`src/services/postService.ts`):
- Evaluate filtered articles using AIEngine
- Select best article based on AI scores
- Generate tweet content with Claude
- Post to X via XAPIClient
- Log token usage to D1

**MetricsService** (`src/services/metricsService.ts`):
- Fetch engagement metrics from X API
- Update D1 `posts` table with impressions/engagements
- Track learning patterns for future optimization

## Multi-Stage Filtering Pipeline

The system follows a funnel approach to minimize AI costs:

```
All articles (100+)
    ↓
Meta-score filter (score ≥ threshold)
    ↓
Already-posted filter (D1 check)
    ↓
Similarity filter (Vectorize, threshold: 0.8)
    ↓
AI evaluation (compressed content)
    ↓
Best article selected (highest AI score)
    ↓
Tweet generation
    ↓
Post to X
```

### Meta-Scoring (Pre-AI Filter)

Calculate score **before** AI evaluation (max 45 points):

- **Likes**: max 10 points
- **Stocks**: max 10 points
- **Freshness**: max 10 points (newer = higher)
- **Premium tags**: max 5 points (high-value tags like `TypeScript`, `React`)
- **Comments**: max 5 points
- **Completeness**: max 5 points (word count, code quality)

Only articles with `score ≥ threshold` proceed to AI evaluation.

### Dynamic Model Selection

- **Score ≥ 35**: Use Claude Sonnet (high-quality content)
- **Score ≥ 20**: Use Claude Haiku (medium-quality content)
- **Score < 20**: Skip AI evaluation entirely

## AI Engine Pattern

The `AIEngine` class centralizes all Claude API interactions:

```typescript
export class AIEngine {
  constructor(private apiKey: string) {}

  // Batch evaluation (single API call for multiple articles)
  async evaluateBatch(articles: Article[]): Promise<EvaluationResult[]>

  // Tweet generation from article
  async generateTweetContent(article: Article): Promise<string>

  // Learning-enhanced generation (future feature)
  async generateTweetWithExamples(article: Article, examples: Tweet[]): Promise<string>

  // Cost tracking
  calculateCost(usage: Usage): number
}
```

**Key principles:**
- Use batch evaluation (`evaluateBatch`) to reduce API calls
- Always compress content before sending to Claude (see `src/utils/tokens.ts`)
- Track token usage and log to D1 `token_usage` table
- Use structured output with Valibot schemas

## Data Access Patterns

### KV Namespace (Cache)

Use for ephemeral, high-frequency data:

```typescript
// Store last run timestamp
await env.KV.put('last_post_run', new Date().toISOString());

// Retrieve timestamp
const lastRun = await env.KV.get('last_post_run');
```

### D1 Database (Persistence)

Use for structured, queryable data:

```typescript
// Insert post record
await env.DB.prepare(
  'INSERT INTO posts (article_id, title, posted_at) VALUES (?, ?, ?)'
).bind(id, title, now).run();

// Query posted articles
const { results } = await env.DB.prepare(
  'SELECT article_id FROM posts WHERE posted_at > ?'
).bind(since).all();
```

### Vectorize (Semantic Search)

Use `VectorService` for similarity checks:

```typescript
const vectorService = new VectorService(env.AI, env.VECTORIZE);

// Generate embedding
const embedding = await vectorService.generateEmbedding(articleText);

// Check similarity
const similar = await vectorService.findSimilar(embedding, threshold);
```

## Endpoint Design

### Hono App Structure

```typescript
const app = new Hono<{ Bindings: Env }>();

// Health check
app.get('/', (c) => c.json({ status: 'ok' }));

// Stats endpoint
app.get('/stats', async (c) => {
  const stats = await getStats(c.env.DB);
  return c.json(stats);
});

// Cron endpoints (called by Workers cron triggers)
app.get('/cron/post-articles', async (c) => {
  // Article posting workflow
});

app.get('/cron/update-metrics', async (c) => {
  // Metrics update workflow
});
```

### Cron Trigger Handling

Cron schedule defined in `wrangler.toml`:
- **Post articles**: Monday & Thursday at 9:00 JST
- **Update metrics**: Daily at 2:00 JST

The `handleScheduled()` function maps UTC hours to operations:

```typescript
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const hour = new Date().getUTCHours();

    if (hour === 0) {
      // Call /cron/post-articles
    } else if (hour === 17) {
      // Call /cron/update-metrics
    }
  }
}
```

## Error Handling Strategy

1. **Try/catch** for all async operations
2. **Log to D1** via `logExecution()` helper
3. **Return JSON** responses (never throw to client)
4. **Optional Slack notifications** for critical errors

```typescript
try {
  const result = await service.process();
  await logExecution(env.DB, 'process', 'success');
  return c.json({ success: true, data: result });
} catch (error) {
  await logExecution(env.DB, 'process', 'failed', (error as Error).message);
  await slackClient.notify(`Error: ${(error as Error).message}`);
  return c.json({ success: false, error: 'Processing failed' }, 500);
}
```

## Future Extension Points

The codebase has placeholders for planned features:

- `src/learning/`: Engagement-based learning patterns (empty, planned)
- `src/optimization/`: Additional optimization strategies (empty, planned)
- `AIEngine.generateTweetWithExamples()`: Learning-enhanced generation

When implementing these features:
1. Follow existing service patterns
2. Maintain cost optimization focus
3. Add comprehensive tests
4. Update CLAUDE.md with new patterns
