# デプロイガイド

このドキュメントでは、Qiita to X Auto PosterをCloudflare Workersにデプロイする詳細な手順を説明します。

## 目次

1. [前提条件](#前提条件)
2. [初回セットアップ](#初回セットアップ)
3. [Cloudflareリソースの作成](#cloudflareリソースの作成)
4. [APIキーの取得](#apiキーの取得)
5. [設定ファイルの編集](#設定ファイルの編集)
6. [デプロイ](#デプロイ)
7. [動作確認](#動作確認)
8. [トラブルシューティング](#トラブルシューティング)

---

## 前提条件

以下のアカウント・環境が必要です：

- **Node.js**: v20.0.0以上（Bunのインストールに必要）
- **Cloudflareアカウント**: [登録](https://dash.cloudflare.com/sign-up)
- **Qiitaアカウント**: [登録](https://qiita.com/)
- **X (Twitter) Developer アカウント**: [登録](https://developer.twitter.com/)
- **Anthropic アカウント**: [登録](https://console.anthropic.com/)
- **Git**: バージョン管理用

---

## 初回セットアップ

### 1. Bunのインストール

```bash
# macOS / Linux
curl -fsSL https://bun.sh/install | bash

# インストール確認
bun --version
```

### 2. リポジトリのクローン

```bash
git clone <your-repository-url>
cd qiita-x-post
```

### 3. 依存パッケージのインストール

```bash
bun install
```

### 4. Wranglerの認証

```bash
# Cloudflareアカウントにログイン
npx wrangler login
```

ブラウザが開くので、Cloudflareアカウントでログインし、認証を完了してください。

---

## Cloudflareリソースの作成

### 1. KV Namespaceの作成

KVは記事のキャッシュと実行履歴の保存に使用します。

```bash
# KV Namespaceを作成
npx wrangler kv:namespace create KV

# 出力例:
# Created namespace with title "qiita-x-post-KV"
# Add the following to your wrangler.toml:
# { binding = "KV", id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }
```

**出力されたIDをメモしてください。**

### 2. D1 Databaseの作成

D1は投稿履歴、トークン使用量、メトリクスの保存に使用します。

```bash
# D1 Databaseを作成
npx wrangler d1 create qiita-bot-db

# 出力例:
# Created database qiita-bot-db
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**出力されたdatabase_idをメモしてください。**

### 3. D1スキーマの適用

**重要**: 本番環境（リモート）にスキーマを適用するには `--remote` フラグが必要です。

```bash
# 本番環境（リモート）にスキーマを適用
npx wrangler d1 execute qiita-bot-db --remote --file=./schema.sql

# 成功メッセージを確認
# ✅ Successfully executed SQL
```

**注意**:
- `--remote` フラグなし: ローカル開発環境のD1データベースに適用
- `--remote` フラグあり: 本番環境（Cloudflare）のD1データベースに適用
- 本番環境でWorkerを実行する場合は、**必ず `--remote` フラグを付けてスキーマを適用**してください

### 4. Vectorize Indexの作成

Vectorizeは記事の重複検出に使用します。

```bash
# Vectorize Indexを作成
npx wrangler vectorize create article-embeddings --dimensions=1024 --metric=cosine

# 出力例:
# Created index article-embeddings
# index_name = "article-embeddings"
```

**出力されたindex_nameをメモしてください。**

### 5. リソースIDの確認（メモし忘れた場合）

作成時にメモし忘れた場合、以下のコマンドで確認できます：

```bash
# KV Namespace一覧
npx wrangler kv:namespace list

# D1 Database一覧
npx wrangler d1 list

# Vectorize Index一覧
npx wrangler vectorize list
```

詳細は[トラブルシューティング](#リソースidを確認する方法)セクションを参照してください。

---

## APIキーの取得

### 1. Qiita APIトークン

1. [Qiita設定ページ](https://qiita.com/settings/tokens)にアクセス
2. 「新しくトークンを発行する」をクリック
3. **スコープ**: `read_qiita` を選択
4. 「発行する」をクリック
5. **表示されたトークンをメモ**（再表示不可）

### 2. Anthropic API Key

1. [Anthropic Console](https://console.anthropic.com/)にアクセス
2. 左メニューから「API Keys」を選択
3. 「Create Key」をクリック
4. **表示されたキーをメモ**

### 3. X (Twitter) API認証情報

#### 3.1 Developerアカウントの申請

1. [X Developer Portal](https://developer.twitter.com/)にアクセス
2. 「Sign up」から開発者アカウントを申請
3. 用途を説明（英語で簡潔に記入）

#### 3.2 Appの作成

1. Developer Portalで「Projects & Apps」→「Overview」を選択
2. 「+ Create App」をクリック
3. App名を入力（例: `qiita-x-poster`）

#### 3.3 API KeysとTokensの取得

1. 作成したAppの「Keys and tokens」タブを開く
2. **API Key and Secret**の「Regenerate」をクリック
   - `TWITTER_API_KEY`
   - `TWITTER_API_SECRET`
   - **メモしてください**（再表示不可）

3. **Access Token and Secret**の「Generate」をクリック
   - アクセスレベルを「Read and Write」に設定
   - `TWITTER_ACCESS_TOKEN`
   - `TWITTER_ACCESS_SECRET`
   - **メモしてください**

4. **Bearer Token**の「Regenerate」をクリック
   - `TWITTER_BEARER_TOKEN`
   - **メモしてください**

### 4. Slack Webhook URL（オプション）

エラー通知を受け取りたい場合のみ設定します。

1. [Slack API](https://api.slack.com/apps)にアクセス
2. 「Create New App」→「From scratch」を選択
3. App名とワークスペースを選択
4. 「Incoming Webhooks」を有効化
5. 「Add New Webhook to Workspace」をクリック
6. 投稿先チャンネルを選択
7. **Webhook URLをメモ**

---

## 設定ファイルの編集

### 0. wrangler.tomlのGit管理について

**重要**: `wrangler.toml`に記述するKV Namespace ID、D1 Database ID、Vectorize Index名について：

- **これらは機密情報ではありません**が、**環境固有の情報**です
- **通常は`wrangler.toml`に含めてGit管理するのが一般的**です
- 開発環境と本番環境で異なるリソースを使う場合は、環境別設定（後述）を使用してください

**機密情報（APIキーなど）は`wrangler secret put`で管理**し、`wrangler.toml`には含めません。

#### 環境別設定（オプション）

開発環境と本番環境で異なるリソースを使う場合：

```toml
# デフォルト設定（開発環境）
[[kv_namespaces]]
binding = "KV"
id = "dev-kv-namespace-id"

# 本番環境設定
[env.production]
[[env.production.kv_namespaces]]
binding = "KV"
id = "production-kv-namespace-id"
```

デプロイ時に環境を指定：
```bash
# 本番環境にデプロイ
npx wrangler deploy --env production
```

### 1. wrangler.tomlの編集

`wrangler.toml`を開き、以下を編集します：

```toml
name = "qiita-x-post"
main = "src/index.ts"
compatibility_date = "2024-11-01"
node_compat = true

# KV Namespace（作成したIDを設定）
[[kv_namespaces]]
binding = "KV"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"  # ← 手順で取得したID

# D1 Database（作成したIDを設定）
[[d1_databases]]
binding = "DB"
database_name = "qiita-bot-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # ← 手順で取得したID

# Vectorize Index
[[vectorize]]
binding = "VECTORIZE"
index_name = "article-embeddings"

# Workers AI
[ai]
binding = "AI"

# 環境変数
[vars]
ORG_MEMBERS = "your_qiita_id_1,your_qiita_id_2"  # ← QiitaユーザーIDを設定
DEFAULT_SCORE_THRESHOLD = "25"

# Cron Triggers
[triggers]
crons = [
  "0 0 * * 1,4",  # 月・木 9:00 JST (UTC 0:00) に記事投稿
  "0 17 * * *"    # 毎日 2:00 JST (UTC 17:00) にメトリクス更新
]
```

**重要**: `ORG_MEMBERS`には、監視対象のQiitaユーザーIDをカンマ区切りで設定してください。

**便利なツール**: 組織名からメンバーIDを自動取得するツールが利用できます。詳細は [tools/README.md](../tools/README.md) を参照してください。

```bash
# 例: wakuto-inc組織のメンバーIDを取得
bun run tools:fetch-members wakuto-inc
```

### 2. Secretsの設定

機密情報はWranglerのSecretsとして設定します：

```bash
# Qiita API Token
npx wrangler secret put QIITA_TOKEN
# プロンプトが表示されるので、取得したトークンを貼り付け

# Anthropic API Key
npx wrangler secret put ANTHROPIC_API_KEY

# X (Twitter) API Credentials
npx wrangler secret put TWITTER_API_KEY
npx wrangler secret put TWITTER_API_SECRET
npx wrangler secret put TWITTER_ACCESS_TOKEN
npx wrangler secret put TWITTER_ACCESS_SECRET
npx wrangler secret put TWITTER_BEARER_TOKEN

# Slack Webhook URL（オプション）
npx wrangler secret put SLACK_WEBHOOK_URL
```

各コマンド実行時に、プロンプトで値を入力してEnterキーを押してください。

---

## デプロイ

### 1. ローカルテスト（オプション）

デプロイ前にローカルで動作確認します：

```bash
# 開発サーバー起動
bun run dev

# 別ターミナルで動作確認
curl http://localhost:8787/
# → {"status":"ok","message":"Qiita to X Auto Poster is running"}

# 記事投稿処理のテスト（実際には投稿されません）
curl http://localhost:8787/cron/post-articles
```

### 2. 本番デプロイ

```bash
# デプロイ実行
npx wrangler deploy

# 出力例:
# Total Upload: xx.xx KiB / gzip: xx.xx KiB
# Uploaded qiita-x-post (x.xx sec)
# Published qiita-x-post (x.xx sec)
#   https://qiita-x-post.your-subdomain.workers.dev
```

**デプロイ成功後、URLが表示されます。**

### 3. デプロイ確認

```bash
# ヘルスチェック
curl https://qiita-x-post.your-subdomain.workers.dev/

# 統計情報の確認
curl https://qiita-x-post.your-subdomain.workers.dev/stats
```

---

## 動作確認

### 1. 手動トリガー

Cloudflare Dashboardから手動でCronを実行できます：

1. [Cloudflare Dashboard](https://dash.cloudflare.com/)にログイン
2. 「Workers & Pages」を選択
3. デプロイした`qiita-x-post`を選択
4. 「Triggers」タブを開く
5. 「Cron Triggers」セクションの「Send Test Event」をクリック

または、直接エンドポイントにアクセス：

```bash
# 記事投稿処理（実際にXに投稿されます！）
curl https://qiita-x-post.your-subdomain.workers.dev/cron/post-articles

# メトリクス更新
curl https://qiita-x-post.your-subdomain.workers.dev/cron/update-metrics
```

### 2. テスト用エンドポイント（投稿しない）

**重要**: 本番環境でデータ取得をテストする場合は、以下のエンドポイントを使用してください。Xへの投稿は行われません。

```bash
# 記事取得のみ（投稿しない）
# 過去7日間の記事を取得
curl https://qiita-x-bot.kurokawa-y.workers.dev/test/fetch-articles

# 特定の日時以降の記事を取得（ISO 8601形式）
curl "https://qiita-x-bot.kurokawa-y.workers.dev/test/fetch-articles?since=2024-01-01T00:00:00Z"
```

**レスポンス例**:
```json
{
  "message": "Articles fetched successfully (no posting)",
  "since": "2024-01-01T00:00:00.000Z",
  "articles": {
    "total": 10,
    "list": [
      {
        "id": "abc123",
        "title": "記事タイトル",
        "url": "https://qiita.com/...",
        "author": "user_id",
        "updated_at": "2024-01-02T10:00:00Z",
        "likes_count": 5,
        "stocks_count": 3
      }
    ]
  },
  "filtered_articles": {
    "total": 5,
    "list": [
      {
        "id": "abc123",
        "title": "記事タイトル",
        "url": "https://qiita.com/...",
        "author": "user_id",
        "meta_score": 30,
        "updated_at": "2024-01-02T10:00:00Z"
      }
    ]
  },
  "unposted_articles": {
    "total": 3,
    "list": [...]
  }
}
```

**注意**: 
- このエンドポイントは**Xへの投稿を行いません**
- 記事取得、メタスコアフィルタリング、投稿済み記事の除外までを実行します
- AI評価やX投稿は実行されません

### 2. ログの確認

リアルタイムでログを確認：

```bash
npx wrangler tail
```

### 3. D1データの確認

投稿履歴を確認：

```bash
# 投稿履歴の確認
npx wrangler d1 execute qiita-bot-db --command "SELECT * FROM posts ORDER BY posted_at DESC LIMIT 10"

# トークン使用量の確認
npx wrangler d1 execute qiita-bot-db --command "SELECT * FROM token_usage ORDER BY created_at DESC LIMIT 10"
```

---

## トラブルシューティング

### リソースIDを確認する方法

作成時にメモし忘れた場合、以下のコマンドで確認できます：

```bash
# KV Namespace一覧を表示
npx wrangler kv namespace list

# 出力例:
# {
#   "title": "qiita-x-post-KV",
#   "id": "f9cbb9a9f22a461c8ff1bc096ad0d2ab",
#   "supports_url_encoding": true
# }

# D1 Database一覧を表示
npx wrangler d1 list

# 出力例:
# {
#   "name": "qiita-bot-db",
#   "database_id": "caafc37f-e7c6-4822-aa40-007f7fd900ce",
#   "created_at": "2024-01-01T00:00:00.000Z"
# }

# Vectorize Index一覧を表示
npx wrangler vectorize list

# 出力例:
# {
#   "name": "article-embeddings",
#   "dimensions": 1024,
#   "metric": "cosine",
#   "created_on": "2024-01-01T00:00:00.000Z"
# }
```

### エラー: "KV namespace not found"

**原因**: KV NamespaceのIDが正しく設定されていない

**解決方法**:
1. `wrangler.toml`のKV IDを確認
2. 以下で正しいIDを確認：
   ```bash
   npx wrangler kv:namespace list
   ```
3. 確認したIDを`wrangler.toml`に反映

### エラー: "D1 database not found"

**原因**: D1 DatabaseのIDが正しく設定されていない

**解決方法**:
1. `wrangler.toml`のdatabase_idを確認
2. 以下で正しいIDを確認：
   ```bash
   npx wrangler d1 list
   ```
3. 確認したIDを`wrangler.toml`に反映

### エラー: "Secret not found"

**原因**: Secretsが正しく設定されていない

**解決方法**:
```bash
# 設定済みのSecretsを確認
npx wrangler secret list

# 不足しているSecretを再設定
npx wrangler secret put <SECRET_NAME>
```

### エラー: `/stats` エンドポイントでInternal Server Error

**原因**: D1データベースのテーブルが作成されていない、またはスキーマが適用されていない

**解決方法**:

1. **D1データベースのテーブルを確認**:
   ```bash
   npx wrangler d1 execute qiita-bot-db --command "SELECT name FROM sqlite_master WHERE type='table'"
   ```

2. **テーブルが存在しない場合、スキーマを適用**:
   ```bash
   # 本番環境（リモート）にスキーマを適用
   npx wrangler d1 execute qiita-bot-db --remote --file=./schema.sql
   ```
   
   **重要**: 本番環境でWorkerを実行する場合は、`--remote` フラグを必ず付けてください。

3. **エラーログを確認**:
   ```bash
   # リアルタイムログを確認
   npx wrangler tail
   
   # または、Cloudflare Dashboardで確認
   # Workers & Pages → qiita-x-bot → Logs
   ```

4. **デプロイ後にエラーハンドリングが追加されたコードを再デプロイ**:
   ```bash
   npx wrangler deploy
   ```

5. **エラーレスポンスを確認**:
   エラーハンドリング追加後、`/stats`エンドポイントにアクセスすると、詳細なエラーメッセージが返されます：
   ```bash
   curl https://qiita-x-bot.your-subdomain.workers.dev/stats
   ```
   レスポンス例：
   ```json
   {
     "error": "no such table: posts",
     "stack": "..."
   }
   ```

### エラー: "API rate limit exceeded"

**原因**: X APIのレート制限に到達

**解決方法**:
- X API Free Tierは月間投稿数に制限があります
- 投稿頻度を減らす（`wrangler.toml`のCron設定を変更）

### デプロイは成功するが動作しない

**確認事項**:
1. Secretsが全て設定されているか確認：
   ```bash
   npx wrangler secret list
   ```
2. ログを確認：
   ```bash
   npx wrangler tail
   ```
3. D1スキーマが正しく適用されているか確認：
   ```bash
   npx wrangler d1 execute qiita-bot-db --command "SELECT name FROM sqlite_master WHERE type='table'"
   ```

### Cronが実行されない

**原因**: Cloudflare Workers無料プランではCron Triggersが制限されています

**解決方法**:
1. [Cloudflare Dashboard](https://dash.cloudflare.com/)で「Workers & Pages」→「Plans」を確認
2. 必要に応じてPaidプランにアップグレード
3. または、外部サービス（GitHub Actions、Vercel Cron等）から定期的にエンドポイントを呼び出す

---

## 再デプロイ

コード変更後の再デプロイ：

```bash
# コード品質チェック
bun run ci  # typecheck + lint + format + test

# デプロイ
npx wrangler deploy
```

---

## Secretsの更新

APIキーを変更した場合：

```bash
# 既存のSecretを上書き
npx wrangler secret put QIITA_TOKEN

# または削除してから再設定
npx wrangler secret delete QIITA_TOKEN
npx wrangler secret put QIITA_TOKEN
```

---

## リソースの削除

プロジェクトを削除する場合：

```bash
# Worker削除
npx wrangler delete qiita-x-post

# KV Namespace削除
npx wrangler kv:namespace delete --namespace-id=<your-kv-id>

# D1 Database削除
npx wrangler d1 delete qiita-bot-db

# Vectorize Index削除
npx wrangler vectorize delete article-embeddings
```

---

## 参考リンク

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Reference](https://developers.cloudflare.com/workers/wrangler/)
- [Qiita API v2 Documentation](https://qiita.com/api/v2/docs)
- [X API Documentation](https://developer.twitter.com/en/docs/twitter-api)
- [Anthropic API Documentation](https://docs.anthropic.com/)
