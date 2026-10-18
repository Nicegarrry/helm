// Foreground fleet: the existing run/pr/clean lifecycle, with a recoverable file per batch.
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { closeSync, existsSync, globSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, statfsSync, statSync, writeFileSync } from 'node:fs';
import { freemem } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
import { defaultBranch, fleetPrState, landFleetPr } from './connectors/github.ts';
import { ROOT, RUNS, WORK, alive, readMeta, requireWork, runDir } from './lib.ts';
import { check } from './watcher.ts';

type Item = { id: string; brief: string; status: 'queued' | 'running' | 'gate' | 'landed' | 'needs-review';
  attempts: number; retryAt?: number; passed?: string; event?: string };
type Fleet = { id: string; repo: string; model: string; base: string; max: number; gate: string; land: string;
  retry: number; items: Item[]; pid?: number; waiting?: string };
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const helm = (...args: string[]) => execFileSync(process.execPath, [join(ROOT, 'cli.ts'), ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const sleep = () => new Promise((r) => setTimeout(r, 500));
const file = (f: Fleet) => join(runDir(f.id), 'fleet.json');
const save = (f: Fleet) => { writeFileSync(`${file(f)}.tmp`, JSON.stringify(f, null, 2)); renameSync(`${file(f)}.tmp`, file(f)); };
const latest = (): Fleet | undefined => existsSync(RUNS) ? readdirSync(RUNS).filter((id) => existsSync(join(runDir(id), 'fleet.json')))
  .sort().map((id) => JSON.parse(readFileSync(join(runDir(id), 'fleet.json'), 'utf8'))).at(-1) : undefined;

function capacity(): boolean {
  const disk = statfsSync(WORK);
  return freemem() / 2 ** 20 >= Number(process.env.HELM_FLEET_MIN_MEMORY_MB ?? 1024)
    && disk.bavail * disk.bsize / 2 ** 20 >= Number(process.env.HELM_FLEET_MIN_DISK_MB ?? 2048);
}

function gate(command: string, cwd: string, output: string, signal: AbortSignal): Promise<number> {
  return new Promise((resolve, reject) => {
    const fd = openSync(output, 'w');
    const child = spawn('sh', ['-c', command], { cwd, detached: true, stdio: ['ignore', fd, fd] });
    closeSync(fd);
    const stop = () => { try { process.kill(-child.pid!, 'SIGTERM'); } catch { /* already exited */ } };
    signal.addEventListener('abort', stop, { once: true });
    child.once('error', reject);
    child.once('close', (code) => { signal.removeEventListener('abort', stop); resolve(code ?? 1); });
  });
}

async function advance(f: Fleet, b: Item, signal: AbortSignal): Promise<void> {
  const meta = readMeta(b.id);
  if (!b.passed) {
    git(meta.worktree, 'fetch', 'origin', f.base);
    git(meta.worktree, 'merge', '--no-edit', `origin/${f.base}`);
    if (git(meta.worktree, 'status', '--porcelain')) {
      git(meta.worktree, 'add', '-A'); git(meta.worktree, 'commit', '-m', meta.summary || `helm: ${b.id}`);
    }
    const head = git(meta.worktree, 'rev-parse', 'HEAD');
    b.attempts++; save(f);
    const code = await gate(f.gate, meta.worktree, join(runDir(f.id), `${b.id}-gate-${b.attempts}.log`), signal);
    if (signal.aborted) return;
    if (code) {
      if (b.attempts >= 2) throw new Error(`gate failed twice (exit ${code}); worktree kept`);
      b.retryAt = Date.now() + f.retry * 1000;
    } else { b.passed = head; b.retryAt = undefined; }
    save(f); return;
  }
  const pr = f.land === 'pr' ? fleetPrState(f.repo, meta.branch) : undefined;
  if (pr?.state === 'MERGED' && (pr.baseRefName !== f.base || pr.headRefOid !== b.passed)) throw new Error('merged PR base/head differs from gated branch');
  if (f.land === 'pr' && pr?.state !== 'MERGED') {
    if (git(meta.worktree, 'rev-parse', 'HEAD') !== b.passed || git(meta.worktree, 'status', '--porcelain')) throw new Error('worktree changed after gate; resume to recheck');
    const body = join(runDir(f.id), `${b.id}-pr.md`);
    const evidence = Array.from({ length: b.attempts }, (_, i) => `### Gate attempt ${i + 1}\n\n\`\`\`text\n${readFileSync(join(runDir(f.id), `${b.id}-gate-${i + 1}.log`), 'utf8')}\n\`\`\``).join('\n\n');
    writeFileSync(body, `${meta.summary ?? b.id}\n\nLocal gate: \`${f.gate}\` at \`${b.passed}\`.\n\n${evidence}`);
    helm('pr', b.id, '--base', f.base, '--body-file', body);
    if (!await landFleetPr(f.repo, meta.branch, f.base, b.passed, body, signal)) { b.retryAt = Date.now() + 5000; save(f); return; }
  }
  if (signal.aborted) return;
  b.status = 'landed'; save(f);
  if (f.land === 'pr') helm('clean', b.id);
}

export async function fleet(args: string[], flags: Record<string, string>): Promise<string> {
  let f = latest();
  if (args[0] === 'status') {
    if (!f) return flags.json ? JSON.stringify({ items: [], totals: {} }) : 'no fleet';
    const totals = Object.fromEntries(['queued', 'running', 'gate', 'landed', 'needs-review'].map((s) => [s, f!.items.filter((b) => b.status === s).length]));
    return flags.json ? JSON.stringify({ ...f, totals }) : [...f.items.map((b) => `${b.id} ${b.status}`),
      `total ${f.items.length} · ${Object.entries(totals).map(([s, n]) => `${n} ${s}`).join(' · ')}${f.waiting ? ` · ${f.waiting}` : ''}`].join('\n');
  }
  requireWork();
  if (f?.pid && alive(f.pid)) throw new Error(`fleet ${f.id} is already running`);
  if (args[0] === 'resume') {
    if (!f) throw new Error('no fleet to resume');
    for (const b of f.items) {
      if (b.status === 'needs-review') { b.status = existsSync(join(runDir(b.id), 'meta.json')) ? 'running' : 'queued'; b.passed = undefined; b.attempts = 0; b.event = undefined; }
    }
  } else {
    if (!args.length || !flags.model || !flags.repo) throw new Error('usage: helm fleet <dir|glob> --model <m> --repo <path> [--max 4] [--gate "<cmd>"] [--land pr|none] [--retry-gate 90]');
    if (f?.items.some((b) => b.status !== 'landed')) throw new Error(`fleet ${f.id} is unfinished; use helm fleet resume`);
    const paths = [...new Set(args.flatMap((p) => existsSync(p) && statSync(p).isDirectory() ? globSync(join(p, '*.md')) : globSync(p)))].sort();
    const ids = paths.map((p) => basename(p, extname(p)));
    if (!paths.length || new Set(ids).size !== ids.length || ids.some((id) => !/^[\w][\w.-]*$/.test(id) || existsSync(runDir(id)))) throw new Error('briefs must have unique, unused file stems (letters, digits, _, ., -)');
    const max = Number(flags.max ?? 4), retry = Number(flags['retry-gate'] ?? 90), land = flags.land ?? 'pr';
    if (!Number.isInteger(max) || max < 1 || !Number.isFinite(retry) || retry < 0 || !['pr', 'none'].includes(land)) throw new Error('invalid --max, --retry-gate or --land');
    const repo = git(resolve(flags.repo), 'rev-parse', '--show-toplevel');
    const base = land === 'pr' ? defaultBranch(repo) : git(repo, 'ls-remote', '--symref', 'origin', 'HEAD').match(/ref: refs\/heads\/(\S+)/)?.[1];
    if (!base) throw new Error('cannot determine origin default branch');
    f = { id: `fleet-${Date.now()}-${randomBytes(2).toString('hex')}`, repo, base, model: flags.model, max, retry, land, gate: flags.gate ?? 'true', items: [] };
    mkdirSync(runDir(f.id), { recursive: true });
    f.items = paths.map((p, i) => {
      const brief = join(runDir(f!.id), `${ids[i]}.md`);
      writeFileSync(brief, `${readFileSync(p, 'utf8')}\n\nAutonomy: decide skips and out-of-scope calls yourself; escalate only when judgement is needed.\n`);
      return { id: ids[i], brief, status: 'queued', attempts: 0 };
    });
  }
  f.pid = process.pid; save(f);
  const controller = new AbortController();
  let task: Promise<void> | undefined;
  try {
    for (;;) {
      // Dispatch may have finished just before a killed controller saved its state.
      for (const b of f.items) if (b.status === 'queued' && existsSync(join(runDir(b.id), 'meta.json'))) { b.status = 'running'; save(f); }
      for (const b of f.items.filter((b) => b.status === 'running')) {
        const event = check([b.id], 10, 0)[0];
        if (!event) continue;
        if (readMeta(b.id).state === 'done') b.status = 'gate';
        else { b.status = 'needs-review'; b.event = event.replace(/\s+/g, ' '); }
        save(f);
      }
      const review = f.items.find((b) => b.status === 'needs-review');
      if (review) { process.exitCode = 1; return review.event!; }
      if (f.items.every((b) => b.status === 'landed')) {
        if (f.land === 'pr') for (const b of f.items) if (existsSync(join(runDir(b.id), 'meta.json'))) helm('clean', b.id);
        return `${f.id} done · ${f.model} · ${f.items.length} landed`;
      }
      const next = f.items.find((b) => b.status === 'gate' && b.passed) ?? f.items.find((b) => b.status === 'gate' && (b.retryAt ?? 0) <= Date.now());
      if (!task && next && (next.retryAt ?? 0) <= Date.now()) {
        task = advance(f, next, controller.signal).catch((err) => {
          if (!controller.signal.aborted) { next.status = 'needs-review'; next.event = `${next.id} failed · ${f!.model} · ${String(err.message).replace(/\s+/g, ' ').slice(0, 300)}`; save(f!); }
        }).finally(() => { task = undefined; });
      }
      await Promise.resolve();
      if (f.items.some((b) => b.status === 'needs-review')) continue;
      const queued = f.items.find((b) => b.status === 'queued');
      if (queued && f.items.filter((b) => b.status === 'running').length < f.max) {
        f.waiting = capacity() ? undefined : 'waiting for memory/disk capacity'; save(f);
        if (!f.waiting) {
          try { helm('run', f.model, '--brief', queued.brief, '--repo', f.repo, '--base', f.base, '--id', queued.id); queued.status = 'running'; }
          catch (err) { queued.status = 'needs-review'; queued.event = `${queued.id} failed · ${f.model} · ${String(err.message).replace(/\s+/g, ' ').slice(0, 300)}`; }
          save(f);
        }
      }
      await sleep();
    }
  } finally { controller.abort(); await task; f.pid = undefined; save(f); }
}
