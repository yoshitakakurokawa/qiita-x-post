import { XAPIClient } from '../api/x';
import type { Env } from '../types/common';

export class MetricsService {
  private env: Env;
  private xClient: XAPIClient;

  constructor(env: Env) {
    this.env = env;
    this.xClient = new XAPIClient(
      env.TWITTER_API_KEY,
      env.TWITTER_API_SECRET,
      env.TWITTER_ACCESS_TOKEN,
      env.TWITTER_ACCESS_SECRET
    );
  }

  async updateMetrics(): Promise<number> {
    // 過去7日間の投稿を取得
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const recentPosts = await this.env.DB.prepare(
      'SELECT tweet_id FROM posts WHERE posted_at > ? ORDER BY posted_at DESC'
    )
      .bind(sevenDaysAgo)
      .all();

    if (!recentPosts.results || recentPosts.results.length === 0) {
      return 0;
    }

    const tweetIds = recentPosts.results.map((post) => (post as { tweet_id: string }).tweet_id);
    const metrics = await this.xClient.getTweetMetrics(tweetIds);

    // D1を更新
    for (const metric of metrics) {
      await this.env.DB.prepare(
        'UPDATE posts SET impressions = ?, engagements = ?, updated_at = ? WHERE tweet_id = ?'
      )
        .bind(metric.impressions, metric.engagements, new Date().toISOString(), metric.tweet_id)
        .run();
    }

    return metrics.length;
  }

  async getStats() {
    try {
      const totalPosts = await this.env.DB.prepare('SELECT COUNT(*) as count FROM posts').first();
      const totalCost = await this.env.DB.prepare(
        'SELECT SUM(cost_usd) as total FROM token_usage'
      ).first();
      const avgEngagement = await this.env.DB.prepare(
        'SELECT AVG(engagement_rate) as avg FROM posts WHERE impressions > 0'
      ).first();

      return {
        total_posts: totalPosts?.count || 0,
        total_cost_usd: totalCost?.total || 0,
        avg_engagement_rate: avgEngagement?.avg || 0,
      };
    } catch (error) {
      console.error('Error in getStats:', error);
      throw error;
    }
  }
}
