#!/usr/bin/env bash
# Ubuntu 22.04 / 24.04 の VPS に Claude Discord Bot をセットアップする。
#
# 使い方(VPS に root でログインして実行):
#   bash setup-vps.sh
#
# 実行後、~/ai-bot/.env を編集してトークンを入れ、
#   systemctl start claude-discord-bot
# で起動する。

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/cysbrq4jpt-dev/-.git}"
BRANCH="${BRANCH:-claude/discord-chat-creation-an0e3i}"
BOT_USER="${BOT_USER:-bot}"
APP_DIR="/home/${BOT_USER}/ai-bot"

echo "==> パッケージを更新"
apt-get update -y
apt-get install -y curl git ca-certificates ripgrep

echo "==> Node.js 22 をインストール"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "==> 実行用ユーザー(${BOT_USER})を作成"
if ! id -u "${BOT_USER}" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "${BOT_USER}"
fi

echo "==> Codex CLI をインストール"
npm install -g @openai/codex || echo "(Codex のインストールに失敗。#ジャーナル を使わないなら無視して可)"

echo "==> リポジトリを取得"
if [ -d "${APP_DIR}/.git" ]; then
  sudo -u "${BOT_USER}" git -C "${APP_DIR}" fetch origin "${BRANCH}"
  sudo -u "${BOT_USER}" git -C "${APP_DIR}" checkout "${BRANCH}"
  sudo -u "${BOT_USER}" git -C "${APP_DIR}" pull origin "${BRANCH}"
else
  sudo -u "${BOT_USER}" git clone "${REPO_URL}" "${APP_DIR}"
  sudo -u "${BOT_USER}" git -C "${APP_DIR}" checkout "${BRANCH}"
fi

echo "==> 依存関係のインストールとビルド"
sudo -u "${BOT_USER}" bash -lc "cd '${APP_DIR}' && npm install && npm run build"

echo "==> .env を用意"
if [ ! -f "${APP_DIR}/.env" ]; then
  sudo -u "${BOT_USER}" cp "${APP_DIR}/.env.example" "${APP_DIR}/.env"
fi
chmod 600 "${APP_DIR}/.env"

echo "==> systemd サービスを登録"
install -m 644 "${APP_DIR}/deploy/claude-discord-bot.service" /etc/systemd/system/claude-discord-bot.service
sed -i "s|__BOT_USER__|${BOT_USER}|g; s|__APP_DIR__|${APP_DIR}|g" /etc/systemd/system/claude-discord-bot.service
systemctl daemon-reload
systemctl enable claude-discord-bot

cat <<EOF

========================================================
セットアップ完了。あと2つやることがあります。

1) トークンを設定する
   nano ${APP_DIR}/.env
   に以下を記入して保存(Ctrl+O, Enter, Ctrl+X):
     DISCORD_BOT_TOKEN=...
     CODEX_DISCORD_BOT_TOKEN=...
     CLAUDE_CODE_OAUTH_TOKEN=...
     GITHUB_TOKEN=...

2) Codex にログインする(#ジャーナルを使う場合のみ)
   sudo -u ${BOT_USER} -H codex login --device-auth
   表示された URL とコードをブラウザで入力

その後、起動:
   systemctl start claude-discord-bot
ログを見る:
   journalctl -u claude-discord-bot -f
========================================================
EOF
