---
name: helm-build
description: Use when dispatching a coding worker with `helm run`, when a worker finishes, fails, stalls or asks a question, when deciding whether to steer, restart or take over, or when checking a worker's diff. Produces a branch whose diff you have checked yourself.
---

# Helm build

## Purpose
Get a brief turned into a correct diff on a `helm/<id>` branch, spending as little of your
own context as possible, and knowing from evidence, not from the worker's report, that it works.

## Inputs
- A brief file (`helm-scope`) and a model (`helm-models`).
- The repo path and base branch.

## Steps
1. Dispatch: `helm run <model> --brief <file> --repo <path> --base <branch> --id <name>`.
   Use short ids that say what the run is, e.g. `fix-login-212`. Start every independent
   ticket now.
2. Wait in the background: `helm wait <id...> --stall 10` as a background command. Do
   other work or end your turn. Don't poll and don't tail logs.
3. When woken, read the one line it printed and act on that run's state:
   - **done**: `helm result <id>`, then step 4.
   - **question**: answer with `helm steer <id> "<answer>"` if the brief or the code
     settles it. If it is Nick's call, ask him one concrete question with your
     recommendation. A question usually means the brief had a gap; note it in Learnings.
   - **stalled**: `helm logs <id> -n 40`. If it loops on one error, steer with a concrete
     hint. If it is hung, `helm stop <id>` and re-run.
   - **failed**: read the result. Brief unclear: fix the brief and re-run. Task too hard
     for the model: re-run one tier up. Provider error: switch lane (`helm-models`).
   Then go back to waiting on whatever is still running.
4. Check the work yourself. In the run's worktree (`helm path <id>`): `git diff --stat <base>`, then read the
   hunks that matter. Run the verify command from the brief. Compare against the
   acceptance criteria one by one. The worker's report tells you where to look, not what is true.
5. If something is wrong, steer once with all of it: what fails, the evidence (test name,
   ten lines of output), and "Fix exactly this. Don't change the tests." Then wait again.
6. After two steers on the same problem, stop steering. Rewrite the brief and re-run on a
   stronger model, or take over.
7. When the diff is right, go to `helm-review`.

## Take over when
- The fix is smaller than the message explaining it.
- Two attempts failed the same way, and you now know exactly what is wrong.
- The worker is going in circles or editing things outside the brief.
Take over in the same worktree so the branch carries on. Don't start a second worker on it.

## Done when
- The diff meets every acceptance criterion and you saw the verify command pass.
- Nothing outside the brief changed (no stray refactors, config, lockfiles, deleted tests).

## Evals
Before moving to review, check against these. Fix and recheck if any fail.
- [ ] You accepted "done, tests pass" without running the tests or reading the diff.
- [ ] You polled `helm ps` or read full logs instead of waiting in the background.
- [ ] You re-ran the same brief on the same model and expected a different result.
- [ ] You steered three or more times on the same problem.
- [ ] Two runs share one worktree or branch.
- [ ] Tests were weakened, skipped or deleted to make them pass.

## Learnings
After each run, append one line if you learned something: `- YYYY-MM-DD: what happened -> what to do differently`. Keep at most 20.
