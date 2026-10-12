---
name: helm-plan
description: Use when work is too big for one worker or one PR: a multi-part issue, a feature, a refactor across modules, or a backlog to run. Breaks it into worktree-sized tickets with order, parallelism, lanes, and the parts you keep for yourself.
---

# Helm plan

## Purpose
Split work into tickets that each fit one worker, one worktree and one small PR, in an
order that avoids conflicts and keeps you out of the critical path.

## Inputs
- The issue or Nick's goal, and its non-goals.
- A read of the code areas it touches.
- Open PRs on the repo (`gh pr list`), so you don't plan on top of in-flight work.

## Steps
1. Cut first. List what the goal really needs. Drop anything that is nice-to-have, and
   prefer deleting or reusing code over adding it.
2. Find the decisions: shared contracts, interfaces, schemas, names other tickets depend
   on. Do these yourself, or make them the first ticket, and merge before the rest start.
3. Split the rest into tickets. One ticket is one concern, one session, one PR, roughly
   under 300 changed lines. If you can't write its acceptance criteria in three or four
   lines, split again.
4. Order by dependency. A ticket starts from a base that has everything it needs merged.
5. Mark what can run in parallel: tickets that touch different files. Two tickets editing
   the same file run one after the other. Run at most 3 or 4 workers at once; more costs
   your attention and merge conflicts.
6. Size each ticket (S ~100, M ~300 lines) and pick a lane and model (`helm-models`).
7. Keep for yourself: decisions, contracts, tiny edits, anything still ambiguous, and
   risky areas (migrations, auth, money, deploy config) where you write or closely read
   every line.
8. Record the plan on GitHub: one issue per ticket, or a checklist on a parent issue. Each
   entry carries its brief summary, size, lane and dependencies.
9. If the plan is large or changes product behaviour, send it to Nick for review and wait
   for his markup before dispatching.

## Ticket line format

```
#<n> <title> | Size S | Lane opencode-go/<model> | Deps #<m> | Files src/a.ts, test/a.test.ts
```

## Done when
- Every ticket has an objective, checkable acceptance, size, lane and dependencies.
- No two parallel tickets touch the same file.
- The decisions are either done or first in line.
- The plan lives on GitHub, not only in your context.

## Evals
Before dispatching, check the plan against these. Fix and recheck if any fail.
- [ ] A ticket is really two concerns, or too big to review in one sitting.
- [ ] Parallel tickets edit the same file and will conflict.
- [ ] A shared interface is left for workers to invent separately.
- [ ] The plan adds machinery that a smaller change or a deletion would avoid.
- [ ] Every ticket went to a worker, including ones cheaper to do yourself.
- [ ] A ticket depends on unmerged work but is based on the default branch.

## Learnings
After each run, append one line if you learned something: `- YYYY-MM-DD: what happened -> what to do differently`. Keep at most 20.
