# 運用戦略ドキュメント

## 概要

Qiita to X Auto Posterの運用戦略と投稿ルールを定義します。

## 現在の課題

1. **投稿頻度のばらつき**: 記事の投稿頻度にばらつきがあり、1ヶ月記事がない時もザラ
2. **アドベントカレンダー対応**: 12月はアドベントカレンダー期間で、新しい記事を優先的に通知したい
3. **重複防止の改善**: 連続送信は防ぎたいが、過去の掘り返しもしたい
4. **短期間での複数投稿**: 1日以内に複数の記事が投稿される可能性

## 提案する運用戦略

### 1. 毎日の投稿スケジュール

#### 朝の投稿（毎日 9:00 JST）

**目的**: 厳選された高品質記事を投稿

**戦略**: 曜日ごとに異なる判断基準を適用

| 曜日 | 戦略 | 説明 |
|------|------|------|
| 月曜 | 新しめ + そこそこのスコア | 過去14日間の記事で、メタスコア25以上 |
| 火曜 | 古いけど高スコア | 過去90日間の記事で、メタスコア40以上 |
| 水曜 | 最新の記事優先 | 過去7日間の記事で、メタスコア20以上（低めでも可） |
| 木曜 | 新しめ + そこそこのスコア | 過去14日間の記事で、メタスコア25以上 |
| 金曜 | 古いけど高スコア | 過去90日間の記事で、メタスコア40以上 |
| 土曜 | バランス型 | 過去28日間の記事で、メタスコア28以上 |
| 日曜 | 最新の記事優先 | 過去7日間の記事で、メタスコア20以上（低めでも可） |

#### 夕方の投稿（毎日 18:00 JST）

**目的**: 複数同時投稿を見落とさないため、過去3日間の記事から古い順に送信

**戦略**: 
- 過去3日間の記事をチェック（複数同時投稿を見落とさないため）
- 古い順にソートして最古のものを送信
- メタスコアの閾値を下げる（15以上）
- アドベントカレンダー期間中はさらに閾値を下げる（10以上）

### 2. 重複防止の改善

#### 現在の問題

- 一度投稿した記事は二度と投稿されない
- 過去の良記事を掘り返せない

#### 改善案

**連続送信防止期間**: 過去7日間以内に投稿した記事は再投稿しない

**再投稿可能期間**: 7日以上経過した記事は再投稿可能

**類似記事の連続送信防止**: 過去3日間以内に類似記事（類似度0.8以上）を投稿した場合はスキップ

### 3. アドベントカレンダー期間の特別処理

**期間**: 12月1日〜12月25日

**特別ルール**:
- メタスコアの閾値を下げる（通常15 → 10）
- 過去3日間の記事をチェック（複数同時投稿を見落とさないため）
- 古い順にソートして最古のものを送信

### 4. 短期間での複数投稿対応

**問題**: 1日以内に複数の記事が投稿される可能性

**対応**:
- 朝の投稿: 1日1件まで（最高スコアの記事のみ）
- 夕方の投稿: その日に投稿された記事があれば、最高スコアの1件を投稿
- 複数候補がある場合: 類似度チェックで連続送信を防止

## 実装案

### エンドポイント構成

1. **`/cron/post-articles-morning`** (毎日 9:00)
   - 曜日ごとの戦略に基づいて厳選記事を投稿

2. **`/cron/post-articles-evening`** (毎日 18:00)
   - その日の新しい記事を優先的に投稿

3. **`/cron/post-articles-advent`** (12月のみ、毎日 12:00)
   - アドベントカレンダー期間中の特別処理

### 重複防止ロジックの改善

```typescript
// 過去7日間以内に投稿した記事は除外
const recentPostedArticles = await getRecentPostedArticles(7); // 過去7日間

// 過去3日間以内に類似記事を投稿した場合は除外
const recentSimilarArticles = await getRecentSimilarArticles(3); // 過去3日間
```

### 曜日ごとの戦略実装

```typescript
interface PostingStrategy {
  daysBack: number;        // 何日前まで遡るか
  metaScoreThreshold: number; // メタスコアの閾値
  prioritizeRecent: boolean;  // 新しい記事を優先するか
  allowRepost: boolean;       // 再投稿を許可するか（7日以上経過）
}

const strategies: Record<number, PostingStrategy> = {
  1: { daysBack: 14, metaScoreThreshold: 25, prioritizeRecent: true, allowRepost: true },  // 月
  2: { daysBack: 90, metaScoreThreshold: 40, prioritizeRecent: false, allowRepost: true },  // 火
  3: { daysBack: 7, metaScoreThreshold: 20, prioritizeRecent: true, allowRepost: false },    // 水
  4: { daysBack: 14, metaScoreThreshold: 25, prioritizeRecent: true, allowRepost: true },   // 木
  5: { daysBack: 90, metaScoreThreshold: 40, prioritizeRecent: false, allowRepost: true }, // 金
  6: { daysBack: 28, metaScoreThreshold: 28, prioritizeRecent: true, allowRepost: true },  // 土
  0: { daysBack: 7, metaScoreThreshold: 20, prioritizeRecent: true, allowRepost: false },  // 日
};
```

## 設定項目

### 環境変数（wrangler.toml）

```toml
[vars]
# 既存
ORG_MEMBERS = "..."
DEFAULT_SCORE_THRESHOLD = "25"

# 新規追加
RECENT_POST_COOLDOWN_DAYS = "7"        # 連続送信防止期間（日）
SIMILAR_POST_COOLDOWN_DAYS = "3"      # 類似記事の連続送信防止期間（日）
ADVENT_CALENDAR_THRESHOLD = "15"      # アドベントカレンダー期間のメタスコア閾値
EVENING_POST_THRESHOLD = "15"         # 夕方投稿のメタスコア閾値
```

## Cron設定

```toml
[triggers]
crons = [
  "0 0 * * *",   # 朝の投稿: 毎日 9:00 JST (UTC 0:00)
  "0 9 * * *",   # 夕方の投稿: 毎日 18:00 JST (UTC 9:00)
  "0 2 * * *"    # メトリクス更新: 毎日 2:00 JST (UTC 17:00前日)
]
```

## 実装優先順位

### Phase 1: 基本機能（最優先）

1. ✅ 重複防止ロジックの改善（7日間のクールダウン）
2. ✅ 夕方の投稿エンドポイント追加
3. ✅ 曜日ごとの戦略実装

### Phase 2: アドベントカレンダー対応

1. アドベントカレンダー期間の検出
2. 特別ルールの適用
3. 閾値の動的調整

### Phase 3: 高度な機能

1. 類似記事の連続送信防止
2. 複数候補からの最適選択
3. 投稿履歴の分析と最適化

## 注意事項

- **コスト管理**: 毎日投稿することでAI評価のコストが増加する可能性があります
- **レート制限**: X APIのレート制限に注意が必要です
- **ユーザー体験**: 投稿頻度が高すぎるとフォロワーに迷惑になる可能性があります

## モニタリング

以下のメトリクスを監視してください：

- 1日あたりの投稿数
- メタスコアの分布
- AI評価のコスト
- エンゲージメント率の変化
- 重複防止の効果

