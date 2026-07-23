# Claude Discord Bot

Discord を「Claude で複数の GitHub リポジトリを操作するワークスペース」にするボットです。**1 チャンネル = 1 プロジェクト（リポジトリ）** の構成で、チャンネルで話しかけるだけで Claude がそのリポジトリを調査・修正・PR 作成まで行います。

[Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk) + [discord.js](https://discord.js.org/) / TypeScript。

## サーバー構成イメージ

```
📌 共通
   ├─ #全体チャット   … 雑談・相談（話しかけると Claude が応答）
   ├─ #ジャーナル     … 作業ログ置き場
   └─ #メモ           … 覚書置き場

📂 プロジェクト
   ├─ #1-repoA   … GitHub の owner/repoA に紐付け
   ├─ #2-repoB   … owner/repoB
   └─ …（増やしていく）
```

`!setup` で「共通」セクションを自動生成し、`!project add owner/name` でプロジェクトチャンネルを増やしていきます。

## 特徴

- 📂 **チャンネル＝リポジトリ**。紐付けは保存され、再起動しても維持
- 🤖 プロジェクトチャンネルで話すだけで Claude が該当リポジトリを操作（コード修正・コミット・push・PR 作成）
- 🏗️ `!setup` / `!project add` でサーバー構成をボットが自動作成
- 🧵 チャンネルごとに会話の文脈を保持
- 🔑 **サブスク（`CLAUDE_CODE_OAUTH_TOKEN`）** / **API（`ANTHROPIC_API_KEY`）** 両対応
- 🔒 `ALLOWED_REPOS` で操作可能リポジトリを制限可能

## 必要なもの

- Node.js 20 以上、`git`（`gh` CLI があれば PR 自動作成が確実）
- Discord Bot トークン
- Claude の認証情報（`CLAUDE_CODE_OAUTH_TOKEN` または `ANTHROPIC_API_KEY`）
- GitHub Personal Access Token（push / PR 作成する場合）

## セットアップ

### 1. インストール

```bash
npm install
```

### 2. Discord Bot を作成

1. [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**
2. **Bot** → **Reset Token** でトークン取得 → `.env` の `DISCORD_BOT_TOKEN`
3. **Bot** の **Privileged Gateway Intents** で **MESSAGE CONTENT INTENT** を **ON**（必須）
4. **OAuth2 → URL Generator** で以下を選択して招待 URL を生成し、サーバーに招待
   - SCOPES: `bot`
   - BOT PERMISSIONS: **Manage Channels**（`!setup`/`!project add` に必要） / **Send Messages** / **Read Message History** / **Add Reactions** / **View Channels**

### 3. Claude の認証（どちらか）

- **サブスク（推奨）**: ローカルで `claude setup-token` → 出たトークンを `CLAUDE_CODE_OAUTH_TOKEN` に設定
- **API 従量課金**: [Console](https://console.anthropic.com/) の API キーを `ANTHROPIC_API_KEY` に設定

> ⚠️ サブスク利用は個人利用の範囲で。Anthropic 規約上、サブスクログインの第三者提供は禁止です。

### 4. GitHub トークン

[GitHub の Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens) で発行し、`GITHUB_TOKEN` に設定。private を扱うなら `repo`、public のみなら `public_repo` スコープ。

### 5. 環境変数と起動

```bash
cp .env.example .env   # 各種トークンを記入
npm run build && npm start
# 開発時: npm run dev
```

## 使い方

### 最初に一度

`#一般` などボットが見えるチャンネルで：

```
!setup
```

→ 「共通」カテゴリと `#全体チャット` / `#ジャーナル` / `#メモ`、「プロジェクト」カテゴリを作成。

### プロジェクトを追加

```
!project add facebook/react
!project add your-org/your-repo かっこいい表示名
```

→ 「プロジェクト」カテゴリに `#1-react` のようなチャンネルを作り、リポジトリに紐付けます。

### 作業する

作成されたプロジェクトチャンネルで、普通に話しかけるだけ：

```
READMEを3行で要約して
src/foo.ts の型エラーを直して
ログイン時のバグを調査して、修正してPRを作って
```

### コマンド一覧

| コマンド | 説明 |
| --- | --- |
| `!setup` | 共通セクションを自動作成 |
| `!project add owner/name [表示名]` | プロジェクトチャンネル作成＋紐付け |
| `!project list` | 紐付け済みプロジェクト一覧 |
| `!bind owner/name` | 今のチャンネルをリポジトリに紐付け |
| `!unbind` | 紐付け解除 |
| `!repo` | このチャンネルの対象リポジトリを表示 |
| `!reset` | 会話履歴をリセット |
| `!help` | ヘルプ |

## #ジャーナル で Codex（OpenAI）を使う

`#ジャーナル` チャンネルだけは Claude ではなく **OpenAI の Codex CLI** が応答します。事前準備：

1. Codex CLI をインストール
   ```bash
   npm install -g @openai/codex   # または brew install codex
   ```
2. ChatGPT サブスクでログイン
   ```bash
   codex login          # ブラウザで「Sign in with ChatGPT」
   # SSH/ヘッドレス環境なら: codex login --device-auth
   ```
3. ボットを再起動すれば、`#ジャーナル` での発言に Codex が答えます。

> Codex は既定で `read-only` サンドボックス（ファイルを書き換えない）で動きます。`CODEX_SANDBOX` で変更可能。

## 環境変数一覧

| 変数 | 必須 | 説明 |
| --- | --- | --- |
| `DISCORD_BOT_TOKEN` | ✅ | Discord Bot トークン |
| `CLAUDE_CODE_OAUTH_TOKEN` | △ | サブスク用トークン（API と排他） |
| `ANTHROPIC_API_KEY` | △ | API 従量課金用キー |
| `ANTHROPIC_MODEL` | | 使用モデル（例: `claude-sonnet-5`） |
| `GITHUB_TOKEN` | | clone/push/PR 用トークン（未設定なら公開 repo 読み取りのみ） |
| `GIT_AUTHOR_NAME` / `GIT_AUTHOR_EMAIL` | | コミット著者情報 |
| `WORKSPACE_DIR` | | repo の clone 先（既定 `./workspace`） |
| `DATA_DIR` | | 紐付け情報の保存先（既定 `./data`） |
| `ALLOWED_REPOS` | | 操作可能な repo の許可リスト（カンマ区切り、空で無制限） |

> `CLAUDE_CODE_OAUTH_TOKEN` と `ANTHROPIC_API_KEY` はどちらか一方が必須。

## 構成

```
src/
├── index.ts         Discord クライアント・コマンド処理・メッセージ振り分け
├── claude.ts        Claude Agent SDK ラッパー（雑談 / リポジトリ作業モード）
├── repos.ts         リポジトリの clone / 更新 / 認証 / git 設定
├── bindings.ts      チャンネル→リポジトリ紐付けの永続化
└── server-setup.ts  共通セクション・プロジェクトチャンネルの自動作成
```

## セキュリティ上の注意

- プロジェクトチャンネルでは Claude がファイル編集・git 操作を**自動承認**で実行します（Discord では対話的な権限確認ができないため）。信頼できるメンバーのみが使えるサーバー／チャンネルで運用してください。
- `ALLOWED_REPOS` で操作対象を絞れます。
- `GITHUB_TOKEN` は必要最小限のスコープ・対象リポジトリに限定することを推奨します。

## ライセンス

MIT
