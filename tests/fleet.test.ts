// Real CLI + git worktrees/bare origin; only the model and GitHub service are faked. No spend.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const cli = resolve(dirname(fileURLToPath(import.meta.url)), '../cli.ts');
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => any, timeout = 40_000): Promise<any> {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = fn(); if (value) return value; await delay(30); }
  throw new Error('timed out waiting for fixture state');
}

const worker = String.raw`#!/usr/bin/env node
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
(async () => {
  let prompt = ''; for await (const chunk of process.stdin) prompt += chunk;
  if (!prompt.includes('Autonomy: decide skips and out-of-scope calls yourself') && !process.env.STUB_STANDALONE) throw Error('missing autonomy clause');
  const id = path.basename(process.cwd()), root = process.env.STUB_ROOT;
  const event = (event) => fs.appendFileSync(path.join(root, 'workers'), JSON.stringify({id,event,time:Date.now()})+'\n');
  event('start'); await new Promise(r => setTimeout(r, Number(prompt.match(/Delay: (\d+)/)?.[1] ?? 1800)));
  const status = prompt.match(/Status: (\w+)/)?.[1] ?? 'done';
  if (status === 'dead') { process.kill(process.ppid, 'SIGKILL'); return; }
  if (status === 'done') {
    fs.writeFileSync(id+'.txt', id+'\n');
    cp.execFileSync('git', ['add', id+'.txt']); cp.execFileSync('git', ['commit', '-m', 'test: '+id]);
  }
  const text = JSON.stringify({status,summary:'fixture '+id,...(status==='question'?{question:'fixture decision?\nsecond line'}:{})});
  fs.writeFileSync(process.argv[process.argv.indexOf('-o')+1], text); event('end');
  console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text}}));
})();
`;

const github = String.raw`#!/usr/bin/env node
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const root = process.env.STUB_ROOT, args = process.argv.slice(2), branch = args[2];
const get = f => args[args.indexOf(f)+1], out = x => console.log(typeof x==='string'?x:JSON.stringify(x));
const git = (cwd,...a) => cp.execFileSync('git', a, {cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const store = path.join(root,'prs',encodeURIComponent(branch || '?')+'.json');
const save = p => fs.writeFileSync(store,JSON.stringify(p));
const fail = text => { console.error(text); process.exit(1); };
const checks = () => {
  const state = fs.existsSync(path.join(root,'ci')) ? fs.readFileSync(path.join(root,'ci'),'utf8').trim() : (process.env.STUB_CI ?? 'success');
  return state==='none' ? [] : [{name:'test',status:state==='pending'?'IN_PROGRESS':'COMPLETED',conclusion:{success:'SUCCESS',fail:'FAILURE',blocked:'STARTUP_FAILURE'}[state]??'',detailsUrl:'https://example.test/actions/runs/1/job/2'}];
};
if (args[0]==='repo') out(args.includes('defaultBranchRef')?{defaultBranchRef:{name:'main'}}:{nameWithOwner:'fixture/repo'});
else if (args[0]==='run') out([]);
else if (args[0]==='api') out(args[1].endsWith('annotations')?[{message:process.env.STUB_CI==='fail'?'Test assertion failed':'The job was not started because account billing spending limit was reached.'}]:{check_runs:[{id:2,name:'test',html_url:'https://example.test/actions/runs/1/job/2'}]});
else if (args[0]==='pr') {
  if (args[1]==='create') {
    const head = get('--head'), file = path.join(root,'prs',encodeURIComponent(head)+'.json');
    const p = {number:fs.readdirSync(path.join(root,'prs')).length+1,state:'OPEN',baseRefName:get('--base'),headRefName:head,headRefOid:git(process.cwd(),'rev-parse',head),url:'https://example.test/pr/'+head,statusCheckRollup:checks(),body:get('--body'),comments:[]};
    assertBase(p); fs.writeFileSync(file,JSON.stringify(p)); out(p.url);
  } else {
    if (!fs.existsSync(store)) fail('no pull requests found for branch '+branch);
    const p = JSON.parse(fs.readFileSync(store));
    if (args[1]==='view') { p.statusCheckRollup=checks(); out(p); }
    else if (args[1]==='edit') { p.body=fs.readFileSync(get('--body-file'),'utf8'); save(p); }
    else if (args[1]==='comment') { p.comments.push(get('--body')); save(p); }
    else if (args[1]==='merge') {
      assertBase(p); if(p.state==='MERGED') fail('merged twice');
      if(get('--match-head-commit')!==p.headRefOid) fail('wrong head');
      if(args.includes('--delete-branch')) fail('cannot delete a local branch checked out in a worker worktree');
      if(process.env.STUB_QUEUE && !fs.existsSync(path.join(root,'release-queue'))) { fs.writeFileSync(path.join(root,'queued'),'yes'); out('queued for merge'); process.exit(0); }
      const landing = fs.mkdtempSync(path.join(root,'land-'));
      git(root,'clone',path.join(root,'origin.git'),landing); git(landing,'config','user.name','Fixture'); git(landing,'config','user.email','fixture@example.test');
      git(landing,'merge','--squash','origin/'+branch); git(landing,'commit','-m','land '+branch); git(landing,'push','origin','main');
      p.state='MERGED'; save(p); fs.appendFileSync(path.join(root,'merges'),branch+'\n');
      if(process.env.STUB_CRASH_AFTER_MERGE && !fs.existsSync(path.join(root,'crashed'))) { fs.writeFileSync(path.join(root,'crashed'),'yes'); process.kill(process.ppid,'SIGKILL'); }
    } else fail('unexpected gh '+args.join(' '));
  }
} else fail('unexpected gh '+args.join(' '));
function assertBase(p) { if(p.baseRefName!=='main') fail('wrong PR base: '+p.baseRefName); }
`;

function fixture(count = 1, env: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'helm-fleet-')), repo = join(root, 'repo'), work = join(root, 'work'), briefs = join(root, 'briefs');
  for (const dir of [repo, work, briefs, join(root, 'bin'), join(root, 'prs')]) mkdirSync(dir);
  git(root, 'init', '--bare', '--initial-branch=main', 'origin.git'); git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.name', 'Fixture'); git(repo, 'config', 'user.email', 'fixture@example.test');
  writeFileSync(join(repo, 'README.md'), 'fixture\n'); git(repo, 'add', '.'); git(repo, 'commit', '-m', 'initial');
  git(repo, 'remote', 'add', 'origin', join(root, 'origin.git')); git(repo, 'push', '-u', 'origin', 'main'); git(repo, 'remote', 'set-head', 'origin', 'main');
  for (let i = 1; i <= count; i++) writeFileSync(join(briefs, `sample${String(i).padStart(2, '0')}.md`), `# Sample ${i}\n`);
  for (const [name, content] of [['codex', worker], ['gh', github]]) { writeFileSync(join(root, 'bin', name), content); chmodSync(join(root, 'bin', name), 0o755); }
  const settings = { ...process.env, HELM_HOME: join(root, 'home'), HELM_WORK: work, HELM_CODEX_BIN: join(root, 'bin', 'codex'),
    PATH: `${join(root, 'bin')}:${process.env.PATH}`, HELM_FLEET_MIN_MEMORY_MB: '0', HELM_FLEET_MIN_DISK_MB: '0', STUB_ROOT: root, ...env };
  const run = (...args: string[]) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: repo, env: settings });
    let stdout = '', stderr = ''; child.stdout.on('data', c => stdout += c); child.stderr.on('data', c => stderr += c);
    const result = new Promise<{code: number | null; signal: string | null; stdout: string; stderr: string}>(r => child.on('close', (code, signal) => r({code,signal,stdout,stderr})));
    return { child, result };
  };
  const state = () => {
    const runs = join(work, 'runs'); if (!existsSync(runs)) return undefined;
    const id = readdirSync(runs).find(id => id.startsWith('fleet-')); if (!id || !existsSync(join(runs,id,'fleet.json'))) return undefined;
    return JSON.parse(readFileSync(join(runs,id,'fleet.json'),'utf8'));
  };
  const start = (...args: string[]) => run('fleet', briefs, '--model', 'codex/stub', '--repo', repo, '--max', '3', '--gate', 'printf "| check | result |\\n| fixture | PASS |\\nPASS\\n"', ...args);
  const workers = () => existsSync(join(root, 'workers')) ? readFileSync(join(root, 'workers'), 'utf8').trim().split('\n').map(l => JSON.parse(l)) : [];
  const cleanup = () => {
    if (existsSync(join(work, 'runs'))) for (const id of readdirSync(join(work,'runs'))) {
      const path = join(work, 'runs', id, 'meta.json'); if (!existsSync(path)) continue;
      const meta = JSON.parse(readFileSync(path,'utf8')); if (meta.pid) try { process.kill(-meta.pid, 'SIGTERM'); } catch { /* exited */ }
    }
    rmSync(root, { recursive: true, force: true });
  };
  return { root, repo, work, briefs, settings, run, start, state, workers, cleanup };
}

test('fleet acceptance (no model or GitHub spend)', async t => {
  await t.test('10 briefs, max 3, serial squash lands and gate evidence', async t => {
    const f = fixture(10); t.after(f.cleanup);
    // A local wip checkout must never become the PR base.
    git(f.repo, 'checkout', '-b', 'wip/orchestrator');
    const result = await f.start().result; assert.equal(result.code, 0, result.stderr); assert.match(result.stdout, /10 landed/);
    const events = f.workers(); let running = 0, peak = 0;
    for (const e of events) { running += e.event === 'start' ? 1 : -1; peak = Math.max(peak, running); }
    assert.equal(peak, 3); assert.equal(events.filter(e => e.event === 'start').length, 10);
    assert.equal(f.state().items.filter(b => b.status === 'landed').length, 10);
    assert.equal(git(join(f.root, 'origin.git'), 'ls-tree', '--name-only', 'main').split('\n').filter(p => p.endsWith('.txt')).length, 10);
    for (const name of readdirSync(join(f.root,'prs'))) { const p = JSON.parse(readFileSync(join(f.root,'prs',name),'utf8')); assert.equal(p.state,'MERGED'); assert.equal(p.baseRefName,'main'); assert.match(p.body,/\| fixture \| PASS \|/); }
    assert.deepEqual(readdirSync(join(f.work,'worktrees')), []);
    const status = await f.run('fleet','status').result; const json = await f.run('fleet','status','--json').result;
    assert.equal(JSON.parse(json.stdout).totals.landed,10); t.diagnostic(`${result.stdout.trim()}\n${status.stdout.trim()}\npeak workers: ${peak}; origin/main: 10 files; worktrees: 0`);
  });
  for (const resource of ['MEMORY','DISK']) await t.test(`low ${resource.toLowerCase()} delays dispatch; resume after relief`, async t => {
    const key = `HELM_FLEET_MIN_${resource}_MB`, f = fixture(1,{[key]:'1000000000000'}); t.after(f.cleanup);
    const run = f.start(); await until(() => f.state()?.waiting); await delay(650);
    assert.equal(f.workers().length,0); assert.equal(run.child.exitCode,null); const waiting = await f.run('fleet','status').result;
    run.child.kill('SIGKILL'); await run.result; f.settings[key]='0';
    const resumed = await f.run('fleet','resume').result; assert.equal(resumed.code,0,resumed.stderr);
    t.diagnostic(`${waiting.stdout.trim()}\nrelief + resume: ${resumed.stdout.trim()}; worker starts: ${f.workers().filter(e=>e.event==='start').length}`);
  });
  await t.test('SIGKILL mid-fleet resumes without redispatching landed briefs', async t => {
    const f=fixture(5); t.after(f.cleanup); const run=f.start();
    await until(()=>f.state()?.items.some(b=>b.status==='landed')); run.child.kill('SIGKILL'); await run.result;
    const landed=f.state().items.filter(b=>b.status==='landed').map(b=>b.id); const result=await f.run('fleet','resume').result;
    assert.equal(result.code,0,result.stderr); for(const id of landed) assert.equal(f.workers().filter(e=>e.id===id&&e.event==='start').length,1);
    assert.equal(f.workers().filter(e=>e.event==='start').length,5);
    t.diagnostic(`killed after landed: ${landed.join(', ')}\nresume: ${result.stdout.trim()}; total dispatches: 5`);
  });
  await t.test('crash after remote merge is recovered without a duplicate merge', async t => {
    const f=fixture(2,{STUB_CRASH_AFTER_MERGE:'1'}); t.after(f.cleanup); const killed=await f.start().result;
    assert.equal(killed.signal,'SIGKILL'); const result=await f.run('fleet','resume').result; assert.equal(result.code,0,result.stderr);
    assert.equal(readFileSync(join(f.root,'merges'),'utf8').trim().split('\n').length,2); assert.equal(f.workers().filter(e=>e.event==='start').length,2);
    t.diagnostic(`crash after merge + resume: ${result.stdout.trim()}; dispatches/merges: 2/2`);
  });
  await t.test('flaky gate retries after delay and preserves both outputs', async t => {
    const f=fixture(); t.after(f.cleanup); const script=join(f.root,'gate.cjs');
    writeFileSync(script,`const fs=require('fs'),p=${JSON.stringify(join(f.root,'attempts'))};fs.appendFileSync(p,Date.now()+'\\n');console.log('| gate | result |');process.exit(fs.readFileSync(p,'utf8').trim().split('\\n').length===1?1:0);`);
    const result=await f.start('--gate',`node '${script}'`,'--retry-gate','0.3').result; assert.equal(result.code,0,result.stderr);
    const times=readFileSync(join(f.root,'attempts'),'utf8').trim().split('\n').map(Number); assert.equal(times.length,2); assert.ok(times[1]-times[0]>=300);
    const p=JSON.parse(readFileSync(join(f.root,'prs',readdirSync(join(f.root,'prs'))[0]),'utf8')); assert.match(p.body,/Gate attempt 1/); assert.match(p.body,/Gate attempt 2/);
    t.diagnostic(`flaky gate: attempts=2, retry gap=${times[1]-times[0]}ms; ${result.stdout.trim()}`);
  });
  await t.test('second gate failure exits in one line and keeps worktree; fixed gate resumes', async t => {
    const f=fixture(); t.after(f.cleanup); const script=join(f.root,'gate.cjs'); writeFileSync(script,'console.log("FAIL");process.exit(1)');
    const result=await f.start('--gate',`node '${script}'`,'--retry-gate','0').result;
    assert.equal(result.code,1); assert.equal(result.stdout.trim().split('\n').length,1); assert.equal(result.stderr,''); assert.match(result.stdout,/gate failed twice/);
    assert.equal(f.state().items[0].status,'needs-review'); assert.ok(existsSync(join(f.work,'worktrees','sample01')));
    writeFileSync(script,'console.log("PASS")'); const resumed=await f.run('fleet','resume').result; assert.equal(resumed.code,0,resumed.stderr);
    assert.equal(f.workers().filter(e=>e.event==='start').length,1); t.diagnostic(`${result.stdout.trim()}\nfixed gate + resume: ${resumed.stdout.trim()}`);
  });
  for(const status of ['question','failed','dead']) await t.test(`worker ${status} stops in one line`,async t=>{
    const f=fixture(); t.after(f.cleanup); writeFileSync(join(f.briefs,'sample01.md'),`# sample\nStatus: ${status}\nDelay: 50\n`);
    const result=await f.start().result; assert.equal(result.code,1); assert.equal(result.stdout.trim().split('\n').length,1); assert.equal(f.state().items[0].status,'needs-review');
    t.diagnostic(result.stdout.trim());
  });
  await t.test('a worker question interrupts an active gate',async t=>{
    const f=fixture(2); t.after(f.cleanup); writeFileSync(join(f.briefs,'sample01.md'),'# sample\nDelay: 10\n');
    writeFileSync(join(f.briefs,'sample02.md'),'# sample\nDelay: 1000\nStatus: question\n');
    const run=f.start('--gate','sleep 60');
    const result=await Promise.race([run.result,delay(6000).then(()=>{run.child.kill('SIGKILL');throw Error('gate did not stop on worker question');})]);
    assert.equal(result.code,1); assert.equal(result.stdout.trim().split('\n').length,1); assert.match(result.stdout,/sample02 question/);
    assert.equal(f.state().items[0].attempts,1); assert.equal(f.state().items[0].status,'gate'); t.diagnostic(`active 60s gate interrupted: ${result.stdout.trim()}`);
  });
  await t.test('stall detection and cleaning a dead run',async t=>{
    const f=fixture(); t.after(f.cleanup); writeFileSync(join(f.briefs,'sample01.md'),'# sample\nDelay: 60000\n'); const run=f.start();
    await until(()=>f.workers().length); const log=join(f.work,'runs','sample01','log.txt'); writeFileSync(log,'old heartbeat\n'); const old=new Date(Date.now()-11*60000); utimesSync(log,old,old);
    const result=await run.result; assert.equal(result.code,1); assert.match(result.stdout,/stalled/);
    const meta=JSON.parse(readFileSync(join(f.work,'runs','sample01','meta.json'),'utf8')); process.kill(-meta.pid,'SIGKILL'); await delay(100);
    const cleaned=await f.run('clean','sample01').result; assert.equal(cleaned.code,0,cleaned.stderr); assert.match(cleaned.stdout,/cleaned 1/);
    assert.ok(!existsSync(join(f.work,'worktrees','sample01'))); t.diagnostic(`${result.stdout.trim()}\n${cleaned.stdout.trim()}`);
  });
  for(const ci of ['none','blocked','fail']) await t.test(`Actions ${ci}: local evidence only when unavailable`,async t=>{
    const f=fixture(1,{STUB_CI:ci}); t.after(f.cleanup); const result=await f.start().result;
    assert.equal(result.code,ci==='fail'?1:0,result.stderr); const p=JSON.parse(readFileSync(join(f.root,'prs',readdirSync(join(f.root,'prs'))[0]),'utf8'));
    assert.equal(p.state,ci==='fail'?'OPEN':'MERGED'); assert.equal(p.comments.length,ci==='fail'?0:1); t.diagnostic(`Actions ${ci}: ${result.stdout.trim()}; evidence comments: ${p.comments.length}`);
  });
  await t.test('pending CI and merge queue retain worktree until confirmed merged',async t=>{
    const f=fixture(1,{STUB_CI:'pending',STUB_QUEUE:'1'}); t.after(f.cleanup); const run=f.start();
    await until(()=>readdirSync(join(f.root,'prs')).length); await delay(700); assert.equal(run.child.exitCode,null); assert.equal(f.state().items[0].status,'gate');
    writeFileSync(join(f.root,'ci'),'success'); await until(()=>existsSync(join(f.root,'queued')));
    assert.equal(f.state().items[0].status,'gate'); assert.ok(existsSync(join(f.work,'worktrees','sample01')));
    writeFileSync(join(f.root,'release-queue'),'yes'); const result=await run.result; assert.equal(result.code,0,result.stderr);
    assert.ok(!existsSync(join(f.work,'worktrees','sample01'))); t.diagnostic(`pending checks -> queued merge (worktree retained) -> confirmed merged: ${result.stdout.trim()}`);
  });
  await t.test('standalone run/wait/ps/path/result/pr retain their behavior',async t=>{
    const f=fixture(1,{STUB_STANDALONE:'1'}); t.after(f.cleanup);
    assert.equal((await f.run('run','codex/stub','--brief',join(f.briefs,'sample01.md'),'--repo',f.repo,'--id','legacy').result).code,0);
    const waited=await f.run('wait','legacy').result; assert.match(waited.stdout,/legacy done/);
    assert.match((await f.run('ps').result).stdout,/legacy\s+done/);
    assert.equal((await f.run('path','legacy').result).stdout.trim(),join(f.work,'worktrees','legacy'));
    assert.match((await f.run('result','legacy').result).stdout,/fixture legacy/);
    const pr=await f.run('pr','legacy').result; assert.equal(pr.code,0,pr.stderr);
    assert.match(JSON.parse(readFileSync(join(f.root,'prs',encodeURIComponent('helm/legacy')+'.json'),'utf8')).body,/<summary>Brief/);
    t.diagnostic(`standalone: ${waited.stdout.trim()}; ps/path/result/pr passed`);
  });
  await t.test('land none gates and retains worktree without GitHub',async t=>{
    const f=fixture(); t.after(f.cleanup); const result=await f.run('fleet',join(f.briefs,'*.md'),'--model','codex/stub','--repo',f.repo,'--land','none').result; assert.equal(result.code,0,result.stderr);
    assert.equal(readdirSync(join(f.root,'prs')).length,0); assert.ok(existsSync(join(f.work,'worktrees','sample01'))); t.diagnostic(result.stdout.trim());
  });
});
