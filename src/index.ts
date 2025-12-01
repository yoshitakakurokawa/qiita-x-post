import { Hono } from 'hono';
import { SlackClient } from './api/slack';
import { ArticleService } from './services/articleService';
import { MetricsService } from './services/metricsService';
import { PostService } from './services/postService';
import type { Env } from './types/common';
import { logExecution } from './utils/logger';

const app = new Hono<{ Bindings: Env }>();

/**
 * メインエントリポイント（Cron Trigger用）
 */
app.get('/cron/post-articles', async (c) => {
  try {
    const env = c.env;
    const startTime = Date.now();

    // Initialize services
    const articleService = new ArticleService(env);
    const postService = new PostService(env);

    // 前回実行時刻を取得
    const lastRunKey = 'last_post_run';
    const lastRunTime = await env.KV.get(lastRunKey);
    const sinceDate = lastRunTime
      ? new Date(lastRunTime)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    console.log(`Fetching articles since ${sinceDate.toISOString()}`);

    // 1. 記事取得
    const newArticles = await articleService.fetchNewArticles(sinceDate);
    console.log(`Found ${newArticles.length} new/updated articles`);

    if (newArticles.length === 0) {
      await logExecution(env.DB, 'post', 'success', 'No new articles found', 0, 0, 0);
      return c.json({ message: 'No new articles to post' });
    }

    // 2. メタスコアフィルタリング
    const filteredArticles = await articleService.filterArticles(newArticles);
    console.log(`${filteredArticles.length} articles passed meta score filter`);

    if (filteredArticles.length === 0) {
      await logExecution(
        env.DB,
        'post',
        'success',
        'No articles passed meta score filter',
        newArticles.length,
        0,
        0
      );
      return c.json({ message: 'No articles passed meta score filter' });
    }

    // 3. 投稿済み記事を除外
    const unpostedArticles = await articleService.getUnpostedArticles(filteredArticles);
    console.log(`${unpostedArticles.length} articles not yet posted`);

    if (unpostedArticles.length === 0) {
      await logExecution(
        env.DB,
        'post',
        'success',
        'All articles already posted',
        filteredArticles.length,
        0,
        0
      );
      return c.json({ message: 'All articles already posted' });
    }

    // 4. AI評価（バッチ処理）
    const evaluationResult = await postService.evaluateArticles(unpostedArticles);

    if (!evaluationResult) {
      await logExecution(
        env.DB,
        'post',
        'success',
        'Articles skipped due to low meta score',
        unpostedArticles.length,
        0,
        0
      );
      return c.json({ message: 'Articles skipped due to low meta score' });
    }

    const { result: batchResult, cost: evaluationCost } = evaluationResult;
    console.log(`AI evaluation completed. Tokens: ${batchResult.total_tokens}`);

    // トークン使用量を記録
    await postService.logTokenUsage(
      unpostedArticles[0].id, // 代表として最初の記事IDを使用（バッチなので）
      'evaluation',
      batchResult.model_used,
      batchResult.total_tokens,
      evaluationCost
    );

    // 5. 最高スコア記事を選定
    const recommendedEvaluations = batchResult.evaluations.filter((e) => e.recommended);

    if (recommendedEvaluations.length === 0) {
      await logExecution(
        env.DB,
        'post',
        'success',
        'No articles recommended by AI',
        unpostedArticles.length,
        0,
        evaluationCost
      );
      return c.json({ message: 'No articles recommended by AI' });
    }

    const bestEvaluation = recommendedEvaluations.reduce((best, current) =>
      current.total_score > best.total_score ? current : best
    );

    const bestArticle = unpostedArticles.find((a) => a.id === bestEvaluation.article_id);
    if (!bestArticle) {
      throw new Error(`Best article not found: ${bestEvaluation.article_id}`);
    }

    // 6. Vectorize: 類似記事チェック
    const similarityCheck = await articleService.checkSimilarity(bestArticle);
    if (similarityCheck.isSimilar) {
      console.log(
        `Found similar article: ${similarityCheck.similarArticleId} (score: ${similarityCheck.score})`
      );
      // 類似度が高い場合はログに残して今回はスキップせず投稿（要件次第だが、とりあえず投稿する）
      // もしスキップするならここでreturn
    }

    // 7. 投稿文生成 & X投稿
    const { tweetId, cost: generationCost } = await postService.postBestArticle(
      bestArticle,
      bestEvaluation,
      batchResult.model_used
    );

    console.log(`Tweet posted: ${tweetId}`);

    // 実行時刻を保存
    await env.KV.put(lastRunKey, new Date().toISOString());

    // 実行ログ
    const totalCost = evaluationCost + generationCost;
    await logExecution(
      env.DB,
      'post',
      'success',
      `Posted: ${bestArticle.title}`,
      unpostedArticles.length,
      1,
      totalCost
    );

    const executionTime = Date.now() - startTime;
    return c.json({
      message: 'Article posted successfully',
      article: bestArticle.title,
      tweet_id: tweetId,
      score: bestEvaluation.total_score,
      execution_time_ms: executionTime,
    });
  } catch (error) {
    if (c.env.SLACK_WEBHOOK_URL) {
      const slackClient = new SlackClient(c.env.SLACK_WEBHOOK_URL);
      await slackClient.notifyError(error instanceof Error ? error.message : String(error));
    }

    await logExecution(
      c.env.DB,
      'post',
      'error',
      error instanceof Error ? error.message : String(error),
      0,
      0,
      0
    );

    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

/**
 * メトリクス更新Cron
 */
app.get('/cron/update-metrics', async (c) => {
  try {
    const env = c.env;
    const metricsService = new MetricsService(env);

    const updatedCount = await metricsService.updateMetrics();

    await logExecution(
      env.DB,
      'metrics_update',
      'success',
      `Updated ${updatedCount} posts`,
      updatedCount,
      0,
      0
    );

    return c.json({ message: 'Metrics updated successfully', updated_count: updatedCount });
  } catch (error) {
    await logExecution(
      c.env.DB,
      'metrics_update',
      'error',
      error instanceof Error ? error.message : String(error),
      0,
      0,
      0
    );
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

/**
 * ヘルスチェック
 */
app.get('/', (c) => {
  return c.json({ status: 'ok', service: 'qiita-x-bot' });
});

/**
 * 統計情報
 */
app.get('/stats', async (c) => {
  try {
    const env = c.env;
    const metricsService = new MetricsService(env);
    const stats = await metricsService.getStats();
    return c.json(stats);
  } catch (error) {
    console.error('Error in /stats endpoint:', error);
    return c.json(
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      500
    );
  }
});

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(handleScheduled(event, env));
  },
};

async function handleScheduled(event: ScheduledEvent, env: Env) {
  const hour = new Date(event.scheduledTime).getUTCHours();

  // 月・木 9:00 (UTC 0:00) → 記事投稿
  if (hour === 0) {
    const request = new Request('http://localhost/cron/post-articles');
    await app.fetch(request, env);
  }
  // 毎日 2:00 (UTC 17:00前日) → メトリクス更新
  else if (hour === 17) {
    const request = new Request('http://localhost/cron/update-metrics');
    await app.fetch(request, env);
  }
}
