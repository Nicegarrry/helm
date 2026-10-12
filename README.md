# Helm

How Nick gets code built. An orchestrator agent (Claude Code) scopes, plans, reviews and ships;
cheap workers write the code in their own git worktrees: Pi on OpenCode Go or OpenRouter models,
or the Codex CLI on the ChatGPT subscription.

Markdown is the code. The process lives in `skills/`, the worker prompts in `agents/`. The
TypeScript only does what markdown can't: start workers, watch them, and talk to GitHub. No daemon,
no database, no MCP server, no gates, no spend control, no sandbox. Workers run with full access.

```
skills/            the process: helm (the loop and taste) + one skill per stage + helm-models
agents/            worker.md, reviewer.md: system prompts every worker gets, on either lane
connectors/        every external interface
  pi.ts            our Pi agent: Pi's coding tools + agents/*.md, resumable session per run
  codex.ts         one `codex exec --json` turn, resumable thread per run
  github.ts        `gh`, printed as a few compact lines
cli.ts             the `helm` command
watcher.ts         `helm wait`: wakes the orchestrator when a run ends, asks or stalls
lib.ts             run folders: $HELM_HOME/runs/<id>/{meta.json,brief.md,log.txt,result.md}
```

The previous Helm (MCP server, daemon, SQLite, gates) is on the `helm-v4-final` branch.

## Setup

Node 22.18+ (runs the `.ts` files directly, no build), `git`, `gh` (logged in), and for the
Codex lane the Codex CLI (logged in).

```sh
npm install
bin/helm install                  # links skills/* into ~/.claude/skills (and ~/.codex/skills)
export PATH="$PWD/bin:$PATH"      # or symlink bin/helm onto your PATH
cp .env.example ~/.helm/.env      # then fill in OPENCODE_API_KEY / OPENROUTER_API_KEY
helm env && helm models
```

Skills are plain Claude Code skills (folders with `SKILL.md`), not a plugin. Edit them in this
repo; the links pick up changes immediately.

## Lanes

| Model string | Runs | Paid by |
| --- | --- | --- |
| `opencode-go/<model>[:thinking]` | Pi, in-process | OpenCode Go subscription (`OPENCODE_API_KEY`) |
| `openrouter/<vendor>/<model>[:thinking]` | Pi, in-process | OpenRouter per token (`OPENROUTER_API_KEY`) |
| any other Pi `provider/model` | Pi, in-process | that provider's key, or Pi's `~/.pi/agent/auth.json` |
| `codex/<model>[:effort]` | Codex CLI | ChatGPT subscription |

OpenCode Go is built into Pi 0.85.1 as the `opencode-go` provider, and Pi sends the
`x-opencode-session` header OpenCode asks third-party agents for, so no opencode harness is
needed. If Go stops working, use the same models through `openrouter/`. Which model for which
job: `skills/helm-models/SKILL.md`.

## Commands

```
helm run <model> --brief <file|-> [--repo path] [--base branch] [--id name]
                                  new worktree on helm/<id>, detached worker; prints the id
helm run <model> --review <branch|pr#> --brief <file>
                                  read-only reviewer on a detached worktree of that branch
helm wait [<id>...] [--stall 10]  block until a run is done/failed/question/stalled; one line out.
                                  Run it in the background: its exit is the ping. HELM_NOTIFY too.
helm steer <id> "<message>"       next turn in the same session (or --file <path>)
helm ps                           one line per run
helm result <id>                  the worker's final message
helm logs <id> [-n 40]            compact event log
helm brief <id> | helm path <id>  the brief, the worktree path
helm stop <id>                    kill a running worker
helm pr <id> [--draft]            commit leftovers, push, open the PR (re-run to push fixes)
helm gh pr|checks|fail|comments|issue <n> [-R owner/repo]
                                  compact GitHub reads: state line, failing checks, failing log
                                  tail, unresolved threads, issue + last 3 comments
helm clean [<id>...] [--all]      remove finished worktrees (and run folders for named ids / --all)
helm models [provider] [--all]    models with credentials (or the whole Pi catalog), plus Codex's
helm env                          which keys are set
helm install                      link the skills
```

## How a run works

`helm run` makes the worktree, writes `meta.json` and `brief.md`, and starts
`node connectors/<lane>.ts <id> <prompt-file>` detached. The connector appends one line per tool
call to `log.txt`, writes the final message to `result.md`, and sets `state` from the JSON
report line at the end of it (`done`, `failed`, `question`). `helm steer` starts the same
connector again, which resumes the stored Pi session file or Codex thread. `helm wait`
counts a run as stalled when `log.txt` hasn't changed for `--stall` minutes, and as failed
when its process is gone without a report.
