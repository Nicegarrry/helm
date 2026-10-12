// helm: the deterministic bits the skills call. See README.md for the command list.
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { commands as ghCommands, openPr, prHead } from './connectors/github.ts';
import { HOME, ROOT, alive, listRuns, loadEnv, readMeta, runDir, writeMeta, type Meta } from './lib.ts';
import { wait } from './watcher.ts';

loadEnv();
const [cmd = 'help', ...rest] = process.argv.slice(2);
const flags: Record<string, string> = {};
const args: string[] = [];
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (a === '--draft' || a === '--all') flags[a.slice(2)] = '1';
  else if (a.startsWith('--')) flags[a.slice(2)] = rest[++i] ?? '';
  else if (a === '-R' || a === '-n') flags[a.slice(1)] = rest[++i] ?? '';
  else args.push(a);
}

const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const tryGit = (cwd: string, ...a: string[]) => { try { return git(cwd, ...a); } catch { return null; } };
const readInput = (f: string) => readFileSync(f === '-' ? 0 : f, 'utf8');
const age = (iso: string) => { const m = Math.floor((Date.now() - Date.parse(iso)) / 60_000); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60}m`; };

/** Start one worker turn as a detached process; the connector writes log.txt and result.md. */
function startTurn(id: string, promptFile: string): void {
  const meta = readMeta(id);
  const connector = join(ROOT, 'connectors', meta.model.startsWith('codex/') ? 'codex.ts' : 'pi.ts');
  const out = openSync(join(runDir(id), 'stderr.log'), 'a');
  writeMeta(id, { state: 'running', turns: meta.turns + 1, question: undefined });
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', connector, id, promptFile],
    { cwd: meta.worktree, detached: true, stdio: ['ignore', out, out] });
  child.unref();
  if (readMeta(id).state === 'running') writeMeta(id, { pid: child.pid }); // a very fast turn may already be done
}

function run(): string {
  const model = args[0];
  if (!model || !flags.brief) throw new Error('usage: helm run <model> --brief <file|-> [--repo path] [--base branch] [--id name] [--review branch|pr#]');
  const repo = git(resolve(flags.repo ?? '.'), 'rev-parse', '--show-toplevel');
  const id = flags.id ?? `${basename(repo)}-${randomBytes(2).toString('hex')}`;
  if (existsSync(runDir(id))) throw new Error(`run ${id} already exists`);
  const worktree = join(HOME, 'worktrees', id);
  const originHead = tryGit(repo, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD')?.replace(/^origin\//, '');
  let base = flags.base ?? originHead ?? 'main';
  let branch = `helm/${id}`;
  let brief = readInput(flags.brief);
  const role: Meta['role'] = flags.review ? 'review' : 'build';

  if (role === 'review') {
    if (/^\d+$/.test(flags.review)) ({ branch, base } = prHead(flags.review, repo));
    else branch = flags.review;
    git(repo, 'fetch', 'origin', branch, base);
    git(repo, 'worktree', 'add', '--detach', worktree, `origin/${branch}`);
    brief = `Branch under review: ${branch}. Base: origin/${base}. The change is \`git diff origin/${base}...HEAD\`.\n\n${brief}`;
  } else {
    tryGit(repo, 'fetch', 'origin', base);
    const start = tryGit(repo, 'rev-parse', '--verify', `origin/${base}`) ? `origin/${base}` : base;
    git(repo, 'worktree', 'add', '-b', branch, worktree, start);
  }

  mkdirSync(runDir(id), { recursive: true });
  writeFileSync(join(runDir(id), 'brief.md'), brief);
  const now = new Date().toISOString();
  writeMeta(id, { id, model, role, repo, worktree, branch, base, state: 'running', created: now, turns: 0 });
  startTurn(id, join(runDir(id), 'brief.md'));
  return `${id} started · ${model} · ${role === 'review' ? `reviewing ${branch}` : branch} · ${worktree}`;
}

function steer(): string {
  const [id, ...words] = args;
  const meta = readMeta(id);
  if (meta.state === 'running' && alive(meta.pid)) throw new Error(`${id} is still running; helm wait ${id} first`);
  const file = join(runDir(id), `steer-${meta.turns}.md`);
  writeFileSync(file, flags.file ? readInput(flags.file) : words.join(' '));
  startTurn(id, file);
  return `${id} steered`;
}

function ps(): string {
  const runs = listRuns().slice(-Number(flags.n ?? 20));
  if (!runs.length) return 'no runs';
  return runs.map((m) => {
    const state = m.state === 'running' && !alive(m.pid) ? 'dead' : m.state;
    return `${m.id.padEnd(20)} ${state.padEnd(8)} ${m.model.padEnd(28)} ${age(m.created).padStart(6)}  ${(m.question ?? m.summary ?? '').slice(0, 90)}`;
  }).join('\n');
}

function pr(): string {
  const meta = readMeta(args[0]);
  if (meta.role === 'review') throw new Error('review runs have no branch to open');
  if (git(meta.worktree, 'status', '--porcelain')) {
    git(meta.worktree, 'add', '-A');
    git(meta.worktree, 'commit', '-m', meta.summary?.slice(0, 72) || `helm: ${meta.id}`);
  }
  if (git(meta.worktree, 'rev-list', '--count', `origin/${meta.base}..HEAD`) === '0') throw new Error('no commits to open a PR with');
  const brief = readFileSync(join(runDir(meta.id), 'brief.md'), 'utf8');
  const title = flags.title ?? (meta.summary?.split(/[.\n]/)[0].slice(0, 72) || brief.split('\n')[0].replace(/^#+\s*/, '').slice(0, 72));
  const body = `${meta.summary ?? ''}\n\n<details><summary>Brief</summary>\n\n${brief}\n</details>\n\nBuilt by \`${meta.model}\` (helm run ${meta.id}).`;
  return openPr(meta.worktree, meta.branch, meta.base, title, body, !!flags.draft);
}

function stop(): string {
  const meta = readMeta(args[0]);
  if (meta.pid && alive(meta.pid)) { try { process.kill(-meta.pid, 'SIGTERM'); } catch { process.kill(meta.pid, 'SIGTERM'); } }
  writeMeta(meta.id, { state: 'stopped', pid: undefined });
  return `${meta.id} stopped`;
}

/** Remove finished runs' worktrees (branches stay); `--all` also drops their run folders. */
function clean(): string {
  const done = listRuns().filter((m) => m.state !== 'running' && (!args.length || args.includes(m.id)));
  for (const m of done) {
    tryGit(m.repo, 'worktree', 'remove', '--force', m.worktree);
    if (flags.all !== undefined || args.length) rmSync(runDir(m.id), { recursive: true, force: true });
  }
  return `cleaned ${done.length} run(s)`;
}

/** Symlink every skill into ~/.claude/skills (and ~/.codex/skills if Codex is installed). */
function install(): string {
  const targets = [join(homedir(), '.claude', 'skills')];
  if (existsSync(join(homedir(), '.codex'))) targets.push(join(homedir(), '.codex', 'skills'));
  const skills = readdirSync(join(ROOT, 'skills'));
  for (const dir of targets) {
    mkdirSync(dir, { recursive: true });
    for (const s of skills) { rmSync(join(dir, s), { force: true, recursive: false }); symlinkSync(join(ROOT, 'skills', s), join(dir, s)); }
  }
  return `linked ${skills.length} skills into ${targets.join(', ')}\nadd ${join(ROOT, 'bin')} to PATH, and put API keys in ${join(HOME, '.env')} (see .env.example)`;
}

function env(): string {
  const keys = readFileSync(join(ROOT, '.env.example'), 'utf8').match(/^#?\s*[A-Z][A-Z0-9_]+(?==)/gm) ?? [];
  return keys.map((k) => k.replace(/^#?\s*/, '')).map((k) => `${process.env[k] ? 'set  ' : 'unset'} ${k}`).join('\n');
}

async function main(): Promise<string> {
  switch (cmd) {
    case 'run': return run();
    case 'steer': return steer();
    case 'ps': return ps();
    case 'logs': return readFileSync(join(runDir(args[0]), 'log.txt'), 'utf8').trimEnd().split('\n').slice(-Number(flags.n ?? 40)).join('\n');
    case 'result': return readFileSync(join(runDir(args[0]), 'result.md'), 'utf8');
    case 'path': return readMeta(args[0]).worktree;
    case 'brief': return readFileSync(join(runDir(args[0]), 'brief.md'), 'utf8');
    case 'wait': return wait(args, Number(flags.stall ?? 10));
    case 'pr': return pr();
    case 'stop': return stop();
    case 'clean': return clean();
    case 'gh': {
      const fn = ghCommands[args[0]];
      if (!fn || !args[1]) throw new Error(`usage: helm gh ${Object.keys(ghCommands).join('|')} <n> [-R owner/repo]`);
      return fn(args[1], flags.R ? ['-R', flags.R] : []);
    }
    case 'models': {
      const out = execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', join(ROOT, 'connectors', 'pi.ts'), '--models', ...args, ...(flags.all ? ['--all'] : [])], { encoding: 'utf8' });
      let codex = '';
      try {
        const json = JSON.parse(execFileSync(process.env.HELM_CODEX_BIN ?? 'codex', ['debug', 'models'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
        codex = (json.models ?? []).map((m: any) => `codex/${typeof m === 'string' ? m : m.slug}`).join('\n');
      } catch { codex = '(codex not available)'; }
      return `${out.trim()}\n\ncodex:\n${codex.trim()}`;
    }
    case 'env': return env();
    case 'install': return install();
    default: return readFileSync(join(ROOT, 'README.md'), 'utf8').split('## Commands')[1]?.split('\n## ')[0].trim() ?? 'see README.md';
  }
}

main().then((out) => console.log(out), (err) => { console.error(`helm ${cmd}: ${err.message}`); process.exit(1); });
