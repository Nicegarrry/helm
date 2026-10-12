// Pi lane, our custom Pi agent: Pi's coding tools + the repo's AGENTS.md + agents/worker.md appended,
// full access, one resumable session per run. Model is `<provider>/<model>[:<thinking>]`, e.g.
// opencode-go/kimi-k2.6 (OpenCode Go subscription) or openrouter/moonshotai/kimi-k2.6 (pay per token).
// Usage: node connectors/pi.ts <id> <promptFile>  |  node connectors/pi.ts --models [provider]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createAgentSession, DefaultResourceLoader, getAgentDir, ModelRuntime, SessionManager, SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { agentPrompt, finish, loadEnv, log, readMeta, runDir, writeMeta } from '../lib.ts';

loadEnv(); // OPENCODE_API_KEY, OPENROUTER_API_KEY, ... from $HELM_HOME/.env; Pi's auth.json also works
const argv = process.argv.slice(2);
const runtime = await ModelRuntime.create({ allowModelNetwork: false, refreshOnCreate: false });

if (argv[0] === '--models') {
  // Default: models you have credentials for. --all: the whole catalog (optionally one provider).
  const provider = argv.slice(1).find((a) => a !== '--all');
  const models = argv.includes('--all') ? runtime.getModels(provider) : await runtime.getAvailable(provider);
  console.log(models.length ? models.map((m) => `${m.provider}/${m.id}`).join('\n') : 'pi: no models with credentials (see helm env)');
  process.exit(0);
}

const [id, promptFile] = argv;
const meta = readMeta(id);
const THINKING = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'];
const [, provider, rest] = meta.model.match(/^([^/]+)\/(.+)$/) ?? [];
const [modelId, thinking] = THINKING.includes(rest?.split(':').at(-1) ?? '') ? [rest.slice(0, rest.lastIndexOf(':')), rest.split(':').at(-1)] : [rest];
const model = provider && runtime.getModel(provider, modelId);

try {
  if (!model) throw new Error(`pi: unknown model ${meta.model} (helm models lists what is available)`);
  const agentDir = getAgentDir();
  const settingsManager = SettingsManager.inMemory({});
  // The worker sees the repo's own context files but none of the operator's personal Pi extensions or skills.
  const resourceLoader = new DefaultResourceLoader({
    cwd: meta.worktree, agentDir, settingsManager,
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true,
    appendSystemPrompt: [agentPrompt(meta.role)],
  });
  await resourceLoader.reload();
  const sessionDir = join(runDir(id), 'pi');
  const sessionManager = meta.session ? SessionManager.open(meta.session, sessionDir, meta.worktree) : SessionManager.create(meta.worktree, sessionDir);
  const { session } = await createAgentSession({
    cwd: meta.worktree, agentDir, model, modelRuntime: runtime, settingsManager, sessionManager, resourceLoader,
    tools: ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls'], ...(thinking ? { thinkingLevel: thinking as any } : {}),
  });
  writeMeta(id, { session: session.sessionFile });
  process.on('SIGTERM', () => { session.abort?.(); process.exit(0); });

  session.subscribe((e: any) => {
    if (e.type === 'tool_execution_start') {
      const a = e.args ?? {};
      log(id, `${e.toolName}: ${a.command ?? a.path ?? a.pattern ?? JSON.stringify(a)}`);
    } else if (e.type === 'tool_execution_end' && e.isError) log(id, `  ✗ ${e.toolName} failed`);
    else if (e.type === 'message_end' && e.message?.role === 'assistant') {
      const text = (e.message.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join(' ');
      if (text.trim()) log(id, `say: ${text}`);
    } else if (e.type === 'compaction_start') log(id, `compacting context (${e.reason})`);
  });

  await session.prompt(readFileSync(promptFile, 'utf8'));
  const text = session.getLastAssistantText() ?? '';
  session.dispose();
  finish(id, text);
} catch (err) {
  finish(id, '', (err as Error).message);
}
process.exit(0);
