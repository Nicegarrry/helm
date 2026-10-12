// Codex lane: one `codex exec --json` turn in the run's worktree, on the operator's ChatGPT login.
// Usage: node connectors/codex.ts <id> <promptFile>. Model is `codex/<model>[:<effort>]`.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { agentPrompt, finish, loadEnv, log, readMeta, runDir, writeMeta } from '../lib.ts';

loadEnv();
const [id, promptFile] = process.argv.slice(2);
const meta = readMeta(id);
const [model, effort] = meta.model.replace(/^codex\//, '').split(':');
const bin = process.env.HELM_CODEX_BIN ?? (existsSync(join(homedir(), '.local/bin/codex')) ? join(homedir(), '.local/bin/codex') : 'codex');
const lastFile = join(runDir(id), `codex-last-${meta.turns}.md`);

// Full access, no approvals: the worktree is the only boundary and it is trust-based.
const common = ['--json', '-m', model, '-o', lastFile, '--skip-git-repo-check',
  '-c', 'approval_policy="never"', '-c', 'sandbox_mode="danger-full-access"'];
if (effort) common.push('-c', `model_reasoning_effort="${effort}"`);
const args = meta.session
  ? ['exec', 'resume', meta.session, ...common, '-']
  : ['exec', ...common, '-C', meta.worktree, '-'];

// Codex has no system-prompt flag, so the first turn carries the agent prompt ahead of the brief.
const prompt = readFileSync(promptFile, 'utf8');
const input = meta.session ? prompt : `${agentPrompt(meta.role)}\n\n---\n\n${prompt}`;

let ended = false;
const end = (text: string, error?: string) => { if (!ended) { ended = true; finish(id, text, error); } };
const child = spawn(bin, args, { cwd: meta.worktree, stdio: ['pipe', 'pipe', 'pipe'] });
child.on('error', (err) => end('', `codex could not start (${bin}): ${err.message}`));
child.stdin.on('error', () => undefined);
child.stdin.end(input);
let stderr = '';
let lastText = '';
child.stderr.on('data', (c: Buffer) => { stderr = (stderr + c.toString()).slice(-2000); });

createInterface({ input: child.stdout }).on('line', (line) => {
  let ev: any;
  try { ev = JSON.parse(line); } catch { return; }
  const it = ev.item;
  if (ev.type === 'thread.started') writeMeta(id, { session: ev.thread_id });
  else if (ev.type === 'item.completed' && it?.type === 'command_execution') log(id, `bash: ${it.command} (exit ${it.exit_code ?? '?'})`);
  else if (ev.type === 'item.completed' && it?.type === 'file_change') log(id, `edit: ${(it.changes ?? []).map((c: any) => c.path).join(' ')}`);
  else if (ev.type === 'item.completed' && it?.type === 'agent_message') { lastText = it.text ?? lastText; log(id, `say: ${lastText}`); }
  else if (ev.type === 'item.completed' && it?.type === 'error') log(id, `error: ${it.message}`);
  else if (ev.type === 'turn.completed') log(id, `turn done (in ${ev.usage?.input_tokens ?? '?'} / out ${ev.usage?.output_tokens ?? '?'} tok)`);
});

child.on('close', (code) => {
  const text = existsSync(lastFile) ? readFileSync(lastFile, 'utf8') : lastText;
  end(text, code === 0 ? undefined : `codex exited ${code}: ${stderr.trim().split('\n').at(-1) ?? ''}`);
});
