import { Env } from '../types/common';
import { AIEngine } from '../ai/engine';
import { XAPIClient } from '../api/x';
import { SlackClient } from '../api/slack';
import { VectorService } from '../utils/vector';
import { QiitaArticle } from '../types/qiita';
import { selectAIModel } from '../utils/scoring';
import { ArticleEvaluation, BatchEvaluationResult } from '../types/ai';

export class PostService {
  private env: Env;
  private aiEngine: AIEngine;
  private xClient: XAPIClient;
  private vectorService?: VectorService;

  constructor(env: Env) {
    this.env = env;
    this.aiEngine = new AIEngine(env.ANTHROPIC_API_KEY);
    this.xClient = new XAPIClient(
      env.TWITTER_API_KEY,
      env.TWITTER_API_SECRET,
      env.TWITTER_ACCESS_TOKEN,
      env.TWITTER_ACCESS_SECRET
    );
    if (env.AI && env.VECTORIZE) {
      this.vectorService = new VectorService(env.AI, env.VECTORIZE);
    }
  }

  async evaluateArticles(articles: Array<QiitaArticle & { metaScore: number }>): Promise<{ result: BatchEvaluationResult; cost: number } | null> {
    if (articles.length === 0) return null;

    const modelType = selectAIModel(articles[0].metaScore);
    if (modelType === 'skip') return null;

    const batchResult = await this.aiEngine.evaluateBatch(articles.slice(0, 5), modelType);
    
    const cost = this.aiEngine.calculateCost(
      batchResult.total_tokens * 0.7,
      batchResult.total_tokens * 0.3,
      batchResult.model_used
    );

    return { result: batchResult, cost };
  }

  async postBestArticle(
    article: QiitaArticle & { metaScore: number },
    evaluation: ArticleEvaluation,
    modelUsed: string
  ): Promise<{ tweetId: string; cost: number }> {
    // Generate tweet
    const tweetContent = await this.aiEngine.generateTweetContent(
      article,
      evaluation.total_score,
      evaluation.total_score >= 35 ? 'sonnet' : 'haiku'
    );

    // Post to X
    const hashtags = tweetContent.hashtags.map(tag => `#${tag}`).join(' ');
    const fullTweetText = `${tweetContent.text}\n\n${article.url}\n\n${hashtags}`;
    const tweetResponse = await this.xClient.postTweet(fullTweetText);

    // Save to DB
    await this.env.DB.prepare(
      `INSERT INTO posts (
        article_id, article_title, article_url, author_id,
        tweet_id, tweet_text, hashtags, score, meta_score, ai_model, posted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        article.id,
        article.title,
        article.url,
        article.user.id,
        tweetResponse.data.id,
        tweetContent.text,
        JSON.stringify(tweetContent.hashtags),
        evaluation.total_score,
        article.metaScore,
        modelUsed,
        new Date().toISOString()
      )
      .run();

    // Save embedding
    if (this.vectorService) {
      try {
        const embedding = await this.vectorService.generateArticleEmbedding(article);
        await this.vectorService.insertArticle(article, embedding);
      } catch (e) {
        console.error('Failed to save embedding:', e);
      }
    }

    // Notify Slack
    if (this.env.SLACK_WEBHOOK_URL) {
      const slackClient = new SlackClient(this.env.SLACK_WEBHOOK_URL);
      await slackClient.notifyPostSuccess(
        article.title,
        article.url,
        tweetResponse.data.id,
        evaluation.total_score
      );
    }

    return { tweetId: tweetResponse.data.id, cost: 0 }; // Cost calculation for generation omitted for brevity or can be added
  }

  async logTokenUsage(articleId: string, operation: string, model: string, tokens: number, cost: number) {
    await this.env.DB.prepare(
      `INSERT INTO token_usage (article_id, operation, model, input_tokens, output_tokens, cost_usd, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        articleId,
        operation,
        model,
        Math.floor(tokens * 0.7),
        Math.floor(tokens * 0.3),
        cost,
        new Date().toISOString()
      )
      .run();
  }
}
