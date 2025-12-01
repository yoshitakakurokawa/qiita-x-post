# `/stats` エンドポイント トラブルシューティングガイド

## 問題
`/stats` エンドポイントにアクセスすると `Internal Server Error` が発生する

## 原因追及手順

### 1. エラーハンドリング追加後の再デプロイ

エラーハンドリングを追加したコードをデプロイして、詳細なエラーメッセージを取得します：

```bash
# コードをデプロイ
npx wrangler deploy

# エンドポイントにアクセスしてエラーメッセージを確認
curl https://qiita-x-bot.kurokawa-y.workers.dev/stats
```

### 2. D1データベースのテーブル確認

最も可能性が高い原因は、D1データベースのテーブルが作成されていないことです。

```bash
# テーブル一覧を確認
npx wrangler d1 execute qiita-bot-db --command "SELECT name FROM sqlite_master WHERE type='table'"
```

**期待される出力**:
```
posts
token_usage
cache_stats
deduplication_log
learning_patterns
execution_logs
```

**テーブルが存在しない場合**:
```bash
# スキーマを適用
npx wrangler d1 execute qiita-bot-db --file=./schema.sql
```

### 3. リアルタイムログの確認

エラーの詳細を確認するために、リアルタイムログを監視します：

```bash
# 別ターミナルで実行
npx wrangler tail

# その後、別のターミナルでエンドポイントにアクセス
curl https://qiita-x-bot.kurokawa-y.workers.dev/stats
```

### 4. Cloudflare Dashboardでログを確認

1. [Cloudflare Dashboard](https://dash.cloudflare.com/)にログイン
2. 「Workers & Pages」を選択
3. `qiita-x-bot` を選択
4. 「Logs」タブを開く
5. エラーログを確認

### 5. 各テーブルの存在確認

個別にテーブルが存在するか確認：

```bash
# postsテーブルの確認
npx wrangler d1 execute qiita-bot-db --command "SELECT COUNT(*) FROM posts"

# token_usageテーブルの確認
npx wrangler d1 execute qiita-bot-db --command "SELECT COUNT(*) FROM token_usage"
```

### 6. スキーマの再適用

テーブルが存在しない、または不完全な場合：

```bash
# スキーマファイルの確認
cat schema.sql

# スキーマを適用
npx wrangler d1 execute qiita-bot-db --file=./schema.sql

# 適用確認
npx wrangler d1 execute qiita-bot-db --command "SELECT name FROM sqlite_master WHERE type='table'"
```

## よくある原因と解決方法

### 原因1: テーブルが作成されていない

**症状**: `no such table: posts` というエラー

**解決方法**:
```bash
npx wrangler d1 execute qiita-bot-db --file=./schema.sql
```

### 原因2: データベースIDの不一致

**症状**: データベースにアクセスできない

**解決方法**:
```bash
# 正しいデータベースIDを確認
npx wrangler d1 list

# wrangler.tomlのdatabase_idを確認・更新
cat wrangler.toml | grep database_id
```

### 原因3: 権限の問題

**症状**: データベースにアクセスできない

**解決方法**:
- Cloudflare DashboardでD1データベースの設定を確認
- Wranglerの認証を再実行: `npx wrangler login`

## デバッグ用エンドポイント（オプション）

エラーハンドリング追加後、以下のような詳細なエラー情報が返されます：

```json
{
  "error": "no such table: posts",
  "stack": "Error: no such table: posts\n    at ..."
}
```

この情報を基に、具体的な問題を特定できます。

## 確認コマンド一覧

```bash
# 1. テーブル一覧確認
npx wrangler d1 execute qiita-bot-db --command "SELECT name FROM sqlite_master WHERE type='table'"

# 2. postsテーブルの構造確認
npx wrangler d1 execute qiita-bot-db --command "PRAGMA table_info(posts)"

# 3. token_usageテーブルの構造確認
npx wrangler d1 execute qiita-bot-db --command "PRAGMA table_info(token_usage)"

# 4. データベース一覧確認
npx wrangler d1 list

# 5. リアルタイムログ確認
npx wrangler tail

# 6. エンドポイントテスト
curl https://qiita-x-bot.kurokawa-y.workers.dev/stats
```

