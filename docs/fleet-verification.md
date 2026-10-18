# Fleet verification

Ran on Node v22.22.2 with no model spend or GitHub service calls. Each scenario creates its own
temporary git repo, bare origin and worktrees. The Codex executable and GitHub CLI are local
stubs; real git executes commits, fetches, pushes, squash merges and cleanup. CI statuses and
billing annotations are simulated, not live GitHub evidence.

```sh
node --test tests/fleet.test.ts
node --check cli.ts
node --check fleet.ts
node --check connectors/github.ts
node --check tests/fleet.test.ts
git diff --check
```

All commands exited 0. This repo has no configured lint/typecheck scripts; Node runs the
TypeScript directly. No dependencies were added. The production implementation adds 195 lines
across fleet.ts, cli.ts and the GitHub connector (tests and documentation excluded).

The ten-brief scenario invokes `helm fleet <temp-briefs> --model codex/stub --repo <temp-repo>
--max 3 --gate '<table + PASS>'` while the repo checkout is on `wip/orchestrator`. The fixture
asserts every PR targets main, every PR body contains the gate table, all ten changes reach
the bare origin's main, and all worker worktrees are removed. The low-capacity scenarios set
each threshold to 1000000000000 MiB independently, verify no dispatch while the controller
stays alive, then SIGKILL and resume with the threshold set to zero. Gate retries use 0.3s
instead of 90s to verify the delay without slowing the suite. The stall test ages the heartbeat
by 11 minutes. The final land-none scenario uses a quoted glob and the default gate.

Captured scenario output and assertions:

```text
10 briefs, max 3, serial squash lands and gate evidence:
fleet-1792085801942-7837 done · codex/stub · 10 landed
sample01 landed
sample02 landed
sample03 landed
sample04 landed
sample05 landed
sample06 landed
sample07 landed
sample08 landed
sample09 landed
sample10 landed
total 10 · 0 queued · 0 running · 0 gate · 10 landed · 0 needs-review
peak workers: 3; origin/main: 10 files; worktrees: 0

low memory delays dispatch; resume after relief:
sample01 queued
total 1 · 1 queued · 0 running · 0 gate · 0 landed · 0 needs-review · waiting for memory/disk capacity
relief + resume: fleet-1792085819616-99f0 done · codex/stub · 1 landed; worker starts: 1

low disk delays dispatch; resume after relief:
sample01 queued
total 1 · 1 queued · 0 running · 0 gate · 0 landed · 0 needs-review · waiting for memory/disk capacity
relief + resume: fleet-1792085824169-da77 done · codex/stub · 1 landed; worker starts: 1

SIGKILL mid-fleet resumes without redispatching landed briefs:
killed after landed: sample01
resume: fleet-1792085828715-a78e done · codex/stub · 5 landed; total dispatches: 5

crash after remote merge is recovered without a duplicate merge:
crash after merge + resume: fleet-1792085838313-0832 done · codex/stub · 2 landed; dispatches/merges: 2/2

flaky gate retries after delay and preserves both outputs:
flaky gate: attempts=2, retry gap=649ms; fleet-1792085843910-b511 done · codex/stub · 1 landed

second gate failure exits in one line and keeps worktree; fixed gate resumes:
sample01 failed · codex/stub · gate failed twice (exit 1); worktree kept
fixed gate + resume: fleet-1792085849707-d93e done · codex/stub · 1 landed

worker question stops in one line:
sample01 question · codex/stub · fixture decision? second line

worker failed stops in one line:
sample01 failed · codex/stub · fixture sample01

worker dead stops in one line:
sample01 failed · codex/stub · worker process died without a report

a worker question interrupts an active gate:
active 60s gate interrupted: sample02 question · codex/stub · fixture decision? second line

stall detection and cleaning a dead run:
sample01 stalled (no progress for 11m) · codex/stub ·
cleaned 1 run(s)

Actions none: local evidence only when unavailable:
Actions none: fleet-1792085865170-a4b8 done · codex/stub · 1 landed; evidence comments: 1

Actions blocked: local evidence only when unavailable:
Actions blocked: fleet-1792085869235-be23 done · codex/stub · 1 landed; evidence comments: 1

Actions fail: local evidence only when unavailable:
Actions fail: sample01 failed · codex/stub · CI failed: test; evidence comments: 0

pending CI and merge queue retain worktree until confirmed merged:
pending checks -> queued merge (worktree retained) -> confirmed merged: fleet-1792085876784-2578 done · codex/stub · 1 landed

standalone run/wait/ps/path/result/pr retain their behavior:
standalone: legacy done · codex/stub · fixture legacy; ps/path/result/pr passed

land none gates and retains worktree without GitHub:
fleet-1792085897612-aeda done · codex/stub · 1 landed

# Subtest: fleet acceptance (no model or GitHub spend)
# tests 19
# suites 0
# pass 19
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 99291.278959
```
