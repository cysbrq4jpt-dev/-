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
}

/**
 * Claude Agent SDK にプロンプトを投げ、最終応答テキストとセッションIDを返す。
 *
 * 認証は環境変数から自動で解決される:
 *   - CLAUDE_CODE_OAUTH_TOKEN(サブスク) を推奨
 *   - もしくは ANTHROPIC_API_KEY(従量課金)
 */
export async function ask(prompt: string, opts: AskOptions = {}): Promise<AskResult> {
  const options: Options = {
    model: opts.model,
    resume: opts.resumeSessionId ?? undefined,
    // Discord チャットボット用途では会話が主目的。ツールの権限確認は
    // インタラクティブに出せないため、ここでは制限的に扱う。
    permissionMode: 'default' as PermissionMode,
    // 暴走防止のためターン数に上限を設ける
    maxTurns: 20,
    systemPrompt:
      opts.systemPrompt ??
      'あなたは Discord 上で動作する親切なアシスタントです。回答は簡潔で分かりやすく、必要に応じて日本語で答えてください。Discord のメッセージは 2000 文字までなので、長くなりすぎないようにしてください。',
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
