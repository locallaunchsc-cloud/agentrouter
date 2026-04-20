import type { Agent, ScoredCandidate } from "@shared/schema";

export const SCORING_WEIGHTS = {
  capability: 0.35,
  price: 0.2,
  latency: 0.15,
  reputation: 0.3,
} as const;

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const A = new Set(a.map((s) => s.toLowerCase().trim()));
  const B = new Set(b.map((s) => s.toLowerCase().trim()));
  let inter = 0;
  A.forEach((x) => {
    if (B.has(x)) inter += 1;
  });
  const union = new Set([...A, ...B]).size;
  return union === 0 ? 0 : inter / union;
}

/**
 * Keyword fallback match when the caller didn't supply capability_tags.
 * We scan the intent for domain tokens and infer overlap with the agent's
 * declared capabilities. This keeps the router useful for freeform intents.
 */
function inferCapabilityMatch(intent: string, capabilities: string[]): number {
  const i = intent.toLowerCase();
  const signals: Record<string, string[]> = {
    summarization: ["summariz", "summary", "summarise", "tl;dr", "condense", "bullet"],
    translation: ["translat", "in spanish", "in japanese", "to japanese", "to spanish", "to english", "en español", "日本語"],
    research: ["research", "who are", "what companies", "investors in", "analyze", "explain", "compare", "market", "funds"],
    analysis: ["analyze", "analys", "compare", "evaluate"],
    multilingual: ["spanish", "japanese", "english", "español", "日本"],
    english: [" the ", " a ", "english"],
  };
  let hits = 0;
  let possible = 0;
  for (const cap of capabilities) {
    const keywords = signals[cap.toLowerCase()];
    if (!keywords) continue;
    possible += 1;
    if (keywords.some((k) => i.includes(k))) hits += 1;
  }
  if (possible === 0) {
    // No known signals mapped — give a neutral-low baseline so ties break on rep/price.
    return 0.2;
  }
  return hits / possible;
}

function priceFit(basePrice: number, budget: number): number {
  if (budget <= 0) return 0;
  if (basePrice > budget) return 0;
  const target = budget * 0.7;
  if (basePrice <= target) return 1;
  // Linear falloff from 1 at `target` to 0 at `budget`.
  return Math.max(0, 1 - (basePrice - target) / (budget - target));
}

function latencyFit(baseLatency: number, max: number): number {
  if (max <= 0) return 0;
  if (baseLatency > max) return 0;
  const target = max * 0.5;
  if (baseLatency <= target) return 1;
  return Math.max(0, 1 - (baseLatency - target) / (max - target));
}

export interface ScoreInput {
  intent: string;
  capability_tags: string[];
  budget_usd: number;
  max_latency_ms: number;
}

export function scoreAgent(agent: Agent, req: ScoreInput): ScoredCandidate {
  const caps: string[] = (() => {
    try {
      const parsed = JSON.parse(agent.capabilitiesJson);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();

  const capMatch =
    req.capability_tags.length > 0
      ? jaccard(req.capability_tags, caps)
      : inferCapabilityMatch(req.intent, caps);

  const pf = priceFit(agent.basePriceUsd, req.budget_usd);
  const lf = latencyFit(agent.baseLatencyMs, req.max_latency_ms);
  const rep = agent.reputationScore;

  const score =
    SCORING_WEIGHTS.capability * capMatch +
    SCORING_WEIGHTS.price * pf +
    SCORING_WEIGHTS.latency * lf +
    SCORING_WEIGHTS.reputation * rep;

  const reasons: string[] = [];
  reasons.push(
    capMatch >= 0.66 ? "match:high" : capMatch >= 0.33 ? "match:partial" : capMatch > 0 ? "match:low" : "match:none",
  );
  reasons.push(pf >= 0.9 ? "price:good" : pf > 0 ? "price:tight" : "price:over-budget");
  reasons.push(lf >= 0.9 ? "latency:ok" : lf > 0 ? "latency:slow" : "latency:over-slo");
  reasons.push(`rep:${rep.toFixed(2)}`);

  return {
    id: agent.id,
    name: agent.name,
    protocol: agent.protocol,
    capability_match: round3(capMatch),
    price_fit: round3(pf),
    latency_fit: round3(lf),
    reputation: round3(rep),
    score: round3(score),
    price_usd: agent.basePriceUsd,
    expected_latency_ms: agent.baseLatencyMs,
    reasons,
  };
}

export function rankAgents(all: Agent[], req: ScoreInput): ScoredCandidate[] {
  const scored = all.map((a) => scoreAgent(a, req));
  // Filter out fully disqualified candidates (zero capability OR over hard caps).
  const eligible = scored.filter(
    (c) => c.capability_match > 0 && c.price_fit > 0 && c.latency_fit > 0,
  );
  eligible.sort((a, b) => b.score - a.score);
  return eligible.slice(0, 5);
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}
