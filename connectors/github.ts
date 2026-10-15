// GitHub through `gh`, printed as a few compact lines instead of raw JSON.
// helm gh pr|checks|fail|comments|issue <n> [-R owner/repo]
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';

const gh = (args: string[], cwd?: string) => execFileSync('gh', args, { cwd, encoding: 'utf8', maxBuffer: 32 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
const ghJson = (args: string[], cwd?: string) => JSON.parse(gh(args, cwd));
const trim = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s).trim();

type Check = { name: string; state: 'pass' | 'fail' | 'pending'; url?: string };

function checks(rollup: any[]): Check[] {
  return (rollup ?? []).map((c) => {
    const raw = String(c.conclusion || c.state || c.status || '').toUpperCase();
    const state = ['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(raw) ? 'pass'
      : ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'].includes(raw) ? 'fail' : 'pending';
    return { name: c.name ?? c.context ?? '?', state, url: c.detailsUrl ?? c.targetUrl };
  });
}

const PR_FIELDS = 'number,title,state,isDraft,mergeable,reviewDecision,headRefName,baseRefName,headRefOid,statusCheckRollup,url';

export function pr(n: string, repo: string[]): string {
  const p = ghJson(['pr', 'view', n, ...repo, '--json', PR_FIELDS]);
  const cs = checks(p.statusCheckRollup);
  const count = (s: Check['state']) => cs.filter((c) => c.state === s).length;
  const failing = cs.filter((c) => c.state === 'fail').map((c) => c.name);
  return [
    `#${p.number} ${p.state.toLowerCase()}${p.isDraft ? ' draft' : ''} · ${String(p.mergeable).toLowerCase()} · ` +
      `checks ${count('pass')}✓ ${count('fail')}✗ ${count('pending')}… · review ${String(p.reviewDecision || 'none').toLowerCase()}`,
    `${p.headRefName} → ${p.baseRefName} @ ${p.headRefOid.slice(0, 7)} · ${p.title}`,
    ...(failing.length ? [`failing: ${failing.join(', ')}`] : []),
  ].join('\n');
}

export function prChecks(n: string, repo: string[]): string {
  const cs = checks(ghJson(['pr', 'view', n, ...repo, '--json', 'statusCheckRollup']).statusCheckRollup);
  const open = cs.filter((c) => c.state !== 'pass');
  return open.length ? open.map((c) => `${c.state} ${c.name}`).join('\n') : `all ${cs.length} checks pass`;
}

/** Tail of the first failing Actions job's log. */
export function fail(n: string, repo: string[], lines = 60): string {
  const failing = checks(ghJson(['pr', 'view', n, ...repo, '--json', 'statusCheckRollup']).statusCheckRollup).filter((c) => c.state === 'fail');
  if (!failing.length) return 'no failing checks';
  const out: string[] = [];
  for (const c of failing) {
    const job = c.url?.match(/\/actions\/runs\/\d+\/job\/(\d+)/)?.[1];
    if (!job) { out.push(`${c.name}: not an Actions job (${c.url ?? 'no url'})`); continue; }
    const text = gh(['run', 'view', '--job', job, ...repo, '--log-failed']);
    // Drop the "job\tstep\ttimestamp" prefix gh puts on each line.
    const body = text.split('\n').map((l) => l.split('\t').at(-1)!.replace(/^\S+Z /, '')).filter(Boolean);
    out.push(`== ${c.name} (job ${job})`, ...body.slice(-lines));
    break;
  }
  return out.join('\n');
}

/** Unresolved review threads plus change-request review bodies. */
export function comments(n: string, repo: string[]): string {
  const [owner, name] = (repo[1] ?? gh(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']).trim()).split('/');
  const q = `query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){
    reviews(last:20){nodes{state author{login} body}}
    reviewThreads(first:100){nodes{isResolved path line comments(first:10){nodes{author{login} body}}}}}}}`;
  const data = ghJson(['api', 'graphql', '-f', `query=${q}`, '-f', `o=${owner}`, '-f', `r=${name}`, '-F', `n=${n}`]);
  const p = data.data.repository.pullRequest;
  const out: string[] = [];
  for (const r of p.reviews.nodes) {
    if (r.state === 'CHANGES_REQUESTED' && r.body.trim()) out.push(`[changes requested] ${r.author?.login}: ${trim(r.body, 600)}`);
  }
  for (const t of p.reviewThreads.nodes.filter((t: any) => !t.isResolved)) {
    out.push(`${t.path}:${t.line ?? '?'}`);
    for (const c of t.comments.nodes) out.push(`  ${c.author?.login}: ${trim(c.body.replace(/\s+/g, ' '), 400)}`);
  }
  return out.length ? out.join('\n') : 'no unresolved review comments';
}

export function issue(n: string, repo: string[]): string {
  const i = ghJson(['issue', 'view', n, ...repo, '--json', 'number,title,state,body,comments']);
  return [
    `#${i.number} [${i.state.toLowerCase()}] ${i.title}`,
    trim(i.body ?? '', 4000),
    ...i.comments.slice(-3).map((c: any) => `--- ${c.author?.login}: ${trim(c.body, 1000)}`),
  ].join('\n');
}

/** Push a branch and open a PR; if the branch already has an open PR, just push. Returns the PR URL. */
export function openPr(cwd: string, branch: string, base: string, title: string, body: string, draft: boolean): string {
  execFileSync('git', ['push', '-u', 'origin', branch], { cwd, stdio: 'ignore' });
  try {
    const open = ghJson(['pr', 'view', branch, '--json', 'url,state'], cwd);
    if (open.state === 'OPEN') return `pushed · ${open.url}`;
  } catch { /* no PR yet */ }
  return gh(['pr', 'create', '--head', branch, '--base', base, '--title', title, '--body', body, ...(draft ? ['--draft'] : [])], cwd).trim();
}

export function prHead(n: string, cwd: string): { branch: string; base: string } {
  const p = ghJson(['pr', 'view', n, '--json', 'headRefName,baseRefName'], cwd);
  return { branch: p.headRefName, base: p.baseRefName };
}

export const defaultBranch = (cwd: string): string => ghJson(['repo', 'view', '--json', 'defaultBranchRef'], cwd).defaultBranchRef.name;
export function fleetPrState(cwd: string, branch: string): any {
  try { return ghJson(['pr', 'view', branch, '--json', PR_FIELDS], cwd); }
  catch (err) { if (/no pull requests? found/i.test(String(err.stderr))) return undefined; throw err; }
}

/** One landing pass; pending checks yield to the fleet loop. Never override branch protection. */
export async function landFleetPr(cwd: string, branch: string, base: string, head: string, bodyFile: string, signal: AbortSignal): Promise<boolean> {
  const call = async (...args: string[]) => (await promisify(execFile)('gh', args, { cwd, signal, encoding: 'utf8' })).stdout;
  const p = JSON.parse(await call('pr', 'view', branch, '--json', PR_FIELDS));
  if (p.baseRefName !== base || p.headRefOid !== head) throw new Error('PR base/head differs from gated branch');
  if (p.state === 'MERGED') return true;
  if (p.state !== 'OPEN') throw new Error(`PR is ${p.state}`);
  await call('pr', 'edit', branch, '--body-file', bodyFile);
  const cs = checks(p.statusCheckRollup);
  if (cs.some((c) => c.state === 'pending')) return false;
  if (!cs.length) {
    const runs = JSON.parse(await call('run', 'list', '--commit', head, '--json', 'status,conclusion'));
    if (runs.some((r: any) => r.status !== 'completed')) return false;
    if (runs.some((r: any) => !['success', 'neutral', 'skipped'].includes(r.conclusion))) throw new Error('Actions failed without check details; inspect the workflow run');
  }
  const failed = cs.some((c) => c.state === 'fail');
  if (failed) {
    const repo = JSON.parse(await call('repo', 'view', '--json', 'nameWithOwner')).nameWithOwner;
    const runs = JSON.parse(await call('api', `repos/${repo}/commits/${head}/check-runs`)).check_runs;
    for (const c of p.statusCheckRollup.filter((c: any) => checks([c])[0].state === 'fail')) {
      const run = runs.find((r: any) => r.html_url === c.detailsUrl && r.name === c.name);
      const annotations = run ? await call('api', `repos/${repo}/check-runs/${run.id}/annotations`) : '';
      if (!/billing|spending limit|payment|actions (?:is|are|has been) disabled/i.test(annotations)) throw new Error(`CI failed: ${c.name ?? c.context}`);
    }
  }
  if (!cs.length || failed) await call('pr', 'comment', branch, '--body', `${failed ? 'GitHub Actions cannot run' : 'GitHub Actions reports no checks'} for this head. The passing local gate and its output in the PR body are the evidence.`);
  // Avoid --delete-branch: gh cannot delete a local branch checked out in a worker worktree.
  await call('pr', 'merge', branch, '--squash', '--match-head-commit', head);
  return JSON.parse(await call('pr', 'view', branch, '--json', 'state')).state === 'MERGED';
}

export const commands: Record<string, (n: string, repo: string[]) => string> = { pr, checks: prChecks, fail, comments, issue };
