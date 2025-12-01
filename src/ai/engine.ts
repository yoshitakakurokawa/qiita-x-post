import Anthropic from '@anthropic-ai/sdk';
import * as v from 'valibot';
import { type BatchEvaluationResult, MODEL_CONFIGS, PRICING, type TweetContent } from '../types/ai';
import type { QiitaArticle } from '../types/qiita';
import { ArticleEvaluationSchema, TweetContentSchema } from '../types/schemas';
import { compressForEvaluation, optimizeForSummarization } from '../utils/tokens';

export class AIEngine {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  /**
   * 複数記事をバッチで評価（コスト最適化）
   */
  async evaluateBatch(
    articles: Array<QiitaArticle & { metaScore: number }>,
    modelType: 'sonnet' | 'haiku' = 'sonnet'
  ): Promise<BatchEvaluationResult> {
    const config = MODEL_CONFIGS[modelType];

    // 各記事を300文字程度に圧縮
    const compressed = articles.map((article) => compressForEvaluation(article));

    const prompt = `以下の${articles.length}件のQiita記事を評価してください。

${compressed.map((c, i) => `## 記事${i + 1}\n${c}`).join('\n\n')}

各記事について、以下の観点で評価し、JSON配列で返してください：
1. 技術的価値（新規性、実用性、学び）
2. 内容の質（構成、説明の分かりやすさ）
3. SNSでのシェア価値（インパクト、話題性）

評価基準:
- 40点以上: 素晴らしい記事。必ず投稿すべき
- 30-39点: 良い記事。投稿する価値あり
- 20-29点: 普通の記事。状況次第
- 20点未満: 投稿不要

\`\`\`json
[
  {
    "article_id": "記事ID",
    "total_score": 35,
    "recommended": true,
    "reasoning": "評価理由を50文字以内で簡潔に"
  }
]
\`\`\``;

    const message = await this.client.messages.create({
      model: config.model,
      max_tokens: config.max_tokens,
      temperature: config.temperature,
      messages: [{ role: 'user', content: prompt }],
    });

    // レスポンスからJSONを抽出
    const firstContent = message.content[0];
    if (!firstContent) {
      throw new Error('No content in AI response');
    }
    const responseText = firstContent.type === 'text' ? firstContent.text : '';
    const jsonMatch = responseText.match(/```json\n([\s\S]+?)\n```/);

    if (!jsonMatch || !jsonMatch[1]) {
      throw new Error('Failed to parse AI response');
    }

    const rawEvaluations = JSON.parse(jsonMatch[1]);
    const evaluations = v.parse(v.array(ArticleEvaluationSchema), rawEvaluations);

    // トークン使用量を計算
    const totalTokens = message.usage.input_tokens + message.usage.output_tokens;

    return {
      evaluations,
      total_tokens: totalTokens,
      model_used: config.model,
    };
  }

  /**
   * 記事から投稿文を生成
   */
  async generateTweetContent(
    article: QiitaArticle,
    score: number,
    modelType: 'sonnet' | 'haiku' = 'haiku'
  ): Promise<TweetContent> {
    const config = MODEL_CONFIGS[modelType];

    // 記事を3000文字に最適化
    const optimized = optimizeForSummarization(article);

    const prompt = `以下のQiita記事について、Xに投稿する文章を作成してください。

記事タイトル: ${article.title}
記事URL: ${article.url}
評価スコア: ${score}点

記事内容:
${optimized}

要件:
1. 記事の核心的な価値を伝える
2. エンジニアの興味を引く
3. 280文字以内（URLとハッシュタグ除く）
4. 絵文字は控えめに（0-2個）
5. 数値や具体例を入れると良い

以下のJSON形式で返してください:
\`\`\`json
{
  "text": "投稿文（URLやハッシュタグは含めない）",
  "hashtags": ["Qiita", "関連タグ1", "関連タグ2"],
  "estimated_engagement": 75
}
\`\`\``;

    const message = await this.client.messages.create({
      model: config.model,
      max_tokens: config.max_tokens,
      temperature: config.temperature,
      messages: [{ role: 'user', content: prompt }],
    });

    const firstContent = message.content[0];
    if (!firstContent) {
      throw new Error('No content in AI response');
    }
    const responseText = firstContent.type === 'text' ? firstContent.text : '';
    const jsonMatch = responseText.match(/```json\n([\s\S]+?)\n```/);

    if (!jsonMatch || !jsonMatch[1]) {
      throw new Error('Failed to parse AI response');
    }

    const rawTweetContent = JSON.parse(jsonMatch[1]);
    const tweetContent = v.parse(TweetContentSchema, rawTweetContent);

    return tweetContent;
  }

  /**
   * トークン使用コストを計算
   */
  calculateCost(inputTokens: number, outputTokens: number, model: string): number {
    const pricing = PRICING[model as keyof typeof PRICING];
    if (!pricing) {
      throw new Error(`Unknown model: ${model}`);
    }

    return inputTokens * pricing.input + outputTokens * pricing.output;
  }

  /**
   * Few-Shot Learningで過去の成功例を活用
   */
  async generateTweetWithExamples(
    article: QiitaArticle,
    score: number,
    successExamples: Array<{ article_title: string; tweet_text: string; engagement_rate: number }>,
    modelType: 'sonnet' | 'haiku' = 'haiku'
  ): Promise<TweetContent> {
    const config = MODEL_CONFIGS[modelType];
    const optimized = optimizeForSummarization(article);

    const examplesText = successExamples
      .map(
        (ex, i) =>
          `例${i + 1}:\n記事: ${ex.article_title}\n投稿文: ${ex.tweet_text}\nエンゲージメント率: ${ex.engagement_rate}%`
      )
      .join('\n\n');

    const prompt = `過去の成功事例を参考に、以下のQiita記事の投稿文を作成してください。

【過去の成功事例】
${examplesText}

【今回の記事】
タイトル: ${article.title}
URL: ${article.url}
評価スコア: ${score}点

記事内容:
${optimized}

要件:
1. 成功事例のスタイルを参考にする
2. 280文字以内（URLとハッシュタグ除く）
3. エンジニアの興味を引く表現

\`\`\`json
{
  "text": "投稿文",
  "hashtags": ["Qiita", "関連タグ1"],
  "estimated_engagement": 80
}
\`\`\``;

    const message = await this.client.messages.create({
      model: config.model,
      max_tokens: config.max_tokens,
      temperature: config.temperature,
      messages: [{ role: 'user', content: prompt }],
    });

    const firstContent = message.content[0];
    if (!firstContent) {
      throw new Error('No content in AI response');
    }
    const responseText = firstContent.type === 'text' ? firstContent.text : '';
    const jsonMatch = responseText.match(/```json\n([\s\S]+?)\n```/);

    if (!jsonMatch || !jsonMatch[1]) {
      throw new Error('Failed to parse AI response');
    }

    const rawTweetContent = JSON.parse(jsonMatch[1]);
    return v.parse(TweetContentSchema, rawTweetContent);
  }
}
