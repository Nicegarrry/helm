# Helm v5

Read `README.md`, then `skills/helm/SKILL.md` for the process.

- Markdown is the code. Before adding TypeScript, ask: could a skill or an agent prompt plus an
  agent turn do this? If yes, write markdown.
- Every external interface is a file in `connectors/`. Core code (`cli.ts`, `watcher.ts`,
  `lib.ts`) does not call outside services directly.
- No gates, spend control, permissions or sandboxes on workers. They run with full access; the
  rules they follow are in `agents/*.md`. The one exception is `helm land`, which checks a PR
  before the orchestrator's merge.
- Credentials live in `~/.helm/.env`, Pi's `auth.json`, `codex login` and `gh`. Never in the repo.
- Keep it small. Cut before adding.
