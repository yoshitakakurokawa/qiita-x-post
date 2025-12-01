import { Hono } from 'hono';
import { SlackClient } from './api/slack';
import { ArticleService } from './services/articleService';
import { MetricsService } from './services/metricsService';
import { PostService } from './services/postService';
import type { Env } from './types/common';
import { logExecution } from './utils/logger';
import {
  weekdayStrategies,
  getCurrentWeekday,
  isAdventCalendarPeriod,
  getEveningStrategy,
  type PostingStrategy,
} from './utils/postingStrategy';
import { filterByMetaScore } from './utils/scoring';

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

/**
 * テスト用: 記事取得のみ（投稿しない）
 * 本番環境でデータ取得をテストするためのエンドポイント
 */
app.get('/test/fetch-articles', async (c) => {
  try {
    const env = c.env;
    const articleService = new ArticleService(env);

    // クエリパラメータから日時を取得（指定がない場合は過去7日間）
    const sinceParam = c.req.query('since');
    const sinceDate = sinceParam
      ? new Date(sinceParam)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    console.log(`[TEST] Fetching articles since ${sinceDate.toISOString()}`);

    // 1. 記事取得
    const newArticles = await articleService.fetchNewArticles(sinceDate);
    console.log(`[TEST] Found ${newArticles.length} new/updated articles`);

    if (newArticles.length === 0) {
      return c.json({
        message: 'No new articles found',
        since: sinceDate.toISOString(),
        articles: [],
        filtered_articles: [],
        unposted_articles: [],
      });
    }

    // 2. メタスコアフィルタリング
    const filteredArticles = await articleService.filterArticles(newArticles);
    console.log(`[TEST] ${filteredArticles.length} articles passed meta score filter`);

    // 3. 投稿済み記事を除外
    const unpostedArticles = await articleService.getUnpostedArticles(filteredArticles);
    console.log(`[TEST] ${unpostedArticles.length} articles not yet posted`);

    return c.json({
      message: 'Articles fetched successfully (no posting)',
      since: sinceDate.toISOString(),
      articles: {
        total: newArticles.length,
        list: newArticles.map((a) => ({
          id: a.id,
          title: a.title,
          url: a.url,
          author: a.user.id,
          updated_at: a.updated_at,
          likes_count: a.likes_count,
          stocks_count: a.stocks_count,
        })),
      },
      filtered_articles: {
        total: filteredArticles.length,
        list: filteredArticles.map((a) => ({
          id: a.id,
          title: a.title,
          url: a.url,
          author: a.user.id,
          meta_score: a.metaScore,
          updated_at: a.updated_at,
        })),
      },
      unposted_articles: {
        total: unpostedArticles.length,
        list: unpostedArticles.map((a) => ({
          id: a.id,
          title: a.title,
          url: a.url,
          author: a.user.id,
          meta_score: a.metaScore,
          updated_at: a.updated_at,
        })),
      },
    });
  } catch (error) {
    console.error('[TEST] Error in /test/fetch-articles endpoint:', error);
    return c.json(
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      500
    );
  }
});

/**
 * 共通の記事投稿処理
 */
async function postArticleWithStrategy(
  env: Env,
  strategy: PostingStrategy,
  strategyName: string
): Promise<Response> {
  const startTime = Date.now();
  const articleService = new ArticleService(env);
  const postService = new PostService(env);

  try {
    // 戦略に基づいて記事取得期間を決定
    const sinceDate = new Date(Date.now() - strategy.daysBack * 24 * 60 * 60 * 1000);
    console.log(`[${strategyName}] Fetching articles since ${sinceDate.toISOString()}`);

    // 1. 記事取得
    const allArticles = await articleService.fetchNewArticles(sinceDate);
    console.log(`[${strategyName}] Found ${allArticles.length} articles`);

    if (allArticles.length === 0) {
      await logExecution(env.DB, 'post', 'success', `No articles found (${strategyName})`, 0, 0, 0);
      return new Response(
        JSON.stringify({ message: `No articles found (${strategyName})` }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. メタスコアフィルタリング
    const filteredArticles = filterByMetaScore(allArticles, strategy.metaScoreThreshold);
    console.log(`[${strategyName}] ${filteredArticles.length} articles passed meta score filter (threshold: ${strategy.metaScoreThreshold})`);

    if (filteredArticles.length === 0) {
      await logExecution(
        env.DB,
        'post',
        'success',
        `No articles passed meta score filter (${strategyName})`,
        allArticles.length,
        0,
        0
      );
      return new Response(
        JSON.stringify({ message: `No articles passed meta score filter (${strategyName})` }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 3. 投稿済み記事を除外（再投稿許可の設定を考慮）
    const unpostedArticles = await articleService.getUnpostedArticles(
      filteredArticles,
      strategy.allowRepost
    );
    console.log(`[${strategyName}] ${unpostedArticles.length} articles not yet posted (allowRepost: ${strategy.allowRepost})`);

    if (unpostedArticles.length === 0) {
      await logExecution(
        env.DB,
        'post',
        'success',
        `All articles already posted (${strategyName})`,
        filteredArticles.length,
        0,
        0
      );
      return new Response(
        JSON.stringify({ message: `All articles already posted (${strategyName})` }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 4. ソート（戦略に基づく）
    let candidates = unpostedArticles;
    if (strategy.prioritizeRecent) {
      // 新しい記事を優先する場合、新しい順
      candidates = candidates.sort((a, b) => {
        const dateA = new Date(a.updated_at).getTime();
        const dateB = new Date(b.updated_at).getTime();
        return dateB - dateA; // 新しい順
      });
    } else {
      // 古い記事を優先する場合、古い順
      candidates = candidates.sort((a, b) => {
        const dateA = new Date(a.updated_at).getTime();
        const dateB = new Date(b.updated_at).getTime();
        return dateA - dateB; // 古い順
      });
    }

    // 5. 類似記事の連続送信チェック（上位3件まで）
    const finalCandidates = [];
    for (const article of candidates.slice(0, 3)) {
      const recentSimilar = await articleService.checkRecentSimilarPosts(article);
      if (!recentSimilar.hasRecentSimilar) {
        finalCandidates.push(article);
      } else {
        console.log(
          `[${strategyName}] Skipping article ${article.id} due to recent similar post: ${recentSimilar.similarArticleId}`
        );
      }
    }

    if (finalCandidates.length === 0) {
      await logExecution(
        env.DB,
        'post',
        'success',
        `All candidates skipped due to recent similar posts (${strategyName})`,
        unpostedArticles.length,
        0,
        0
      );
      return new Response(
        JSON.stringify({ message: `All candidates skipped due to recent similar posts (${strategyName})` }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 6. AI評価（バッチ処理）
    const evaluationResult = await postService.evaluateArticles(finalCandidates);

    if (!evaluationResult) {
      await logExecution(
        env.DB,
        'post',
        'success',
        `Articles skipped due to low meta score (${strategyName})`,
        finalCandidates.length,
        0,
        0
      );
      return new Response(
        JSON.stringify({ message: `Articles skipped due to low meta score (${strategyName})` }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { result: batchResult, cost: evaluationCost } = evaluationResult;
    console.log(`[${strategyName}] AI evaluation completed. Tokens: ${batchResult.total_tokens}`);

    // トークン使用量を記録
    await postService.logTokenUsage(
      finalCandidates[0].id,
      'evaluation',
      batchResult.model_used,
      batchResult.total_tokens,
      evaluationCost
    );

    // 7. 最高スコア記事を選定
    const recommendedEvaluations = batchResult.evaluations.filter((e) => e.recommended);

    if (recommendedEvaluations.length === 0) {
      await logExecution(
        env.DB,
        'post',
        'success',
        `No articles recommended by AI (${strategyName})`,
        finalCandidates.length,
        0,
        evaluationCost
      );
      return new Response(
        JSON.stringify({ message: `No articles recommended by AI (${strategyName})` }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const bestEvaluation = recommendedEvaluations.reduce((best, current) =>
      current.total_score > best.total_score ? current : best
    );

    const bestArticle = finalCandidates.find((a) => a.id === bestEvaluation.article_id);
    if (!bestArticle) {
      throw new Error(`Best article not found: ${bestEvaluation.article_id}`);
    }

    // 8. 投稿文生成 & X投稿
    const { tweetId, cost: generationCost } = await postService.postBestArticle(
      bestArticle,
      bestEvaluation,
      batchResult.model_used
    );

    console.log(`[${strategyName}] Tweet posted: ${tweetId}`);

    // 実行ログ
    const totalCost = evaluationCost + generationCost;
    await logExecution(
      env.DB,
      'post',
      'success',
      `Posted: ${bestArticle.title} (${strategyName})`,
      finalCandidates.length,
      1,
      totalCost
    );

    const executionTime = Date.now() - startTime;
    return new Response(
      JSON.stringify({
        message: 'Article posted successfully',
        strategy: strategyName,
        article: bestArticle.title,
        tweet_id: tweetId,
        score: bestEvaluation.total_score,
        execution_time_ms: executionTime,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    if (env.SLACK_WEBHOOK_URL) {
      const slackClient = new SlackClient(env.SLACK_WEBHOOK_URL);
      await slackClient.notifyError(
        error instanceof Error ? error.message : String(error)
      );
    }

    await logExecution(
      env.DB,
      'post',
      'error',
      error instanceof Error ? error.message : String(error),
      0,
      0,
      0
    );

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * 朝の投稿エンドポイント（毎日 9:00 JST）
 * 曜日ごとの戦略に基づいて厳選記事を投稿
 */
app.get('/cron/post-articles-morning', async (c) => {
  const weekday = getCurrentWeekday();
  const strategy = weekdayStrategies[weekday];
  const strategyName = `morning-${['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][weekday]}`;

  console.log(`[Morning Post] Weekday: ${weekday}, Strategy: ${strategyName}`);

  return await postArticleWithStrategy(c.env, strategy, strategyName);
});

/**
 * 夕方の投稿エンドポイント（毎日 18:00 JST）
 * その日の新しい記事を優先的に投稿
 */
app.get('/cron/post-articles-evening', async (c) => {
  const strategy = getEveningStrategy(c.env);
  const strategyName = isAdventCalendarPeriod() ? 'evening-advent' : 'evening';

  console.log(`[Evening Post] Strategy: ${strategyName}, IsAdvent: ${isAdventCalendarPeriod()}`);

  return await postArticleWithStrategy(c.env, strategy, strategyName);
});

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(handleScheduled(event, env));
  },
};

async function handleScheduled(event: ScheduledEvent, env: Env) {
  const hour = new Date(event.scheduledTime).getUTCHours();

  // 毎日 9:00 JST (UTC 0:00) → 朝の記事投稿
  if (hour === 0) {
    const request = new Request('http://localhost/cron/post-articles-morning');
    await app.fetch(request, env);
  }
  // 毎日 18:00 JST (UTC 9:00) → 夕方の記事投稿
  else if (hour === 9) {
    const request = new Request('http://localhost/cron/post-articles-evening');
    await app.fetch(request, env);
  }
  // 毎日 2:00 JST (UTC 17:00前日) → メトリクス更新
  else if (hour === 17) {
    const request = new Request('http://localhost/cron/update-metrics');
    await app.fetch(request, env);
  }
}
