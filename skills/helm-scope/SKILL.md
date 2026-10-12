---
name: helm-scope
description: Use when turning a GitHub issue, a bug report, or an idea from Nick into a brief for a Helm worker, or when a worker misread a brief and it needs rewriting. Produces a one-page brief a cheap model cannot misread.
---

# Helm scope

## Purpose
Turn a GitHub issue (the ticket) into a brief that a cheap model in a fresh worktree can finish without
asking you anything. The brief is the whole contract: the worker sees nothing else.

## Inputs
- The issue (`helm gh issue <n>`) or Nick's request.
- Enough of the code to name real files. Read it yourself or dispatch a cheap read-only run.
- The repo's test command (README, `package.json`, CI config).

## Steps
1. State the objective in one or two sentences: what changes and why. One objective per
   brief. If you need "and", it is probably two tickets (see `helm-plan`).
2. Write acceptance criteria a script or a reviewer can check: a command and its expected
   result, an observable behaviour, a file that exists. No adjectives like "clean" or "robust".
3. Name the files to read first and say why each matters. Point at an existing pattern to copy.
4. Say what is out of scope. Cheap models over-reach: refactors, renames, new deps, docs.
5. Give the exact verify command. For a behaviour change, ask for a test that fails before
   the change and passes after.
6. Inline what matters from the issue. Don't make the worker go and find context.
7. Read it as a stranger. Anything you would have to explain is missing. Fix it.
8. Save it as a file (e.g. `~/.helm/briefs/<id>.md`). The reviewer reuses it.

## Brief template

```markdown
# <short title>
Repo: <path>   Base: <branch>   Issue: #<n>   Context: ~<N>k tokens

## Objective
<What changes and why, in one or two sentences.>

## Acceptance criteria
- [ ] `<command>` exits 0 and prints <expected>
- [ ] <observable behaviour, with a concrete input and output>
- [ ] Existing tests still pass; no tests deleted or weakened

## Look at first
- `<path/file>`: <why; e.g. the pattern to follow>
- `<path/test>`: <how existing tests are written>

## Out of scope
- <things that look related but must not change>
- No new dependencies. No unrelated refactors or renames.

## Verify
`<exact test command>`
```

The worker's standing rules (stay in the worktree, commit, never push, ask instead of
guessing, end with a JSON report) come from `agents/worker.md`; don't repeat them in briefs.

## Done when
- The brief fits on one page and has every section filled with specifics.
- Every acceptance criterion is checkable by running something or looking at something.
- A stranger could start work without asking a question.

## Evals
Before dispatching, check the brief against these. Fix and recheck if any fail.
- [ ] Acceptance criteria are vague ("works well", "handles errors") instead of checkable.
- [ ] Two objectives in one brief.
- [ ] No files named, so the worker greps the whole repo and edits the wrong place.
- [ ] Out of scope is empty, so the worker refactors things nobody asked for.
- [ ] The brief links to the issue instead of stating what it needs.
- [ ] No verify command, or one that doesn't exist in this repo.

## Learnings
After each run, append one line if you learned something: `- YYYY-MM-DD: what happened -> what to do differently`. Keep at most 20.
