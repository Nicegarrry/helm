# Writing a brief

The brief is the worker's whole contract: it sees nothing else. A stranger in a fresh worktree
must be able to finish it without asking you anything. Save it as a file; the reviewer reuses it.

- One objective. If you need "and", it is two tickets.
- Acceptance checks a script or reviewer can verify: a command and its output, an observable
  behaviour, a file that exists. No "clean" or "robust".
- Name the files to read first and why. Point at an existing pattern to copy.
- Say what is out of scope. Cheap models over-reach: refactors, renames, new deps, docs.
- Give the exact verify command. For a behaviour change, ask for a test that fails before and
  passes after.
- Inline what matters from the plan issue; don't make the worker go and find it.
- The worker's standing rules (stay in the worktree, commit, never push, ask instead of
  guessing, end with a JSON report) are in `agents/worker.md`; don't repeat them.

```markdown
# <short title>
Repo: <path>   Base: <branch>   Plan: #<n>   Context: ~<N>k tokens

## Objective
<What changes and why, in one or two sentences.>

## Acceptance criteria
- [ ] `<command>` exits 0 and prints <expected>
- [ ] <observable behaviour, with a concrete input and output>
- [ ] Existing tests still pass; no tests deleted or weakened

## Look at first
- `<path/file>`: <why; e.g. the pattern to follow>

## Out of scope
- <things that look related but must not change>
- No new dependencies. No unrelated refactors or renames.

## Verify
`<exact test command>`
```
