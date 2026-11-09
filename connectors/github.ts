// GitHub through `gh`, printed as a few compact lines instead of raw JSON.
// helm gh pr|checks|fail|comments|issue <n> [-R owner/repo]
import { execFileSync } from 'node:child_process';

const gh = (args: string[], cwd?: string) => execFileSync('gh', args, { cwd, encoding: 'utf8', maxBuffer: 32 << 20 });
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

/** The single open PR for a branch, or why there isn't one. */
export function findOpenPr(branch: string, cwd: string): any | string {
  const open = ghJson(['pr', 'list', '--head', branch, '--state', 'open', '--json', 'number'], cwd);
  if (open.length !== 1) return `${open.length} open PRs for ${branch}, need exactly 1`;
  return ghJson(['pr', 'view', String(open[0].number), '--json', PR_FIELDS], cwd);
}

export function defaultBranch(cwd: string): string {
  return ghJson(['repo', 'view', '--json', 'defaultBranchRef'], cwd).defaultBranchRef.name;
}

/** Everything that blocks landing except checks. One line per failed gate. */
export function prGates(p: any, base: string | null): string[] {
  const fails: string[] = [];
  if (p.isDraft) fails.push('PR is a draft');
  if (p.mergeable !== 'MERGEABLE') fails.push(`PR mergeable is ${p.mergeable}`);
  if (p.reviewDecision === 'CHANGES_REQUESTED') fails.push('a review requests changes');
  if (base !== null && p.baseRefName !== base) fails.push(`PR targets ${p.baseRefName}, not ${base} (--stacked to allow)`);
  const t = String(p.title ?? '').trim();
  const sha = /\b(?=[0-9a-f]*[a-f])(?=[0-9a-f]*[0-9])[0-9a-f]{7,40}\b/;
  if (!t || /^(committed|done|finished)\b/i.test(t) || sha.test(t)) fails.push(`PR title is junk: "${t}" (gh pr edit --title)`);
  return fails;
}

/** Why checks aren't green, or null when at least one exists and all pass. */
export function checksGate(p: any): string | null {
  const cs = checks(p.statusCheckRollup);
  if (!cs.length) return 'PR has no checks';
  const open = cs.filter((c) => c.state !== 'pass');
  return open.length ? `checks not green: ${open.map((c) => `${c.state} ${c.name}`).join(', ')}` : null;
}

export function commentPr(n: number, body: string, cwd: string): void {
  gh(['pr', 'comment', String(n), '--body', body], cwd);
}

/** Merge at exactly this head, then read back what GitHub says. Never `--admin`. */
export function mergePr(n: number, sha: string, method: string, cwd: string): { sha?: string; error?: string } {
  let error: string | undefined;
  try {
    execFileSync('gh', ['pr', 'merge', String(n), `--${method}`, '--match-head-commit', sha], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e: any) { error = String(e.stderr || e.message).trim().replace(/\s+/g, ' '); }
  const after = ghJson(['pr', 'view', String(n), '--json', 'state,mergeCommit,headRefOid'], cwd);
  if (after.state !== 'MERGED') return { error: error ?? `PR state is ${after.state}` };
  if (after.headRefOid !== sha) return { error: `PR merged at ${after.headRefOid.slice(0, 7)}, not the checked ${sha.slice(0, 7)}` };
  return { sha: after.mergeCommit?.oid ?? sha };
}

/** True once the branch is gone from origin. Keeps it while an open PR is based on it (deleting would close that PR) or if it moved past `sha`. */
export function deleteRemoteBranch(branch: string, sha: string, cwd: string): boolean {
  try {
    if (ghJson(['pr', 'list', '--base', branch, '--state', 'open', '--json', 'number'], cwd).length) return false;
  } catch { return false; }
  try { execFileSync('git', ['push', `--force-with-lease=refs/heads/${branch}:${sha}`, 'origin', `:refs/heads/${branch}`], { cwd, stdio: 'ignore' }); return true; } catch { /* moved, or already gone */ }
  try { return !execFileSync('git', ['ls-remote', '--heads', 'origin', branch], { cwd, encoding: 'utf8' }).trim(); } catch { return false; }
}

export const commands: Record<string, (n: string, repo: string[]) => string> = { pr, checks: prChecks, fail, comments, issue };
