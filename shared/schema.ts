import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ---------------------------------------------------------------------------
// agents — registry of in-process agents across simulated protocols.
// capabilities_json is a JSON-encoded string[] (SQLite lacks array columns).
// ---------------------------------------------------------------------------
export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  protocol: text("protocol").notNull(), // A2A | MCP | ACP | UCP | AP2 | x402
  capabilitiesJson: text("capabilities_json").notNull(),
  basePriceUsd: real("base_price_usd").notNull(),
  baseLatencyMs: integer("base_latency_ms").notNull(),
  reputationScore: real("reputation_score").notNull(),
  description: text("description").notNull().default(""),
  model: text("model").notNull().default(""),
});

// ---------------------------------------------------------------------------
// routes — ledger of completed routing decisions.
// ---------------------------------------------------------------------------
export const routes = sqliteTable("routes", {
  id: text("id").primaryKey(),
  intent: text("intent").notNull(),
  selectedAgentId: text("selected_agent_id").notNull(),
  costUsd: real("cost_usd").notNull(),
  latencyMs: integer("latency_ms").notNull(),
  success: integer("success", { mode: "boolean" }).notNull(),
  createdAt: text("created_at").notNull(),
});

export const insertAgentSchema = createInsertSchema(agents);
export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agents.$inferSelect;

export const insertRouteSchema = createInsertSchema(routes);
export type InsertRoute = z.infer<typeof insertRouteSchema>;
export type Route = typeof routes.$inferSelect;

// API request/response shapes.
export const routeRequestSchema = z.object({
  intent: z.string().min(1),
  input: z.union([z.string(), z.record(z.any())]).optional(),
  budget_usd: z.number().positive().default(0.5),
  max_latency_ms: z.number().int().positive().default(15000),
  capability_tags: z.array(z.string()).default([]),
});

export type RouteRequest = z.infer<typeof routeRequestSchema>;

export interface ScoredCandidate {
  id: string;
  name: string;
  protocol: string;
  capability_match: number;
  price_fit: number;
  latency_fit: number;
  reputation: number;
  score: number;
  price_usd: number;
  expected_latency_ms: number;
  reasons: string[];
}

export interface RouteResponse {
  route_id: string;
  selected_agent: {
    id: string;
    name: string;
    protocol: string;
    reputation_score: number;
    price_usd: number;
    expected_latency_ms: number;
  };
  candidates: ScoredCandidate[];
  output: string;
  latency_ms: number;
  cost_usd: number;
  completed_at: string;
  reputation_delta: { agent_id: string; old: number; new: number };
  scoring_weights: { capability: number; price: number; latency: number; reputation: number };
}
