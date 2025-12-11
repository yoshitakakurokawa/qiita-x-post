# Type System Rules

## Validation Library

**Use Valibot** (not Zod) for runtime validation:

- **95% lighter** than Zod with tree-shaking
- **Modular** design (import only what you need)
- **Type-safe** with full TypeScript inference

## Import Convention

```typescript
import * as v from 'valibot';
```

Always use the `v.*` namespace for clarity.

## Schema Definition

### Basic Schemas

```typescript
// Object schema
const ArticleSchema = v.object({
  id: v.string(),
  title: v.pipe(v.string(), v.minLength(1)),
  likes_count: v.pipe(v.number(), v.minValue(0)),
  created_at: v.string(), // ISO 8601 date string
  tags: v.array(v.object({
    name: v.string(),
  })),
});

// Type inference
type Article = v.InferOutput<typeof ArticleSchema>;
```

### Schema with Validation

Use `v.pipe()` to chain validators:

```typescript
const ScoreSchema = v.pipe(
  v.number(),
  v.minValue(0),
  v.maxValue(100),
  v.integer()
);

const EmailSchema = v.pipe(
  v.string(),
  v.email(),
  v.maxLength(255)
);

const UrlSchema = v.pipe(
  v.string(),
  v.url(),
  v.startsWith('https://')
);
```

### Optional Fields

```typescript
const ArticleMetadataSchema = v.object({
  title: v.string(),                    // Required
  description: v.optional(v.string()),  // Optional
  tags: v.optional(v.array(v.string()), []), // Optional with default
});
```

### Union Types

```typescript
const ResultSchema = v.union([
  v.object({
    success: v.literal(true),
    data: v.any(),
  }),
  v.object({
    success: v.literal(false),
    error: v.string(),
  }),
]);
```

## Parsing and Validation

### Safe Parsing

```typescript
import * as v from 'valibot';

// Throws on invalid data
const article = v.parse(ArticleSchema, unknownData);

// Returns result object (no throw)
const result = v.safeParse(ArticleSchema, unknownData);

if (result.success) {
  console.log(result.output);
} else {
  console.error(result.issues);
}
```

### Async Validation

For async checks (e.g., database lookups):

```typescript
const UniqueIdSchema = v.pipeAsync(
  v.string(),
  v.checkAsync(async (id) => {
    const exists = await checkIdExists(id);
    return !exists;
  }, 'ID already exists')
);
```

## Common Schemas

Define reusable schemas in `src/types/schemas.ts`:

```typescript
// API Response Schemas
export const QiitaArticleSchema = v.object({
  id: v.string(),
  title: v.string(),
  body: v.string(),
  created_at: v.string(),
  updated_at: v.string(),
  likes_count: v.number(),
  stocks_count: v.number(),
  comments_count: v.number(),
  tags: v.array(v.object({
    name: v.string(),
    versions: v.optional(v.array(v.string()), []),
  })),
  user: v.object({
    id: v.string(),
    name: v.string(),
  }),
});

// AI Response Schemas
export const EvaluationResultSchema = v.object({
  id: v.string(),
  score: v.pipe(v.number(), v.minValue(0), v.maxValue(100)),
  reasoning: v.pipe(v.string(), v.minLength(10)),
  topics: v.array(v.string()),
  quality_indicators: v.object({
    technical_depth: v.pipe(v.number(), v.minValue(0), v.maxValue(10)),
    clarity: v.pipe(v.number(), v.minValue(0), v.maxValue(10)),
    usefulness: v.pipe(v.number(), v.minValue(0), v.maxValue(10)),
  }),
});

export const TweetContentSchema = v.object({
  text: v.pipe(v.string(), v.maxLength(280)),
  hashtags: v.optional(v.array(v.string()), []),
});
```

## Type Definitions

Define TypeScript interfaces in `src/types/*.ts`:

### Core Types (`src/types/common.ts`)

```typescript
export interface Env {
  // Secrets
  QIITA_TOKEN: string;
  ANTHROPIC_API_KEY: string;
  TWITTER_API_KEY: string;
  TWITTER_API_SECRET: string;
  TWITTER_ACCESS_TOKEN: string;
  TWITTER_ACCESS_SECRET: string;
  TWITTER_BEARER_TOKEN: string;
  SLACK_WEBHOOK_URL?: string;

  // Environment variables
  ORG_MEMBERS: string;
  DEFAULT_SCORE_THRESHOLD: string;

  // Bindings
  KV: KVNamespace;
  DB: D1Database;
  AI: Ai;
  VECTORIZE: VectorizeIndex;
}

export interface ArticleScore {
  article_id: string;
  meta_score: number;
  ai_score?: number;
  total_score: number;
}

export interface PostedArticle {
  id: number;
  article_id: string;
  title: string;
  url: string;
  tweet_id: string;
  posted_at: string;
  impressions?: number;
  engagements?: number;
}

export interface TokenUsage {
  operation: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost: number;
  created_at: string;
}
```

### API Types (`src/types/qiita.ts`, `src/types/ai.ts`)

```typescript
// Qiita API types
export interface QiitaArticle {
  id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
  likes_count: number;
  stocks_count: number;
  comments_count: number;
  tags: QiitaTag[];
  user: QiitaUser;
}

export interface QiitaTag {
  name: string;
  versions: string[];
}

export interface QiitaUser {
  id: string;
  name: string;
  profile_image_url?: string;
}

// AI evaluation types
export interface EvaluationResult {
  id: string;
  score: number;
  reasoning: string;
  topics: string[];
  quality_indicators: QualityIndicators;
}

export interface QualityIndicators {
  technical_depth: number;
  clarity: number;
  usefulness: number;
}

export interface TweetContent {
  text: string;
  hashtags?: string[];
}
```

## Runtime Validation Pattern

Always validate external data:

```typescript
// API response validation
async function fetchArticles(): Promise<QiitaArticle[]> {
  const response = await fetch(url);
  const data = await response.json();

  // Validate with Valibot
  return v.parse(v.array(QiitaArticleSchema), data);
}

// AI response validation
async function evaluateArticle(article: Article): Promise<EvaluationResult> {
  const response = await anthropic.messages.create({...});
  const content = JSON.parse(response.content[0].text);

  // Validate structured output
  return v.parse(EvaluationResultSchema, content);
}
```

## Type Guards

Use Valibot for runtime type guards:

```typescript
function isValidArticle(data: unknown): data is QiitaArticle {
  const result = v.safeParse(QiitaArticleSchema, data);
  return result.success;
}

// Usage
if (isValidArticle(unknownData)) {
  // TypeScript knows unknownData is QiitaArticle
  console.log(unknownData.title);
}
```

## Partial Types

For updates or optional fields:

```typescript
import * as v from 'valibot';

// Make all fields optional
const PartialArticleSchema = v.partial(ArticleSchema);

// Pick specific fields
const ArticleSummarySchema = v.pick(ArticleSchema, ['id', 'title', 'created_at']);

// Omit specific fields
const ArticleWithoutBodySchema = v.omit(ArticleSchema, ['body']);
```

## Error Handling

Handle validation errors gracefully:

```typescript
import * as v from 'valibot';

try {
  const article = v.parse(ArticleSchema, data);
  return { success: true, data: article };
} catch (error) {
  if (error instanceof v.ValiError) {
    const issues = error.issues.map(i => ({
      path: i.path?.map(p => p.key).join('.'),
      message: i.message,
    }));
    return { success: false, errors: issues };
  }
  throw error;
}
```

## Performance Considerations

Valibot is optimized for tree-shaking:

```typescript
// ✅ GOOD: Import specific validators
import * as v from 'valibot';
const schema = v.pipe(v.string(), v.email());

// ❌ BAD: Don't use entire schemas when not needed
// (This still works but loses tree-shaking benefits)
```

## Schema Composition

Build complex schemas from simpler ones:

```typescript
const BaseArticleSchema = v.object({
  id: v.string(),
  title: v.string(),
});

const FullArticleSchema = v.object({
  ...BaseArticleSchema.entries,
  body: v.string(),
  created_at: v.string(),
  tags: v.array(TagSchema),
});
```

## Default Values

Provide defaults for optional fields:

```typescript
const ConfigSchema = v.object({
  threshold: v.optional(v.number(), 25), // Default: 25
  maxArticles: v.optional(v.number(), 10), // Default: 10
  enableSlack: v.optional(v.boolean(), false), // Default: false
});

const config = v.parse(ConfigSchema, {});
// config = { threshold: 25, maxArticles: 10, enableSlack: false }
```

## Type System Checklist

When adding new types or schemas:

- [ ] Define schema in `src/types/schemas.ts`
- [ ] Define TypeScript interface in appropriate `src/types/*.ts`
- [ ] Use `v.InferOutput<typeof Schema>` for type inference
- [ ] Add validation for all external data (API responses, user input)
- [ ] Use `v.pipe()` for chained validators
- [ ] Provide default values for optional fields
- [ ] Handle validation errors gracefully
- [ ] Test schema with valid and invalid data
- [ ] Document complex schemas with comments
- [ ] Ensure tree-shaking optimization (import `* as v`)
