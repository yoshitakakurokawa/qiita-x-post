# 開発ガイド

このドキュメントでは、Qiita to X Auto Posterの開発方法、段階的アプローチ、テスト戦略について説明します。

## 目次

1. [段階的実装アプローチ](#段階的実装アプローチ)
2. [テスト戦略](#テスト戦略)
3. [開発環境のセットアップ](#開発環境のセットアップ)
4. [コーディング規約](#コーディング規約)
5. [デバッグ方法](#デバッグ方法)

---

## 段階的実装アプローチ

プロジェクトは4つのフェーズに分けて段階的に実装することを推奨します。

### Phase 1: MVP（最小限の動作確認）

**目標**: 基本動作の確認

**実装内容**:
- ✅ Qiita API記事取得
- ✅ メタスコア計算
- ✅ 単純なAI評価（最適化なし）
- ✅ X投稿

**実装ファイル**:
- `src/api/qiita.ts`: Qiita APIクライアント
- `src/utils/scoring.ts`: メタスコア計算
- `src/ai/engine.ts`: AI評価エンジン
- `src/api/x.ts`: X APIクライアント

**確認事項**:
- [ ] Qiita APIから記事を取得できる
- [ ] メタスコアが正しく計算される
- [ ] AI評価が動作する
- [ ] Xに投稿できる

**完了条件**: 手動実行で1記事をXに投稿できること

---

### Phase 2: 最適化レイヤー追加

**目標**: コスト削減の実証

**実装内容**:
- ✅ トークン最適化（コードブロック圧縮、画像簡略化）
- ✅ バッチ処理（複数記事を1回のAPI呼び出しで評価）
- ✅ キャッシュ戦略（KV Storage）

**実装ファイル**:
- `src/utils/tokens.ts`: トークン最適化関数
- `src/ai/engine.ts`: バッチ評価機能
- `src/index.ts`: キャッシュロジック

**確認事項**:
- [ ] トークン数が73%以上削減されている
- [ ] バッチ処理で複数記事を1回で評価できる
- [ ] キャッシュが正しく動作する
- [ ] コストが$1/月以下になっている

**完了条件**: コストが最適化前の10%以下になっていること

---

### Phase 3: 高度な機能

**目標**: システムの完成度向上

**実装内容**:
- ✅ ベクトル重複除去（Vectorize + Workers AI）
- ✅ エンゲージメント学習（メトリクス取得）
- ⏳ 学習パターンの分析・活用（将来実装予定）

**実装ファイル**:
- `src/utils/vector.ts`: ベクトル埋め込み生成
- `src/services/articleService.ts`: 類似度チェック
- `src/services/metricsService.ts`: メトリクス更新

**確認事項**:
- [ ] 類似記事が正しく検出される
- [ ] メトリクスが正しく取得・記録される
- [ ] 重複投稿が防止される

**完了条件**: 重複投稿が0件、メトリクスが正しく記録されること

---

### Phase 4: 本番運用・記事化

**目標**: 本番環境での安定運用と技術記事執筆

**実装内容**:
- ✅ テスト・デバッグ
- ✅ モニタリング設定
- ⏳ 技術記事執筆

**確認事項**:
- [ ] 全テストがパスする
- [ ] エラーハンドリングが適切
- [ ] ログが正しく記録される
- [ ] 本番環境で1ヶ月以上安定動作

**完了条件**: 本番環境で1ヶ月以上安定動作し、技術記事が公開されること

---

## テスト戦略

### 単体テスト

**目的**: 各関数・クラスの動作を個別に検証

**テスト対象**:

| ファイル | テスト内容 |
|---------|-----------|
| `src/utils/scoring.ts` | メタスコア計算の正確性 |
| `src/utils/tokens.ts` | トークン最適化の圧縮率 |
| `src/utils/vector.ts` | ベクトル埋め込み生成 |

**実行方法**:
```bash
# 全テスト実行
bun test

# カバレッジ付き実行
bun run test:coverage

# UI付き実行
bun run test:ui
```

**テスト例**:
```typescript
// src/utils/scoring.test.ts
import { describe, it, expect } from 'vitest';
import { calculateMetaScore } from './scoring';

describe('calculateMetaScore', () => {
  it('should calculate correct score for high-quality article', () => {
    const article = {
      likes_count: 50,
      stocks_count: 30,
      // ...
    };
    const score = calculateMetaScore(article);
    expect(score).toBeGreaterThan(30);
  });
});
```

**確認事項**:
- [ ] メタスコア計算が正確
- [ ] トークン圧縮率が期待値以上
- [ ] エッジケース（空文字、null等）に対応

---

### 統合テスト

**目的**: 複数コンポーネントの連携を検証

**テスト対象**:

| テストケース | 説明 |
|-------------|------|
| Qiita API → メタスコア → AI評価 | 記事取得から評価までの流れ |
| キャッシュヒット率 | KV Storageのキャッシュ動作 |
| コスト計測 | 実際のトークン使用量とコスト |

**実行方法**:
```bash
# 統合テスト（環境変数が必要）
bun test -- --grep "integration"
```

**テスト例**:
```typescript
// src/ai/engine.test.ts
describe('AIEngine Integration', () => {
  it('should evaluate batch articles correctly', async () => {
    const engine = new AIEngine(process.env.ANTHROPIC_API_KEY!);
    const articles = [/* テスト用記事 */];
    const result = await engine.evaluateBatch(articles);
    
    expect(result.evaluations).toHaveLength(articles.length);
    expect(result.total_tokens).toBeLessThan(10000);
  });
});
```

**確認事項**:
- [ ] 記事取得から投稿までの流れが正常
- [ ] キャッシュが正しく動作
- [ ] コストが期待値以下

---

### 本番前テスト

**目的**: 本番環境での動作をシミュレート

**テスト内容**:

1. **Cron実行のシミュレーション**:
   ```bash
   # ローカルでCronエンドポイントをテスト
   curl http://localhost:8787/cron/post-articles
   ```

2. **エラーハンドリング**:
   - API呼び出し失敗時のリトライ
   - 不正なレスポンスの処理
   - タイムアウト処理

3. **Slack通知**:
   - エラー時の通知が正しく送信される

**確認事項**:
- [ ] Cron実行が正常に動作
- [ ] エラーが適切にハンドリングされる
- [ ] Slack通知が正しく送信される
- [ ] ログが正しく記録される

---

## 開発環境のセットアップ

### 前提条件

- **Node.js**: v20.0.0以上
- **Bun**: v1.1.0以上
- **Wrangler CLI**: 最新版

### セットアップ手順

```bash
# 1. リポジトリをクローン
git clone <repository-url>
cd qiita-x-post

# 2. 依存パッケージのインストール
bun install

# 3. 環境変数の設定（.dev.vars）
# .dev.vars ファイルを作成して以下を設定:
# QIITA_TOKEN=your_token
# ANTHROPIC_API_KEY=your_key
# TWITTER_API_KEY=your_key
# ...

# 4. ローカル開発サーバー起動
bun run dev
```

### 開発用コマンド

```bash
# 開発サーバー起動
bun run dev

# テスト実行
bun test

# 型チェック
bun run typecheck

# リント
bun run lint

# フォーマット
bun run format

# 全チェック（CI用）
bun run ci
```

---

## コーディング規約

### 使用ツール

- **Linter**: Biome v2.3.8（ESLintの50-100倍高速）
- **Formatter**: Biome（Prettierの代替）
- **Type Checker**: TypeScript v5.6.3

### 規約

1. **型安全性**: すべての関数に型注釈を付ける
2. **エラーハンドリング**: すべての非同期処理でtry-catchを使用
3. **コメント**: 複雑なロジックには説明コメントを追加
4. **命名規則**: 
   - 関数: camelCase
   - クラス: PascalCase
   - 定数: UPPER_SNAKE_CASE

### コード例

```typescript
/**
 * 記事のメタスコアを計算
 * @param article - Qiita記事オブジェクト
 * @returns メタスコア（0-45点）
 */
export function calculateMetaScore(article: QiitaArticle): number {
  // 実装
}
```

---

## デバッグ方法

### ローカルデバッグ

```bash
# 開発サーバー起動（ログが表示される）
bun run dev

# 別ターミナルでエンドポイントをテスト
curl http://localhost:8787/cron/post-articles
```

### 本番環境のログ確認

```bash
# リアルタイムログ
npx wrangler tail

# 特定のエラーをフィルタ
npx wrangler tail --format=pretty | grep "error"
```

### D1データベースの確認

```bash
# 投稿履歴の確認
npx wrangler d1 execute qiita-bot-db \
  --command "SELECT * FROM posts ORDER BY posted_at DESC LIMIT 10"

# トークン使用量の確認
npx wrangler d1 execute qiita-bot-db \
  --command "SELECT * FROM token_usage ORDER BY created_at DESC LIMIT 10"
```

### よくある問題と解決方法

#### 1. "KV namespace not found"

**原因**: KV NamespaceのIDが正しく設定されていない

**解決方法**:
```bash
# KV NamespaceのIDを確認
npx wrangler kv:namespace list

# wrangler.toml を更新
```

#### 2. "Secret not found"

**原因**: Secretsが正しく設定されていない

**解決方法**:
```bash
# 設定済みのSecretsを確認
npx wrangler secret list

# 不足しているSecretを設定
npx wrangler secret put <SECRET_NAME>
```

#### 3. AI評価が失敗する

**原因**: プロンプトが長すぎる、またはAPIキーが無効

**解決方法**:
- トークン数を確認（`src/utils/tokens.ts`の圧縮ロジックを確認）
- APIキーを再設定
- ログでエラーメッセージを確認

---

## 参考資料

- [ARCHITECTURE.md](./ARCHITECTURE.md): システムアーキテクチャの詳細
- [OPTIMIZATION.md](./OPTIMIZATION.md): コスト最適化戦略の詳細
- [DEPLOYMENT.md](./DEPLOYMENT.md): デプロイ手順
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Hono Documentation](https://hono.dev/)
- [Vitest Documentation](https://vitest.dev/)

