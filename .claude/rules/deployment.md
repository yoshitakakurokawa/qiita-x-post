# Deployment Rules

## Platform

**Cloudflare Workers** with Wrangler v4

## Pre-Deployment Checklist

Before deploying, ensure all checks pass:

```bash
# Run full CI pipeline locally
bun run ci

# This runs:
# 1. bun run typecheck
# 2. bun run lint
# 3. bun run format:check
# 4. bun run test:coverage
```

All checks must pass before deployment.

## Deployment Commands

### Production Deployment

```bash
# Deploy to production (main branch only)
wrangler deploy

# View live logs
wrangler tail

# View deployment info
wrangler deployments list
```

### Testing Deployment

```bash
# Test locally first
bun run dev

# Test cron endpoints manually
curl http://localhost:8787/cron/post-articles
curl http://localhost:8787/cron/update-metrics

# Check stats endpoint
curl http://localhost:8787/stats
```

## Environment Variables

Defined in `wrangler.toml`:

```toml
[vars]
ORG_MEMBERS = "wakuto,example-user"
DEFAULT_SCORE_THRESHOLD = "25"
```

**Never commit secrets** to `wrangler.toml`. Use `wrangler secret put` instead.

## Secrets Management

Set secrets via Wrangler CLI:

```bash
# Qiita API
wrangler secret put QIITA_TOKEN

# Anthropic (Claude) API
wrangler secret put ANTHROPIC_API_KEY

# X (Twitter) API
wrangler secret put TWITTER_API_KEY
wrangler secret put TWITTER_API_SECRET
wrangler secret put TWITTER_ACCESS_TOKEN
wrangler secret put TWITTER_ACCESS_SECRET
wrangler secret put TWITTER_BEARER_TOKEN

# Optional: Slack notifications
wrangler secret put SLACK_WEBHOOK_URL
```

**List secrets:**

```bash
wrangler secret list
```

**Delete secret:**

```bash
wrangler secret delete SECRET_NAME
```

## Resource Setup

### KV Namespace

```bash
# Create KV namespace
wrangler kv:namespace create KV

# Get namespace ID
wrangler kv:namespace list

# Add to wrangler.toml:
[[kv_namespaces]]
binding = "KV"
id = "YOUR_NAMESPACE_ID"
```

### D1 Database

```bash
# Create database
wrangler d1 create qiita-bot-db

# Get database ID
wrangler d1 list

# Add to wrangler.toml:
[[d1_databases]]
binding = "DB"
database_name = "qiita-bot-db"
database_id = "YOUR_DATABASE_ID"

# Apply schema
wrangler d1 execute qiita-bot-db --file=./schema.sql

# Query database (for debugging)
wrangler d1 execute qiita-bot-db --command="SELECT * FROM posts LIMIT 10"
```

### Vectorize Index

```bash
# Create Vectorize index
wrangler vectorize create article-embeddings \
  --dimensions=1024 \
  --metric=cosine

# Get index info
wrangler vectorize list

# Add to wrangler.toml:
[[vectorize]]
binding = "VECTORIZE"
index_name = "article-embeddings"
```

### Workers AI Binding

Add to `wrangler.toml`:

```toml
[ai]
binding = "AI"
```

No additional setup required (automatically available on Cloudflare Workers).

## Cron Triggers

Defined in `wrangler.toml`:

```toml
[triggers]
crons = [
  "0 9 * * 1,4",  # Monday & Thursday at 9:00 JST (0:00 UTC)
  "0 2 * * *"     # Daily at 2:00 JST (17:00 UTC previous day)
]
```

**Cron schedule:**
- **Post articles**: Monday & Thursday at 9:00 JST
- **Update metrics**: Daily at 2:00 JST

The `handleScheduled()` function in `src/index.ts` routes to appropriate endpoints based on UTC hour.

### Testing Cron Locally

Cron triggers don't fire in local dev. Test endpoints directly:

```bash
# Start dev server
bun run dev

# Trigger post-articles workflow
curl http://localhost:8787/cron/post-articles

# Trigger update-metrics workflow
curl http://localhost:8787/cron/update-metrics
```

## CI/CD Pipeline

GitHub Actions workflow (`.github/workflows/ci.yml`):

```yaml
name: CI/CD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run ci  # typecheck + lint + format + test

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

**Required GitHub Secrets:**
- `CLOUDFLARE_API_TOKEN`: Cloudflare API token with Workers edit permissions

## Monitoring

### Live Logs

```bash
# Tail logs in real-time
wrangler tail

# Filter by status
wrangler tail --status error

# Filter by method
wrangler tail --method GET
```

### Health Checks

```bash
# Check if worker is running
curl https://your-worker.workers.dev/

# Get stats
curl https://your-worker.workers.dev/stats
```

### Database Queries

```bash
# Check recent posts
wrangler d1 execute qiita-bot-db \
  --command="SELECT * FROM posts ORDER BY posted_at DESC LIMIT 10"

# Check token usage
wrangler d1 execute qiita-bot-db \
  --command="SELECT SUM(cost) as total_cost FROM token_usage WHERE created_at > date('now', '-30 days')"

# Check execution logs
wrangler d1 execute qiita-bot-db \
  --command="SELECT * FROM execution_logs ORDER BY executed_at DESC LIMIT 10"
```

## Cost Monitoring

Monitor Cloudflare Workers usage:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages** → **your-worker** → **Metrics**
3. Check:
   - **Requests**: Should be ~60-100/month (2 cron triggers/day)
   - **CPU time**: Should be minimal (< 10ms per request)
   - **KV reads/writes**: Low volume
   - **D1 reads/writes**: Low volume

Target monthly cost: **~$1** (mostly AI API costs, Workers usage is free tier)

## Rollback

If deployment has issues:

```bash
# List deployments
wrangler deployments list

# Rollback to previous deployment
wrangler rollback --deployment-id DEPLOYMENT_ID
```

## Environment Isolation

Use separate environments for dev/prod:

```bash
# Deploy to staging
wrangler deploy --env staging

# Deploy to production
wrangler deploy --env production
```

Add to `wrangler.toml`:

```toml
[env.staging]
name = "qiita-bot-staging"
vars = { DEFAULT_SCORE_THRESHOLD = "20" }

[env.production]
name = "qiita-bot"
vars = { DEFAULT_SCORE_THRESHOLD = "25" }
```

## Troubleshooting

### Deployment Fails

1. **Check Wrangler version**: `wrangler --version` (should be v4+)
2. **Verify secrets**: `wrangler secret list`
3. **Check bindings**: Ensure KV, D1, Vectorize are created
4. **Review logs**: `wrangler tail --status error`

### Cron Not Triggering

1. **Verify cron schedule**: Check `wrangler.toml` `[triggers]` section
2. **Check UTC time**: Crons use UTC, not local time
3. **Test endpoint manually**: `curl https://your-worker.workers.dev/cron/post-articles`
4. **Review execution logs**: Query D1 `execution_logs` table

### High Costs

1. **Check token usage**: Query D1 `token_usage` table
2. **Verify meta-score filtering**: Ensure low-quality articles are filtered
3. **Review batch sizes**: Should be 5-10 articles per batch
4. **Check compression**: Verify `compressForEvaluation()` is applied

### Database Issues

1. **Verify schema**: `wrangler d1 execute qiita-bot-db --file=./schema.sql`
2. **Check migrations**: Ensure all tables exist
3. **Query directly**: Use `wrangler d1 execute` to debug

## Security Best Practices

- **Never commit secrets** to version control
- **Use environment variables** for configuration
- **Rotate API keys** regularly
- **Limit CORS** if adding web UI
- **Monitor access logs** for suspicious activity
- **Use Cloudflare Access** for sensitive endpoints (optional)

## Deployment Checklist

Before deploying to production:

- [ ] All tests pass (`bun run ci`)
- [ ] Secrets are set (`wrangler secret list`)
- [ ] KV namespace created and bound
- [ ] D1 database created and schema applied
- [ ] Vectorize index created and bound
- [ ] Cron triggers configured
- [ ] Environment variables set in `wrangler.toml`
- [ ] GitHub Actions secrets configured
- [ ] Monitoring setup (logs, metrics)
- [ ] Cost tracking enabled (D1 `token_usage` table)
- [ ] Documentation updated (README, CLAUDE.md)
