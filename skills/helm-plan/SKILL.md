---
name: helm-plan
description: Use when work is too big for one worker or one PR: a multi-part issue, a feature, a refactor across modules, or a backlog to run. Breaks it into tickets (GitHub issues) that each fit one worker run, with order, parallelism, lanes, and the parts you keep for yourself.
---

# Helm plan

## Purpose
Split work into tickets, each a GitHub issue holding one scoped item of work that one worker
can finish in one run, in an order that avoids conflicts and keeps you out of the critical path.

## Inputs
- The issue or Nick's goal, and its non-goals.
- A read of the code areas it touches.
- Open PRs on the repo (`gh pr list`), so you don't plan on top of in-flight work.

## Steps
1. Cut first. List what the goal really needs. Drop anything that is nice-to-have, and
   prefer deleting or reusing code over adding it.
2. Find the decisions: shared contracts, interfaces, schemas, names other tickets depend
   on. Do these yourself, or make them the first ticket, and merge before the rest start.
3. Split the rest into tickets. A ticket is one scoped item of work: one concern, one
   worker run, one PR. Line count doesn't matter. The test is context: can one agent do
   it in a single run in one context, staying under half the model's window (~500k tokens
   on a 1M model, ~130k on a 262k one), counting the code it must read, its edits and
   test output? If not, split it. If you can't write its acceptance criteria in three or
   four lines, split again.
4. Order by dependency. A ticket starts from a base that has everything it needs merged.
5. Mark what can run in parallel: tickets that touch different files. Two tickets editing
   the same file run one after the other. Run at most 3 or 4 workers at once; more costs
   your attention and merge conflicts.
6. Estimate each ticket's context use (what must be read plus what it will produce) and
   pick a lane and model (`helm-models`). A ticket that needs more than half of a
   smaller-window model's context goes to a 1M model.
7. Keep for yourself: decisions, contracts, changes under ~200 lines, anything still
   ambiguous, and risky areas (migrations, auth, money, deploy config) where you write or closely read
   every line.
8. Record the plan on GitHub: one issue per ticket, linked from a parent issue's checklist.
   Each issue carries its scope, acceptance criteria, context estimate, lane and
   dependencies. The issue is the ticket; the brief is written from it (`helm-scope`).
9. If the plan is large or changes product behaviour, send it to Nick for review and wait
   for his markup before dispatching.

## Ticket line format

```
#<n> <title> | ~200k ctx | Lane opencode-go/<model> | Deps #<m> | Files src/a.ts, test/a.test.ts
```

## Done when
- Every ticket is a GitHub issue with an objective, checkable acceptance, context estimate,
  lane and dependencies.
- No two parallel tickets touch the same file.
- The decisions are either done or first in line.
- The plan lives on GitHub, not only in your context.

## Evals
Before dispatching, check the plan against these. Fix and recheck if any fail.
- [ ] A ticket is really two concerns, or needs more than half a context window to finish.
- [ ] A ticket was split by line count when it fits one run fine.
- [ ] Parallel tickets edit the same file and will conflict.
- [ ] A shared interface is left for workers to invent separately.
- [ ] The plan adds machinery that a smaller change or a deletion would avoid.
- [ ] Every ticket went to a worker, including ones cheaper to do yourself.
- [ ] A ticket depends on unmerged work but is based on the default branch.

## Learnings
After each run, append one line if you learned something: `- YYYY-MM-DD: what happened -> what to do differently`. Keep at most 20.
