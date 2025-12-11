# AI Optimization Rules

## Core Principle

**Minimize AI costs while maintaining quality**. This project targets ~$1/month operation through 99%+ token reduction.

## Cost Optimization Strategy

### 1. Meta-Score Filtering (Pre-AI)

**Always** calculate meta-scores before AI evaluation:

```typescript
import { calculateMetaScore } from './utils/scoring';

const score = calculateMetaScore(article);
if (score < threshold) {
  // Skip AI evaluation entirely
  return null;
}
```

Meta-score components (max 45 points):
- **Likes**: `Math.min(likes / 2, 10)` → max 10pt
- **Stocks**: `Math.min(stocks / 2, 10)` → max 10pt
- **Freshness**: `10 * (1 - ageInDays / 30)` → max 10pt
- **Premium tags**: `hasPremiumTag ? 5 : 0` → max 5pt
- **Comments**: `Math.min(comments, 5)` → max 5pt
- **Completeness**: Word count + code quality → max 5pt

### 2. Batch Evaluation

**Never** evaluate articles one-by-one. Always use batch processing:

```typescript
// ❌ BAD: Multiple API calls
for (const article of articles) {
  const result = await aiEngine.evaluate(article);
}

// ✅ GOOD: Single API call
const results = await aiEngine.evaluateBatch(articles);
```

Batch evaluation reduces API calls from N to 1, saving ~95% on costs.

### 3. Token Compression

**Always** compress content before sending to Claude. Use utilities from `src/utils/tokens.ts`:

```typescript
import { compressForEvaluation, optimizeForSummarization } from './utils/tokens';

// For batch evaluation
const compressed = compressForEvaluation(articleContent);

// For tweet generation
const optimized = optimizeForSummarization(articleContent);
```

Compression techniques:

**Code Block Compression** (`compressCodeBlocks`):
- Remove comments and blank lines
- Minify variable names (e.g., `longVariableName` → `v1`)
- Preserve structure and key logic
- Target: 60-80% size reduction

**Image Simplification**:
- Replace image URLs with placeholders: `[Image: {alt_text}]`
- Remove base64-encoded images
- Target: 90%+ size reduction

**Content Extraction**:
- Extract key sections (introduction, conclusion, code snippets)
- Remove boilerplate (navigation, footers, etc.)
- Limit to first 1000 words for evaluation
- Target: 50-70% size reduction

### 4. Dynamic Model Selection

Choose the right model based on meta-score:

```typescript
function selectModel(metaScore: number): string {
  if (metaScore >= 35) {
    return 'claude-sonnet-4-5-20250929'; // High-quality content
  } else if (metaScore >= 20) {
    return 'claude-haiku-3-5-20250219'; // Medium-quality content
  } else {
    throw new Error('Score too low for AI evaluation');
  }
}
```

**Cost comparison:**
- Sonnet: ~$3 per million input tokens
- Haiku: ~$0.25 per million input tokens

Using Haiku for medium-quality content saves ~90% on costs.

### 5. Differential Processing

Only process articles since last run:

```typescript
const lastRun = await env.KV.get('last_post_run');
const newArticles = articles.filter((a) => new Date(a.created_at) > new Date(lastRun));
```

Reduces processing volume by 80-90% on subsequent runs.

### 6. Semantic Deduplication

Use `VectorService` to avoid re-evaluating similar articles:

```typescript
const vectorService = new VectorService(env.AI, env.VECTORIZE);

// Generate embedding for new article
const embedding = await vectorService.generateEmbedding(article.body);

// Check similarity with existing articles
const similarArticles = await vectorService.findSimilar(embedding, 0.8);

if (similarArticles.length > 0) {
  // Skip AI evaluation - too similar to existing content
  return null;
}
```

Similarity threshold: **0.8** (80% similarity = skip)

## Prompt Engineering Best Practices

### Structured Output

Always use Valibot schemas for structured responses:

```typescript
const EvaluationSchema = v.object({
  score: v.pipe(v.number(), v.minValue(0), v.maxValue(100)),
  reasoning: v.pipe(v.string(), v.minLength(10)),
  topics: v.array(v.string()),
});

const result = v.parse(EvaluationSchema, apiResponse);
```

Benefits:
- Reduces parsing errors
- Enables smaller responses (JSON vs. prose)
- Simplifies error handling

### Concise Prompts

Keep prompts short and focused:

```typescript
// ❌ BAD: Verbose prompt
const prompt = `
  I would like you to please evaluate the following article.
  Consider the technical depth, clarity, and usefulness.
  Please provide a detailed analysis with reasoning.
  Make sure to score it from 0 to 100.
`;

// ✅ GOOD: Concise prompt
const prompt = `
  Evaluate this article (0-100):
  - Technical depth
  - Clarity
  - Usefulness

  Format: { score, reasoning, topics }
`;
```

### Batch Prompt Design

For batch evaluation, use structured lists:

```typescript
const prompt = `
Evaluate these ${articles.length} articles. Return JSON array.

Articles:
${articles.map((a, i) => `${i + 1}. ${a.title}\n${compressForEvaluation(a.body)}`).join('\n\n')}

Format: [{ id, score, reasoning, topics }]
`;
```

## Token Budget Monitoring

### Estimation

Use `estimateTokens()` before API calls:

```typescript
import { estimateTokens } from './utils/tokens';

const prompt = buildPrompt(articles);
const estimatedTokens = estimateTokens(prompt);

if (estimatedTokens > 10000) {
  // Split into smaller batches
  const batches = splitIntoBatches(articles, 5);
}
```

### Logging

Always log token usage to D1:

```typescript
await env.DB.prepare(
  'INSERT INTO token_usage (operation, model, input_tokens, output_tokens, cost) VALUES (?, ?, ?, ?, ?)'
).bind(operation, model, usage.input_tokens, usage.output_tokens, cost).run();
```

### Cost Tracking

Calculate costs using official pricing:

```typescript
function calculateCost(usage: Usage, model: string): number {
  const prices = {
    'claude-sonnet-4-5-20250929': { input: 3.0, output: 15.0 },
    'claude-haiku-3-5-20250219': { input: 0.25, output: 1.25 },
  };

  const { input, output } = prices[model];
  return (usage.input_tokens / 1_000_000) * input +
         (usage.output_tokens / 1_000_000) * output;
}
```

## Performance Targets

Monitor these metrics to ensure cost optimization:

| Metric | Target | Current |
|--------|--------|---------|
| Average tokens per article | < 500 | ~300 |
| API calls per run | 1-2 | 1 |
| Cost per post | < $0.05 | ~$0.03 |
| Monthly cost | < $2 | ~$1 |
| Token reduction vs. raw content | > 95% | 99% |

## Optimization Checklist

Before modifying AI-related code, verify:

- [ ] Meta-score filtering is applied before AI evaluation
- [ ] Batch evaluation is used (not per-article evaluation)
- [ ] Content is compressed with `compressForEvaluation()` or `optimizeForSummarization()`
- [ ] Dynamic model selection is based on meta-score
- [ ] Differential processing filters out already-processed articles
- [ ] Semantic deduplication checks are performed
- [ ] Token usage is logged to D1
- [ ] Cost calculation is accurate
- [ ] Estimated tokens are < 10,000 per batch
- [ ] Tests verify token reduction effectiveness

## Debugging Token Usage

If costs are higher than expected:

1. **Check token logs**: `SELECT * FROM token_usage ORDER BY created_at DESC LIMIT 10`
2. **Measure compression ratio**: `originalTokens / compressedTokens`
3. **Verify batch size**: Should be 5-10 articles per batch
4. **Review meta-score threshold**: Increase if too many low-quality articles are being evaluated
5. **Test compression functions**: `estimateTokens(original)` vs. `estimateTokens(compressed)`
