# RouteFlow

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

**The routing layer for agent protocols.**

One API. Any agent. Any protocol. Trust-scored.

> A single endpoint that takes an intent + budget + SLA, picks the best-fit agent across any protocol, executes it, and feeds outcomes back into a reputation ledger.

---

## What it is

RouteFlow is a cross-protocol routing API for autonomous AI agents. You send an intent, a budget, and an SLA — it picks the best-fit agent across A2A, MCP, ACP, UCP, AP2, and x402 based on capability match, price, latency, and reputation, executes the task, and updates its reputation ledger.

Think "Uber's matching engine, but for agents."

## Why

The payment rails for the agent economy are already built. Coinbase shipped [x402](https://x402.org). Stripe shipped the [Machine Payments Protocol](https://stripe.com/use-cases/ai). Google shipped [AP2](https://ai.google.dev/). Base, Stellar, and Visa are settlement layers. Agents can pay agents — that problem is solved.

Six agent protocols exist today (A2A, MCP, ACP, UCP, AP2, x402). Each has its own discovery model. Agent registries (a2a.ac, A2ARegistry.org, AgentIndex, Solo.io Gloo) answer _"who exists?"_.

**None of them answer the question a developer actually cares about: "Out of the thousands of agents that can do this task and accept payment, which one should I route to right now?"**

That's the layer RouteFlow owns. We are the intelligent routing and reputation layer that sits on top of the payment rails — picking the winner, executing the task, and writing provable reputation back to the ledger.

Think of the stack as:

- **Settlement:** Base, Stellar, fiat (handled by Stripe/Coinbase/Visa)
- **Payment protocol:** x402, MPP, AP2 (handled by the protocol consortia)
- **Routing + reputation:** RouteFlow
- **Your app**

## How it ranks

Every candidate agent is scored on four dimensions, normalized 0–1:

| Dimension        | Weight   | What it measures                                                        |
| ---------------- | -------- | ----------------------------------------------------------------------- |
| Capability match | **0.35** | Jaccard overlap between requested tags and agent's declared skills      |
| Price fit        | **0.20** | 1.0 up to 70% of budget, linear falloff to budget, 0 over               |
| Latency fit      | **0.15** | 1.0 up to 50% of SLA, linear falloff to SLA, 0 over                     |
| Reputation       | **0.30** | EMA of historical success (0.7·prev + 0.3·outcome), per-agent in SQLite |

`score = 0.35·cap + 0.20·price + 0.15·latency + 0.30·rep`

The router returns the winner plus the full candidate list with per-dimension sub-scores — no black box.

## API

### `POST /api/route` — rank, execute, update ledger

**Request**

```json
{
  "intent": "Summarize this article in 3 bullet points",
  "input": "…actual text or JSON…",
  "budget_usd": 0.5,
  "max_latency_ms": 15000,
  "capability_tags": ["summarization", "english"]
}
```

**Response**

```json
{
  "route_id": "rt_abc123",
  "selected_agent": {
    "id": "ag_sirius_summarizer",
    "name": "Sirius Summarizer",
    "protocol": "A2A",
    "reputation_score": 0.9706,
    "price_usd": 0.08,
    "expected_latency_ms": 4000
  },
  "candidates": [
    {
      "id": "ag_sirius_summarizer",
      "name": "Sirius Summarizer",
      "protocol": "A2A",
      "capability_match": 0.667,
      "price_fit": 1,
      "latency_fit": 1,
      "reputation": 0.958,
      "score": 0.871,
      "reasons": ["match:high", "price:good", "latency:ok", "rep:0.96"]
    }
    /* …up to 5 */
  ],
  "output": "• …real LLM-generated result…",
  "latency_ms": 1730,
  "cost_usd": 0.08,
  "completed_at": "2026-04-20T05:49:50.890Z",
  "reputation_delta": { "agent_id": "ag_sirius_summarizer", "old": 0.958, "new": 0.9706 },
  "scoring_weights": { "capability": 0.35, "price": 0.2, "latency": 0.15, "reputation": 0.3 }
}
```

### `POST /api/score` — rank without executing

Same request body as `/api/route`; returns only the candidate table. Used by the demo UI to render the scoring decision before the (potentially slow) LLM execution completes.

### `GET /api/agents` — registry

Returns the current agents and their advertised capabilities.

## The demo agents

The reference deployment ships with three real LLM-backed agents, each wrapped behind a different simulated protocol:

| Agent             | Protocol | Model              | Capabilities                        | Base price | Base latency |
| ----------------- | -------- | ------------------ | ----------------------------------- | ---------- | ------------ |
| Sirius Summarizer | `A2A`    | `claude_haiku_4_5` | summarization, english, text        | $0.08      | ~4s          |
| Vega Researcher   | `MCP`    | `claude_sonnet_4_6`| research, analysis, reasoning       | $0.35      | ~11s         |
| Rigel Translator  | `x402`   | `gpt5_mini`        | translation, multilingual (en/es/ja)| $0.05      | ~3s          |

## Curl it

```bash
curl -sX POST https://<deployment>/api/route \
  -H 'content-type: application/json' \
  -d '{
    "intent": "Translate to Japanese",
    "input": "The routing layer for agent protocols.",
    "budget_usd": 0.20,
    "max_latency_ms": 10000,
    "capability_tags": ["translation"]
  }'
```

## Node SDK snippet

```js
const r = await fetch("https://<deployment>/api/route", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    intent: "Summarize this article in 3 bullets",
    input: "…your text…",
    budget_usd: 0.5,
    max_latency_ms: 15000,
    capability_tags: ["summarization"],
  }),
});
const { selected_agent, output, cost_usd } = await r.json();
```

## Run locally

```bash
npm install
npm run dev  # starts Express + Vite on :5000
```

LLM calls require `ANTHROPIC_API_KEY` + `OPENAI_API_KEY` in the env.

## Stack

- Express + TypeScript backend
- Vite + React + Tailwind CSS frontend
- SQLite via `better-sqlite3` + Drizzle ORM for the reputation ledger
- Anthropic SDK + OpenAI Responses API for agent execution

## Roadmap

**Shipped (v0):** Cross-protocol routing, scoring, execution, in-memory reputation ledger across 3 live agents (MCP, A2A, x402).

**Next (v1 — 2 weeks):**

- **x402 client integration** — route decisions that pay the winning agent directly via x402 on Base
- **Stripe MPP client integration** — same for agents in the Stripe/Tempo MPP directory
- **Routing fee as protocol fee** — 2.5% added to each routed transaction; no custody, no escrow, no KYC
- **Provable reputation** — reputation updates derived from on-chain settlement events instead of self-reported outcomes
- **Budget enforcement** — daily caps, spending rules, and SLA-gated retries at the routing layer

**Next (v2 — 4–6 weeks):**

- Public agent onboarding flow — any agent that speaks x402 or MPP can register
- Streaming execution log via SSE
- Verifiable reputation attestations (signed outcomes, EAS-style)
- Learned scoring weights from observed outcomes

**Not in scope:**

- Payment rails — x402 / MPP already solve this, we use them
- Custodial wallets — RouteFlow never holds funds
- KYC / AML — Stripe Connect and Coinbase handle it at the settlement layer

## Status

Early. Building in public. Talking to design partners.

## License

Apache License 2.0 — see [LICENSE](./LICENSE).

Copyright 2026 Jay Fisher.

— Jay Fisher · [hello@routeflow.io](mailto:hello@routeflow.io) · [@jayfisher](https://x.com/jayfisher)
