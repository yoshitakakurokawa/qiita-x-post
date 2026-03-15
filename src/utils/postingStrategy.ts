/**
 * 投稿戦略の定義
 */

export interface PostingStrategy {
  daysBack: number; // 何日前まで遡るか
  metaScoreThreshold: number; // メタスコアの閾値
  prioritizeRecent: boolean; // 新しい記事を優先するか
  allowRepost: boolean; // 再投稿を許可するか（7日以上経過）
  fallbackEnabled: boolean; // 閾値未満でも最善の記事を1件投稿するか
}

/**
 * 曜日ごとの投稿戦略
 * 0: 日曜, 1: 月曜, 2: 火曜, 3: 水曜, 4: 木曜, 5: 金曜, 6: 土曜
 */
export const weekdayStrategies: Record<number, PostingStrategy> = {
  0: {
    // 日曜: 最新の記事優先
    daysBack: 14,
    metaScoreThreshold: 8,
    prioritizeRecent: true,
    allowRepost: false,
    fallbackEnabled: true,
  },
  1: {
    // 月曜: 新しめ + そこそこのスコア
    daysBack: 30,
    metaScoreThreshold: 12,
    prioritizeRecent: true,
    allowRepost: true,
    fallbackEnabled: true,
  },
  2: {
    // 火曜: 古いけど高スコア（閾値緩和）
    daysBack: 180,
    metaScoreThreshold: 20,
    prioritizeRecent: false,
    allowRepost: true,
    fallbackEnabled: true,
  },
  3: {
    // 水曜: 最新の記事優先
    daysBack: 14,
    metaScoreThreshold: 8,
    prioritizeRecent: true,
    allowRepost: false,
    fallbackEnabled: true,
  },
  4: {
    // 木曜: 新しめ + そこそこのスコア
    daysBack: 30,
    metaScoreThreshold: 12,
    prioritizeRecent: true,
    allowRepost: true,
    fallbackEnabled: true,
  },
  5: {
    // 金曜: 古いけど高スコア（閾値緩和）
    daysBack: 180,
    metaScoreThreshold: 20,
    prioritizeRecent: false,
    allowRepost: true,
    fallbackEnabled: true,
  },
  6: {
    // 土曜: バランス型
    daysBack: 60,
    metaScoreThreshold: 12,
    prioritizeRecent: true,
    allowRepost: true,
    fallbackEnabled: true,
  },
};

/**
 * 現在の曜日を取得（JST）
 */
export function getCurrentWeekday(): number {
  // JSTはUTC+9なので、UTC時間に9時間を加算
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000; // 9時間をミリ秒に変換
  const jstTime = new Date(now.getTime() + jstOffset);
  return jstTime.getUTCDay();
}

/**
 * アドベントカレンダー期間かどうかを判定
 */
export function isAdventCalendarPeriod(): boolean {
  const now = new Date();
  const month = now.getUTCMonth() + 1; // 0-11 → 1-12
  const day = now.getUTCDate();

  // 12月1日〜12月25日
  return month === 12 && day >= 1 && day <= 25;
}

/**
 * 夕方投稿用の戦略を取得
 */
export function getEveningStrategy(env: {
  EVENING_POST_THRESHOLD?: string;
  ADVENT_CALENDAR_THRESHOLD?: string;
}): PostingStrategy {
  const threshold = parseInt(env.EVENING_POST_THRESHOLD || '15', 10);
  const isAdvent = isAdventCalendarPeriod();
  const adventThreshold = parseInt(env.ADVENT_CALENDAR_THRESHOLD || '10', 10);

  return {
    daysBack: 7, // 過去7日間（複数同時投稿を見落とさないため）
    metaScoreThreshold: isAdvent ? adventThreshold : threshold,
    prioritizeRecent: false, // 古い順にソート（最古のものを送信）
    allowRepost: false,
    fallbackEnabled: true,
  };
}
