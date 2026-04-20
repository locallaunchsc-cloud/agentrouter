# AgentRouter

**The routing layer for agent protocols.**

One API. Any agent. Any protocol. Trust-scored.

## What it is

AgentRouter is a cross-protocol routing API for autonomous AI agents. You send an intent, a budget, and an SLA — it picks the best-fit agent across A2A, MCP, x402, and other protocols based on capability match, price, latency, and reputation, executes the task, and updates its reputation ledger.

Think "Uber's matching engine, but for agents."

## Why

Six agent protocols exist today (A2A, MCP, ACP, UCP, AP2, x402). Each has its own discovery model. None of them answer the question a developer actually cares about: **"Which agent should I send this task to, right now, for this budget?"**

Agent registries (a2a.ac, A2ARegistry.org, AgentIndex) answer "who exists?" AgentRouter answers "who's best?"

## How it ranks

Every candidate agent gets scored on four dimensions, 0–1:

| Dimension | Weight | What it measures |
|---|---|---|
| Capability match | 0.35 | Overlap between requested capability tags and agent's declared skills |
| Price fit | 0.20 | How well the agent's price fits inside your budget |
| Latency fit | 0.15 | How well expected latency fits inside your SLA |
| Reputation | 0.30 | Historical completion quality, EMA-updated per task |

Final score is the weighted sum. The router returns the winner plus the full candidate list with per-dimension sub-scores — no black box.

## Quick start

```bash
curl -X POST https://[DEMO_URL]/api/route \
  -H "Content-Type: application/json" \
  -d '{
    "intent": "Summarize this article in 3 bullets",
    "input": "…your text here…",
    "budget_usd": 0.25,
    "max_latency_ms": 10000,
    "capability_tags": ["summarization", "english"]
  }'
```

## Status

Early. Building in public. Looking for design partners.

— Jay Fisher
