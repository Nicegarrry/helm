// `helm wait`: block until a watched run ends, asks a question, dies or stalls, print one line, exit.
// The orchestrator runs it as a background command, so the exit is what wakes it. HELM_NOTIFY, if set,
// is a shell command that also gets the line (as $HELM_EVENT), e.g. a Discord webhook or a push.
import { execSync } from 'node:child_process';
import { alive, lastLogAt, listRuns, readMeta, writeMeta, type Meta } from './lib.ts';

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

export async function wait(ids: string[], stallMin: number): Promise<string> {
  const watched = ids.length ? ids : listRuns().filter((m) => m.state === 'running').map((m) => m.id);
  if (!watched.length) return 'nothing running';
  const since = Date.now();
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
}
