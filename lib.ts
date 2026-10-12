// Run state is a folder per run under $HELM_WORK/runs/<id>: meta.json, brief.md, log.txt, result.md.
// $HELM_HOME (~/.helm) holds .env; $HELM_WORK (default $HELM_HOME) holds runs, worktrees and worker caches,
// so they can live on an external drive.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = dirname(fileURLToPath(import.meta.url));
export const HOME = process.env.HELM_HOME ?? join(homedir(), '.helm');
loadEnv();
export const WORK = process.env.HELM_WORK?.replace(/^~(?=\/)/, homedir()) ?? HOME;
export const RUNS = join(WORK, 'runs');

/** Refuse to start when HELM_WORK is set but missing (e.g. the drive is unplugged), so nothing lands on the boot disk. */
export function requireWork(): void {
  if (process.env.HELM_WORK && !existsSync(WORK)) throw new Error(`HELM_WORK ${WORK} is not available (drive unplugged?)`);
}

/** Worker environment: temp files and package caches under $HELM_WORK/cache when HELM_WORK is set. */
export function workerEnv(): NodeJS.ProcessEnv {
  if (!process.env.HELM_WORK) return process.env;
  const cache = join(WORK, 'cache');
  for (const d of ['tmp', 'npm', 'pnpm-store', 'xdg']) mkdirSync(join(cache, d), { recursive: true });
  return { ...process.env, TMPDIR: join(cache, 'tmp'), npm_config_cache: join(cache, 'npm'),
    npm_config_store_dir: join(cache, 'pnpm-store'), XDG_CACHE_HOME: join(cache, 'xdg') };
}

export type State = 'running' | 'done' | 'failed' | 'question' | 'stopped';
export type Meta = {
  id: string; model: string; role: 'build' | 'review'; repo: string; worktree: string;
  branch: string; base: string; state: State; pid?: number; session?: string;
  summary?: string; question?: string; created: string; updated: string; turns: number;
};

export const runDir = (id: string) => join(RUNS, id);

export function readMeta(id: string): Meta {
  const file = join(runDir(id), 'meta.json');
  if (!existsSync(file)) throw new Error(`no run ${id}`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function writeMeta(id: string, patch: Partial<Meta>): Meta {
  const file = join(runDir(id), 'meta.json');
  const prev = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const meta = { ...prev, ...patch, updated: new Date().toISOString() };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(meta, null, 2));
  return meta;
}

export function listRuns(): Meta[] {
  if (!existsSync(RUNS)) return [];
  return readdirSync(RUNS).filter((id) => existsSync(join(RUNS, id, 'meta.json'))).map(readMeta)
    .sort((a, b) => a.created.localeCompare(b.created));
}

/** One compact line per worker event; the watcher reads this file's mtime as the heartbeat. */
export function log(id: string, line: string): void {
  const time = new Date().toISOString().slice(11, 19);
  appendFileSync(join(runDir(id), 'log.txt'), `${time} ${line.replace(/\s+/g, ' ').slice(0, 200)}\n`);
}

export function lastLogAt(id: string): number {
  const file = join(runDir(id), 'log.txt');
  return existsSync(file) ? statSync(file).mtimeMs : Date.parse(readMeta(id).updated);
}

export function alive(pid?: number): boolean {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/** The worker's report: the last {"status": ...} JSON object in its final message, if any. */
export function parseReport(text: string): { status: State; summary: string; question?: string } {
  const objects = [...text.matchAll(/\{[^{}]*"status"[^{}]*\}/g)].reverse();
  for (const [raw] of objects) {
    try {
      const r = JSON.parse(raw);
      const status: State = r.status === 'question' ? 'question' : r.status === 'failed' ? 'failed' : 'done';
      return { status, summary: String(r.summary ?? ''), question: r.question ? String(r.question) : undefined };
    } catch { /* try the next one */ }
  }
  return { status: 'done', summary: text.trim().split('\n').at(-1)?.slice(0, 200) ?? '' };
}

/** Called by a connector when its turn ends: store the final message and set the run state. */
export function finish(id: string, text: string, error?: string): void {
  if (readMeta(id).state === 'stopped') return;
  writeFileSync(join(runDir(id), 'result.md'), text);
  if (error) {
    log(id, `error: ${error}`);
    writeMeta(id, { state: 'failed', summary: error.replace(/\s+/g, ' ').slice(0, 200), pid: undefined });
    return;
  }
  const r = parseReport(text);
  log(id, `${r.status}: ${r.summary}`);
  writeMeta(id, { state: r.status, summary: r.summary.replace(/\s+/g, ' '), question: r.question, pid: undefined });
}

/** System prompt for a run: agents/worker.md or agents/reviewer.md. */
export const agentPrompt = (role: Meta['role']) =>
  readFileSync(join(ROOT, 'agents', role === 'review' ? 'reviewer.md' : 'worker.md'), 'utf8');

/** Load $HELM_HOME/.env (KEY=value lines) without overriding the real environment. */
export function loadEnv(): void {
  const file = join(process.env.HELM_HOME ?? join(homedir(), '.helm'), '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
