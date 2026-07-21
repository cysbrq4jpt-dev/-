import 'dotenv/config';
import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
  type Message,
  type TextBasedChannel,
} from 'discord.js';
import { ask } from './claude.js';
import { ensureRepo, parseRepoSpec, hasGithubToken, type RepoRef } from './repos.js';
import { getBinding, setBinding, removeBinding, allBindings } from './bindings.js';
import { setupServer, createProjectChannel, COMMON_CHANNELS } from './server-setup.js';

// ---- 環境変数 ----
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const MODEL = process.env.ANTHROPIC_MODEL;
// 「全体チャット」チャンネルではメンション不要で雑談応答する
const CHAT_CHANNEL_NAME = '全体チャット';

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

// チャンネルごとの会話セッションID（文脈継続用）
const sessions = new Map<string, string>();

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
  console.log(`✅ ログインしました: ${c.user.tag}`);
  const authMode = process.env.ANTHROPIC_API_KEY ? 'ANTHROPIC_API_KEY(従量課金)' : 'CLAUDE_CODE_OAUTH_TOKEN(サブスク)';
  console.log(`   認証: ${authMode}`);
  console.log(`   GitHub トークン: ${hasGithubToken() ? 'あり(push/PR可)' : 'なし(公開repoの読み取りのみ)'}`);
  console.log(`   紐付け済みプロジェクト: ${allBindings().length} 件`);
});

client.on(Events.MessageCreate, async (message) => {
  try {
    await handleMessage(message);
  } catch (err) {
    console.error('メッセージ処理でエラー:', err);
    try {
      await message.reply(`⚠️ エラーが発生しました: ${(err as Error).message ?? err}`);
    } catch {
      /* ignore */
    }
  }
});

async function handleMessage(message: Message): Promise<void> {
  if (message.author.bot) return;

  const isDM = !message.guild;
  const botUser = client.user;
  const mentioned = botUser ? message.mentions.users.has(botUser.id) : false;
  const binding = getBinding(message.channelId);
  const channelName = 'name' in message.channel ? (message.channel as { name: string }).name : '';
  const isChatChannel = channelName === CHAT_CHANNEL_NAME;

  // メンション文字列を除去
  let content = message.content;
  if (botUser) {
    content = content.replace(new RegExp(`<@!?${botUser.id}>`, 'g'), '').trim();
  }

  // ---- コマンド（メンション or DM or 明示コマンドで受け付け）----
  if (content.startsWith('!')) {
    const handled = await handleCommand(message, content);
    if (handled) return;
  }

  // ---- 反応するかどうかの判定 ----
  //  - DM: 常に反応
  //  - プロジェクトチャンネル(紐付けあり): 常に反応
  //  - 全体チャット: 常に反応
  //  - それ以外: メンション時のみ
  const shouldRespond = isDM || Boolean(binding) || isChatChannel || mentioned;
  if (!shouldRespond) return;

  if (!content) {
    await message.reply('何か話しかけてください。使い方は `!help` を見てください。');
    return;
  }

  const channel = message.channel as TextBasedChannel;

  // ---- プロジェクト（リポジトリ）モード ----
  if (binding) {
    const typing = startTyping(channel);
    let cwd: string;
    try {
      await react(message, '📥');
      const ensured = await ensureRepo(binding);
      cwd = ensured.path;
    } catch (err) {
      typing.stop();
      await message.reply(`⚠️ リポジトリの準備に失敗しました: ${(err as Error).message}`);
      return;
    }

    await react(message, '🤔');
    const result = await ask(content, {
      resumeSessionId: sessions.get(message.channelId) ?? null,
      model: MODEL,
      cwd,
    });
    typing.stop();
    if (result.sessionId && !result.isError) sessions.set(message.channelId, result.sessionId);
    await sendChunked(message, result.text || '(応答が空でした)');
    return;
  }

  // ---- 通常チャットモード ----
  const typing = startTyping(channel);
  const result = await ask(content, {
    resumeSessionId: sessions.get(message.channelId) ?? null,
    model: MODEL,
  });
  typing.stop();
  if (result.sessionId && !result.isError) sessions.set(message.channelId, result.sessionId);
  await sendChunked(message, result.text || '(応答が空でした)');
}

/** `!` コマンドを処理。処理したら true */
async function handleCommand(message: Message, content: string): Promise<boolean> {
  const [cmd, ...rest] = content.slice(1).split(/\s+/);
  const arg = rest.join(' ').trim();

  switch (cmd) {
    case 'help':
      await message.reply(helpText());
      return true;

    case 'reset':
    case 'new':
    case 'clear':
      sessions.delete(message.channelId);
      await message.reply('🔄 会話履歴をリセットしました。');
      return true;

    case 'setup': {
      if (!message.guild) {
        await message.reply('サーバー内で実行してください。');
        return true;
      }
      if (!hasManageChannels(message)) {
        await message.reply('⚠️ 私に「チャンネルの管理」権限がありません。ロール設定を確認してください。');
        return true;
      }
      await react(message, '🏗️');
      const res = await setupServer(message.guild);
      const lines = ['🏗️ 共通セクションを準備しました。'];
      if (res.created.length) lines.push(`作成: ${res.created.join(', ')}`);
      if (res.skipped.length) lines.push(`既存: ${res.skipped.join(', ')}`);
      lines.push('', '次は `!project add owner/name` でプロジェクトを追加してください。');
      await message.reply(lines.join('\n'));
      return true;
    }

    case 'project': {
      return handleProjectCommand(message, rest);
    }

    case 'bind': {
      const ref = parseRepoSpec(arg);
      if (!ref) {
        await message.reply('形式: `!bind owner/name`');
        return true;
      }
      await bindChannel(message, ref);
      return true;
    }

    case 'unbind': {
      if (!getBinding(message.channelId)) {
        await message.reply('このチャンネルにはリポジトリが紐付いていません。');
        return true;
      }
      removeBinding(message.channelId);
      sessions.delete(message.channelId);
      await message.reply('🔓 このチャンネルのリポジトリ紐付けを解除しました。');
      return true;
    }

    case 'repo':
    case 'status': {
      const b = getBinding(message.channelId);
      await message.reply(
        b
          ? `📁 このチャンネルの対象リポジトリ: \`${b.owner}/${b.repo}\``
          : 'このチャンネルにリポジトリは紐付いていません。`!bind owner/name` で紐付けできます。',
      );
      return true;
    }

    default:
      return false; // 未知の ! はコマンドとして扱わない
  }
}

async function handleProjectCommand(message: Message, rest: string[]): Promise<boolean> {
  const sub = rest[0];

  if (sub === 'add') {
    if (!message.guild) {
      await message.reply('サーバー内で実行してください。');
      return true;
    }
    if (!hasManageChannels(message)) {
      await message.reply('⚠️ 私に「チャンネルの管理」権限がありません。');
      return true;
    }
    const ref = parseRepoSpec(rest[1] ?? '');
    if (!ref) {
      await message.reply('形式: `!project add owner/name [表示名]`');
      return true;
    }
    const displayName = rest.slice(2).join(' ') || undefined;

    await react(message, '🏗️');
    // 事前に clone を試み、失敗するならチャンネルを作らない
    try {
      await ensureRepo(ref);
    } catch (err) {
      await message.reply(`⚠️ リポジトリを取得できませんでした: ${(err as Error).message}`);
      return true;
    }

    const { channel } = await createProjectChannel(message.guild, ref, displayName);
    setBinding(channel.id, ref);
    await channel.send(
      [
        `📂 **${ref.owner}/${ref.repo}** のプロジェクトチャンネルを作成しました。`,
        'このチャンネルで話しかけると、Claude がこのリポジトリを操作します。',
        '例:「READMEを要約して」「◯◯のバグを直してPRを作って」',
      ].join('\n'),
    );
    await message.reply(`✅ ${channel} を作成しました。`);
    return true;
  }

  if (sub === 'list') {
    const list = allBindings();
    if (!list.length) {
      await message.reply('紐付け済みプロジェクトはありません。');
      return true;
    }
    const lines = list.map(([cid, ref]) => `・<#${cid}> → \`${ref.owner}/${ref.repo}\``);
    await message.reply(['📂 **プロジェクト一覧**', ...lines].join('\n'));
    return true;
  }

  await message.reply('サブコマンド: `!project add owner/name` / `!project list`');
  return true;
}

async function bindChannel(message: Message, ref: RepoRef): Promise<void> {
  await react(message, '📥');
  try {
    await ensureRepo(ref);
  } catch (err) {
    await message.reply(`⚠️ リポジトリを取得できませんでした: ${(err as Error).message}`);
    return;
  }
  setBinding(message.channelId, ref);
  sessions.delete(message.channelId);
  await message.reply(`✅ このチャンネルを \`${ref.owner}/${ref.repo}\` に紐付けました。話しかけると Claude が操作します。`);
}

function hasManageChannels(message: Message): boolean {
  const me = message.guild?.members.me;
  return Boolean(me?.permissions.has(PermissionFlagsBits.ManageChannels));
}

function helpText(): string {
  return [
    '**使い方**',
    '',
    '__セットアップ（最初に一度）__',
    '・`!setup` … 「共通」カテゴリと ' + COMMON_CHANNELS.map((c) => `#${c}`).join(' / ') + ' を自動作成',
    '',
    '__プロジェクト（＝リポジトリ）__',
    '・`!project add owner/name [表示名]` … プロジェクト用チャンネルを作成してリポジトリに紐付け',
    '・`!project list` … 紐付け済みプロジェクト一覧',
    '・`!bind owner/name` … 今いるチャンネルをリポジトリに紐付け',
    '・`!unbind` … 紐付けを解除',
    '・`!repo` … このチャンネルの対象リポジトリを表示',
    '',
    '__会話__',
    '・プロジェクトチャンネルでは、話しかけるだけで Claude がそのリポジトリを操作（調査・修正・PR作成）。',
    '・#全体チャット では普通に雑談できます。',
    '・`!reset` … 会話履歴をリセット',
  ].join('\n');
}

async function react(message: Message, emoji: string): Promise<void> {
  try {
    await message.react(emoji);
  } catch {
    /* ignore */
  }
}

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

async function sendChunked(message: Message, text: string): Promise<void> {
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

function splitText(text: string, max: number): string[] {
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

client.login(DISCORD_BOT_TOKEN);
