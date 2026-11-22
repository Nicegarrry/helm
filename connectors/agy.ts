// agy lane: one `agy -p --output-format stream-json` turn in the run's worktree, on the operator's
// Antigravity login. Usage: node connectors/agy.ts <id> <promptFile>. Model is `agy/<model>`
// (`agy models` lists ids, e.g. agy/gemini-4-neon-high).
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { agentPrompt, finish, loadEnv, log, readMeta, writeMeta } from '../lib.ts';

loadEnv();
const [id, promptFile] = process.argv.slice(2);
const meta = readMeta(id);
const model = meta.model.replace(/^agy\//, '');
const bin = process.env.HELM_AGY_BIN ?? 'agy';

// agy has no system-prompt flag, so the first turn carries the agent prompt ahead of the brief.
const prompt = readFileSync(promptFile, 'utf8');
const input = meta.session ? prompt : `${agentPrompt(meta.role)}\n\n---\n\n${prompt}`;

// Full access, no approvals, as on the Codex lane: the worktree is the only boundary.
// The prompt is attached to -p with `=` so no flag is ever taken as the prompt.
const args = ['--dangerously-skip-permissions', '--output-format', 'stream-json', '--model', model,
  ...(meta.session ? ['--conversation', meta.session] : []), `--print=${input}`];

let ended = false;
const end = (text: string, error?: string) => { if (!ended) { ended = true; finish(id, text, error); } };
const child = spawn(bin, args, { cwd: meta.worktree, stdio: ['ignore', 'pipe', 'pipe'] });
child.on('error', (err) => end('', `agy could not start (${bin}): ${err.message}`));
let stderr = '';
let text = '';
let all = '';
let result: any;
child.stderr.on('data', (c: Buffer) => { stderr = (stderr + c.toString()).slice(-2000); });

createInterface({ input: child.stdout }).on('line', (line) => {
  let ev: any;
  try { ev = JSON.parse(line); } catch { return; }
  const s = ev.step_update;
  if (ev.event === 'init' && ev.conversation_id) writeMeta(id, { session: ev.conversation_id });
  else if (s?.step_type === 'tool' && s.state === 'DONE') log(id, `${s.tool_name}: ${JSON.stringify(s.tool_info?.parameters ?? {}).slice(0, 160)}`);
  else if (s?.step_type === 'agent_response') {
    if (s.text_delta) { text += s.text_delta; all += s.text_delta; }
    if (s.state === 'DONE' && text) { log(id, `say: ${text}`); text = ''; }
  }
  else if (ev.event === 'result') {
    result = ev.result;
    log(id, `turn done (in ${result?.usage?.input_tokens ?? '?'} / out ${result?.usage?.output_tokens ?? '?'} tok)`);
  }
});

child.on('close', (code) => {
  const final = result?.response ?? all;
  if (code !== 0) return end(final, `agy exited ${code}: ${stderr.trim().split('\n').at(-1) ?? ''}`);
  if (result && result.status !== 'SUCCESS') return end(final, `agy ${result.status}: ${String(final).slice(-200)}`);
  end(final);
});
