# Claude Discord Bot

[Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk) を使って、Discord 上で Claude と会話できるチャットボットです。TypeScript + [discord.js](https://discord.js.org/) で実装しています。

チャンネルごとに会話の文脈を保持するので、続けて質問するとちゃんと前の話を覚えています。

## 特徴

- 💬 チャンネルにメッセージを送るだけで Claude が応答（メンション or 指定チャンネル）
- 🧵 チャンネル単位で会話履歴を自動継続
- 🔁 `!reset` で会話をリセット
- ✂️ Discord の 2000 文字制限に合わせて自動分割
- 🔑 **Claude サブスク（Pro/Max 等）** でも **API 従量課金** でも動作

## 必要なもの

- Node.js 20 以上
- Discord Bot トークン（[Discord Developer Portal](https://discord.com/developers/applications)）
- Claude の認証情報（下記いずれか）
  - **サブスク利用（推奨）**: `CLAUDE_CODE_OAUTH_TOKEN`
  - **API 従量課金**: `ANTHROPIC_API_KEY`

## セットアップ

### 1. インストール

```bash
npm install
```

### 2. Discord Bot を作成

1. [Discord Developer Portal](https://discord.com/developers/applications) で **New Application** を作成
2. 左メニュー **Bot** → **Reset Token** でトークンを取得（`DISCORD_BOT_TOKEN`）
3. **Bot** 画面の **Privileged Gateway Intents** で **MESSAGE CONTENT INTENT** を **ON**（必須）
4. 左メニュー **OAuth2** → **General** の **Client ID** を控える（`DISCORD_CLIENT_ID`）
5. **OAuth2 → URL Generator** で `bot` スコープと `Send Messages` / `Read Message History` 権限を選び、生成された URL からサーバーに招待

### 3. Claude の認証情報を用意

#### A. サブスク（Pro/Max 等）で使う場合 ★推奨

ローカルで Claude Code にログイン済みの状態で、長期トークンを発行します。

```bash
claude setup-token
```

表示されたトークンを `.env` の `CLAUDE_CODE_OAUTH_TOKEN` に設定します（1 年間有効）。

> ⚠️ Anthropic の規約上、サブスクログインを第三者向けに提供することは禁止されています。**自分専用のボットとして個人利用の範囲**でお使いください。

#### B. API 従量課金で使う場合

[Anthropic Console](https://console.anthropic.com/) で API キーを発行し、`.env` の `ANTHROPIC_API_KEY` に設定します。

> `ANTHROPIC_API_KEY` を設定するとそちらが優先され、**従量課金**になります。サブスクで使いたい場合は設定しないでください。

### 4. 環境変数を設定

```bash
cp .env.example .env
# .env を編集してトークン類を入力
```

### 5. 起動

```bash
# 開発（ホットリロード）
npm run dev

# 本番
npm run build
npm start
```

## 使い方

- **指定チャンネル**（`ALLOWED_CHANNEL_IDS` に設定）では、全メッセージに反応します
- **それ以外のチャンネル**では、ボットを **@メンション** したときのみ反応します
- **DM** では常に反応します

| コマンド | 説明 |
| --- | --- |
| （通常のメッセージ） | Claude が応答します |
| `!reset` / `!new` / `!clear` | そのチャンネルの会話履歴をリセット |
| `!help` | ヘルプを表示 |

## 環境変数一覧

| 変数 | 必須 | 説明 |
| --- | --- | --- |
| `DISCORD_BOT_TOKEN` | ✅ | Discord Bot トークン |
| `DISCORD_CLIENT_ID` | | アプリケーション ID（招待 URL 生成などに使用） |
| `ALLOWED_CHANNEL_IDS` | | 反応するチャンネル ID（カンマ区切り）。空ならメンション時のみ反応 |
| `CLAUDE_CODE_OAUTH_TOKEN` | △ | サブスク用トークン（`claude setup-token` で発行） |
| `ANTHROPIC_API_KEY` | △ | API 従量課金用キー（OAuth と排他） |
| `ANTHROPIC_MODEL` | | 使用モデル（例: `claude-sonnet-5`） |

> `CLAUDE_CODE_OAUTH_TOKEN` と `ANTHROPIC_API_KEY` のどちらか一方は必須です。

## 構成

```
src/
├── index.ts    Discord クライアント・メッセージ処理
└── claude.ts   Claude Agent SDK ラッパー（会話継続・セッション管理）
```

## ライセンス

MIT
