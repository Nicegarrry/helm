# Reviewing a change

1. Pick the reviewer: a different model family from the builder, at least as strong
   (`models.md`). You count as a different family, but you are expensive: read small diffs
   yourself, dispatch bigger ones.
2. `helm run <model> --review <branch|pr#> --brief <file>` with the original brief plus the
   riskiest areas. `agents/reviewer.md` tells it how to report: `blocking:` and `nit:` findings
   with file:line, then a verdict. Nits never block.
3. Judge each finding against the code. The reviewer's claim is not evidence either.
4. Your own short pass, scaled to the risk:
   - Each acceptance check met, and nothing beyond them.
   - Tests that test behaviour; none deleted, skipped, weakened or hard-coded to pass.
   - Stubs or TODOs presented as done.
   - Changes outside the brief: refactors, config, CI, lockfiles, new dependencies.
   - Error paths on inputs that can happen. Secrets, injection, unsafe shell.
   - A new helper that duplicates an existing one.
5. Send all real blocking findings to the builder in one steer. Re-review only those findings
   and the new diff; no new nits.
6. On a PR, post the verdict and what was fixed as a PR comment.
