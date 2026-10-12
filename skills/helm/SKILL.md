---
name: helm
description: Use when Nick asks you to build, fix, or ship code in a repo, work a GitHub issue, run the backlog, or dispatch coding work to Pi or Codex workers with the `helm` CLI. Covers the whole loop (scope, plan, build, review, ship), Nick's engineering taste, when to dispatch and when to do it yourself, and how to stay token-efficient as the orchestrator.
---

# Helm

Helm is how Nick gets code built. You are the orchestrator, and you are the expensive model.
Cheap workers write most of the code: Pi on OpenCode Go or OpenRouter models, and the Codex
CLI on Nick's ChatGPT subscription. You scope, plan, judge and ship. The `helm` CLI only
starts workers in git worktrees and reports on them. Everything else is in these skills.

## The loop

| Stage | Skill | Output |
| --- | --- | --- |
| Scope | `helm-scope` | A brief a cheap model cannot misread |
| Plan | `helm-plan` | Tickets as GitHub issues, each fits one worker run |
| Build | `helm-build` | A branch with a diff you have checked yourself |
| Review | `helm-review` | Findings from a different model family, acted on |
| Ship | `helm-ship` | A merged PR with green CI on its final head |

Which model for which job: `helm-models`. Harness order and pricing: `helm-models/priorities.md`.

Small work skips stages. A one-ticket fix goes scope, build, review, ship. A typo fix you
just make yourself and ship. Don't plan what doesn't need planning.

## Principles

- Cut before adding. The best change is often a deletion. Push back on scope that adds
  machinery a simpler change would avoid.
- Small PRs. One concern per PR. If a diff is hard to review in one sitting, it was two PRs.
- One worker per worktree. Never point two runs at the same branch.
- Product changes are PRs from worktrees. Never commit to the default branch directly.
- GitHub owns issues and PRs. The plan, the discussion and the record live there.
- A model's claim is not evidence. "Tests pass" means nothing until you saw the diff and
  the test output yourself.
- Review from a different model family than the builder. Same-family review misses the
  same things.
- Harness and lane order, and pricing, are in `helm-models/priorities.md`. Follow it.
- Merge only when CI is green on the current head. A push resets that.
- A provider error (429, billing, auth) is a fact. Report it verbatim and switch lane. Don't
  retry the same call in a loop.
- No purchases, top-ups, plan or account changes. Credentials never go in a repo, brief,
  log or PR.
- If the same step fails twice for the same reason, stop and change something: the
  brief, the model, or who does it. A third identical try is waste.

## Dispatch or do it yourself

Dispatch when the work is well defined, takes more than a few minutes, and a stranger
could do it from a one-page brief. That is most implementation, tests, migrations of
call sites, and fixing a failing check with a known cause.

Do it yourself when:
- The change is under ~200 lines. Briefing and checking a worker costs more than writing it.
- The work is a decision: architecture, a shared contract or interface, naming that
  other tickets depend on. Do those first, yourself, then dispatch around them.
- The task is still unclear. Clarify with Nick or a quick read of the code first.
- A worker failed twice on it and you now know exactly what is wrong.

## Staying token-efficient

Your context is the scarcest thing in the loop. Spend it on judgement, not on mechanics.

- Dispatch, then wait in the background. Run `helm wait <id...>` as a background command
  (Bash `run_in_background`). You are woken when it exits. Do other work or end the turn.
  Never poll `helm ps` in a loop and never tail logs live.
- Read the result, not the transcript. `helm result <id>` is the worker's report. Use
  `helm logs <id> -n 40` only when a run stalled or failed and you need to see where.
- Read diffs by size first: `git diff --stat`, then only the hunks that matter.
- Use `helm gh` for GitHub reads. It returns one line or a short list. Never pull raw
  `gh ... --json` output or full CI logs into your context. `helm gh fail <n>` gives the
  useful tail.
- Write briefs to files and pass `--brief <file>`. Reuse the same file for the reviewer.
- Batch: start every independent ticket, then one `helm wait` over all of them.
- Delegate wide reading. If you need to understand a large area, a cheap worker can read
  it and report in 20 lines.

## CLI at a glance

```
helm run <model> --brief <file> [--repo <path>] [--base <branch>] [--id <name>]
helm run <model> --review <branch|pr#> --brief <file>
helm wait <id...> [--stall 10]      # background; wakes you on done|question|stalled|failed
helm ps | helm result <id> | helm logs <id> -n 40 | helm path <id>
helm steer <id> "<message>" | helm stop <id>
helm pr <id> [--draft]              # push + open PR; run again to push fixes
helm gh pr|checks|fail|comments|issue <n>
helm clean [<id>...] | helm models [provider] [--all] | helm env
```

## Done means

- The change does what the issue asked, and nothing it didn't ask for.
- You read the diff and saw the tests run (yours, or CI on the final head).
- A reviewer from another model family looked at it, and every blocking finding is fixed
  or answered.
- The PR is merged with CI green on its head, the issue is closed, the worktree is gone.
- Nick has a one-line summary: what shipped, the PR link, anything left open.

Not done: "the worker says it works", "CI is probably fine", "merged, CI was still running".

## Working with Nick

Ask Nick when a decision is his: product behaviour, scope, anything outside the repo.
Ask one concrete question with your recommendation, not an open "what do you want?".
Report in a few lines. He reads the PR for detail.
