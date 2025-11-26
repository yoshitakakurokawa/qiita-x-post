import { QiitaArticle } from '../types/qiita';

/**
 * 記事のメタスコアを計算（AI評価前のフィルタリング用）
 * 最大45点満点
 */
export function calculateMetaScore(article: QiitaArticle): number {
  let score = 0;

  // いいね数 (最大10点)
  score += Math.min(10, Math.floor(article.likes_count / 5));

  // ストック数 (最大10点)
  score += Math.min(10, Math.floor(article.stocks_count / 3));

  // 鮮度スコア (最大10点)
  const daysOld = (Date.now() - new Date(article.updated_at).getTime()) / (1000 * 60 * 60 * 24);
  if (daysOld < 7) {
    score += 10;
  } else if (daysOld < 30) {
    score += 7;
  } else if (daysOld < 90) {
    score += 5;
  } else if (daysOld < 365) {
    score += 3;
  } else {
    score += 1;
  }

  // タグの質 (最大5点)
  const premiumTags = [
    'TypeScript', 'React', 'AWS', 'Python', 'Next.js',
    'Claude', 'AI', 'OpenAI', 'LLM', '機械学習',
    'Docker', 'Kubernetes', 'Go', 'Rust', 'Vue.js'
  ];
  const matchingTags = article.tags.filter(t =>
    premiumTags.some(pt => pt.toLowerCase() === t.name.toLowerCase())
  ).length;
  score += Math.min(5, matchingTags * 2);

  // コメント数 (最大5点) - エンゲージメントの指標
  score += Math.min(5, Math.floor(article.comments_count / 2));

  // 記事の完成度 (最大5点)
  let completenessScore = 0;

  // 記事の長さ（3000文字以上で満点）
  if (article.body.length >= 3000) {
    completenessScore += 2;
  } else if (article.body.length >= 1500) {
    completenessScore += 1;
  }

  // コードブロックの存在
  const codeBlockCount = (article.body.match(/```/g) || []).length / 2;
  if (codeBlockCount >= 2) {
    completenessScore += 2;
  } else if (codeBlockCount >= 1) {
    completenessScore += 1;
  }

  // 見出しの存在
  const headingCount = (article.body.match(/^#+\s/gm) || []).length;
  if (headingCount >= 3) {
    completenessScore += 1;
  }

  score += completenessScore;

  return Math.round(score);
}

/**
 * メタスコアに基づいて記事をフィルタリング
 */
export function filterByMetaScore(
  articles: QiitaArticle[],
  threshold: number = 25
): Array<QiitaArticle & { metaScore: number }> {
  return articles
    .map(article => ({
      ...article,
      metaScore: calculateMetaScore(article)
    }))
    .filter(article => article.metaScore >= threshold)
    .sort((a, b) => b.metaScore - a.metaScore);
}

/**
 * スコアに基づいてAIモデルを選択
 */
export function selectAIModel(metaScore: number): 'sonnet' | 'haiku' | 'skip' {
  if (metaScore >= 35) {
    return 'sonnet'; // 高品質な記事はSonnetで丁寧に
  } else if (metaScore >= 20) {
    return 'haiku'; // 中品質な記事はHaikuで効率的に
  } else {
    return 'skip'; // 低品質な記事はAI評価スキップ
  }
}

/**
 * トークン数を推定
 */
export function estimateTokens(text: string): number {
  // 英語: 4文字 ≒ 1トークン
  // 日本語: 1文字 ≒ 1.5トークン（概算）
  const japaneseChars = (text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g) || []).length;
  const otherChars = text.length - japaneseChars;

  return Math.ceil(japaneseChars * 1.5 + otherChars / 4);
}
