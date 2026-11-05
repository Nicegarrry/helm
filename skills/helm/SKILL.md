---
name: helm
description: Use when Nick asks you to build, fix, or ship code in a repo, work a GitHub issue or backlog, or dispatch coding work to Pi or Codex workers with the `helm` CLI. The whole loop: chat, a short strategic apex in qWork, plan and build, model choice, review, merge, ping Nick.
---

# Helm

How Nick gets code built. You are the orchestrator and the expensive model. Cheap workers
(Codex, Pi on OpenCode Go or OpenRouter) write most of the code in their own worktrees. You
decide, brief, check, review and merge. Nick reviews one thing: the apex.

## The loop

1. **Chat.** Talk it through with Nick until the goal is clear. At most two sharp questions
   per round, each with your recommendation.
2. **Apex (Nick reviews).** A 2-5 page strategic document: the goal, the approach, stack and
   tech choices, what it looks like when done, what is out of scope. Write it as a wiki page under
   `projects/<project>/` (the master) and push it to qWork with `qdoc.mjs create` (qwork skill); give Nick the
   link. Revise in qWork with `qw ops`; when he says done, `qdoc.mjs read`, apply his edits and comments, resolve
   them, then `qdoc.mjs pull`. A new review round is `qdoc.mjs create` again (a new version listed on the master).
   If qw fails, give Nick the wiki link. His approval covers everything through to merge.
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
- 2026-10-15: merged a PR from a `grep ...; gh pr merge` chain after a timing test failed alone (it was load avg 100, passed on main) -> never chain a merge after `;`, put the merge in its own call after reading the gate
- 2026-10-16: builds "stalled" because no background `helm wait` was running after dispatch; a worker question and a finished run sat for 3h -> start `helm wait <ids>` as a background command right after every dispatch and re-arm it on each wake
- 2026-10-16: qWork merges sat undeployed for 13h (vercel.json git.deploymentEnabled=false) -> after merging qWork, run `vercel --prod --yes` once from main and confirm the new deploy is aliased
- 2026-10-17: a gate queue loop used `while pgrep -f "gate.sh"` and matched its own command line, deadlocking three gates for an hour -> chain gates in one background command (`for id in ...; do gate $id; done`), never pgrep for a string the waiter itself contains
- 2026-10-17: under load avg 100+, full-suite gates failed 5-15 browser tests per run on 5s/2s timeouts, and the same tests also failed on main -> gate with `--testTimeout=30000 --hookTimeout=60000`, baseline failures on main, and fix tests that are broken on main in their own small PR rather than in the ticket
- 2026-10-19: `helm models` listed opencode-go models but OPENCODE_API_KEY was unset, so two Pi runs "finished" in 0m with no commits -> check `helm env` before dispatching to a Pi lane, and treat a 0m done with no commits as a lane failure
- 2026-10-19: a `rm -f node_modules && git commit` chain died on a real node_modules dir and `helm pr` then committed the unfinished merge with the worker summary as message -> check `git status` before `helm pr`, and never put a cleanup step in front of a commit in one && chain
- 2026-10-19: symlinked node_modules into a helm worktree passed tests but next build (Turbopack) rejected it; GitHub CI on qwork fails in ~3s so local CI is the gate, and browser journey tests time out under load on main too -> npm ci in the worktree before building, and baseline flaky browser files on main before blaming a diff
- 2026-10-19: browser suites run 3x flakier from helm worktrees on the T7 external drive than from the SSD checkout; 'regressions' vanished when main also ran from T7 -> baseline main from the same disk (or gate in an SSD worktree) before blaming a branch
- 2026-10-21: `helm run --review` failed on a repo with no git remote (sidekick) -> dispatch the review as a normal read-only `helm run` whose brief says `git diff main helm/<id>`, no edits
- 2026-10-21: twice committed with failing tests because `unittest ... | tail -1 && git commit` takes tail's exit code -> write test output to a file, capture `rc=$?`, commit only on `[ $rc -eq 0 ]`; and `git status` the worktree before merging so uncommitted fixes aren't left behind
- 2026-10-22: a new e2e test sent a reply on the shared seeded card (blocking later seeds), and the UI change created drafts on render so resync kept deleted cards; both only showed in the full Playwright run -> run the whole e2e suite (free port if 8793 is taken), and baseline main before blaming flakes
- 2026-10-22: a "protected paths" denylist for agent self-shipping missed the files that wire the gates (routines.py, sandbox.py, routine frontmatter `command:`); an automated review caught it in 3 rounds -> for unattended self-modification start from a fail-closed allowlist of non-executable files, and treat config-in-markdown (frontmatter) as code
- 2026-10-22: a worker's download code passed mocked tests but Discord's CDN 403s urllib's default user agent -> run every real network path once live (temp home) before merging
- 2026-10-23: npm ci fails in qwork worktrees on the @qubit/rail git dep (edgesOut) -> symlink or copy the main checkout's node_modules, and add new deps there via a temp npm install + copy
- 2026-10-24: R1 screenshots in artifacts/ were committed and merged (#173) and design CSS added under docs/ blew the CSS budget for every branch -> gitignore artifacts/ and skip docs/ in budgets before dispatching UI tickets that save screenshots
- 2026-10-24: 11 parallel group workers each produced in-scope slides that passed every check but were small-type and top-heavy; only the contact-sheet look caught it -> encode visual rules as a hard gate (e.g. min font px in the render check) before fanning out, and eyeball the first wave's contact sheets before dispatching the rest
- 2026-10-24: gated the v3 kit PR on lib+cli tests only and broke two app/ component tests (theme colour, description) -> run the full non-browser suite (lib cli app) on any theme/kit change
- 2026-10-24: fixers gamed a painted-area gate by shrinking charts, then broke marimekko/treemap encodings to cut ink -> every measured rule needs a counter-metric (extent vs density) and data-encoding exemptions; eyeball the first fixed group before/after before fanning out the rest
- 2026-10-24: mid-run, launchd stopped answering this login (`launchctl managername` fails, "Reentrancy avoided", system DNS down) so Chrome SIGABRTed and four workers stalled asking for a "quiet host" -> when workers report browser unavailable, run `launchctl managername` and a bare headless Chrome first; if launchd is broken, take over non-browser checks and ask Nick to reboot
- 2026-10-25: 5 parallel qwork workers ran browser suites (load 50-90) and wedged launchd again. I also made a node_modules symlink in a worktree and `helm pr` committed it, which broke main's node_modules on pull -> at most 2 browser-verifying workers at once; delete worktree symlinks before `helm pr`; clear orphaned test runners by ppid 1 only (`pkill -f "node \(vitest"` killed my own gate)
- 2026-10-26: handed branches to a cloud session after a review round, but the review-fix commits were still only local, so it merged the pre-fix heads and I had to port 3 fixes in a follow-up PR -> push every head (and re-push after fixes) before any handover, and say in the handoff which commit is reviewed
- 2026-10-26: briefed a Reddit connector on public JSON; Reddit 403s every JSON/RSS endpoint from the Mac mini (even fetch inside Chrome) and the worker shipped hand-made fixtures that hid it -> curl/probe the live transport yourself before briefing any new connector, and demand recorded real responses, not hand-written fixtures
- 2026-10-26: helm worktrees and `git diff main` use the repo's local main, which stayed at the old commit after `gh pr merge`, so diffs showed already-merged work -> `git merge --ff-only origin/main` in the main checkout after every merge, and diff workers against origin/main
- 2026-10-26: codex runs exited 1 with no provider error after ~2 min (twice), leaving resolved-but-uncommitted work; `helm run --review` needs the branch on the remote -> on a silent codex exit, `git status` the worktree and take over rather than re-run; push the branch before a review run (or use `codex exec -s read-only -o file` directly)
- 2026-10-27: a codex review sat 2.5h at 0% CPU with no output while another session merged a stricter fix for the same bug (#235), making my PR redundant -> run every `codex exec` under a watchdog (kill after 15 min), and `git fetch` + check main for overlapping fixes before reviewing or merging a bug PR
- 2026-10-27: two QA auditors drove the iPhone and iPad simulators at once and Maestro's drivers kept dying; separately, a parallel session merged 18 qwork PRs mid-sweep and the build under test drifted -> run sim-driving workers one at a time, and pin QA to a built commit (record the SHA in the findings) so a later session can re-check what is stale
- 2026-10-27: ran `helm clean` with no ids to tidy up and it removed 107 finished worktrees, including other sessions' runs -> always pass your own ids to `helm clean`
- 2026-10-27: colour/motion passes (press `transform`, `@starting-style` entrances) broke geometry journeys that measured mid-animation or tapped a scaling tile -> brief visual workers to never scale elements that zoom/drag, and have tests await `getAnimations()` before measuring
- 2026-10-27: a worker built a pre-hydration click overlay for a "slow cold click" that a corrected timing script showed was 6 ms on main -> fix the measurement first and baseline main with it before building a perf fix
- 2026-10-28: 4 parallel qwork workers (next build + tsc + browser suites) plus other sessions drove load to ~480 on the 16GB mini; Claude Code reaped my `helm wait` watchers for low memory and the box rebooted overnight -> cap at 2 build/browser workers on this machine across all sessions, check `uptime` before each dispatch
- 2026-10-28: `helm pr` printed nothing and a chained `gh pr list --head` returned empty, so edit/merge ran against `main` and `helm clean` in the same chain removed the worktree before anything was pushed (the local branch survived) -> run `helm pr` alone, confirm the PR URL, then edit and merge in later calls; never put `helm clean` in the same chain as a PR step
- 2026-10-28: qwork briefs' verify ran `lib cli app` but not `e2e/journeys`, so 4 journey regressions reached review; later `git merge -q origin/main` hid a conflict and a full gate ran against conflict markers (103 files "failed") -> put `e2e/journeys` in every qwork verify command, and after any merge check `git diff --name-only --diff-filter=U` before gating
- 2026-10-28: workers stopped twice asking to "expand scope" over full-suite failures that were host-load flakes (main failed 19-42 tests in the same window) -> tell workers to run only touched files plus their journeys, and run the full gate yourself on a quiet host, baselining any failing file on origin/main 2-3 times
- 2026-10-28: a backgrounded `codex exec` review sat 15 min on "Reading additional input from stdin..." until the watchdog killed it -> always run `codex exec ... < /dev/null` outside a TTY
- 2026-10-28: a 5-slice UI redesign (qWork floating comments) had every slice green on its touched browser files, yet the full suite on the release branch showed 47 failures (35 real) in journeys nobody touched, which still asserted the old flows -> for redesigns that change shared flows, baseline the full browser suite against main after the first two slices merge, not only at the end, and have briefs grep e2e/ for the selectors and labels they change
- 2026-10-31: a qwork release passed typecheck, every vitest suite and next build, then failed the prod deploy because a convex/ module imported lib code that dynamically imports node-only scripts (esbuild); none of the local gates bundle Convex -> add `npx convex deploy --dry-run --yes` to the release gate for any repo deploying Convex, and keep node-only code out of lib/ that convex/ imports
- 2026-11-01: a worker swapping qwork's rail dependency hit the expected mid-refactor type errors, rolled everything back and reported "failed" -> when a brief removes an API in steps, say outright that breakage mid-way is expected and the job is to work through it without restoring
- 2026-11-01: Vercel sensitive env vars pull as empty strings, so QOS's qWork agent key couldn't be read for a live subscribe -> rotate the agent key as its owner (`npx convex run --prod agents:rotateKey --identity '{"subject":…,"email":…}'`), set it on Vercel and redeploy, then keep a 600-mode copy in `~/.config/<app>/`
- 2026-11-04: four live dry runs of a wiki-hygiene job called qwiki `lint` per folder, whose body checks read up to 300 pages each from GitHub; qwiki's GitHub token hit its rate limit (health 403) and every agent's wiki reads failed for the hour -> before a live run against a shared service, count the upstream calls it fans out to (and the service's own quota), use index-only paths, and run once, not in a loop
- 2026-11-05: ran the full qwork vitest suite (lib, cli, app, convex in one process) while a codex worker ran its own tests; the mini rebooted, killing the worker mid-edit and wiping the /private/tmp scratchpad (briefs lost) -> keep briefs in a persistent dir (e.g. `~/code/<repo>-wt/briefs/`), run gates in chunks (convex, then non-browser app/lib with `--exclude "**/*.browser.test.ts"`, then only touched browser files with `--no-file-parallelism`), and commit worker WIP before re-dispatching with the WIP branch as base
- 2026-11-05: a qwork merge to main (#437) silently got no Vercel deployment while the four before it did -> after each merge check `gh api repos/<o>/<r>/deployments` for the merge SHA; if missing after ~2 min, run `vercel --prod --yes` from a clean, up-to-date main checkout
- 2026-11-05: `f=$(grep ... --include=*.ts)` hit zsh "no matches found", left $f empty, and `npx vitest run $f` ran the whole suite (the reboot trigger) -> never pass a computed file list to vitest without `[ -n "$f" ]`, avoid `--include=*.x` globs in zsh (use `grep -rl ... | grep '\.browser\.test\.ts$'`), and use `${=f}` to split
- 2026-11-05: a merged PR added a dep (fflate) and every other open qwork worktree then failed 100+ convex tests ("Cannot find package") because actions load that module; and `cp -R pkg wt/node_modules/` into a worktree with no node_modules made node_modules a copy of the package -> after merging a new dep, `npm install --no-save <pkg>@<lock version>` in the main checkout and copy it into each live worktree's real node_modules (check `[ -d node_modules ]` first); for `next build` use a real copy (`rsync -a`), Turbopack rejects symlinks
- 2026-11-05: a brief said "P opens ink" without checking existing shortcuts; the worker removed P = Present, and an added toolbar row shifted the deck layout (caught only by unrelated journeys) -> grep the keydown handlers before assigning a key in a brief, and always run `slide-editor-d1` + `phone-gestures` journeys for any deck-shell UI change
- 2026-11-05: workers built "fail closed" and "cancel guard" changes that read unbounded tables per call (all runs of an agent per write) and would have blocked a live agent forever after one Stop -> for any guard on a hot path, ask "how many rows does this read in a year" and "what does a live caller that never sends the new field see", and bound both before merging
- 2026-11-05: `helm steer` refuses while a run is still working, so my own QA findings had to wait; separately, a worker's "4 sorter columns" fix passed its test at 1366-1920px but kept a 264px thumb cap, so wide screens showed a small centred grid -> write mid-run findings to a briefs file and steer once the run is done; check every layout fix on prod at Nick's real viewport (1819px+), and assert size as well as count
