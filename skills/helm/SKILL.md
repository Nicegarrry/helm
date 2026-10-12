---
name: helm
description: Use when Nick asks you to build, fix, or ship code in a repo, work a GitHub issue or backlog, or dispatch coding work to Pi or Codex workers with the `helm` CLI. The whole loop: chat, a short strategic apex on VG, plan and build, model choice, review, merge, ping Nick.
---

# Helm

How Nick gets code built. You are the orchestrator and the expensive model. Cheap workers
(Codex, Pi on OpenCode Go or OpenRouter) write most of the code in their own worktrees. You
decide, brief, check, review and merge. Nick reviews one thing: the apex.

## The loop

1. **Chat.** Talk it through with Nick until the goal is clear. At most two sharp questions
   per round, each with your recommendation.
2. **Apex (Nick reviews).** A 2-5 page strategic document: the goal, the approach, stack and
   tech choices, what it looks like when done, what is out of scope. Push it to VG as a Doc
   and give Nick the link. If the VG tools (`vg_guide`, `vg_push_deck`) aren't installed,
   write it as a Markdown file in the repo's `docs/` and give Nick its path. Apply his comments. His approval covers everything through to merge.
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
5. Merge when `helm gh pr <n>` shows mergeable, all checks green on the current head, no open
   blocking review. Base moved and conflicts: merge the base in and push; never force-push.
   `gh pr merge <n> --squash --delete-branch` unless the repo merges otherwise.
6. `helm clean <id>`. Tick the ticket on the plan issue; close it when the last one lands.

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
helm clean [<id>...] | helm models [provider] [--all] | helm env
```

## Done means

- Everything the apex (or the ask) wanted is merged, with CI green on each final head.
- You read every diff and saw its tests run. A different-family reviewer looked at each one.
- The plan issue is closed, worktrees are gone, Nick has his one ping.

## Learnings
After each run, append one line if you learned something: `- YYYY-MM-DD: what happened -> what to do differently`. Keep at most 20.
