import { query, type Options, type PermissionMode } from '@anthropic-ai/claude-agent-sdk';

export interface AskResult {
  /** Claude の最終応答テキスト */
  text: string;
  /** 会話を継続するためのセッションID(次回 resume に渡す) */
  sessionId: string | null;
  /** エラーで終了した場合 true */
  isError: boolean;
}

export interface AskOptions {
  /** 前回の会話を続ける場合のセッションID */
  resumeSessionId?: string | null;
  /** 使用モデル(未指定なら CLI デフォルト) */
  model?: string;
  /** システムプロンプト */
  systemPrompt?: string;
  /** 作業ディレクトリ(リポジトリの clone 先)。指定するとそのリポジトリ上で作業する */
  cwd?: string;
  /** 権限モード。リポジトリを編集/コミットする場合は acceptEdits か bypassPermissions */
  permissionMode?: PermissionMode;
}

const DEFAULT_CHAT_PROMPT =
  'あなたは Discord 上で動作する親切なアシスタントです。回答は簡潔で分かりやすく、必要に応じて日本語で答えてください。Discord のメッセージは 2000 文字までなので、長くなりすぎないようにしてください。';

const REPO_SYSTEM_PROMPT = `あなたは Discord 経由で GitHub リポジトリの作業を代行するエンジニアです。現在の作業ディレクトリは、対象リポジトリを clone したものです。

- コードの調査・修正・テスト実行などを行えます。
- 変更を加えたら git で新しいブランチを作成し、コミットして push してください（origin の認証は設定済みです）。
- 可能なら \`gh pr create\` で Pull Request を作成し、その URL を回答に含めてください。gh が使えない場合は、push したブランチ名と compare URL を案内してください。
- main / master へ直接 push しないでください。必ずブランチを切ってください。
- 回答は簡潔にまとめ、何をしたか（変更点・ブランチ・PR URL）を報告してください。Discord は 2000 文字までです。`;

/**
 * Claude Agent SDK にプロンプトを投げ、最終応答テキストとセッションIDを返す。
 *
 * 認証は環境変数から自動で解決される:
 *   - CLAUDE_CODE_OAUTH_TOKEN(サブスク) を推奨
 *   - もしくは ANTHROPIC_API_KEY(従量課金)
 */
export async function ask(prompt: string, opts: AskOptions = {}): Promise<AskResult> {
  const isRepoMode = Boolean(opts.cwd);

  const options: Options = {
    model: opts.model,
    resume: opts.resumeSessionId ?? undefined,
    cwd: opts.cwd,
    // 雑談時は制限的に、リポジトリ作業時は編集を自動承認(インタラクティブに
    // 権限確認を出せないため)。既定はモードに応じて切り替え、env で上書き可能。
    permissionMode: opts.permissionMode ?? (isRepoMode ? 'acceptEdits' : 'default'),
    // 暴走防止のためターン数に上限を設ける
    maxTurns: isRepoMode ? 60 : 20,
    systemPrompt: opts.systemPrompt ?? (isRepoMode ? REPO_SYSTEM_PROMPT : DEFAULT_CHAT_PROMPT),
  };

  let text = '';
  let sessionId: string | null = null;
  let isError = false;

  const response = query({ prompt, options });

  for await (const message of response) {
    if (message.type === 'system' && message.subtype === 'init') {
      sessionId = message.session_id;
    } else if (message.type === 'result') {
      sessionId = message.session_id;
      if (message.subtype === 'success') {
        text = message.result;
      } else {
        isError = true;
        text = `⚠️ 処理中にエラーが発生しました (${message.subtype})。`;
      }
    }
  }

  return { text, sessionId, isError };
}
