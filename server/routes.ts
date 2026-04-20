import type { Express, Request, Response } from "express";
import type { Server } from "node:http";
import { storage, seedIfEmpty } from "./storage";
import { rankAgents, SCORING_WEIGHTS } from "./scoring";
import { agentRuntimes } from "./agents";
import { routeRequestSchema, type RouteResponse } from "@shared/schema";

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function emaReputation(prev: number, outcome: number): number {
  // EMA toward outcome (1.0 = success, 0.0 = failure). alpha = 0.3.
  return 0.7 * prev + 0.3 * outcome;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  seedIfEmpty();

  // ---- Public: list agents in the registry -------------------------------
  app.get("/api/agents", (_req: Request, res: Response) => {
    const list = storage.listAgents().map((a) => ({
      id: a.id,
      name: a.name,
      protocol: a.protocol,
      capabilities: safeParse<string[]>(a.capabilitiesJson, []),
      base_price_usd: a.basePriceUsd,
      base_latency_ms: a.baseLatencyMs,
      reputation_score: a.reputationScore,
      description: a.description,
      model: a.model,
    }));
    res.json({ agents: list });
  });

  // ---- Public: recent completed routes ------------------------------------
  app.get("/api/routes/recent", (_req: Request, res: Response) => {
    res.json({ routes: storage.recentRoutes(20) });
  });

  // ---- Score-only (no execution) — used by UI to render the candidate table
  //      before the (potentially slow) LLM call finishes.
  app.post("/api/score", (req: Request, res: Response) => {
    const parsed = routeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_request", detail: parsed.error.flatten() });
    }
    const body = parsed.data;
    const all = storage.listAgents();
    const candidates = rankAgents(all, {
      intent: body.intent,
      capability_tags: body.capability_tags,
      budget_usd: body.budget_usd,
      max_latency_ms: body.max_latency_ms,
    });
    res.json({
      candidates,
      scoring_weights: SCORING_WEIGHTS,
      selected_agent_id: candidates[0]?.id ?? null,
    });
  });

  // ---- The core: route an intent to the best-fit agent --------------------
  app.post("/api/route", async (req: Request, res: Response) => {
    const parsed = routeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_request", detail: parsed.error.flatten() });
    }
    const body = parsed.data;

    const all = storage.listAgents();
    const candidates = rankAgents(all, {
      intent: body.intent,
      capability_tags: body.capability_tags,
      budget_usd: body.budget_usd,
      max_latency_ms: body.max_latency_ms,
    });

    if (candidates.length === 0) {
      return res.status(422).json({
        error: "no_agent_matches",
        message:
          "No agent in the registry satisfies this intent within the provided budget + SLA.",
        scoring_weights: SCORING_WEIGHTS,
      });
    }

    const winner = candidates[0];
    const runtime = agentRuntimes[winner.id];
    if (!runtime) {
      return res.status(500).json({ error: "runtime_missing", agent_id: winner.id });
    }

    const started = Date.now();
    let output = "";
    let success = true;
    // infra_error = failure caused by our infrastructure (e.g. auth token expiry,
    // network blip). The agent itself didn't underperform, so reputation MUST NOT
    // be penalized — that would silently corrupt the ledger every time our creds
    // rotate. A real agent marketplace would treat infra errors the same way
    // Stripe treats processor errors: retry, surface to operator, don't charge.
    let infraError = false;
    try {
      output = await runtime.execute(body.intent, body.input);
      if (!output || output.trim().length === 0) {
        success = false;
        output = "(agent returned empty output)";
      }
    } catch (err: any) {
      success = false;
      const msg = err?.message ?? String(err);
      // Heuristic: upstream auth / rate-limit / 5xx = our infra, not agent fault.
      const status = err?.status ?? err?.response?.status;
      if (
        status === 401 ||
        status === 403 ||
        status === 429 ||
        (typeof status === "number" && status >= 500) ||
        /authentication|session token|api[_ ]key|rate limit|ECONNRESET|ETIMEDOUT/i.test(msg)
      ) {
        infraError = true;
      }
      output = `(execution error: ${msg})`;
    }
    const latencyMs = Date.now() - started;

    // Update reputation via EMA — only when the agent itself is accountable.
    const agentRow = storage.getAgent(winner.id)!;
    const oldRep = agentRow.reputationScore;
    let newRep = oldRep;
    if (!infraError) {
      newRep = Math.round(emaReputation(oldRep, success ? 1.0 : 0.0) * 10000) / 10000;
      storage.updateReputation(winner.id, newRep);
    }

    // Persist route.
    const routeId = newId("rt");
    const completedAt = new Date().toISOString();
    storage.recordRoute({
      id: routeId,
      intent: body.intent.slice(0, 500),
      selectedAgentId: winner.id,
      costUsd: winner.price_usd,
      latencyMs,
      success,
      createdAt: completedAt,
    });

    const resp: RouteResponse = {
      route_id: routeId,
      selected_agent: {
        id: winner.id,
        name: winner.name,
        protocol: winner.protocol,
        reputation_score: newRep,
        price_usd: winner.price_usd,
        expected_latency_ms: winner.expected_latency_ms,
      },
      candidates,
      output,
      latency_ms: latencyMs,
      cost_usd: winner.price_usd,
      completed_at: completedAt,
      reputation_delta: { agent_id: winner.id, old: round4(oldRep), new: newRep },
      scoring_weights: {
        capability: SCORING_WEIGHTS.capability,
        price: SCORING_WEIGHTS.price,
        latency: SCORING_WEIGHTS.latency,
        reputation: SCORING_WEIGHTS.reputation,
      },
    };
    return res.json(resp);
  });

  return httpServer;
}

function safeParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
