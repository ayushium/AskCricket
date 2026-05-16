# AskCricket — Engineering Task Breakdown

**For:** LLM coding agents (each task is self-contained — assume zero prior context beyond this file + the named upstream files).
**Companion docs:** `PRD.md` (product spec), `PROJECT_PLAN.md` (phases).
**Stack:** Cloudflare Workers (JS, no TypeScript) + Workers Static Assets + Azure OpenAI `gpt-4o-mini`.
**No frameworks. No build step. Vanilla JS on both sides.**

---

## How to use this file

- Tasks are atomic and ordered by dependency. **Do not skip ahead.**
- Each task lists: **ID · Depends on · Files · Spec · Acceptance criteria · Hints**.
- When a task says "create file X", the agent must produce the full file content.
- When a task says "modify file X", the agent must apply a precise diff, not a full rewrite.
- All file paths are relative to the project root.
- Acceptance criteria are binary checks. If you cannot satisfy them, stop and report — do not fudge.

---

# PHASE 0 — Foundation Setup

## T0.1 — Initialize `wrangler.toml`

**Depends on:** none
**Files to create:** `wrangler.toml`

### Spec
Create `wrangler.toml` at project root with the following content:

```toml
name = "askcricket"
main = "src/worker.js"
compatibility_date = "2025-01-01"

[assets]
directory = "./public"
binding = "ASSETS"

[vars]
AZURE_OPENAI_ENDPOINT = "https://REPLACE-ME.openai.azure.com"
AZURE_OPENAI_DEPLOYMENT = "gpt-4o-mini"
AZURE_OPENAI_API_VERSION = "2024-10-21"
```

The `AZURE_OPENAI_KEY` is a *secret*, not a var; it will be set via `wrangler secret put AZURE_OPENAI_KEY` (out-of-band, not in this file).

### Acceptance criteria
- File exists at exactly `./wrangler.toml`
- Parses as valid TOML
- Contains `[assets]` block pointing to `./public`
- Does **not** contain `AZURE_OPENAI_KEY`

---

## T0.2 — Create project skeleton

**Depends on:** T0.1
**Files to create:** all empty/stub files below

### Spec
Create the following file structure with placeholder content:

```
src/worker.js     # stub: exports default { fetch() returning new Response("Hello AskCricket") }
src/agent.js      # stub: export async function runAgent() { throw new Error("not implemented") }
src/tools.js      # stub: export const TOOLS = {}; export const TOOL_SCHEMAS = [];
src/azure.js      # stub: export async function callAzure() { throw new Error("not implemented") }
public/index.html # stub: minimal valid HTML5 doc with <h1>AskCricket</h1>
public/app.js     # stub: console.log("AskCricket loaded")
scripts/flatten.js # stub: console.log("flatten script placeholder")
```

`src/worker.js` content:
```js
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/ask") {
      return new Response("Not implemented yet", { status: 501 });
    }
    return env.ASSETS.fetch(request);
  }
};
```

### Acceptance criteria
- All 7 files exist
- `src/worker.js` exports a default object with `fetch` method
- All ES module exports parse without syntax errors (run `node --check src/worker.js` etc.)

---

## T0.3 — Local dev verification (manual step — agent: document command)

**Depends on:** T0.2
**Files to modify:** none (this is a human verification step)

### Spec
Document in a top-of-file comment in `src/worker.js`:
```
// To run locally: `npx wrangler dev`
// To deploy:      `npx wrangler deploy`
// To set secret:  `npx wrangler secret put AZURE_OPENAI_KEY`
```

### Acceptance criteria
- Comment block exists at top of `src/worker.js`

---

# PHASE 1 — Data Layer

## T1.1 — Cricsheet flattener script

**Depends on:** T0.2
**Files to create:** `scripts/flatten.js`

### Context
Cricsheet provides match-level JSON files where deliveries are nested as `innings[].overs[].deliveries[]`. We need to flatten them into a single array of delivery rows for fast in-Worker filtering.

### Spec
Write a Node.js script (CommonJS or ESM, your choice — match Node 18+) that:
1. Reads all `*.json` files from `./raw_matches/` directory.
2. For each match, walks the nested structure and emits one row per delivery.
3. Writes the combined array to `src/data.json`.

**Flattened row schema (locked — downstream tools depend on this):**
```js
{
  match_id: string,      // derived from filename (basename without .json)
  innings: 1 | 2,
  over: number,          // 0-indexed (0–19 for T20)
  ball: number,          // 1–6
  batter: string,
  bowler: string,
  runs_batter: number,
  runs_extras: number,
  wicket: boolean,
  phase: "powerplay" | "middle" | "death",  // overs 0-5 = powerplay, 6-14 = middle, 15-19 = death
  venue: string,         // from match.info.venue
  team_batting: string,
  team_bowling: string,
  result: string         // match.info.outcome.winner ?? "no result"
}
```

**Cricsheet shape reference (relevant parts):**
```json
{
  "info": {
    "teams": ["A","B"],
    "venue": "...",
    "outcome": {"winner": "A"}
  },
  "innings": [
    {
      "team": "A",
      "overs": [
        {
          "over": 0,
          "deliveries": [
            {"batter":"X","bowler":"Y","runs":{"batter":4,"extras":0,"total":4},"wickets":[...]?}
          ]
        }
      ]
    }
  ]
}
```

Script must:
- Skip malformed files with `console.warn` rather than crashing
- Print final count: `console.log(\`Wrote ${rows.length} rows to src/data.json\`)`
- Handle missing fields with sensible defaults

### Acceptance criteria
- Script runs as `node scripts/flatten.js`
- Reads from `./raw_matches/*.json`
- Writes valid JSON to `src/data.json`
- Output is a JSON array (not an object)
- Each row has all 13 fields per schema above

### Hint
```js
function derivePhase(over) {
  if (over <= 5) return "powerplay";
  if (over <= 14) return "middle";
  return "death";
}
```

---

## T1.2 — Acquire dataset (human task — agent: skip)

**Depends on:** T1.1
**Note:** This is a human task. Download 5 IPL match JSONs from cricsheet.org into `./raw_matches/`, then run T1.1's script. The coding LLM should not attempt this.

---

## T1.3 — Data import + bundle sanity check

**Depends on:** T1.1, T1.2
**Files to modify:** `src/tools.js`

### Spec
Add to top of `src/tools.js`:
```js
import data from './data.json' assert { type: 'json' };

export function getDeliveryCount() {
  return data.length;
}
export const DELIVERIES = data;
```

### Acceptance criteria
- `src/tools.js` imports `data.json` successfully
- `getDeliveryCount()` exported
- `DELIVERIES` exported as the raw array

### Hint
If `assert { type: 'json' }` causes Wrangler issues, fall back to `with { type: 'json' }` or bundle via `wrangler.toml` rules. Wrangler 3.x supports JSON imports natively for Workers.

---

# PHASE 2 — Tools Layer

> All tools in this phase: pure functions over `DELIVERIES`. No I/O. No async. No external state. Return small JSON-serializable objects.

## T2.1 — `get_player_stats` tool

**Depends on:** T1.3
**Files to modify:** `src/tools.js`

### Spec
Implement and export:
```js
export function get_player_stats({ player, tournament, phase, vs_team }) {
  // Filters DELIVERIES where:
  //   - batter matches `player` (case-insensitive substring) OR bowler matches `player`
  //   - if `phase` provided, row.phase === phase
  //   - if `vs_team` provided, opposing team matches
  // Computes BOTH batting and bowling stats; returns whichever has data (or both).
  return {
    player,
    filters: { tournament, phase, vs_team },
    batting: {
      balls, runs, dismissals, strike_rate, average, boundary_pct
    } | null,
    bowling: {
      balls, runs_conceded, wickets, economy, dot_pct
    } | null
  };
}
```

**Formulas:**
- `strike_rate = runs / balls * 100` (0 if balls=0)
- `boundary_pct = (4s + 6s) / balls * 100`
- `economy = runs_conceded / (balls / 6)`
- `dot_pct = balls_with_0_runs / balls * 100`

Return `null` for the section if zero balls match.

### Acceptance criteria
- Function exported from `tools.js`
- Returns object with required keys
- `get_player_stats({ player: 'Kohli' })` returns non-null `batting` (assuming Kohli is in dataset)
- `get_player_stats({ player: 'Bumrah', phase: 'death' })` returns non-null `bowling`

---

## T2.2 — `compare_players` tool

**Depends on:** T2.1
**Files to modify:** `src/tools.js`

### Spec
```js
export function compare_players({ players, metric, filters }) {
  // players: string[] of length 2-4
  // metric: "strike_rate" | "average" | "economy" | "boundary_pct" | "wickets" | "runs"
  // filters: same shape as get_player_stats filters
  // Returns rows[] for each player with the metric value, sorted desc.
  return {
    metric,
    filters,
    rows: [
      { player: "X", value: 145.2, sample_size: 87 },
      ...
    ]
  };
}
```

Reuse `get_player_stats` internally.

### Acceptance criteria
- Returns sorted rows (highest value first)
- `sample_size` reflects balls used in the calculation
- Handles missing players gracefully (`value: null, sample_size: 0`)

---

## T2.3 — `match_context` tool

**Depends on:** T1.3
**Files to modify:** `src/tools.js`

### Spec
```js
export function match_context({ match_id }) {
  // Pulls metadata from DELIVERIES rows of this match.
  return {
    match_id,
    teams: [string, string],
    venue: string,
    result: string,
    total_runs_innings1: number,
    total_runs_innings2: number,
    wickets_innings1: number,
    wickets_innings2: number
  };
}
```

### Acceptance criteria
- Returns metadata derived purely from DELIVERIES
- Returns `{ error: "match not found" }` if match_id absent

---

## T2.4 — `clutch_index` tool (signature smart metric)

**Depends on:** T2.1
**Files to modify:** `src/tools.js`

### Spec
This is the **defensible "smart" tool** that judges will ask about. Implement carefully.

```js
export function clutch_index({ player, definition }) {
  // Default definition: performance in death overs (15-19) during 2nd innings (chases).
  // Composite score 0-100 = weighted blend:
  //   40% : death-overs SR (batter) OR death-overs economy_inverted (bowler), normalized
  //   30% : boundary_pct (batter) OR dot_pct (bowler) in death overs
  //   30% : sample size confidence (cap at 50 balls = full confidence)
  //
  // Normalization:
  //   batter SR: map 80→0, 200→100, clamp
  //   bowler economy: map 12→0, 6→100, clamp
  //   boundary_pct: map 0→0, 40→100, clamp
  //   dot_pct: map 0→0, 60→100, clamp

  return {
    player,
    definition: definition || "death-overs in 2nd innings",
    score: number,  // 0-100
    breakdown: {
      role: "batter" | "bowler",
      sample_size: number,
      performance_component: number,  // 0-100
      pressure_component: number,     // 0-100
      confidence_component: number,   // 0-100
    },
    interpretation: string  // 1-sentence plain English, e.g., "Above-average clutch performer in death overs."
  };
}
```

Pick batter vs bowler role based on whichever has more deliveries for that player.

### Acceptance criteria
- Returns score in [0, 100]
- Breakdown components each in [0, 100]
- `interpretation` is a non-empty string
- `clutch_index({ player: 'Kohli' })` returns a number, not NaN

### Hint
Helper for clamping/mapping:
```js
function mapClamp(v, inMin, inMax, outMin, outMax) {
  const t = Math.max(0, Math.min(1, (v - inMin) / (inMax - inMin)));
  return outMin + t * (outMax - outMin);
}
```

---

## T2.5 — `head_to_head` tool

**Depends on:** T1.3
**Files to modify:** `src/tools.js`

### Spec
```js
export function head_to_head({ batter, bowler }) {
  return {
    batter, bowler,
    balls, runs, dismissals,
    strike_rate, dot_pct, boundary_pct
  };
}
```

Substring case-insensitive match for both names.

### Acceptance criteria
- Returns zeros (not nulls) when no balls match — never NaN
- Strike rate computed correctly

---

## T2.6 — Tool schema registry (OpenAI function-calling format)

**Depends on:** T2.1–T2.5
**Files to modify:** `src/tools.js`

### Spec
Export two things from `tools.js`:

```js
export const TOOLS = {
  get_player_stats,
  compare_players,
  match_context,
  clutch_index,
  head_to_head
};

export const TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "get_player_stats",
      description: "Get batting and/or bowling stats for a cricket player. Filters by phase (powerplay/middle/death) and opposing team.",
      parameters: {
        type: "object",
        properties: {
          player: { type: "string", description: "Player name (e.g., 'Kohli', 'Bumrah')" },
          tournament: { type: "string" },
          phase: { type: "string", enum: ["powerplay", "middle", "death"] },
          vs_team: { type: "string" }
        },
        required: ["player"]
      }
    }
  },
  // ... one entry per tool, complete and accurate
];
```

Write **complete, accurate** JSON schemas for all 5 tools — these are what GPT-4o-mini sees.

### Acceptance criteria
- `TOOLS` object has 5 keys, each a function
- `TOOL_SCHEMAS` array has 5 entries
- Each schema has `type: "function"`, `function.name`, `function.description`, `function.parameters` with `type: "object"` and `properties`
- All `required` fields are non-empty

---

# PHASE 3 — Agent Layer

## T3.1 — Azure OpenAI fetch wrapper

**Depends on:** T0.2
**Files to modify:** `src/azure.js`

### Spec
```js
export async function callAzureChat(env, { messages, tools, tool_choice, response_format, temperature, max_tokens }) {
  const url = `${env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${env.AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=${env.AZURE_OPENAI_API_VERSION}`;

  const body = {
    messages,
    temperature: temperature ?? 0.3,
    max_tokens: max_tokens ?? 800,
  };
  if (tools) body.tools = tools;
  if (tool_choice) body.tool_choice = tool_choice;
  if (response_format) body.response_format = response_format;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": env.AZURE_OPENAI_KEY
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Azure error ${res.status}: ${errText}`);
  }
  return await res.json();
}
```

### Acceptance criteria
- Function signature matches spec
- Uses `api-key` header (Azure convention, **not** Bearer auth)
- Throws on non-2xx with status code in the message

---

## T3.2 — Agent loop (function-calling)

**Depends on:** T2.6, T3.1
**Files to modify:** `src/agent.js`

### Spec
```js
import { callAzureChat } from "./azure.js";
import { TOOLS, TOOL_SCHEMAS } from "./tools.js";

const SYSTEM_PROMPT = `You are AskCricket, an expert cricket analyst agent for IPL data.

Rules:
1. Always use tools before answering. Never guess stats.
2. After gathering data, respond with strict JSON:
   {
     "headline": "<one punchy sentence, <=15 words>",
     "insight": "<3-4 sentences, plain English, no jargon dumps>",
     "chart": { "type": "bar"|"line"|"none", "labels": [...], "values": [...], "unit": "..." },
     "sources": "<short string e.g. '47 deliveries from IPL 2024 finals'>",
     "followups": ["<q1>", "<q2>", "<q3>"]
   }
3. If data is missing, say so honestly in the insight field.
4. Prefer concrete numbers over adjectives.`;

const MAX_ROUNDS = 5;

export async function* runAgent(env, userQuestion) {
  // Async generator yielding events: { type: 'tool_call', name, args } | { type: 'final', payload }
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userQuestion }
  ];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const completion = await callAzureChat(env, {
      messages,
      tools: TOOL_SCHEMAS,
      tool_choice: round === 0 ? "required" : "auto",
      response_format: round > 0 ? { type: "json_object" } : undefined
    });

    const msg = completion.choices[0].message;
    messages.push(msg);

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      for (const tc of msg.tool_calls) {
        let args;
        try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }
        yield { type: "tool_call", name: tc.function.name, args };

        const fn = TOOLS[tc.function.name];
        let result;
        try {
          result = fn ? fn(args) : { error: `unknown tool ${tc.function.name}` };
        } catch (e) {
          result = { error: e.message };
        }

        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result)
        });
      }
      continue;
    }

    // No more tool calls — final answer
    let payload;
    try {
      payload = JSON.parse(msg.content);
    } catch {
      payload = {
        headline: "Analysis complete",
        insight: msg.content || "No structured response.",
        chart: { type: "none" },
        sources: "",
        followups: []
      };
    }
    yield { type: "final", payload };
    return;
  }

  yield { type: "final", payload: {
    headline: "Could not complete analysis",
    insight: "Reached max reasoning rounds.",
    chart: { type: "none" }, sources: "", followups: []
  }};
}
```

### Acceptance criteria
- Exports `runAgent` as async generator
- Yields `tool_call` event **before** executing each tool
- Yields exactly one `final` event
- Bounded by `MAX_ROUNDS`
- Forces tool use on first round via `tool_choice: "required"`

---

## T3.3 — `/api/ask` SSE route

**Depends on:** T3.2
**Files to modify:** `src/worker.js`

### Spec
Modify `src/worker.js` to handle `/api/ask`:

```js
import { runAgent } from "./agent.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/ask") {
      const q = url.searchParams.get("q");
      if (!q) return new Response("Missing q", { status: 400 });

      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();

      const send = (event, data) =>
        writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

      ctx.waitUntil((async () => {
        try {
          for await (const evt of runAgent(env, q)) {
            await send(evt.type, evt);
          }
        } catch (e) {
          await send("error", { message: e.message });
        } finally {
          await writer.close();
        }
      })());

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive"
        }
      });
    }

    return env.ASSETS.fetch(request);
  }
};
```

### Acceptance criteria
- `GET /api/ask?q=...` returns `text/event-stream`
- Emits SSE events of types `tool_call`, `final`, optionally `error`
- All other paths pass through to `env.ASSETS.fetch`

### Hint
Cloudflare Workers do not require `ctx.waitUntil` to keep the stream alive (the Response holding `readable` does), but `waitUntil` ensures the async work isn't cancelled. Keep it.

---

# PHASE 4 — Frontend Layer

## T4.1 — `index.html` shell

**Depends on:** T0.2
**Files to modify:** `public/index.html`

### Spec
Single-page HTML. Dark theme. Tailwind via CDN. Tag IDs that `app.js` will hook into.

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>AskCricket — an agentic cricket analyst</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; }
    @keyframes slideIn { from { opacity:0; transform: translateX(-10px); } to { opacity:1; transform: none; } }
    .chip-enter { animation: slideIn 250ms ease-out both; }
  </style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen">
  <main class="max-w-3xl mx-auto px-4 py-12">
    <h1 class="text-4xl font-bold mb-2">🏏 AskCricket</h1>
    <p class="text-slate-400 mb-8">An agent that reads every ball and explains the game like a personal analyst.</p>

    <form id="ask-form" class="mb-6">
      <input id="q" type="text" autocomplete="off"
        class="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-lg focus:outline-none focus:border-emerald-500"
        placeholder="Ask anything about IPL…" />
    </form>

    <div id="suggestions" class="flex flex-wrap gap-2 mb-10">
      <button class="suggestion px-3 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-sm">Was Kohli clutch in the 2024 final?</button>
      <button class="suggestion px-3 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-sm">Compare Bumrah vs Rashid in death overs</button>
      <button class="suggestion px-3 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-sm">Who should I pick captain for CSK vs MI?</button>
    </div>

    <section id="trace" class="flex flex-wrap gap-2 mb-6"></section>
    <section id="answer" class="hidden bg-slate-900 border border-slate-800 rounded-xl p-6"></section>
  </main>
  <script src="/app.js"></script>
</body>
</html>
```

### Acceptance criteria
- File loads without console errors
- All four IDs present: `ask-form`, `q`, `trace`, `answer`
- Tailwind classes render

---

## T4.2 — `app.js` SSE client

**Depends on:** T4.1, T3.3
**Files to modify:** `public/app.js`

### Spec
```js
const form = document.getElementById("ask-form");
const input = document.getElementById("q");
const trace = document.getElementById("trace");
const answer = document.getElementById("answer");

document.querySelectorAll(".suggestion").forEach(btn =>
  btn.addEventListener("click", () => { input.value = btn.textContent; form.requestSubmit(); })
);

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = input.value.trim();
  if (!q) return;
  runAsk(q);
});

function runAsk(q) {
  trace.innerHTML = "";
  answer.classList.add("hidden");
  answer.innerHTML = "";

  addChip("🤔 Thinking…");

  const es = new EventSource(`/api/ask?q=${encodeURIComponent(q)}`);

  es.addEventListener("tool_call", (e) => {
    const data = JSON.parse(e.data);
    addChip(`🔧 ${data.name}(${prettyArgs(data.args)})`);
  });

  es.addEventListener("final", (e) => {
    const { payload } = JSON.parse(e.data);
    addChip("✍️  Writing insight…");
    renderAnswer(payload);
    es.close();
  });

  es.addEventListener("error", (e) => {
    addChip("⚠️  Error");
    es.close();
  });
}

function addChip(text) {
  const span = document.createElement("span");
  span.className = "chip-enter px-3 py-1 rounded-full bg-slate-800 text-xs border border-slate-700";
  span.textContent = text;
  trace.appendChild(span);
}

function prettyArgs(args) {
  return Object.entries(args).slice(0, 2).map(([k,v]) => `${k}:${JSON.stringify(v)}`).join(", ");
}

function renderAnswer(p) {
  answer.classList.remove("hidden");
  answer.innerHTML = `
    <h2 class="text-2xl font-semibold mb-3">${escapeHtml(p.headline || "")}</h2>
    <p class="text-slate-300 mb-4 leading-relaxed">${escapeHtml(p.insight || "")}</p>
    <div id="chart" class="mb-4"></div>
    <div class="text-xs text-slate-500 mb-4">📚 ${escapeHtml(p.sources || "")}</div>
    <div class="flex flex-wrap gap-2">
      ${(p.followups || []).map(f => `<button class="followup px-3 py-1 rounded-full bg-emerald-900/40 hover:bg-emerald-900/60 text-sm">${escapeHtml(f)}</button>`).join("")}
    </div>
  `;
  if (p.chart && p.chart.type !== "none") renderChart(p.chart);
  document.querySelectorAll(".followup").forEach(btn =>
    btn.addEventListener("click", () => { input.value = btn.textContent; form.requestSubmit(); })
  );
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

// renderChart implemented in T4.3
function renderChart(chart) { /* implemented in next task */ }
```

### Acceptance criteria
- On submit: opens EventSource to `/api/ask?q=...`
- Chips animate in for each tool call
- Final answer card renders with headline, insight, sources, followups
- Suggestion buttons populate input and submit
- Followup buttons populate input and submit
- No XSS — all user-influenced strings pass through `escapeHtml`

---

## T4.3 — SVG mini-chart renderer

**Depends on:** T4.2
**Files to modify:** `public/app.js`

### Spec
Replace the placeholder `renderChart` function with a real implementation:

```js
function renderChart({ type, labels, values, unit }) {
  const container = document.getElementById("chart");
  if (!labels || !values || values.length === 0) return;
  const W = 360, H = 140, P = 20;
  const max = Math.max(...values, 1);
  const barW = (W - P*2) / values.length - 6;

  if (type === "bar") {
    const bars = values.map((v, i) => {
      const x = P + i * ((W - P*2) / values.length);
      const h = (v / max) * (H - P*2);
      const y = H - P - h;
      return `
        <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="3" fill="#10b981"/>
        <text x="${x + barW/2}" y="${y - 4}" font-size="10" fill="#94a3b8" text-anchor="middle">${v}</text>
        <text x="${x + barW/2}" y="${H - 4}" font-size="10" fill="#94a3b8" text-anchor="middle">${labels[i]}</text>
      `;
    }).join("");
    container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="w-full max-w-md">${bars}</svg>`;
    return;
  }

  if (type === "line") {
    const pts = values.map((v, i) => {
      const x = P + i * ((W - P*2) / (values.length - 1 || 1));
      const y = H - P - (v / max) * (H - P*2);
      return `${x},${y}`;
    }).join(" ");
    container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="w-full max-w-md">
      <polyline fill="none" stroke="#10b981" stroke-width="2" points="${pts}"/>
    </svg>`;
  }
}
```

### Acceptance criteria
- `bar` and `line` types render correctly
- Handles 1–10 data points
- Bars/points scale to fit viewbox

---

# PHASE 5 — Demo Hardening

## T5.1 — Demo prompt test harness

**Depends on:** T3.3
**Files to create:** `scripts/test-demo.js`

### Spec
A Node script that hits the deployed `/api/ask` endpoint with the 3 canonical prompts and asserts:
- Streams open successfully
- At least 1 `tool_call` event received per prompt
- A `final` event with valid JSON payload received
- `final.payload.headline` and `final.payload.insight` are non-empty strings

```js
const BASE = process.env.BASE_URL || "http://localhost:8787";
const PROMPTS = [
  "Was Kohli clutch in the 2024 final?",
  "Compare Bumrah vs Rashid in death overs",
  "Who should I pick captain for CSK vs MI?"
];

for (const q of PROMPTS) {
  console.log(`\n--- ${q} ---`);
  const res = await fetch(`${BASE}/api/ask?q=${encodeURIComponent(q)}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "", toolCalls = 0, finalPayload = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
      const lines = chunk.split("\n");
      const event = lines.find(l => l.startsWith("event: "))?.slice(7);
      const data = lines.find(l => l.startsWith("data: "))?.slice(6);
      if (event === "tool_call") { toolCalls++; console.log("  tool:", JSON.parse(data).name); }
      if (event === "final") { finalPayload = JSON.parse(data).payload; }
    }
  }
  console.assert(toolCalls > 0, "Expected ≥1 tool call");
  console.assert(finalPayload?.headline, "Expected headline");
  console.log("  ✓", finalPayload?.headline);
}
```

### Acceptance criteria
- Script runs as `BASE_URL=https://askcricket.X.workers.dev node scripts/test-demo.js`
- Prints headlines for all 3 prompts
- Exits 0 on success

---

## T5.2 — Pitch script (human task — agent: skip code)

**Depends on:** T5.1
**Note:** Human-only task. Memorize the 60-sec pitch from `PRD.md` §11. Coding LLM should skip.

---

# APPENDIX — Cross-cutting rules

### A. No external libraries on the frontend
Only allowed: Tailwind CDN. No chart libraries, no React, no jQuery.

### B. No external libraries on the backend
Only allowed: the `fetch` global. No `openai` SDK, no `axios`. We construct Azure requests manually.

### C. Error policy
Never let a thrown error reach the browser unhandled. Every async function in the agent layer must catch and emit a meaningful event. If a tool throws, return `{ error: msg }` from the tool — the agent continues.

### D. JSON safety
GPT-4o-mini in `json_object` mode is reliable but not perfect. Every `JSON.parse` of model output **must** be wrapped in try/catch.

### E. Player name matching
Always case-insensitive substring. `"kohli"`, `"V Kohli"`, `"Kohli"` all match `"V Kohli"` in the dataset.

### F. Determinism
Same input → same output. Temperature is 0.3, not 0. Acceptable variance; demo prompts pre-tested.

---

**End of task list. ~24 atomic tasks across 6 phases. Execute in order. Verify each acceptance criterion before moving on.**
