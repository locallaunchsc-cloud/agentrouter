/**
 * In-process agents behind simulated protocol wrappers.
 * Each agent exposes execute(intent, input) -> string, backed by a real LLM call.
 *
 * We simulate the protocol layer (A2A, MCP, x402) as an adapter around the
 * same function surface — in a real system each would own its own transport
 * (JSON-RPC, MCP tool calls, HTTP 402 + payment handshake, etc.).
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

const anthropic = new Anthropic();
const openai = new OpenAI();

export interface AgentRuntime {
  id: string;
  execute: (intent: string, input?: string | Record<string, unknown>) => Promise<string>;
}

function asText(input?: string | Record<string, unknown>): string {
  if (!input) return "";
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

// ---------- Sirius Summarizer (A2A, claude_haiku_4_5) -----------------------
async function siriusExecute(intent: string, input?: string | Record<string, unknown>): Promise<string> {
  const text = asText(input) || intent;
  const res = await anthropic.messages.create({
    model: "claude_haiku_4_5",
    max_tokens: 600,
    system:
      "You are Sirius, a terse summarization agent. Return exactly 3 bullet points (each starting with '• '). No preamble, no headings. Keep each bullet under 25 words.",
    messages: [
      {
        role: "user",
        content: `Intent: ${intent}\n\nContent to summarize:\n${text}`,
      },
    ],
  });
  // anthropic response shape: content is an array of blocks.
  const block = res.content.find((b) => b.type === "text") as
    | { type: "text"; text: string }
    | undefined;
  return block?.text?.trim() ?? "";
}

// ---------- Vega Researcher (MCP, claude_sonnet_4_6) -----------------------
async function vegaExecute(intent: string, input?: string | Record<string, unknown>): Promise<string> {
  const extra = asText(input);
  const res = await anthropic.messages.create({
    model: "claude_sonnet_4_6",
    max_tokens: 900,
    system:
      "You are Vega, a research agent. Deliver a structured short-form research answer with: 1) Direct answer (2-3 sentences). 2) Key factors (3-5 bullets). 3) Caveats. You are answering from training knowledge — do not claim live web access. Be precise, cite general sources inline where natural (e.g. 'per SEC filings').",
    messages: [
      {
        role: "user",
        content: extra ? `${intent}\n\nContext:\n${extra}` : intent,
      },
    ],
  });
  const block = res.content.find((b) => b.type === "text") as
    | { type: "text"; text: string }
    | undefined;
  return block?.text?.trim() ?? "";
}

// ---------- Rigel Translator (x402, gpt5_mini) -----------------------------
async function rigelExecute(intent: string, input?: string | Record<string, unknown>): Promise<string> {
  const text = asText(input) || intent;
  // OpenAI proxy only supports the Responses API.
  const res = await openai.responses.create({
    model: "gpt5_mini",
    input: `You are Rigel, a precise translator between English, Spanish, and Japanese. Detect source language and target language from the user's instruction. Return ONLY the translated text — no quotes, no commentary, no romaji unless explicitly asked.

Instruction: ${intent}

Text to translate:
${text}`,
  });
  // The Responses API exposes a convenience accessor.
  const out = (res as unknown as { output_text?: string }).output_text;
  if (typeof out === "string" && out.trim().length > 0) return out.trim();
  // Fallback: walk the output array.
  const outputs = (res as unknown as { output?: Array<{ content?: Array<{ text?: string }> }> }).output ?? [];
  for (const item of outputs) {
    for (const c of item.content ?? []) {
      if (c.text) return c.text.trim();
    }
  }
  return "";
}

export const agentRuntimes: Record<string, AgentRuntime> = {
  ag_sirius_summarizer: { id: "ag_sirius_summarizer", execute: siriusExecute },
  ag_vega_researcher: { id: "ag_vega_researcher", execute: vegaExecute },
  ag_rigel_translator: { id: "ag_rigel_translator", execute: rigelExecute },
};
