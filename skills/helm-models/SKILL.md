---
name: helm-models
description: Use when choosing a model for a `helm run` builder or reviewer, when a lane is rate-limited or out of subscription window, when a model keeps failing a ticket, or when checking the cross-family review rule. Covers lanes, difficulty tiers, cost and the reviewer pairing.
---

# Helm models

## Purpose
Pick the cheapest model that will get a ticket right first time, on a lane Nick is already
paying for, and a reviewer from a different family.

## Inputs
- The ticket's size and difficulty (`helm-plan`).
- What is available today: `helm models`. Model IDs below drift; verify them there.

## Lanes

| Lane | Model string | Runs on | Cost |
| --- | --- | --- | --- |
| Codex | `codex/<model>[:<effort>]` | Codex CLI, Nick's ChatGPT subscription | $0 marginal, 5-hour and weekly windows |
| OpenCode Go | `opencode-go/<model>` | Pi, OpenCode Go subscription | Flat fee; the preferred cheap lane |
| OpenRouter | `openrouter/<vendor>/<model>` | Pi, pay per token | Fallback when OpenCode Go fails or lacks the model |
| Other Pi providers | `google/<model>` etc. | Pi, provider's own billing | Use for a family the other lanes don't have |
| You | Claude, the orchestrator | Claude Code | The expensive top tier |

Order of preference: a subscription lane with window left (Codex, OpenCode Go), then
OpenRouter or another pay-per-token provider.

## Tiers by difficulty
Seeded from the old Helm routing table and Pi 0.85.1's `opencode-go` catalog (2026-10-12).
All IDs drift: verify with `helm models` (`helm models opencode-go --all` lists the whole catalog).
Pi models take an optional thinking level: `opencode-go/kimi-k3:high`.

| Tier | Work | Candidates, cheapest first |
| --- | --- | --- |
| 1 | Mechanical: rename, small test, config, docs, clear one-file fix | `opencode-go/qwen3.8-flash`, `opencode-go/deepseek-v4-flash`, `opencode-go/glm-5.3-flash`, `codex/gpt-6-luna:medium` |
| 2 | Small feature or bug in known code, a few files | `opencode-go/kimi-k2.7-code`, `opencode-go/deepseek-v4-pro`, `codex/gpt-6-luna:high`, `google/gemini-3.8-flash` |
| 3 | Multi-file change, unfamiliar code, tricky tests | `opencode-go/glm-5.3`, `opencode-go/kimi-k2.6`, `codex/gpt-5.6-terra:high` |
| 4 | Concurrency, contracts, subtle state, hard debugging | `codex/gpt-6.1-sol:medium`, `opencode-go/kimi-k3`, `opencode-go/qwen3.8-max`, `codex/gpt-5.6-sol:medium` |
| 5 | Hardest work a worker should still attempt | `codex/gpt-6-astra:high`, `codex/gpt-6.1-sol:high` |
| Top | Scoping, planning, review judgement, decisions | You. Don't spend yourself on typing code a worker can type. |

When the same Codex model is listed at two efforts, try the lower effort first on easy work.
OpenRouter equivalents (`openrouter/qwen/...`, `openrouter/deepseek/...`) replace the
OpenCode Go entries when that lane is down.

## Steps
1. Size the ticket and pick its tier. When unsure, start one tier lower; a clean failure
   is cheap if the brief is good.
2. Take the first candidate in that tier on a lane with window left.
3. Pick the reviewer: a different family, at least the builder's tier. Family is the model
   vendor, not the lane: `opencode-go/qwen...` and `openrouter/qwen/...` are both Alibaba.
   Families: OpenAI (codex, gpt), Google (gemini), Alibaba (qwen), DeepSeek, Zhipu (glm),
   Moonshot (kimi), NVIDIA (nemotron), Anthropic (you).
   Default pairs: built on Codex, review on Gemini or an OpenCode Go model one tier up;
   built on an open model or Gemini, review on Codex.
4. If a run fails on difficulty, move up one tier. If it fails on a provider error (429,
   quota, billing, auth), report the error verbatim and switch lane; don't retry in a loop.

## Rules
- Free models (`:free` on OpenRouter) only ever see synthetic content, never Nick's code.
- No purchases, top-ups, plan changes or account changes to unblock a lane. Tell Nick.
- Codex windows are finite. When a window is spent, use OpenCode Go rather than waiting.

## Done when
- Builder and reviewer are chosen, from different families, on lanes that are up.

## Evals
Before dispatching, check against these. Fix and recheck if any fail.
- [ ] Reviewer and builder are the same vendor on different providers.
- [ ] A pay-per-token lane was used while a subscription lane had window left.
- [ ] A hard ticket went to tier 1 and failed twice before moving up.
- [ ] A model ID was used from this file without checking `helm models`.
- [ ] You did tier-1 work yourself.

## Learnings
After each run, append one line if you learned something: `- YYYY-MM-DD: what happened -> what to do differently`. Keep at most 20.
