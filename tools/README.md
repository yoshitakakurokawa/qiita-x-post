# 開発ツール

このフォルダには、開発や運用を支援する簡易ツールが含まれています。

## fetch-org-members.ts

Qiita組織のメンバーIDを取得するツールです。`ORG_MEMBERS`環境変数を設定する際に、メンバーIDを手動でコピーする手間を省くために使用します。

### 使用方法

```bash
# npmスクリプト経由で実行
bun run tools:fetch-members <organization-name>

# 直接実行
bun run tools/fetch-org-members.ts <organization-name>
```

### 例

```bash
# wakuto-inc組織のメンバーを取得
bun run tools:fetch-members wakuto-inc
```

### 出力例

```
Fetching members from: https://qiita.com/organizations/wakuto-inc/members

Organization members (comma-separated):
hato_code,wakuto-o-ga,wakuto-ariga-owl

Individual members:
  1. hato_code
  2. wakuto-o-ga
  3. wakuto-ariga-owl

Total: 3 members
```

出力されたカンマ区切りのメンバーIDを、`wrangler.toml`の`ORG_MEMBERS`環境変数に設定してください。

### 注意事項

⚠️ **このツールは非公式な方法を使用しています**

- Qiita API v2には、組織名からメンバー一覧を取得する公式エンドポイントが存在しません
- このツールは、組織のメンバーページに埋め込まれたJSONデータを抽出する非公式な方法を使用しています
- **Qiitaのページ構造が変更されると、このツールが動作しなくなる可能性があります**
- メンバー情報が取得できない場合は、手動でメンバーIDを設定してください

### 実装の詳細

このツールは以下の手順で動作します：

1. 指定された組織名から、QiitaのメンバーページURLを構築
   - 例: `https://qiita.com/organizations/wakuto-inc/members`
2. HTMLページを取得
3. ページに埋め込まれたJSONデータを抽出
4. JSONからメンバーID（`urlName`）を抽出
5. カンマ区切りの形式で出力

### トラブルシューティング

**エラー: "Could not find organization data in the page"**

- Qiitaのページ構造が変更された可能性があります
- 組織名が正しいか確認してください
- 手動でメンバーIDを設定してください

**エラー: "Failed to parse JSON data"**

- ページ構造の変更により、JSONの抽出に失敗しています
- 手動でメンバーIDを設定してください

