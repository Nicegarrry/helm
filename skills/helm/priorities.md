# Priorities: who does the work, on what, at what price

Nick edits this file. When it disagrees with a skill, this file wins.

## 1. Harness order

Use the first one that fits the work and has window left.

1. **Claude, yourself (orchestrator).** Scoping, planning, review judgement and decisions.
   Also any change under ~200 lines: writing the brief and checking a worker costs more.
2. **Codex CLI** (`codex/<model>[:effort]`): ChatGPT subscription, $0 marginal. First choice
   for builders and reviewers while its 5-hour and weekly windows have room.
3. **Pi on OpenCode Go** (`opencode-go/<model>`): flat subscription. Default for open models,
   and when Codex is out of window.
4. **Pi on OpenRouter** (`openrouter/<vendor>/<model>`): pay per token. Only when OpenCode Go
   is down, rate-limited, or doesn't have the model.
5. **Other Pi providers** (`google/<model>` etc.): pay per token. Only for a model family the
   lanes above don't have, usually to get a cross-family reviewer.

## 2. Pricing

| Lane | What you pay | Limits |
| --- | --- | --- |
| Claude Code | Nick's Claude plan | Usage limits; your context is the scarcest thing in the loop |
| Codex | ChatGPT plan, $0 per run | 5-hour and weekly usage windows |
| OpenCode Go | $10/month ($5 first month) | Usage limits; cheaper models stretch further |
| OpenRouter | Per token, from Nick's credit | Credit balance |

List prices per 1M tokens, input / output, from Pi 0.85.1's catalog (2026-10-12). On OpenCode Go
these show how fast a model uses up the plan; on OpenRouter they are what you pay.

| Model | OpenCode Go | OpenRouter | Context |
| --- | --- | --- | --- |
| glm-5.3-flash | $0.08 / $0.25 | $0.08 / $0.25 | 1M |
| qwen3.8-flash | $0.15 / $0.47 | $0.15 / $0.47 | 1M |
| deepseek-v4-flash | $0.22 / $0.66 | $0.09 / $0.17 | 1M |
| deepseek-v4-pro | $0.66 / $1.98 | $0.89 / $1.78 | 1M |
| kimi-k2.7-code | $0.95 / $4.00 | $0.66 / $3.40 | 262k |
| kimi-k2.6 | $0.95 / $4.00 | $0.95 / $4.00 | 262k |
| glm-5.3 | $1.40 / $4.40 | $1.40 / $4.40 | 1M |
| qwen3.8-max | $2.00 / $6.00 | not listed | 1M |
| kimi-k3 | $3.00 / $15.00 | $3.00 / $15.00 | 1M |
| gemini-3.8-flash (`google/`) | n/a | $0.75 / $3.75 direct | 1M |

Prices and IDs drift. Check with `helm models` and the provider's site before relying on them.

## 3. Rules

- Cheapest model that gets it right first time beats the cheapest model. A failed run is not free.
- Builder and reviewer come from different model families (vendor, not lane).
- A ticket has to fit one worker run in one context, using no more than half the model's window
  (~500k tokens on a 1M model, ~130k on a 262k model). If it won't, split the issue.
- A 429, quota, billing or auth error is a fact: report it verbatim and drop to the next lane.
  Don't retry in a loop.
- Free models (`:free` on OpenRouter) only ever see synthetic content, never Nick's code.
- No purchases, top-ups, plan changes or account changes. Tell Nick instead.
