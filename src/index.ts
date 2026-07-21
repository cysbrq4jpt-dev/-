import 'dotenv/config';
import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  type Message,
  type TextBasedChannel,
} from 'discord.js';
import { ask } from './claude.js';

// ---- 環境変数 ----
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const ALLOWED_CHANNEL_IDS = (process.env.ALLOWED_CHANNEL_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const MODEL = process.env.ANTHROPIC_MODEL;

if (!DISCORD_BOT_TOKEN) {
  console.error('❌ DISCORD_BOT_TOKEN が設定されていません。.env を確認してください。');
  process.exit(1);
}
if (!process.env.CLAUDE_CODE_OAUTH_TOKEN && !process.env.ANTHROPIC_API_KEY) {
  console.error(
    '❌ Claude の認証情報がありません。CLAUDE_CODE_OAUTH_TOKEN(サブスク) または ANTHROPIC_API_KEY を設定してください。',
  );
  process.exit(1);
}

// チャンネルごとに会話セッションIDを保持し、文脈を継続する
const sessions = new Map<string, string>();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel], // DM を受け取るために必要
});

client.once(Events.ClientReady, (c) => {
  console.log(`✅ ログインしました: ${c.user.tag}`);
  if (ALLOWED_CHANNEL_IDS.length > 0) {
    console.log(`   反応するチャンネル: ${ALLOWED_CHANNEL_IDS.join(', ')}`);
  } else {
    console.log('   全チャンネルでメンション/DM に反応します。');
  }
  const authMode = process.env.ANTHROPIC_API_KEY ? 'ANTHROPIC_API_KEY(従量課金)' : 'CLAUDE_CODE_OAUTH_TOKEN(サブスク)';
  console.log(`   認証: ${authMode}`);
});

client.on(Events.MessageCreate, async (message) => {
  try {
    await handleMessage(message);
  } catch (err) {
    console.error('メッセージ処理でエラー:', err);
    try {
      await message.reply('⚠️ 内部エラーが発生しました。もう一度お試しください。');
    } catch {
      /* ignore */
    }
  }
});

async function handleMessage(message: Message): Promise<void> {
  // 自分・他のボットは無視
  if (message.author.bot) return;

  const isDM = !message.guild;
  const botUser = client.user;
  const mentioned = botUser ? message.mentions.users.has(botUser.id) : false;

  // 反応条件:
  //  - DM は常に反応
  //  - ALLOWED_CHANNEL_IDS が設定されていればそのチャンネルでは全メッセージに反応
  //  - それ以外はメンションされた時のみ反応
  const inAllowedChannel = ALLOWED_CHANNEL_IDS.includes(message.channelId);
  if (!isDM && !inAllowedChannel && !mentioned) return;

  // メンション文字列を除去してプロンプト化
  let content = message.content;
  if (botUser) {
    content = content.replace(new RegExp(`<@!?${botUser.id}>`, 'g'), '').trim();
  }

  // 会話リセットコマンド
  if (content === '!reset' || content === '!new' || content === '!clear') {
    sessions.delete(message.channelId);
    await message.reply('🔄 会話履歴をリセットしました。');
    return;
  }

  // ヘルプ
  if (content === '!help') {
    await message.reply(
      [
        '**使い方**',
        '・普通に話しかければ Claude が応答します。',
        '・会話の文脈はチャンネルごとに保持されます。',
        '・`!reset` … 会話履歴をリセット',
        '・`!help`  … このヘルプを表示',
      ].join('\n'),
    );
    return;
  }

  if (!content) {
    await message.reply('何かメッセージを送ってください。使い方は `!help` で確認できます。');
    return;
  }

  // 「入力中...」表示
  const channel = message.channel as TextBasedChannel;
  const typing = startTyping(channel);

  const resumeSessionId = sessions.get(message.channelId) ?? null;
  const result = await ask(content, {
    resumeSessionId,
    model: MODEL,
  });

  typing.stop();

  if (result.sessionId && !result.isError) {
    sessions.set(message.channelId, result.sessionId);
  }

  const reply = result.text || '(応答が空でした)';
  await sendChunked(message, reply);
}

/** typing インジケータを定期送信し続けるヘルパー */
function startTyping(channel: TextBasedChannel): { stop: () => void } {
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
async function sendChunked(message: Message, text: string): Promise<void> {
  const MAX = 2000;
  if (text.length <= MAX) {
    await message.reply(text);
    return;
  }

  const chunks = splitText(text, MAX);
  // 最初の1件は reply、以降は同チャンネルへ続けて送信
  await message.reply(chunks[0]);
  for (let i = 1; i < chunks.length; i++) {
    if ('send' in message.channel) {
      await (message.channel as { send: (c: string) => Promise<unknown> }).send(chunks[i]);
    }
  }
}

/** 改行やコードブロックをなるべく壊さずに分割 */
function splitText(text: string, max: number): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > max) {
    let cut = remaining.lastIndexOf('\n', max);
    if (cut < max * 0.5) cut = max; // 改行が見つからなければ強制分割
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

client.login(DISCORD_BOT_TOKEN);
