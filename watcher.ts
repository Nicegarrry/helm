// `helm wait`: block until a watched run ends, asks a question, dies or stalls, print one line, exit.
// The orchestrator runs it as a background command, so the exit is what wakes it. HELM_NOTIFY, if set,
// is a shell command that also gets the line (as $HELM_EVENT), e.g. a Discord webhook or a push.
import { execFileSync, execSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { alive, lastLogAt, listRuns, readMeta, runDir, writeMeta, type Meta } from './lib.ts';

const line = (m: Meta, why: string) => `${m.id} ${why} · ${m.model} · ${m.question ?? m.summary ?? ''}`.trim();

/** One pass over the watched runs; returns the event lines worth waking for. Quiet time counts from
 * the later of the last log line and the start of this wait, so waiting again gives a full window. */
export function check(ids: string[], stallMin: number, since: number): string[] {
  const out: string[] = [];
  for (const id of ids) {
    let m = readMeta(id);
    if (m.state === 'running' && !alive(m.pid)) m = writeMeta(id, { state: 'failed', summary: 'worker process died without a report', pid: undefined });
    if (m.state !== 'running') { out.push(line(m, m.state)); continue; }
    const quietMin = (Date.now() - Math.max(lastLogAt(id), since)) / 60_000;
    if (quietMin >= stallMin) out.push(line(m, `stalled (no progress for ${Math.floor(quietMin)}m)`));
  }
  return out;
}

export type Status = { id: string; state: Meta['state'] | 'stalled' | 'missing'; model?: string; summary?: string; question?: string; updated?: string; quietMin?: number };

/** `helm status <id...> --json`: one snapshot per run for a supervisor that polls instead of waiting (QubitOS reads this).
 * Same rules as check(): a dead worker is marked failed, a running one quiet for stallMin minutes reads as stalled. */
export function status(ids: string[], stallMin: number): Status[] {
  return ids.map((id) => {
    let m: Meta;
    try { m = readMeta(id); } catch { return { id, state: 'missing' }; }
    if (m.state === 'running' && !alive(m.pid)) m = writeMeta(id, { state: 'failed', summary: 'worker process died without a report', pid: undefined });
    const quietMin = Math.floor((Date.now() - lastLogAt(id)) / 60_000);
    const state = m.state === 'running' && quietMin >= stallMin ? 'stalled' : m.state;
    return { id, state, model: m.model, summary: m.summary, question: m.question, updated: m.updated, quietMin };
  });
}

const waiters = (id: string) => join(runDir(id), 'waiters');

/** A killed watcher leaves its marker behind, so check the pid is still a `helm wait` and not a recycled one. */
const isWaiter = (pid: string) => {
  try { return execFileSync('ps', ['-o', 'command=', '-p', pid], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).includes('cli.ts wait'); } catch { return false; }
};
const hasWatcher = (id: string) => { try { return readdirSync(waiters(id)).some(isWaiter); } catch { return false; } };

/** `helm guard`: Claude Code Stop hook. Blocks the turn end once when this session has running workers and no
 * live `helm wait`, because nothing would wake it. Any error allows the stop, so a helm fault can't trap a session. */
export function guard(stdin: string): string {
  try {
    const { session_id, stop_hook_active } = JSON.parse(stdin);
    if (!session_id || stop_hook_active) return '';
    const ids = listRuns().filter((m) => m.owner === session_id && m.state === 'running' && alive(m.pid) && !hasWatcher(m.id)).map((m) => m.id);
    if (!ids.length) return '';
    return JSON.stringify({ decision: 'block', reason: `Helm runs with no live watcher: ${ids.join(' ')}. Start \`helm wait ${ids.join(' ')} --stall 10\` as a background command, then end your turn.` });
  } catch { return ''; }
}

export async function wait(ids: string[], stallMin: number): Promise<string> {
  const watched = ids.length ? ids : listRuns().filter((m) => m.state === 'running').map((m) => m.id);
  if (!watched.length) return 'nothing running';
  // One marker per watcher, read by guard(). Not in meta.json, which a connector may be writing.
  for (const id of watched) { mkdirSync(waiters(id), { recursive: true }); writeFileSync(join(waiters(id), String(process.pid)), ''); }
  const since = Date.now();
  try {
    for (;;) {
      const events = check(watched, stallMin, since);
      if (events.length) {
        const text = events.join('\n');
        if (process.env.HELM_NOTIFY) {
          try { execSync(process.env.HELM_NOTIFY, { env: { ...process.env, HELM_EVENT: text }, stdio: 'ignore' }); } catch { /* best effort */ }
        }
        return text;
      }
      await new Promise((r) => setTimeout(r, 5_000));
    }
  } finally {
    for (const id of watched) rmSync(join(waiters(id), String(process.pid)), { force: true });
  }
}
