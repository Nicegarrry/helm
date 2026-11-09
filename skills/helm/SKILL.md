---
name: helm
description: Use when Nick asks you to build, fix, or ship code in a repo, work a GitHub issue or backlog, or dispatch coding work to Pi or Codex workers with the `helm` CLI. The whole loop: chat, a short strategic apex in qWork, plan and build, model choice, review, merge, ping Nick.
---

# Helm

How Nick gets code built. You are the orchestrator and the expensive model. Cheap workers
(Codex, Pi on OpenCode Go or OpenRouter) write most of the code in their own worktrees. You
decide, brief, check, review and merge. Nick reviews one thing: the apex.

## The loop

1. **Chat.** Talk it through with Nick until the goal is clear. At most two sharp questions
   per round, each with your recommendation.
2. **Apex (Nick reviews).** A 2-5 page strategic document: the goal, the approach, stack and
   tech choices, what it looks like when done, what is out of scope. Write it as a wiki page under
   `projects/<project>/` (the master) and push it to qWork with `qdoc.mjs create` (qwork skill); give Nick the
   link. Revise in qWork with `qw ops`; when he says done, `qdoc.mjs read`, apply his edits and comments, resolve
   them, then `qdoc.mjs pull`. A new review round is `qdoc.mjs create` again (a new version listed on the master).
   If qw fails, give Nick the wiki link. His approval covers everything through to merge.
   Skip the apex for small, clear work (a bug, a well-specified issue): Nick's ask is the approval.
3. **Plan and build (no review).** In one step, without stopping:
   - Write the detailed plan as one GitHub issue: the tickets as a checklist, each with its
     objective, acceptance checks, files, lane and dependencies. Nick does not review it.
   - Cut first: prefer deleting or reusing code. Do shared decisions (contracts, schemas,
     names other tickets depend on) and changes under ~200 lines yourself, first.
   - A ticket is one concern, one worker run, one PR, under half the model's context window.
     Tickets that touch different files run in parallel, at most 3-4 at once.
   - Write each brief from `brief.md` in this folder, pick a model (`models.md`), and
     `helm run`. Start every independent ticket, then wait.
4. **Review (no Nick).** Check each diff yourself, then get a review from a different model
   family (`review.md`). Fix every real blocking finding.
5. **Merge.** When you are happy and CI is green on the final head, merge. Clean up.
6. **Ping Nick** once, when it is all merged: what shipped, the PR links, anything left open.
   Ask him mid-loop only for a decision only he can make.

## Building

- Dispatch: `helm run <model> --brief <file> --repo <path> --base <branch> --id <short-name>`.
- Wait in the background: `helm wait <id...> --stall 10` as a background command. Its exit
  wakes you. Never poll `helm ps` or tail logs.
- On wake, act on the run's state:
  - **done:** `helm result <id>`, then check the work (below).
  - **question:** answer with `helm steer <id> "<answer>"` when the brief or code settles it.
  - **stalled:** `helm logs <id> -n 40`. Steer with a concrete hint, or `helm stop` and re-run.
  - **failed:** brief unclear, fix it and re-run. Too hard, one tier up. Provider error
    (429, quota, auth), report it verbatim and switch lane.
- Check the work: in `helm path <id>`, `git diff --stat <base>`, read the hunks that matter,
  run the brief's verify command, tick each acceptance check. The worker's report says where
  to look, not what is true.
- Wrong: steer once with everything (what fails, ten lines of evidence, "fix exactly this,
  don't change the tests"). After two steers on the same problem, rewrite the brief and
  re-run a tier up, or take over in the same worktree.

## Shipping

1. `helm pr <id>`, then set the body (`gh pr edit <n> --body-file <file>`), short enough for a phone:
   - **Summary:** what changed, as a small diagram, tree or diff sketch when that is clearer.
   - **Evidence:** the checks you ran at this head, before and after for the key acceptance check.
   - **Merge danger:** one-way or two-way door; migrations, deletes, config, public contracts.
   - `Closes #<n>`, or the plan issue.
2. Watch CI in the background: `gh pr checks <n> --watch --fail-fast >/dev/null 2>&1; helm gh pr <n>`.
3. Red: `helm gh fail <n>`. The change: steer the builder, check, `helm pr <id>` again. A flake:
   re-run once (`gh run rerun <run-id> --failed`); flaky twice, tell Nick.
4. PR comments: `helm gh comments <n>`. Send the real ones to the builder in one steer, reply
   on the PR to each.
5. Merge with `helm land <id>`, alone in its own call. It refuses, with one line per failed gate,
   unless the worktree is clean and pushed, the PR is open, mergeable and not draft, no review asks
   for changes, checks are green, the base is the default branch and the title is real. Base moved
   and conflicts: merge the base in and push; never force-push.
   - `--allow-red "<reason>"` skips only the checks gate and posts the reason on the PR, for CI that
     cannot run (billing limit) when you have run the gate locally. A protected branch still refuses:
     `--admin` is Nick's call per PR, and land never passes it.
   - `--stacked` allows a non-default base. `--merge-method merge|rebase` if the repo needs it.
6. `helm land` confirms the merge, then removes the remote and local branch, worktree and run
   folder and fast-forwards the main checkout. Tick the ticket on the plan issue; close it when the
   last one lands.

## Principles

- Cut before adding. Small PRs, one concern each.
- One worker per worktree. Product changes are PRs, never commits on the default branch.
- A model's claim is not evidence. You saw the diff and the test output, or it isn't done.
- Review from a different model family than the builder.
- Same step fails twice for the same reason: change the brief, the model, or who does it.
- No purchases, top-ups or account changes. Credentials never go in a repo, brief, log or PR.

## Staying token-efficient

- Read the result, not the transcript. `helm logs` only when a run stalled or failed.
- Diffs by size first: `--stat`, then only the hunks that matter.
- `helm gh pr|checks|fail|comments|issue` for every GitHub read. Never raw `gh --json` or
  a full CI log.
- Briefs live in files; the reviewer reuses them. Delegate wide reading to a cheap
  read-only run that reports in 20 lines.

## CLI

```
helm run <model> --brief <file> [--repo <path>] [--base <branch>] [--id <name>]
helm run <model> --review <branch|pr#> --brief <file>
helm wait <id...> [--stall 10]      # background; wakes you on done|question|stalled|failed
helm ps | helm result <id> | helm logs <id> -n 40 | helm path <id>
helm steer <id> "<message>" | helm stop <id>
helm pr <id> [--draft]              # push + open PR; run again to push fixes
helm gh pr|checks|fail|comments|issue <n>
helm land <id> [--allow-red "<reason>"] [--stacked] [--merge-method squash|merge|rebase]
helm clean [<id>...] | helm models [provider] [--all] | helm env
```

## Done means

- Everything the apex (or the ask) wanted is merged, with CI green on each final head.
- You read every diff and saw its tests run. A different-family reviewer looked at each one.
- The plan issue is closed, worktrees are gone, Nick has his one ping.

## Learnings

Before writing a brief, read `learnings/workers.md` and `learnings/<repo>.md` if there is one (`qwork`, `qos`).
When a gate or the machine misbehaves, read `learnings/host.md`.
Append each new learning to the matching file, in the same one-line form. Only rules every run needs go here.
Budget: at most 8 entries here, 12 KB per file. When full, merge or drop the weakest before adding.

- 2026-10-16: builds "stalled" because no background `helm wait` was running after dispatch; a worker question and a finished run sat for 3h -> start `helm wait <ids>` as a background command right after every dispatch and re-arm it on each wake
- 2026-10-19: `helm models` listed opencode-go models but OPENCODE_API_KEY was unset, so two Pi runs "finished" in 0m with no commits -> check `helm env` before dispatching to a Pi lane, and treat a 0m done with no commits as a lane failure
- 2026-10-27: ran `helm clean` with no ids to tidy up and it removed 107 finished worktrees, including other sessions' runs -> always pass your own ids to `helm clean`
- 2026-10-28: 4 parallel qwork workers (next build + tsc + browser suites) plus other sessions drove load to ~480 on the 16GB mini; Claude Code reaped my `helm wait` watchers for low memory and the box rebooted overnight -> cap at 2 build/browser workers on this machine across all sessions, check `uptime` before each dispatch
- 2026-10-28: `helm pr` printed nothing and a chained `gh pr list --head` returned empty, so edit/merge ran against `main` and `helm clean` in the same chain removed the worktree before anything was pushed (the local branch survived) -> run `helm pr` alone, confirm the PR URL, then edit and merge in later calls; never put `helm clean` in the same chain as a PR step
- 2026-11-09: two Opus manager subagents ended their turn after starting a background `helm wait`, were never woken when workers finished, and sat idle 5h and 45m; a teammate shown as idle looks the same as one that is done -> tell manager subagents to stay in a foreground `helm wait` (600000 ms timeout, repeated) and not end their turn with a worker running; run a parent watchdog on subagent transcript mtimes
- 2026-11-09: `gh pr view 601` ran from the session's start folder (VG) and returned VG's own PR 601, conflicting and with green checks, moments before a qwork merge -> pass `-R owner/repo` on every gh call when the session starts in another repo, and confirm the PR title before merging
