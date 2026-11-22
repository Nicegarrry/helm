# Lanes: who does the work, on what

Nick edits this file. When it disagrees with a skill, this file wins.

## Lane order and default models

Take the first lane that has room. One default model per lane: use it for every ticket, builder
or reviewer. Do not pick tiers per ticket.

| # | Lane | Default model | Pays with |
| --- | --- | --- | --- |
| 0 | You, the orchestrator | n/a | Claude plan. Scoping, planning, review judgement, decisions, and any change under ~200 lines |
| 1 | Codex | `codex/gpt-6.2-sol:high` | ChatGPT plan, $0 per run; 5-hour and weekly windows |
| 2 | agy (Antigravity) | `agy/gemini-4-neon-medium` | Antigravity plan |
| 3 | OpenRouter | `openrouter/~deepseek/deepseek-v4-flash-latest` | Per token, from Nick's credit. Read spend before and after a wave (below) |
| 4 | Claude subagent | `model: sonnet`, or a Workflow when Nick asked for one | Claude plan. Last fallback, or a ticket that needs the session's tools |

- Pi is only the harness helm uses to run OpenRouter models. It ships inside helm
  (`node_modules/.bin/pi`), so it is not on `PATH` and needs no setup: the OpenRouter lane is open
  whenever `helm env` shows `OPENROUTER_API_KEY` set. Ignore `pi: no models with credentials`
  from `helm models <provider>`.
- The OpenRouter default is an alias that tracks the newest DeepSeek flash, so it needs no updates.
- If a default stops resolving, `helm models --all` lists current ids (plain `helm models` hides
  some agy and Codex ones). Update this table.
- Avoid `agy/claude-*`: Anthropic models cannot review your work and spend the same family.

## Reviewer

A different family from the builder. Codex builds: review on agy. agy or OpenRouter builds:
review on Codex. Same default models.

## OpenRouter spend

Before and after a wave on the OpenRouter lane, read `usage` (USD) and put the difference in the PR:

```bash
set -a; . ~/.helm/.env; set +a
curl -s -H "Authorization: Bearer $OPENROUTER_API_KEY" https://openrouter.ai/api/v1/key | jq .data.usage
```

## Rules

- A ticket fits one worker run, using no more than half the model's context window. If it won't, split it.
- A 429, quota, billing, auth error or login prompt is a fact: quote it once and drop to the next
  lane. Don't retry in a loop.
- Free models (`:free` on OpenRouter) never see Nick's code.
- No purchases, top-ups, plan changes or account changes. Tell Nick instead.
