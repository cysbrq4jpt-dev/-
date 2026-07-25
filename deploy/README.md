# VPS（クラウド）で 24 時間動かす手順

Mac を閉じてもボットが止まらないように、クラウドのサーバーで動かす手順です。所要 15〜20 分。

## 1. VPS を借りる

Ubuntu 24.04 が使えるところならどこでもよいです。目安は **メモリ 2GB 以上**（1GB だと Claude と Codex の同時実行で足りなくなることがあります）。

- さくらの VPS / ConoHa VPS … 日本語サポート、月 700 円〜
- Hetzner / Vultr / DigitalOcean … 月 $5 前後
- Oracle Cloud Always Free … 無料枠あり（設定はやや難しめ）

作成時に **Ubuntu 24.04** を選び、root の SSH ログイン情報を控えます。

## 2. VPS にログインして、セットアップを実行

Mac のターミナルから:

```bash
ssh root@サーバーのIPアドレス
```

ログインできたら、そのまま次を貼り付けます:

```bash
curl -fsSL https://raw.githubusercontent.com/cysbrq4jpt-dev/-/claude/discord-chat-creation-an0e3i/deploy/setup-vps.sh -o setup-vps.sh
bash setup-vps.sh
```

Node.js、Codex CLI、リポジトリの取得、ビルド、systemd への登録までが自動で終わります。

> 上の URL が 404 になる場合（private リポジトリのため）は、代わりに次を実行してください。
> ```bash
> apt-get update -y && apt-get install -y git
> git clone https://<GITHUB_TOKEN>@github.com/cysbrq4jpt-dev/-.git /root/src
> bash /root/src/deploy/setup-vps.sh
> ```

## 3. トークンを設定

```bash
nano /home/bot/ai-bot/.env
```

以下を記入して保存（`Ctrl+O` → `Enter` → `Ctrl+X`）:

```
DISCORD_BOT_TOKEN=Claudeにいやんのトークン
CODEX_DISCORD_BOT_TOKEN=Codexくんのトークン
CLAUDE_CODE_OAUTH_TOKEN=claude setup-token で出たトークン
GITHUB_TOKEN=ghp_...
```

> Mac の `~/ai-bot/.env` に入っている値をそのままコピーすれば OK です。

## 4. Codex にログイン（#ジャーナルを使う場合）

サーバーにはブラウザが無いので、デバイス認証を使います。

```bash
sudo -u bot -H codex login --device-auth
```

表示された URL を手元のブラウザで開き、コードを入力して承認します。

## 5. 起動

```bash
systemctl start claude-discord-bot
journalctl -u claude-discord-bot -f
```

ログに次の 2 行が出れば成功です。

```
✅ Codex bot ログインしました: Codexくん#3140（#ジャーナル 担当）
✅ ログインしました: Claudeにいやん#5089
```

`Ctrl+C` でログ表示を抜けても、ボットは動き続けます。SSH を切っても、サーバーを再起動しても自動で起き上がります。

## 6. Mac 側のボットは止める

二重に返信しないよう、Mac で動いているボットは `Ctrl+C` で止めてください。

---

## よく使うコマンド

| やりたいこと | コマンド |
| --- | --- |
| 状態を見る | `systemctl status claude-discord-bot` |
| ログを見る | `journalctl -u claude-discord-bot -f` |
| 止める | `systemctl stop claude-discord-bot` |
| 起動する | `systemctl start claude-discord-bot` |
| 最新版に更新 | `sudo -u bot bash /home/bot/ai-bot/deploy/update.sh` |

## 注意

- `.env` には秘密の鍵が入っています。VPS の SSH は鍵認証にし、パスワードログインは無効にしておくことを推奨します。
- Claude / ChatGPT のサブスクリプションは個人利用の範囲で使ってください。
