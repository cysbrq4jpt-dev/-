import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { RepoRef } from './repos.js';

const DATA_DIR = path.resolve(process.env.DATA_DIR ?? './data');
const BINDINGS_FILE = path.join(DATA_DIR, 'bindings.json');

type Store = Record<string, RepoRef>;

let store: Store = load();

function load(): Store {
  try {
    if (existsSync(BINDINGS_FILE)) {
      return JSON.parse(readFileSync(BINDINGS_FILE, 'utf8')) as Store;
    }
  } catch (err) {
    console.error('bindings.json の読み込みに失敗:', err);
  }
  return {};
}

function persist(): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(BINDINGS_FILE, JSON.stringify(store, null, 2));
  } catch (err) {
    console.error('bindings.json の保存に失敗:', err);
  }
}

/** チャンネルに紐付いたリポジトリを取得 */
export function getBinding(channelId: string): RepoRef | undefined {
  return store[channelId];
}

/** チャンネルにリポジトリを紐付ける */
export function setBinding(channelId: string, ref: RepoRef): void {
  store[channelId] = ref;
  persist();
}

/** 紐付けを解除 */
export function removeBinding(channelId: string): void {
  delete store[channelId];
  persist();
}

/** 全紐付けを返す */
export function allBindings(): ReadonlyArray<[string, RepoRef]> {
  return Object.entries(store);
}
