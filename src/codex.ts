import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';

const exec = promisify(execFile);

const CODEX_BIN = process.env.CODEX_BIN ?? 'codex';
// read-only / workspace-write / danger-full-access
const CODEX_SANDBOX = process.env.CODEX_SANDBOX ?? 'read-only';
// 思考の深さ: minimal / low / medium / high / xhigh。ジャーナル用途は低めが速い。
// 空にすると Codex の設定(config)に従う。
const CODEX_REASONING_EFFORT = process.env.CODEX_REASONING_EFFORT ?? 'low';
// 追加で渡したい引数(スペース区切り)
const CODEX_EXTRA_ARGS = (process.env.CODEX_EXTRA_ARGS ?? '').split(/\s+/).filter(Boolean);

let counter = 0;

export interface CodexResult {
  text: string;
  isError: boolean;
}

export interface CodexOptions {
  /** 作業ディレクトリ(省略時はプロセスのcwd) */
  cwd?: string;
}

/**
 * OpenAI Codex CLI をヘッドレス実行(`codex exec`)し、最終メッセージを返す。
 *
 * 認証は Codex CLI に保存済みのもの(`codex login` で ChatGPT サブスク or API キー)を
 * そのまま使う。事前に一度 `codex login` しておくこと。
 */
export async function askCodex(prompt: string, opts: CodexOptions = {}): Promise<CodexResult> {
  // 出力ファイルは作業ディレクトリ内に置く。read-only サンドボックスでも cwd 内には
  // 最終メッセージを書き出せることを確認済み(tmpdir はサンドボックスで弾かれることがある)。
  const baseDir = opts.cwd ?? process.cwd();
  const outFile = path.join(baseDir, `.codex-last-${process.pid}-${counter++}.txt`);

  const args = ['exec'];
  // Codex は既定で git リポジトリ(信頼されたディレクトリ)外での実行を拒否するため、
  // これを付けてボットの作業ディレクトリでも動くようにする。
  args.push('--skip-git-repo-check');
  if (CODEX_SANDBOX) args.push('--sandbox', CODEX_SANDBOX);
  // 思考の深さを指定(速度優先)。空なら Codex の既定設定に従う。
  if (CODEX_REASONING_EFFORT) args.push('-c', `model_reasoning_effort=${CODEX_REASONING_EFFORT}`);
  // 最終メッセージだけをファイルに書き出す
  args.push('--output-last-message', outFile);
  args.push(...CODEX_EXTRA_ARGS);
  // 素の会話文で返すよう指示を添える(太字やコード装飾を避ける)
  args.push(
    `${prompt}\n\n(返信は普通の会話文で。太字・見出し・バッククォート・箇条書きなどの装飾は使わないで)`,
  );

  try {
    const { stdout, stderr } = await exec(CODEX_BIN, args, {
      cwd: opts.cwd,
      maxBuffer: 1024 * 1024 * 32,
      timeout: 1000 * 60 * 5,
      env: { ...process.env },
    });

    // 最終メッセージファイルを最優先で読む
    let text = '';
    try {
      text = (await readFile(outFile, 'utf8')).trim();
    } catch {
      /* ファイルが無ければ次へ */
    }

    // ファイルが空なら stdout から最終メッセージを抽出する
    if (!text) text = extractFinalMessage(stdout ?? '');

    // それでも空なら、診断のため生の出力(末尾)を返す
    if (!text) {
      const diag = ((stderr || '') + '\n' + (stdout || '')).trim().slice(-1200);
      text = diag
        ? `(Codexの最終メッセージを取得できませんでした。生の出力↓)\n\`\`\`\n${diag}\n\`\`\``
        : '(Codex からの応答が空でした)';
    }

    return { text, isError: false };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string; code?: string };
    if (e.code === 'ENOENT') {
      return {
        text:
          '⚠️ `codex` コマンドが見つかりません。Codex CLI をインストールし、`codex login` でログインしてください。',
        isError: true,
      };
    }
    const detail = (e.stderr || e.stdout || e.message || '不明なエラー').toString().trim();
    return { text: `⚠️ Codex 実行エラー:\n${detail}`.slice(0, 1900), isError: true };
  } finally {
    await rm(outFile, { force: true }).catch(() => {});
  }
}

/**
 * `codex exec` の標準出力から最終メッセージを抽出する。
 * 出力は「...ヘッダー... / codex / <本文> / hook:... / tokens used / ...」の形。
 * 最後の "codex" 行の次から、次のメタ行(hook:/tokens used/user 等)までを本文とみなす。
 */
function extractFinalMessage(stdout: string): string {
  const lines = stdout.split(/\r?\n/);
  const metaLine = (l: string) =>
    /^(hook:|tokens used|user$|codex$|--------|workdir:|model:|provider:|approval:|sandbox:|reasoning |session id:|warning:|\d[\d,]*$)/.test(
      l.trim(),
    );

  // 最後の "codex" 行を探す
  let start = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === 'codex') {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return '';

  const body: string[] = [];
  for (let i = start; i < lines.length; i++) {
    if (metaLine(lines[i])) break;
    body.push(lines[i]);
  }
  return body.join('\n').trim();
}
