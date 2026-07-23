import type { RepoRef } from './repos.js';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? '';

export interface RepoInfo extends RepoRef {
  fullName: string;
  private: boolean;
  archived: boolean;
  fork: boolean;
  pushedAt: string | null;
}

/**
 * 認証ユーザーがアクセスできるリポジトリを全件取得する（ページング対応）。
 * GITHUB_TOKEN が必要。
 */
export async function listMyRepos(): Promise<RepoInfo[]> {
  if (!GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN が未設定です。.env に GitHub トークンを設定してください。');
  }

  const repos: RepoInfo[] = [];
  const perPage = 100;

  // 所有・共同編集・組織メンバーのリポジトリを全て対象にする。
  // owner だけに絞りたい場合は GITHUB_REPO_AFFILIATION=owner を設定。
  const affiliation = process.env.GITHUB_REPO_AFFILIATION ?? 'owner,collaborator,organization_member';

  for (let page = 1; page <= 20; page++) {
    const url = `https://api.github.com/user/repos?per_page=${perPage}&page=${page}&affiliation=${encodeURIComponent(affiliation)}&sort=pushed`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'claude-discord-bot',
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitHub API エラー (${res.status}): ${body.slice(0, 200)}`);
    }

    const page_repos = (await res.json()) as Array<{
      name: string;
      full_name: string;
      owner: { login: string };
      private: boolean;
      archived: boolean;
      fork: boolean;
      pushed_at: string | null;
    }>;

    for (const r of page_repos) {
      repos.push({
        owner: r.owner.login,
        repo: r.name,
        fullName: r.full_name,
        private: r.private,
        archived: r.archived,
        fork: r.fork,
        pushedAt: r.pushed_at,
      });
    }

    if (page_repos.length < perPage) break; // 最終ページ
  }

  return repos;
}
