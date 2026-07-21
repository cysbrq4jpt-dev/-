import {
  ChannelType,
  type Guild,
  type CategoryChannel,
  type TextChannel,
} from 'discord.js';
import type { RepoRef } from './repos.js';

export const COMMON_CATEGORY = '共通';
export const PROJECTS_CATEGORY = 'プロジェクト';
export const COMMON_CHANNELS = ['全体チャット', 'ジャーナル', 'メモ'] as const;

/** 名前とタイプでカテゴリを検索。無ければ作成 */
async function ensureCategory(guild: Guild, name: string): Promise<CategoryChannel> {
  const existing = guild.channels.cache.find(
    (c): c is CategoryChannel => c.type === ChannelType.GuildCategory && c.name === name,
  );
  if (existing) return existing;
  return guild.channels.create({ name, type: ChannelType.GuildCategory });
}

/** 指定カテゴリ配下に同名テキストチャンネルがあれば返す */
function findTextChannel(guild: Guild, name: string, parentId: string): TextChannel | undefined {
  // Discord はチャンネル名を小文字化・空白をハイフンに変換するため緩く比較する
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '-');
  return guild.channels.cache.find(
    (c): c is TextChannel =>
      c.type === ChannelType.GuildText && c.parentId === parentId && norm(c.name) === norm(name),
  );
}

export interface SetupResult {
  created: string[];
  skipped: string[];
}

/** 共通セクション（カテゴリ＋全体チャット/ジャーナル/メモ）とプロジェクトカテゴリを用意する */
export async function setupServer(guild: Guild): Promise<SetupResult> {
  const created: string[] = [];
  const skipped: string[] = [];

  const common = await ensureCategory(guild, COMMON_CATEGORY);
  for (const name of COMMON_CHANNELS) {
    if (findTextChannel(guild, name, common.id)) {
      skipped.push(`#${name}`);
    } else {
      await guild.channels.create({ name, type: ChannelType.GuildText, parent: common.id });
      created.push(`#${name}`);
    }
  }

  const projects = await ensureCategory(guild, PROJECTS_CATEGORY);
  // カテゴリ自体は ensureCategory 内で作成済み。作成有無を報告に含める。
  if (guild.channels.cache.get(projects.id)) {
    // 既にあった/今作った どちらでも OK。存在確認のみ。
  }

  return { created, skipped };
}

export interface ProjectChannelResult {
  channel: TextChannel;
  number: number;
}

/**
 * プロジェクトカテゴリ配下に、リポジトリ用のチャンネルを作成する。
 * 連番（1, 2, 3…）を先頭に付ける。
 */
export async function createProjectChannel(
  guild: Guild,
  ref: RepoRef,
  displayName?: string,
): Promise<ProjectChannelResult> {
  const projects = await ensureCategory(guild, PROJECTS_CATEGORY);

  // カテゴリ内の既存チャンネル数から次の番号を決める
  const siblings = guild.channels.cache.filter(
    (c) => c.type === ChannelType.GuildText && c.parentId === projects.id,
  );
  const number = siblings.size + 1;

  const base = (displayName ?? ref.repo).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  const name = `${number}-${base || 'project'}`;

  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: projects.id,
    topic: `repo:${ref.owner}/${ref.repo} | このチャンネルで話すと Claude が ${ref.owner}/${ref.repo} を操作します`,
  });

  return { channel, number };
}
