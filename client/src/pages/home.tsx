import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import type { RouteResponse, ScoredCandidate } from "@shared/schema";
import { Logo } from "@/components/Logo";

// ---------- preset intents --------------------------------------------------
type Preset = {
  key: string;
  label: string;
  intent: string;
  input: string;
  budget: number;
  latency: number;
  tags: string[];
};

const PRESETS: Preset[] = [
  {
    key: "summarize",
    label: "Summarize an article",
    intent: "Summarize this article in 3 bullet points",
    input:
      "The rise of agent-to-agent protocols in 2025 created a coordination problem. A2A from Google emphasizes JSON-RPC discovery. Anthropic MCP focuses on tool-level context. ACP, UCP, AP2, and x402 each carved out niches in payments, commerce, and capability discovery. None of them standardized how an orchestrator chooses among competing agents on price, latency, and trust. AgentRouter fills that gap by acting as a meta-router across all six protocols, scoring candidates on capability match, economic fit, latency SLA, and historical reputation, then executing the chosen agent and feeding outcomes back into a shared reputation ledger.",
    budget: 0.5,
    latency: 15000,
    tags: ["summarization", "english"],
  },
  {
    key: "translate",
    label: "Translate to Japanese",
    intent: "Translate the following English sentence into natural Japanese.",
    input: "The routing layer for agent protocols.",
    budget: 0.5,
    latency: 15000,
    tags: ["translation", "multilingual"],
  },
  {
    key: "research",
    label: "Research: fund A2A commerce startups",
    intent:
      "Which venture funds are actively backing A2A commerce and agentic payments infrastructure in 2025? List the most active firms with brief rationale.",
    input: "",
    budget: 0.8,
    latency: 20000,
    tags: ["research", "analysis"],
  },
  {
    key: "custom",
    label: "Custom…",
    intent: "",
    input: "",
    budget: 0.5,
    latency: 15000,
    tags: [],
  },
];

// ---------- helpers ---------------------------------------------------------
function fmtMoney(n: number) {
  return `$${n.toFixed(n < 1 ? 3 : 2)}`;
}
function fmtMs(n: number) {
  if (n < 1000) return `${n}ms`;
  return `${(n / 1000).toFixed(1)}s`;
}

// =============================================================================
export default function Home() {
  const [presetKey, setPresetKey] = useState<string>("summarize");
  const preset = PRESETS.find((p) => p.key === presetKey)!;

  const [intent, setIntent] = useState(preset.intent);
  const [inputText, setInputText] = useState(preset.input);
  const [budget, setBudget] = useState(preset.budget);
  const [latency, setLatency] = useState(preset.latency);
  const [tags, setTags] = useState<string[]>(preset.tags);

  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<RouteResponse | null>(null);
  const [pre, setPre] = useState<ScoredCandidate[] | null>(null); // pre-execution scoring preview
  const [error, setError] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [showSdk, setShowSdk] = useState(false);

  const demoRef = useRef<HTMLDivElement>(null);

  // When preset changes, reset all fields (unless custom).
  useEffect(() => {
    if (preset.key === "custom") return;
    setIntent(preset.intent);
    setInputText(preset.input);
    setBudget(preset.budget);
    setLatency(preset.latency);
    setTags(preset.tags);
    setResult(null);
    setPre(null);
    setLog([]);
    setError(null);
  }, [presetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const apiBase = (globalThis as any).__AR_API_BASE ?? "";

  async function runRoute() {
    if (loading) return;
    setLoading(true);
    setResult(null);
    setPre(null);
    setError(null);
    setLog([]);

    const body = {
      intent: intent.trim(),
      input: inputText.trim() ? inputText : undefined,
      budget_usd: budget,
      max_latency_ms: latency,
      capability_tags: tags,
    };

    try {
      pushLog("→ Opening routing session…");
      pushLog(`→ Candidate set: 3 agents across A2A, MCP, x402`);
      pushLog(
        `→ Scoring on capability · price · latency · reputation (weights 0.35 / 0.20 / 0.15 / 0.30)`,
      );

      // Pre-score so the UI shows the candidate table immediately, before the
      // (potentially slow) LLM execution completes.
      try {
        const sres = await apiRequest("POST", "/api/score", body);
        const sjson = (await sres.json()) as {
          candidates: ScoredCandidate[];
          selected_agent_id: string | null;
        };
        setPre(sjson.candidates);
        if (sjson.selected_agent_id) {
          const winner = sjson.candidates.find((c) => c.id === sjson.selected_agent_id);
          if (winner) {
            pushLog(
              `→ Selected <span class="tok-ok">${winner.name}</span> (${winner.protocol}) · score ${winner.score.toFixed(3)}`,
            );
          }
        } else {
          pushLog(`✗ <span class="tok-warn">No candidate matches intent + budget + SLA</span>`);
        }
      } catch {
        // non-fatal; continue to /api/route which will surface the real error.
      }

      const t0 = performance.now();
      const res = await apiRequest("POST", "/api/route", body);
      const json = (await res.json()) as RouteResponse;
      const dt = Math.round(performance.now() - t0);

      pushLog(
        `→ Dispatching to <span class="tok-ok">${json.selected_agent.name}</span> (${json.selected_agent.protocol})…`,
      );
      pushLog(
        `← Response received in <span class="tok-ok">${fmtMs(json.latency_ms)}</span> (wire: ${fmtMs(dt)})`,
      );
      pushLog(
        `✓ Reputation updated: ${json.reputation_delta.old.toFixed(4)} → <span class="tok-ok">${json.reputation_delta.new.toFixed(4)}</span>`,
      );
      pushLog(`✓ route_id = ${json.route_id}`);

      setResult(json);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      pushLog(`✗ <span class="tok-err">error: ${e?.message ?? e}</span>`);
    } finally {
      setLoading(false);
    }
  }

  function pushLog(line: string) {
    setLog((l) => [...l, line]);
  }

  const scrollToDemo = () => demoRef.current?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="min-h-screen" style={{ background: "hsl(var(--background))" }}>
      <Nav onTry={scrollToDemo} />
      <Hero onTry={scrollToDemo} />
      <Demo
        demoRef={demoRef}
        presetKey={presetKey}
        setPresetKey={setPresetKey}
        intent={intent}
        setIntent={setIntent}
        inputText={inputText}
        setInputText={setInputText}
        budget={budget}
        setBudget={setBudget}
        latency={latency}
        setLatency={setLatency}
        tags={tags}
        setTags={setTags}
        loading={loading}
        log={log}
        result={result}
        pre={pre}
        error={error}
        onRun={runRoute}
        showJson={showJson}
        setShowJson={setShowJson}
        showSdk={showSdk}
        setShowSdk={setShowSdk}
      />
      <WhyThis />
      <Footer />
    </div>
  );
}

// ============================================================================
function Nav({ onTry }: { onTry: () => void }) {
  return (
    <header className="sticky top-0 z-20 border-b hair" style={{ background: "hsl(var(--background) / 0.92)", backdropFilter: "blur(8px)" }}>
      <div className="mx-auto max-w-[1280px] px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="mono text-[11px] tracking-[0.2em] uppercase text-[hsl(var(--muted-foreground))]">
            AgentRouter
          </span>
          <span className="chip ml-2">v0.1 · alpha</span>
        </div>
        <div className="flex items-center gap-2">
          <a
            className="btn-ghost hidden sm:inline-flex"
            href="https://github.com/locallaunchsc-cloud/agentrouter"
            target="_blank"
            rel="noreferrer"
            data-testid="link-github"
          >
            GITHUB
          </a>
          <button onClick={onTry} className="btn-primary" data-testid="button-nav-try">
            TRY IT LIVE
          </button>
        </div>
      </div>
    </header>
  );
}

// ============================================================================
function Hero({ onTry }: { onTry: () => void }) {
  const curl = `curl -sX POST $ENDPOINT/api/route \\
  -H 'content-type: application/json' \\
  -d '{"intent":"Summarize this article in 3 bullets","input":"...","budget_usd":0.50,"max_latency_ms":15000,"capability_tags":["summarization"]}'`;
  return (
    <section className="relative border-b hair overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-[0.35] pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "radial-gradient(800px 400px at 20% 10%, hsl(var(--primary) / 0.08), transparent 70%)"
      }} />
      <div className="relative mx-auto max-w-[1280px] px-6 pt-20 pb-24">
        <div className="flex items-center gap-2 mb-8">
          <span className="chip chip-primary">AGENT INFRASTRUCTURE · 2026</span>
          <span className="chip">6 PROTOCOLS · 1 ROUTER</span>
        </div>
        <h1
          className="font-sans font-semibold text-[hsl(var(--foreground))] tracking-[-0.02em] leading-[1.02]"
          style={{ fontSize: "clamp(40px, 6.5vw, 84px)" }}
        >
          The routing layer for<br />agent protocols.
        </h1>
        <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-[hsl(var(--muted-foreground))]">
          One API. Any agent. Any protocol. Trust-scored. AgentRouter takes an intent,
          ranks candidates across <Mono>A2A</Mono>, <Mono>MCP</Mono>, <Mono>ACP</Mono>,{" "}
          <Mono>UCP</Mono>, <Mono>AP2</Mono>, and <Mono>x402</Mono> on capability, price,
          latency, and reputation — then executes and updates a ledger.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row gap-3">
          <button onClick={onTry} className="btn-primary" data-testid="button-hero-try">
            TRY IT LIVE →
          </button>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(curl);
            }}
            className="btn-ghost"
            data-testid="button-hero-copy"
          >
            COPY CURL
          </button>
        </div>

        <div className="mt-12 panel p-5 max-w-3xl">
          <div className="flex items-center justify-between mb-3">
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
              POST /api/route
            </span>
            <span className="mono text-[10px] text-[hsl(var(--muted-foreground))]">bash</span>
          </div>
          <pre className="mono text-[12.5px] leading-[1.7] text-[hsl(var(--foreground))] whitespace-pre-wrap break-all">
{curl}
          </pre>
        </div>
      </div>
    </section>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <span className="mono text-[13px] px-1 py-[1px] border hair text-[hsl(var(--primary))]">
      {children}
    </span>
  );
}

// ============================================================================
interface DemoProps {
  demoRef: React.RefObject<HTMLDivElement>;
  presetKey: string;
  setPresetKey: (k: string) => void;
  intent: string;
  setIntent: (s: string) => void;
  inputText: string;
  setInputText: (s: string) => void;
  budget: number;
  setBudget: (n: number) => void;
  latency: number;
  setLatency: (n: number) => void;
  tags: string[];
  setTags: (t: string[]) => void;
  loading: boolean;
  log: string[];
  result: RouteResponse | null;
  pre: ScoredCandidate[] | null;
  error: string | null;
  onRun: () => void;
  showJson: boolean;
  setShowJson: (b: boolean) => void;
  showSdk: boolean;
  setShowSdk: (b: boolean) => void;
}

function Demo(p: DemoProps) {
  return (
    <section ref={p.demoRef} id="demo" className="border-b hair">
      <div className="mx-auto max-w-[1280px] px-6 py-20">
        <div className="flex items-baseline gap-3 mb-8">
          <span className="mono text-[10px] tracking-[0.18em] uppercase text-[hsl(var(--primary))]">
            § 02
          </span>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">Live demo</h2>
          <span className="mono text-[11px] text-[hsl(var(--muted-foreground))]">
            backed by real LLM calls · no mocks
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 panel">
          {/* ---- LEFT: intent form ---- */}
          <div className="p-6 border-b lg:border-b-0 lg:border-r hair">
            <FieldLabel num="01" label="Preset" />
            <div className="grid grid-cols-2 gap-2 mb-6">
              {PRESETS.map((ps) => (
                <button
                  key={ps.key}
                  onClick={() => p.setPresetKey(ps.key)}
                  data-testid={`button-preset-${ps.key}`}
                  className={`mono text-[11px] uppercase tracking-[0.1em] px-3 py-2 text-left border transition-colors ${
                    p.presetKey === ps.key
                      ? "text-[hsl(var(--primary))] border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.06)]"
                      : "text-[hsl(var(--muted-foreground))] hair-strong hover:text-[hsl(var(--foreground))] hover:border-[hsl(var(--border-strong))]"
                  }`}
                >
                  {ps.label}
                </button>
              ))}
            </div>

            <FieldLabel num="02" label="Intent" />
            <input
              type="text"
              value={p.intent}
              onChange={(e) => p.setIntent(e.target.value)}
              placeholder="e.g. Summarize this article in 3 bullet points"
              data-testid="input-intent"
            />

            <div className="h-5" />

            <FieldLabel num="03" label="Input (optional)" />
            <textarea
              value={p.inputText}
              onChange={(e) => p.setInputText(e.target.value)}
              rows={6}
              className="mono"
              placeholder="…text or JSON the agent should operate on…"
              data-testid="input-content"
            />

            <div className="grid grid-cols-2 gap-6 mt-6">
              <div>
                <FieldLabel num="04" label={`Budget · ${fmtMoney(p.budget)}`} />
                <input
                  type="range"
                  min={0.01}
                  max={1}
                  step={0.01}
                  value={p.budget}
                  onChange={(e) => p.setBudget(Number(e.target.value))}
                  data-testid="slider-budget"
                />
                <div className="flex justify-between mono text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
                  <span>$0.01</span>
                  <span>$1.00</span>
                </div>
              </div>
              <div>
                <FieldLabel num="05" label={`Max latency · ${fmtMs(p.latency)}`} />
                <input
                  type="range"
                  min={1000}
                  max={30000}
                  step={500}
                  value={p.latency}
                  onChange={(e) => p.setLatency(Number(e.target.value))}
                  data-testid="slider-latency"
                />
                <div className="flex justify-between mono text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
                  <span>1s</span>
                  <span>30s</span>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <FieldLabel num="06" label="Capability tags" />
              <TagInput value={p.tags} onChange={p.setTags} />
            </div>

            <div className="mt-8 flex items-center gap-3">
              <button
                onClick={p.onRun}
                disabled={p.loading || !p.intent.trim()}
                className="btn-primary"
                data-testid="button-route"
              >
                {p.loading ? "ROUTING…" : "ROUTE ▸"}
              </button>
              <span className="mono text-[11px] text-[hsl(var(--muted-foreground))]">
                {p.loading ? "dispatching to selected agent…" : "POST /api/route"}
              </span>
            </div>
          </div>

          {/* ---- RIGHT: response panel ---- */}
          <div className="p-6 space-y-6 min-w-0">
            <ResponsePanel
              loading={p.loading}
              result={p.result}
              pre={p.pre}
              log={p.log}
              error={p.error}
              showJson={p.showJson}
              setShowJson={p.setShowJson}
            />
          </div>
        </div>

        <SdkBlock showSdk={p.showSdk} setShowSdk={p.setShowSdk} />
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
function FieldLabel({ num, label }: { num: string; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="mono text-[10px] text-[hsl(var(--muted-foreground))]">{num}</span>
      <span className="mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
        {label}
      </span>
    </div>
  );
}

// ----------------------------------------------------------------------------
function TagInput({ value, onChange }: { value: string[]; onChange: (t: string[]) => void }) {
  const [draft, setDraft] = useState("");
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2 min-h-[24px]">
        {value.length === 0 && (
          <span className="mono text-[11px] text-[hsl(var(--muted-foreground))]">
            none · router will infer from intent text
          </span>
        )}
        {value.map((t) => (
          <button
            key={t}
            onClick={() => onChange(value.filter((x) => x !== t))}
            className="chip chip-primary hover:opacity-70"
            data-testid={`tag-${t}`}
          >
            {t} ×
          </button>
        ))}
      </div>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft.trim()) {
            e.preventDefault();
            if (!value.includes(draft.trim())) onChange([...value, draft.trim()]);
            setDraft("");
          }
        }}
        placeholder="type a tag + Enter (e.g. summarization, translation, research)"
        data-testid="input-tag"
      />
    </div>
  );
}

// ----------------------------------------------------------------------------
function ResponsePanel({
  loading,
  result,
  pre,
  log,
  error,
  showJson,
  setShowJson,
}: {
  loading: boolean;
  result: RouteResponse | null;
  pre: ScoredCandidate[] | null;
  log: string[];
  error: string | null;
  showJson: boolean;
  setShowJson: (b: boolean) => void;
}) {
  if (!loading && !result && !error && log.length === 0) {
    return <EmptyState />;
  }

  const activeCandidates = result?.candidates ?? pre ?? null;
  const winnerId = result?.selected_agent.id ?? pre?.[0]?.id ?? "";

  return (
    <div className="space-y-6">
      {/* Candidates */}
      {(activeCandidates || loading) && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
              Candidates · ranked
            </span>
            <div className="flex-1 h-px bg-[hsl(var(--border))]" />
            <span className="mono text-[10px] text-[hsl(var(--muted-foreground))]">
              0.35·cap + 0.20·price + 0.15·lat + 0.30·rep
            </span>
          </div>
          {activeCandidates ? (
            <CandidateTable candidates={activeCandidates} winnerId={winnerId} />
          ) : (
            <SkeletonRows />
          )}
        </div>
      )}

      {/* Execution log */}
      {log.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
              Execution log
            </span>
            <div className="flex-1 h-px bg-[hsl(var(--border))]" />
          </div>
          <div className="panel bg-[hsl(var(--surface-2))] p-4 space-y-1">
            {log.map((line, i) => (
              <div
                key={i}
                className="log-line"
                dangerouslySetInnerHTML={{ __html: line }}
              />
            ))}
            {loading && (
              <div className="log-line">
                <span className="caret" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Output */}
      {result && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
              Output · from {result.selected_agent.name}
            </span>
            <div className="flex-1 h-px bg-[hsl(var(--border))]" />
            <span className="mono text-[10px] text-[hsl(var(--primary))]">
              {fmtMs(result.latency_ms)} · {fmtMoney(result.cost_usd)}
            </span>
          </div>
          <pre className="panel p-4 mono text-[13px] leading-[1.65] text-[hsl(var(--foreground))] whitespace-pre-wrap break-words max-h-[360px] overflow-auto">
{result.output}
          </pre>
        </div>
      )}

      {/* Raw JSON toggle */}
      {result && (
        <div>
          <button
            className="btn-ghost"
            onClick={() => setShowJson(!showJson)}
            data-testid="button-toggle-json"
          >
            {showJson ? "HIDE" : "SHOW"} RAW JSON
          </button>
          {showJson && (
            <pre className="panel mt-3 p-4 mono text-[11.5px] leading-[1.6] text-[hsl(var(--muted-foreground))] whitespace-pre-wrap max-h-[340px] overflow-auto">
{JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      )}

      {error && (
        <div className="panel p-4 border-[hsl(var(--destructive)/0.5)]">
          <div className="mono text-[11px] uppercase text-[hsl(var(--destructive))] mb-1">ERROR</div>
          <div className="mono text-[12.5px] text-[hsl(var(--foreground))] break-words">{error}</div>
        </div>
      )}
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="panel p-3 animate-pulse">
          <div className="h-3 w-1/3 bg-[hsl(var(--muted))] mb-2" />
          <div className="h-2 w-full bg-[hsl(var(--muted))]" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center min-h-[420px]">
      <div className="text-center max-w-sm">
        <div className="mono text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--muted-foreground))] mb-4">
          Awaiting intent
        </div>
        <div className="text-[hsl(var(--foreground))] text-[15px] leading-relaxed">
          Pick a preset on the left, tweak budget & SLA, then hit <span className="mono text-[hsl(var(--primary))]">ROUTE</span>.
        </div>
        <div className="mt-4 mono text-[11px] text-[hsl(var(--muted-foreground))]">
          The router will score all 3 agents, pick the best, execute, and update its reputation ledger — live.
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
function CandidateTable({
  candidates,
  winnerId,
}: {
  candidates: ScoredCandidate[];
  winnerId: string;
}) {
  return (
    <div className="panel overflow-hidden">
      <div className="grid grid-cols-[minmax(0,2.8fr)_repeat(5,minmax(0,0.85fr))] gap-2 px-4 py-2 border-b hair mono text-[10px] uppercase tracking-[0.15em] text-[hsl(var(--muted-foreground))]">
        <div>Agent · Protocol</div>
        <div className="text-right">Cap</div>
        <div className="text-right">Price</div>
        <div className="text-right">Lat</div>
        <div className="text-right">Rep</div>
        <div className="text-right">Score</div>
      </div>
      {candidates.map((c) => {
        const isWinner = c.id === winnerId;
        return (
          <div
            key={c.id}
            className={`grid grid-cols-[minmax(0,2.8fr)_repeat(5,minmax(0,0.85fr))] gap-2 px-4 py-3 border-b hair last:border-b-0 items-center ${
              isWinner ? "winner-row" : ""
            }`}
            data-testid={`row-candidate-${c.id}`}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-medium truncate">{c.name}</span>
                {isWinner && (
                  <span className="mono text-[9px] uppercase tracking-[0.15em] text-[hsl(var(--primary))] border border-[hsl(var(--primary)/0.5)] px-1.5 py-[1px]">
                    selected
                  </span>
                )}
              </div>
              <div className="mono text-[10.5px] text-[hsl(var(--muted-foreground))] mt-0.5">
                {c.protocol} · {fmtMoney(c.price_usd)} · {fmtMs(c.expected_latency_ms)}
              </div>
            </div>
            <SubScore v={c.capability_match} />
            <SubScore v={c.price_fit} />
            <SubScore v={c.latency_fit} />
            <SubScore v={c.reputation} />
            <div className="text-right mono text-[14px] font-semibold" style={{ color: isWinner ? "hsl(var(--primary))" : "hsl(var(--foreground))" }}>
              {c.score.toFixed(3)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SubScore({ v }: { v: number }) {
  return (
    <div className="text-right">
      <div className="mono text-[12px] text-[hsl(var(--foreground))]">{v.toFixed(2)}</div>
      <div className="score-bar mt-1">
        <span style={{ width: `${Math.max(2, v * 100)}%` }} />
      </div>
    </div>
  );
}

// ============================================================================
function SdkBlock({
  showSdk,
  setShowSdk,
}: {
  showSdk: boolean;
  setShowSdk: (b: boolean) => void;
}) {
  const curl = `curl -sX POST https://<your-deployment>/api/route \\
  -H 'content-type: application/json' \\
  -d '{
    "intent": "Summarize this article in 3 bullets",
    "input": "…your text here…",
    "budget_usd": 0.50,
    "max_latency_ms": 15000,
    "capability_tags": ["summarization", "english"]
  }'`;

  const node = `// Node 18+ (native fetch)
const r = await fetch("https://<your-deployment>/api/route", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    intent: "Translate to Japanese",
    input: "The routing layer for agent protocols.",
    budget_usd: 0.2,
    max_latency_ms: 10000,
    capability_tags: ["translation"],
  }),
});
const { selected_agent, output, cost_usd } = await r.json();
console.log(selected_agent.name, output, cost_usd);`;

  return (
    <div className="mt-8">
      <button
        className="btn-ghost"
        onClick={() => setShowSdk(!showSdk)}
        data-testid="button-toggle-sdk"
      >
        {showSdk ? "HIDE" : "SHOW"} SDK SNIPPETS
      </button>
      {showSdk && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <SnippetCard label="cURL" language="bash" code={curl} />
          <SnippetCard label="Node.js" language="javascript" code={node} />
        </div>
      )}
    </div>
  );
}

function SnippetCard({ label, language, code }: { label: string; language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="panel">
      <div className="flex items-center justify-between px-4 py-2 border-b hair">
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
          {label}
        </span>
        <div className="flex items-center gap-2">
          <span className="mono text-[10px] text-[hsl(var(--muted-foreground))]">{language}</span>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="mono text-[10px] uppercase tracking-[0.15em] text-[hsl(var(--primary))] hover:opacity-80"
            data-testid={`button-copy-${label.toLowerCase()}`}
          >
            {copied ? "COPIED" : "COPY"}
          </button>
        </div>
      </div>
      <pre className="p-4 mono text-[12px] leading-[1.65] text-[hsl(var(--foreground))] whitespace-pre-wrap break-all max-h-[320px] overflow-auto">
{code}
      </pre>
    </div>
  );
}

// ============================================================================
function WhyThis() {
  return (
    <section className="border-b hair">
      <div className="mx-auto max-w-[1280px] px-6 py-20">
        <div className="flex items-baseline gap-3 mb-12">
          <span className="mono text-[10px] tracking-[0.18em] uppercase text-[hsl(var(--primary))]">
            § 03
          </span>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Why this, why now
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 panel">
          <Column
            num="01"
            title="The problem"
            bullets={[
              "Six agent protocols shipped in 12 months: A2A, MCP, ACP, UCP, AP2, x402.",
              "Each has its own discovery surface. None defines cross-protocol selection.",
              "Developers hardcode agents per task. No price, latency, or trust arbitrage.",
            ]}
          />
          <Column
            num="02"
            title="What AgentRouter does"
            bullets={[
              "One endpoint: POST /api/route with intent, budget, SLA, capability tags.",
              "Ranks candidates on capability match · price fit · latency fit · reputation.",
              "Executes the winner, streams the result, writes outcomes to a ledger.",
            ]}
            accent
          />
          <Column
            num="03"
            title="What's next"
            bullets={[
              "Cross-protocol integrations to real A2A / MCP / x402 agent registries.",
              "Verifiable reputation attestations (signed outcomes, EAS-style).",
              "Dispute resolution API — arbitration for agent-executed contracts.",
            ]}
            trailing
          />
        </div>
      </div>
    </section>
  );
}

function Column({
  num,
  title,
  bullets,
  accent,
  trailing,
}: {
  num: string;
  title: string;
  bullets: string[];
  accent?: boolean;
  trailing?: boolean;
}) {
  return (
    <div
      className={`p-6 md:p-8 ${trailing ? "" : "border-b md:border-b-0 md:border-r"} hair`}
    >
      <div className="flex items-center gap-2 mb-4">
        <span className="mono text-[10px] text-[hsl(var(--primary))]">{num}</span>
        <span className="mono text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--muted-foreground))]">
          {accent ? "CORE" : trailing ? "ROADMAP" : "CONTEXT"}
        </span>
      </div>
      <h3 className="text-xl font-semibold tracking-tight mb-5" style={{ color: accent ? "hsl(var(--primary))" : "hsl(var(--foreground))" }}>
        {title}
      </h3>
      <ul className="space-y-3">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-3 text-[14px] leading-relaxed text-[hsl(var(--muted-foreground))]">
            <span className="mono text-[10px] text-[hsl(var(--primary))] mt-[5px]">▸</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ============================================================================
function Footer() {
  return (
    <footer className="py-12 border-t hair">
      <div className="mx-auto max-w-[1280px] px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="mono text-[11px] text-[hsl(var(--muted-foreground))]">
            Built by Jay Fisher · Talking to design partners now
          </span>
        </div>
        <div className="flex items-center gap-5 mono text-[11px] text-[hsl(var(--muted-foreground))]">
          <a href="mailto:hello@agentrouter.dev" className="hover:text-[hsl(var(--primary))]">
            hello@agentrouter.dev
          </a>
          <a
            href="https://x.com/jayfisher"
            target="_blank"
            rel="noreferrer"
            className="hover:text-[hsl(var(--primary))]"
          >
            @jayfisher
          </a>
          <a
            href="https://github.com/locallaunchsc-cloud/agentrouter"
            target="_blank"
            rel="noreferrer"
            className="hover:text-[hsl(var(--primary))]"
          >
            github
          </a>
        </div>
      </div>
    </footer>
  );
}
