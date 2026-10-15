# Helm v5

How Nick gets code built. An orchestrator agent (Claude Code) scopes, plans, reviews and ships;
cheap workers write the code in their own git worktrees: Pi on OpenCode Go or OpenRouter models,
or the Codex CLI on the ChatGPT subscription.

Markdown is the code. The process lives in `skills/`, the worker prompts in `agents/`. The
TypeScript only does what markdown can't: start workers, watch them, and talk to GitHub. No daemon,
no database, no MCP server, no spend control, no sandbox. Workers run with full access.

```
skills/            the process: helm: the whole loop in SKILL.md, plus brief.md, review.md, models.md, priorities.md
agents/            worker.md, reviewer.md: system prompts every worker gets, on either lane
connectors/        every external interface
  pi.ts            our Pi agent: Pi's coding tools + agents/*.md, resumable session per run
  codex.ts         one `codex exec --json` turn, resumable thread per run
  github.ts        `gh`, printed as a few compact lines
cli.ts             the `helm` command
watcher.ts         `helm wait`: wakes the orchestrator when a run ends, asks or stalls
fleet.ts           foreground batch of briefs: dispatch, local gate, serial PR landing, resume
lib.ts             run folders: $HELM_WORK/runs/<id>/{meta.json,brief.md,log.txt,result.md}
```

This is Helm v5 (repo `Nicegarrry/helm`, formerly `helm3`).

| Version | What it was | Where |
|---|---|---|
| v3 | Durable control plane design (spec, issues #1-#140) | closed issues in this repo; spec in the archived `helm-cli` repo |
| v4 | MCP server, daemon, SQLite, gates | git tag `archive/helm-v4-final` |
| v5 | Markdown skills plus a small CLI, no daemon | `main` |

To move a machine and this repo off v4, see [Migrating from v4](#migrating-from-v4).

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

Set `HELM_WORK` in `~/.helm/.env` to keep runs, worktrees and worker caches (TMPDIR, npm/pnpm,
XDG cache) on another drive, e.g. `HELM_WORK=/Volumes/T7/factory-scratch/helm`. `helm run`
refuses to start when it is set but missing.

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
job: `skills/helm/models.md`. Harness order, pricing and the standing rules for
agents: [`skills/helm/priorities.md`](skills/helm/priorities.md), one short file to edit.

## Commands

```
helm run <model> --brief <file|-> [--repo path] [--base branch] [--id name]
                                  new worktree on helm/<id>, detached worker; prints the id
helm run <model> --review <branch|pr#> --brief <file>
                                  read-only reviewer on a detached worktree of that branch
helm fleet <dir|glob> --model <m> --repo <path> [--max 4] [--gate "<cmd>"]
                                  [--land pr|none] [--retry-gate 90]
helm fleet status [--json] | helm fleet resume
                                  foreground batch; one line on completion or judgement needed
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

## Fleet

Use a fleet for independent, approved briefs with a shared gate. Each Markdown file in a folder
(or matched by a quoted glob) becomes one run; its file stem is its id. Stems must be unique and
unused in `HELM_WORK/runs`. Fleet snapshots the briefs and appends:
"Autonomy: decide skips and out-of-scope calls yourself; escalate only when judgement is needed."

```sh
helm fleet ./briefs --model codex/gpt-6.1 --repo ./project --max 3 --gate 'npm test'
helm fleet './briefs/batch-*.md' --model codex/gpt-6.1 --repo ./project --land none
helm fleet status
helm fleet status --json
helm fleet resume
```

The foreground loop saves `$HELM_WORK/runs/<fleet-id>/fleet.json` atomically. `status` and
`resume` select the latest fleet; only one controller may run at a time. Killing it leaves detached
workers running. `resume` picks up their results and skips landed briefs, including a PR merged
just before a crash. An unfinished fleet must be resumed before starting another one.

`--max` limits running workers (default 4). Before each dispatch, fleet checks free memory and
available disk on `HELM_WORK`. Defaults are 1024 MiB memory and 2048 MiB disk, adjustable with
`HELM_FLEET_MIN_MEMORY_MB` and `HELM_FLEET_MIN_DISK_MB` (0 disables that threshold). Low capacity
keeps briefs queued and appears in status; the loop checks again every half second. It never
rejects a brief for low capacity.

On `done`, fleet fetches and merges the origin default branch (`origin/main` on this repo),
commits any worker leftovers, and runs `--gate` in the worktree. Omitting `--gate` uses `true`,
so supply the repo's actual verification command for shipping. Gate attempts are serialised,
with one delayed retry after failure (`--retry-gate` seconds, default 90). Output from both
attempts, including the gate's table/verdict, goes in the PR body. Logs stay in the fleet folder.

With `--land pr` (default), fleet calls `helm pr` against the GitHub default branch, waits for
pending checks, squash-merges the tested head, then calls `helm clean`. Real CI failures stop it.
If Actions has no checks or reports a billing/disabled-Actions annotation, it comments that the
passing local gate is the evidence. It uses ordinary merges and respects branch protection.
`--land none` marks a gated brief `landed` and retains its worktree, without pushing or using GitHub.

A question, failure, ten-minute stall, merge conflict or second gate failure exits nonzero with
one line in the `helm wait` format; the worktree stays for inspection. Other detached workers
continue. Inspect the result/logs, steer the worker or fix its worktree, then `helm fleet resume`;
items needing review get a fresh gate attempt. Status lists `queued`, `running`, `gate`, `landed`
and `needs-review`, with totals (`--json` includes state and totals). Helm sends no Slack messages.
`helm clean` also accepts dead runs whose recorded worker process no longer exists.

No-spend integration verification: `node --test tests/fleet.test.ts` (real temporary git repos,
stubbed Codex and GitHub). Node runs these TypeScript sources directly; syntax-check with
`node --check cli.ts`, `node --check fleet.ts` and `node --check connectors/github.ts`.

## Migrating from v4

One-time cleanup, written for an agent to run on Nick's machine from a checkout of this repo on
`main`. Each step is safe to re-run.

1. **Stop the v4 daemon.** From a v4 checkout, `helm shutdown`. Without one, stop whatever holds
   the daemon port (default 4747, or `port` in `~/.helm/serve.json`): `lsof -ti tcp:4747 | xargs -r kill`.
2. **Remove the v4 MCP server** from every repo's `.mcp.json` (the `helm` entry that runs
   `helm.js serve --stdio`) and from Codex's config if it was added there. Delete `.mcp.json`
   if nothing is left in it.
3. **Clear v4 state from `~/.helm`.** Delete `helm.sqlite*`, `serve.json`, `helm.json`, `repos/`
   and v4 logs. Keep `.env`, `runs/` and `worktrees/`; those are v5's. Run `git worktree prune`
   in each repo v4 worked on.
4. **Install v5.** `npm install`, then `bin/helm install` (links the skills into
   `~/.claude/skills`), put `bin/` on `PATH`, copy `.env.example` to `~/.helm/.env` and fill in
   `OPENCODE_API_KEY` (and `OPENROUTER_API_KEY` for the fallback). Check with `helm env` and
   `helm models`.
5. **Delete stale branches.** Everything except `main` is v4 work: worker
   branches (`helm/w-*`, `worker-*`), `wave*` branches, and old `feat/`, `fix/`, `docs/`,
   `prep/`, `salvage/` branches. The repo squash-merges, so git shows most of them as unmerged
   even when their PR landed. Branches that never had a PR are gone for good once deleted.

   ```sh
   git fetch --prune origin
   git branch -r | sed 's#^ *origin/##' | grep -vE '^(main|HEAD.*)$' \
     | xargs -n 20 git push origin --delete
   git branch | grep -vE '^\*|^ *main$' | xargs -r git branch -D
   ```
6. **Stop branches piling up.** Turn on "Automatically delete head branches" for the repo:
   `gh repo edit --delete-branch-on-merge`.
