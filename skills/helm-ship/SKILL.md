---
name: helm-ship
description: Use when a reviewed branch is ready to become a PR, when watching CI, when CI is red, when a PR has review comments to address, or when deciding whether a PR can merge. Covers token-efficient GitHub use via `helm gh`. Produces a merged PR with green CI on its final head.
---

# Helm ship

## Purpose
Take a reviewed branch to a merged PR, with CI green on the exact head that merges, and
without reading raw GitHub output.

## Inputs
- A run id whose diff you checked and that passed review (`helm-review`).
- The issue number it closes.

## Steps
1. Open the PR: `helm pr <id>`. Use `--draft` if you want CI running while review is still
   going. Check the title and body: the body says what changed, how it was verified, and
   `Closes #<n>`. Fix it with `gh pr edit <n> --body-file <file>` if not.
2. Watch CI in the background, quietly:
   `gh pr checks <n> --watch --fail-fast >/dev/null 2>&1; helm gh pr <n>`
   as a background command. You get one line when it settles.
3. If red: `helm gh fail <n>` for the failing tail. Decide if it is the change or a flake.
   - The change: steer the builder with the failing check name and the tail, "Fix exactly
     this." Check the fix, push with `helm pr <id>` again (it re-pushes the branch when the PR exists), go back to step 2.
   - A flake: re-run the job once (`gh run rerun <run-id> --failed`). Flaky twice is a
     real problem; tell Nick, don't keep re-running.
4. If there are review comments: `helm gh comments <n>`. Judge each one. Send the real ones
   to the builder in one steer, check the fix, push (`helm pr <id>`), and reply on the PR saying what was
   fixed and what was not, and why.
5. Before merging, `helm gh pr <n>` must show: mergeable, all checks passing on the current
   head, no unresolved blocking review. Any push resets this; check again after it.
6. If the base moved and the PR conflicts, merge the base into the branch in the worktree
   and push. Never force-push and never rebase a pushed branch.
7. Merge with the repo's convention (`gh pr merge <n> --squash --delete-branch` unless the
   repo uses merge commits).
8. Clean up: confirm the issue closed, then `helm clean <id>` (removes the worktree and run folder; the branch stays on GitHub).
9. Tell Nick in one line: what shipped and the PR link.

## Token rules
- `helm gh pr|checks|fail|comments|issue` for every read. Never `gh ... --json` raw, never a
  full job log.
- Wait for CI in the background; don't poll.

## Done when
- The PR is merged, CI was green on its final head, the issue is closed, the worktree is gone.
- Every review comment was fixed or answered on the PR.

## Evals
Before reporting done, check against these. Fix and recheck if any fail.
- [ ] Merged with checks pending, or green on an older head.
- [ ] Re-ran a failing check repeatedly instead of reading `helm gh fail`.
- [ ] A review comment was ignored without a reply.
- [ ] Force-pushed or rebased a pushed branch.
- [ ] Pulled raw `gh` JSON or a full CI log into context.
- [ ] The PR mixes several concerns; the issue should have been split in `helm-plan`.

## Learnings
After each run, append one line if you learned something: `- YYYY-MM-DD: what happened -> what to do differently`. Keep at most 20.
