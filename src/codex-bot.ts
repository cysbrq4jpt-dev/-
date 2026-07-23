import { Client, Events, GatewayIntentBits, Partials, type Message } from 'discord.js';
import { askCodex } from './codex.js';
import { startTyping, react, sendChunked } from './discord-utils.js';

const JOURNAL_CHANNEL_NAME = 'ジャーナル';

/**
 * Codex 専用の Discord bot を起動する。
 * #ジャーナル チャンネル（およびメンション/DM）にのみ反応し、OpenAI Codex CLI が応答する。
 * Claude 側の bot とは別アプリ・別トークンで、見た目（名前/アイコン）を分けられる。
 */
export function startCodexBot(token: string): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel],
  });

  client.once(Events.ClientReady, (c) => {
    console.log(`✅ Codex bot ログインしました: ${c.user.tag}（#${JOURNAL_CHANNEL_NAME} 担当）`);
  });

  client.on(Events.MessageCreate, async (message) => {
    try {
      await handle(client, message);
    } catch (err) {
      console.error('Codex bot エラー:', err);
      try {
        await message.reply(`⚠️ エラー: ${(err as Error).message ?? err}`);
      } catch {
        /* ignore */
      }
    }
  });

  client.login(token);
  return client;
}

async function handle(client: Client, message: Message): Promise<void> {
  if (message.author.bot) return; // 他bot(Claude側含む)は無視してループ防止

  const isDM = !message.guild;
  const channelName = 'name' in message.channel ? (message.channel as { name: string }).name : '';
  const isJournal = channelName === JOURNAL_CHANNEL_NAME;
  const mentioned = client.user ? message.mentions.users.has(client.user.id) : false;

  // #ジャーナル / DM / メンション のみ反応
  if (!isDM && !isJournal && !mentioned) return;

  let content = message.content;
  if (client.user) {
    content = content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
  }
  if (!content) return;

  const typing = startTyping(message.channel);
  await react(message, '🤔');
  const result = await askCodex(content);
  typing.stop();
  await sendChunked(message, result.text || '(応答が空でした)');
}
