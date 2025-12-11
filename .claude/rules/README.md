# Claude Code Rules

This directory contains modular rules for Claude Code to follow when working with this codebase.

## Overview

These rules provide specific guidance for maintaining code quality, architecture consistency, and cost optimization in the Qiita-to-X auto-posting system.

## Rule Files

### 1. [code-style.md](./code-style.md)
**Code formatting, linting, and naming conventions**

- Biome configuration (50-100x faster than ESLint/Prettier)
- TypeScript strict mode guidelines
- Naming conventions (camelCase, PascalCase, UPPER_CASE)
- Import organization
- Error handling patterns
- Cloudflare Workers specific patterns

**Use when:** Writing or modifying any TypeScript code

### 2. [architecture.md](./architecture.md)
**System architecture and design patterns**

- Service layer pattern with dependency injection
- Multi-stage filtering pipeline (meta-score → AI evaluation)
- Data access patterns (KV, D1, Vectorize)
- Endpoint design with Hono framework
- Cron trigger handling
- Future extension points

**Use when:** Designing new features, refactoring services, or understanding system flow

### 3. [ai-optimization.md](./ai-optimization.md)
**Cost optimization and token reduction strategies**

- Meta-score filtering (pre-AI evaluation)
- Batch evaluation techniques
- Token compression utilities
- Dynamic model selection (Sonnet vs. Haiku)
- Differential processing
- Semantic deduplication
- Performance targets (~$1/month operation)

**Use when:** Working with AI prompts, evaluation logic, or cost-sensitive features

### 4. [testing.md](./testing.md)
**Testing strategy and coverage requirements**

- Vitest configuration and best practices
- 70% coverage threshold
- Test priorities (meta-scoring, token optimization, AI prompts)
- Mocking external services (Anthropic, Cloudflare bindings)
- Performance testing for token compression

**Use when:** Writing tests, debugging test failures, or verifying coverage

### 5. [type-system.md](./type-system.md)
**Valibot schemas and TypeScript type definitions**

- Valibot usage (95% lighter than Zod)
- Schema definition patterns
- Runtime validation
- Type inference with `v.InferOutput<typeof Schema>`
- Error handling for validation failures

**Use when:** Defining new types, validating API responses, or parsing external data

### 6. [deployment.md](./deployment.md)
**Deployment workflow and infrastructure setup**

- Wrangler commands for deployment
- Secrets management
- Resource setup (KV, D1, Vectorize, Workers AI)
- Cron trigger configuration
- CI/CD pipeline with GitHub Actions
- Monitoring and cost tracking

**Use when:** Deploying to production, setting up infrastructure, or troubleshooting deployment issues

## How Claude Code Uses These Rules

When you work with Claude Code in this repository:

1. **Claude automatically reads** all files in `.claude/rules/` directory
2. **Rules are applied contextually** based on the task at hand
3. **Modular design** allows focusing on specific aspects (e.g., only testing rules when writing tests)
4. **CLAUDE.md is still the source of truth** - these rules complement and expand on it

## Priority Order

When there are conflicts, follow this priority:

1. **Project-specific requirements** (in CLAUDE.md)
2. **Rule files** (this directory)
3. **Biome configuration** (biome.json)
4. **TypeScript configuration** (tsconfig.json)

## Updating Rules

When updating rules:

1. Keep them **concise and actionable**
2. Include **code examples** for clarity
3. Reference **specific file paths** when applicable
4. Update this README if adding new rule files
5. Ensure **consistency** across all rule files

## Quick Reference

### Development Workflow

```bash
# Install dependencies
bun install

# Start dev server
bun run dev

# Run all checks (before committing)
bun run ci
```

### Code Quality

```bash
# Lint and format
bun run check

# Type checking
bun run typecheck

# Run tests
bun run test:coverage
```

### Deployment

```bash
# Deploy to production
wrangler deploy

# View logs
wrangler tail
```

## Rule File Maintenance

These rules should be updated when:

- **Architecture changes** (new services, patterns, or data flows)
- **Tooling updates** (new versions of Biome, Vitest, Wrangler, etc.)
- **Cost optimization improvements** (new compression techniques, better filtering)
- **Testing strategies evolve** (new test patterns, coverage requirements)
- **Type system patterns change** (Valibot updates, new schema patterns)
- **Deployment processes change** (new CI/CD steps, infrastructure updates)

## See Also

- [CLAUDE.md](../../CLAUDE.md) - Main project documentation
- [README.md](../../README.md) - User-facing documentation
- [biome.json](../../biome.json) - Linter and formatter configuration
- [vitest.config.ts](../../vitest.config.ts) - Test configuration
- [wrangler.toml](../../wrangler.toml) - Cloudflare Workers configuration
