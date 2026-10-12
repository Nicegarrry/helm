---
name: helm-review
description: Use when a worker's branch or a PR needs review before merge, when picking a reviewer model, when dispatching a read-only review run with `helm run --review`, or when deciding what to do with review findings. Produces findings from a different model family, checked and acted on.
---

# Helm review

## Purpose
Catch what the builder missed. A reviewer from a different model family reads the change
against the brief; you judge the findings and get the real ones fixed.

## Inputs
- The branch (`helm/<id>`) or PR number, and the brief it was built from.
- The builder's model, so you pick a different family (`helm-models`).

## Steps
1. Pick the reviewer. Different family from the builder; at least as strong; $0 lane when
   the window allows. You (Claude) count as a different family from every worker, but you
   are expensive: read small diffs yourself, dispatch for anything bigger.
2. Write the reviewer brief: the original brief's objective and acceptance criteria, and
   the areas of most risk. `agents/reviewer.md` already tells the reviewer how to work and
   report: one pass, `blocking:` and `nit:` findings with file:line, then a JSON verdict
   (`approve` or `request changes`). Nits never block.
3. Dispatch: `helm run <model> --review <branch|pr#> --brief <file>`, then `helm wait` in
   the background. Read `helm result <id>` when it finishes.
4. Judge each finding against the code. Real: keep it. Wrong or out of scope: drop it with
   a one-line reason. The reviewer's claim is not evidence either.
5. Do your own short pass for what cheap models miss (list below). Scale it to the risk.
6. Send all real blocking findings to the builder in one `helm steer <builder-id>`, then
   check the fix as in `helm-build`.
7. Re-review only the previous findings and the new diff. Do it yourself when it is small,
   or dispatch a new review run with the previous findings in the brief. No new nits.
8. If a PR exists, post the verdict and what was fixed as a PR comment, so the record
   lives on GitHub.

## What to look for
- Does it meet each acceptance criterion, and only those?
- Tests: do they test the behaviour, or just the implementation? Any deleted, skipped or
  weakened tests? Hard-coded values that only make a test pass?
- Stubs, TODOs or fake implementations presented as done.
- Changes outside the brief: refactors, renames, config, CI, lockfiles, new dependencies.
- Error paths and edge cases on inputs that can actually happen.
- Secrets, injection, unsafe shell, paths built from user input.
- New code that duplicates a helper that already exists.
- Report claims that the diff doesn't support.

## Done when
- A different-family reviewer (or you) has reviewed the current diff.
- Every blocking finding is fixed or answered with a reason.
- The verdict is recorded on the PR, if there is one.

## Evals
Before moving to ship, check against these. Fix and recheck if any fail.
- [ ] Reviewer is the same family as the builder (e.g. two Qwen models on two providers).
- [ ] Findings applied without checking them against the code.
- [ ] Findings fed back one at a time over several steers.
- [ ] Re-review invented new nits outside the new diff.
- [ ] Review ran on an old head; the builder pushed after it.

## Learnings
After each run, append one line if you learned something: `- YYYY-MM-DD: what happened -> what to do differently`. Keep at most 20.
