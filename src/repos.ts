import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const exec = promisify(execFile);

const WORKSPACE_DIR = path.resolve(process.env.WORKSPACE_DIR ?? './workspace');
const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? '';
const GIT_AUTHOR_NAME = process.env.GIT_AUTHOR_NAME ?? 'Claude Discord Bot';
const GIT_AUTHOR_EMAIL = process.env.GIT_AUTHOR_EMAIL ?? 'claude-bot@users.noreply.github.com';

// 許可リスト(カンマ区切りの owner/repo)。空なら制限なし。
const ALLOWED_REPOS = (process.env.ALLOWED_REPOS ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export interface RepoRef {
  owner: string;
  repo: string;
}

/** "owner/name" や "owner/name.git" 形式をパースする */
export function parseRepoSpec(spec: string): RepoRef | null {
  const m = spec.trim().match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

export function isRepoAllowed(ref: RepoRef): boolean {
  if (ALLOWED_REPOS.length === 0) return true;
  return ALLOWED_REPOS.includes(`${ref.owner}/${ref.repo}`.toLowerCase());
}

function authedUrl(ref: RepoRef): string {
  if (GITHUB_TOKEN) {
    return `https://x-access-token:${GITHUB_TOKEN}@github.com/${ref.owner}/${ref.repo}.git`;
  }
  return `https://github.com/${ref.owner}/${ref.repo}.git`;
}

function localPath(ref: RepoRef): string {
  return path.join(WORKSPACE_DIR, ref.owner, ref.repo);
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await exec('git', args, {
    cwd,
    maxBuffer: 1024 * 1024 * 32,
    env: {
      ...process.env,
      // 認証待ちでハングさせない
      GIT_TERMINAL_PROMPT: '0',
    },
  });
  return stdout.trim();
}

/** リポジトリのデフォルトブランチ名を取得(取れなければ main) */
async function defaultBranch(dir: string): Promise<string> {
  try {
    const ref = await git(dir, ['symbolic-ref', 'refs/remotes/origin/HEAD']);
    return ref.replace('refs/remotes/origin/', '').trim() || 'main';
  } catch {
    return 'main';
  }
}

export interface EnsureResult {
  path: string;
  branch: string;
  /** 新規 clone だったか */
  cloned: boolean;
}

/**
 * リポジトリをローカルに用意する。
 * - 未 clone なら clone
 * - clone 済みなら fetch してデフォルトブランチを最新化(ローカル変更は破棄)
 */
export async function ensureRepo(ref: RepoRef): Promise<EnsureResult> {
  if (!isRepoAllowed(ref)) {
    throw new Error(
      `リポジトリ ${ref.owner}/${ref.repo} は許可されていません。ALLOWED_REPOS を確認してください。`,
    );
  }

  const dir = localPath(ref);
  await mkdir(path.dirname(dir), { recursive: true });

  if (!existsSync(path.join(dir, '.git'))) {
    await mkdir(path.dirname(dir), { recursive: true });
    await exec('git', ['clone', authedUrl(ref), dir], {
      maxBuffer: 1024 * 1024 * 64,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    await configureIdentity(dir);
    const branch = await defaultBranch(dir);
    return { path: dir, branch, cloned: true };
  }

  // 既存 clone を最新化
  await configureIdentity(dir);
  const branch = await defaultBranch(dir);
  await git(dir, ['fetch', 'origin', branch]);
  await git(dir, ['checkout', branch]);
  await git(dir, ['reset', '--hard', `origin/${branch}`]);
  // 未追跡ファイルの掃除(生成物などが残っていると混乱するため)
  await git(dir, ['clean', '-fd']);
  return { path: dir, branch, cloned: false };
}

/** コミットできるよう git のユーザー情報を設定する */
async function configureIdentity(dir: string): Promise<void> {
  await git(dir, ['config', 'user.name', GIT_AUTHOR_NAME]);
  await git(dir, ['config', 'user.email', GIT_AUTHOR_EMAIL]);
}

export function hasGithubToken(): boolean {
  return Boolean(GITHUB_TOKEN);
}

export function workspaceDir(): string {
  return WORKSPACE_DIR;
}
