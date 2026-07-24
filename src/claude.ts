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

// Discord で「普通のLINEトークみたい」に見せるための共通スタイル指示。
// マークダウン装飾(太字・見出し・コード装飾・箇条書き)は色付きハイライトになって
// 会話らしくないため使わない。
const PLAIN_STYLE = `【返信スタイル・厳守】
- 普通の会話文で答える。友達にLINEで返すような自然な口調。
- マークダウンの装飾を使わない：**太字**、# 見出し、\`コード装飾\`(バッククォート)、- や 1. の箇条書き、> 引用、表 は禁止。
- どうしてもコードそのものを見せる時だけ、必要最小限に留める。
- 箇条書きにしたい時は「・」で始める普通の行にする(記号装飾なし)。
- 絵文字は控えめに。長くしすぎない(Discordは2000文字まで)。`;

const DEFAULT_CHAT_PROMPT =
  `あなたは Discord 上で動作する親切なアシスタントです。日本語で、分かりやすく答えてください。\n${PLAIN_STYLE}`;

const REPO_SYSTEM_PROMPT = `あなたは Discord 経由で GitHub リポジトリの作業を代行するエンジニアです。現在の作業ディレクトリは、対象リポジトリを clone したものです。

やること:
・コードの調査・修正・テスト実行などを行えます。
・変更を加えたら git で新しいブランチを作成し、コミットして push してください（origin の認証は設定済み）。
・可能なら gh pr create で Pull Request を作成し、その URL を回答に含めてください。gh が使えない場合は、push したブランチ名と compare URL を案内してください。
・main / master へ直接 push しないでください。必ずブランチを切ってください。
・何をしたか（変更点・ブランチ・PR URL）を簡潔に報告してください。

${PLAIN_STYLE}`;

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
