import { agents, routes } from "@shared/schema";
import type { Agent, InsertAgent, Route, InsertRoute } from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

// Bootstrap schema (drizzle-kit not available at runtime in the sandbox).
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    protocol TEXT NOT NULL,
    capabilities_json TEXT NOT NULL,
    base_price_usd REAL NOT NULL,
    base_latency_ms INTEGER NOT NULL,
    reputation_score REAL NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS routes (
    id TEXT PRIMARY KEY,
    intent TEXT NOT NULL,
    selected_agent_id TEXT NOT NULL,
    cost_usd REAL NOT NULL,
    latency_ms INTEGER NOT NULL,
    success INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
`);

export const db = drizzle(sqlite);

export interface IStorage {
  listAgents(): Agent[];
  getAgent(id: string): Agent | undefined;
  upsertAgent(agent: InsertAgent): Agent;
  updateReputation(id: string, newScore: number): void;
  recordRoute(r: InsertRoute): Route;
  recentRoutes(limit?: number): Route[];
}

class DatabaseStorage implements IStorage {
  listAgents(): Agent[] {
    return db.select().from(agents).all();
  }
  getAgent(id: string): Agent | undefined {
    return db.select().from(agents).where(eq(agents.id, id)).get();
  }
  upsertAgent(a: InsertAgent): Agent {
    const existing = this.getAgent(a.id);
    if (existing) {
      return db
        .update(agents)
        .set(a)
        .where(eq(agents.id, a.id))
        .returning()
        .get();
    }
    return db.insert(agents).values(a).returning().get();
  }
  updateReputation(id: string, newScore: number): void {
    db.update(agents)
      .set({ reputationScore: newScore })
      .where(eq(agents.id, id))
      .run();
  }
  recordRoute(r: InsertRoute): Route {
    return db.insert(routes).values(r).returning().get();
  }
  recentRoutes(limit = 20): Route[] {
    return db.select().from(routes).orderBy(desc(routes.createdAt)).limit(limit).all();
  }
}

export const storage = new DatabaseStorage();

// ---------------------------------------------------------------------------
// Seed — idempotent. Inserts the three demo agents if the table is empty.
// Reputation scores reflect ~15 prior successful completions each.
// ---------------------------------------------------------------------------
export function seedIfEmpty() {
  const existing = storage.listAgents();
  if (existing.length > 0) return;

  storage.upsertAgent({
    id: "ag_sirius_summarizer",
    name: "Sirius Summarizer",
    protocol: "A2A",
    capabilitiesJson: JSON.stringify(["summarization", "english", "text"]),
    basePriceUsd: 0.08,
    baseLatencyMs: 4000,
    reputationScore: 0.94,
    description: "Distills long-form text into tight bullet points. Haiku-class latency.",
    model: "claude_haiku_4_5",
  });

  storage.upsertAgent({
    id: "ag_vega_researcher",
    name: "Vega Researcher",
    protocol: "MCP",
    capabilitiesJson: JSON.stringify(["research", "analysis", "english", "reasoning"]),
    basePriceUsd: 0.35,
    baseLatencyMs: 11000,
    reputationScore: 0.88,
    description: "Structured research answers with cited reasoning. Sonnet-class depth.",
    model: "claude_sonnet_4_6",
  });

  storage.upsertAgent({
    id: "ag_rigel_translator",
    name: "Rigel Translator",
    protocol: "x402",
    capabilitiesJson: JSON.stringify(["translation", "multilingual", "english", "spanish", "japanese"]),
    basePriceUsd: 0.05,
    baseLatencyMs: 3000,
    reputationScore: 0.91,
    description: "Low-cost bidirectional translation across en/es/ja.",
    model: "gpt5_mini",
  });
}
