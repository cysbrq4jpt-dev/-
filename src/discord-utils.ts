import type { Message, TextBasedChannel } from 'discord.js';

/**
 * リアクションを付ける。
 * ユーザー要望により絵文字リアクションは無効化(進捗は「入力中…」表示で分かるため)。
 * REACTIONS=on を設定すると再び付くようにしてある。
 */
const REACTIONS_ENABLED = /^(1|true|yes|on)$/i.test(process.env.REACTIONS ?? '');
export async function react(message: Message, emoji: string): Promise<void> {
  if (!REACTIONS_ENABLED) return;
  try {
    await message.react(emoji);
  } catch {
    /* ignore */
  }
}

/** typing インジケータを定期送信し続けるヘルパー */
export function startTyping(channel: TextBasedChannel): { stop: () => void } {
  const send = () => {
    if ('sendTyping' in channel) {
      (channel as { sendTyping: () => Promise<void> }).sendTyping().catch(() => {});
    }
  };
  send();
  const interval = setInterval(send, 8000);
  return { stop: () => clearInterval(interval) };
}

/** Discord の 2000 文字制限に合わせて分割送信する */
export async function sendChunked(message: Message, text: string): Promise<void> {
  const MAX = 2000;
  if (text.length <= MAX) {
    await message.reply(text);
    return;
  }
  const chunks = splitText(text, MAX);
  await message.reply(chunks[0]);
  for (let i = 1; i < chunks.length; i++) {
    if ('send' in message.channel) {
      await (message.channel as { send: (c: string) => Promise<unknown> }).send(chunks[i]);
    }
  }
}

/** 改行をなるべく壊さずに分割 */
export function splitText(text: string, max: number): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > max) {
    let cut = remaining.lastIndexOf('\n', max);
    if (cut < max * 0.5) cut = max;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}
