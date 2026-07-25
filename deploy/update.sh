#!/usr/bin/env bash
# VPS 上でボットを最新版に更新して再起動する。
#   bash ~/ai-bot/deploy/update.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH="${BRANCH:-claude/discord-chat-creation-an0e3i}"

cd "${APP_DIR}"
git fetch origin "${BRANCH}"
git checkout "${BRANCH}"
git pull origin "${BRANCH}"
npm install
npm run build

if systemctl list-unit-files | grep -q '^claude-discord-bot.service'; then
  sudo systemctl restart claude-discord-bot
  echo "更新して再起動しました。ログ: journalctl -u claude-discord-bot -f"
else
  echo "更新しました。systemd 未登録のため手動で起動してください: npm start"
fi
