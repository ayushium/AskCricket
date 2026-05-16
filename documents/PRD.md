# AskCricket — Product Requirements Document

**Hackathon:** Build with AI · Agentic Premier League · GDG Baroda
**Problem statement:** #2 — Data & Insights (translate complex match/player data into actionable insights for fans)
**Author:** Ayush Makwana (solo)
**Date:** 2026-05-16

---

## 1. Hard constraints

| Constraint | Value |
|---|---|
| Build time | **2 hours** end-to-end (code + deploy + demo prep) |
| Model | **Azure OpenAI `gpt-4o-mini`** (only) — function calling supported, low latency, cheap |
| Deployment | **Cloudflare** via `wrangler` (Workers + static assets) |
| Language | JavaScript (no TS overhead) |
| Team | Solo |
| No paid third-party APIs beyond Azure OpenAI |

These constraints are non-negotiable. Every design decision below respects them.

---

## 2. One-line product

> **A conversational, agentic cricket co-pilot that turns ball-by-ball data into instant, narrated insights — with visible tool reasoning so users see *why* they can trust the answer.**

---

## 3. Why this wins

| Judging criterion | How AskCricket scores |
|---|---|
| Live demo wow-factor | Streaming answer + visible tool-call chips + inline mini chart |
| Technical depth (agentic) | Multi-tool function-calling loop, transparent reasoning trace |
| Business viability | Clear B2B2C path: license to fantasy/streaming/sports-media platforms (Dream11, JioHotstar, Cricbuzz, ESPN); B2C premium tier for serious fans |
| Social impact / novelty | Democratizes advanced analytics — every fan gets a personal analyst, not just commentators on TV |
| Thematic fit | "Agentic Premier League" + IPL = judges are primed for this |

---

## 4. Target users (demo personas)

1. **The Fantasy Player** — *"Who should I captain in CSK vs MI tonight?"*
2. **The Engaged Fan** — *"Was Kohli actually clutch in the 2024 final?"*
3. **The Stats Curious** — *"Compare Bumrah vs Rashid in death overs."*

These three queries are also the **canonical demo prompts** (Section 11).

---

## 5. Core user flow (the ONLY flow we build)

```
[Landing page with single input]
        ↓ user types question
[Streaming response area opens]
        ↓ live updates
   "🤔 Thinking…"
   "🔧 Called get_player_stats(player='Kohli', tournament='IPL2024')"
   "🔧 Called filter_by_phase(phase='final', situation='chase')"
   "📊 Computed clutch index"
   "✍️  Writing insight…"
        ↓
[Final answer card]
   • Headline (1 sentence)
   • Insight paragraph (3-4 sentences, plain English)
   • Mini chart (SVG bar/sparkline rendered from agent's chart_data)
   • "Sources: 47 deliveries analyzed" pill
   • Suggested follow-up questions (3 chips)
```

**There is no login, no settings, no history persistence, no user accounts.** One input. One agentic answer. That is the entire product for the demo.

---

## 6. Agent architecture

### 6.1 Loop
Single agent, multi-turn function-calling loop using GPT-4o-mini's tool-use API.

```
loop:
  call gpt-4o-mini(messages, tools=TOOL_SCHEMA, stream=true)
  if response.tool_calls:
      for each tool_call:
          execute locally (pure JS over dataset)
          append result to messages
          stream tool-call event to UI
      continue loop
  else:
      stream final assistant content to UI
      break
```

Max 5 tool-call rounds (safety cap). Temperature 0.3. `gpt-4o-mini` handles this loop fine; we keep tool outputs small (<2KB each) to stay snappy.

### 6.2 Tools (5 total — designed to be composable)

| Tool | Inputs | Returns | Purpose |
|---|---|---|---|
| `get_player_stats` | `player`, `tournament?`, `phase?` (powerplay/middle/death), `vs_team?` | runs, balls, SR, avg, wickets, economy | Foundational lookup |
| `compare_players` | `players[]`, `metric`, `filters?` | side-by-side rows | Comparisons |
| `match_context` | `match_id` | teams, venue, toss, result, key moments | Background for narrative |
| `clutch_index` | `player`, `definition?` (default: last-5-overs in chase) | composite score 0–100 + breakdown | The "smart" tool — judges love this |
| `head_to_head` | `batter`, `bowler` | balls, runs, dismissals, SR | Matchup queries |

All tools are **pure JS functions over a static dataset**. No external API calls. Deterministic, fast, demo-safe.

### 6.3 System prompt (verbatim, ~200 tokens)

```
You are AskCricket, an expert cricket analyst agent for IPL data.

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
4. Prefer concrete numbers over adjectives.
```

JSON-mode output → trivial frontend rendering, no parsing fragility.

---

## 7. Data

**Source:** [Cricsheet](https://cricsheet.org) IPL JSON (free, ball-by-ball, no auth required).

**Scope for demo:** 5 hand-picked marquee matches (the 3 demo prompts must always work).
- IPL 2024 Final
- A high-stakes Bumrah death-overs spell
- A Kohli chase
- A CSK vs MI clash
- One Rashid Khan game

**Format:** Flatten Cricsheet JSON into a single `data.json` (~2-5 MB) of deliveries:
```json
{ "match_id", "innings", "over", "ball", "batter", "bowler",
  "runs_batter", "runs_extras", "wicket", "phase", "venue", "result" }
```

**Storage:** Bundle into the Worker as an imported module (`import data from './data.json'`). Avoids KV/R2 setup overhead. ~5 MB is well under the 10 MB Worker size limit when gzipped.

---

## 8. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Compute | Cloudflare Workers | Native streaming, fast cold start, one-command deploy |
| Static UI | Workers Assets (`assets` binding in `wrangler.toml`) | Single deployment artifact, no separate Pages project |
| Frontend | Vanilla HTML + minimal JS + Tailwind via CDN | Zero build step at 2hr budget |
| LLM | Azure OpenAI `gpt-4o-mini` deployment | Constraint |
| Streaming | Server-Sent Events from Worker to browser | Simpler than WebSocket, plays well with Workers |
| Secrets | `wrangler secret put AZURE_OPENAI_KEY` | Standard |
| Dataset | Static JSON imported into Worker bundle | Zero infra |

### `wrangler.toml` skeleton
```toml
name = "askcricket"
main = "src/worker.js"
compatibility_date = "2025-01-01"

[assets]
directory = "./public"
binding = "ASSETS"

[vars]
AZURE_OPENAI_ENDPOINT = "https://<resource>.openai.azure.com"
AZURE_OPENAI_DEPLOYMENT = "gpt-4o-mini"
AZURE_OPENAI_API_VERSION = "2024-10-21"
```
Secret: `AZURE_OPENAI_KEY`.

### File layout
```
/
├── wrangler.toml
├── src/
│   ├── worker.js        # entry: routes / and /api/ask
│   ├── agent.js         # LLM loop + tool dispatch
│   ├── tools.js         # 5 tool implementations
│   ├── azure.js         # Azure OpenAI fetch wrapper
│   └── data.json        # flattened Cricsheet
└── public/
    ├── index.html       # one input, streaming pane, answer card
    ├── app.js           # SSE client, chart renderer
    └── style.css        # minimal Tailwind overrides
```

---

## 9. UI/UX spec

### 9.1 Landing
- Dark background, single centered `<input>` styled like search.
- Placeholder rotates through 3 prompts every 3s.
- "✨ Powered by an agent that uses real ball-by-ball data" microcopy beneath.
- Three suggestion chips below input (the demo prompts).

### 9.2 Answer view (after submit)

```
┌─────────────────────────────────────────────────────────┐
│  > Was Kohli clutch in the 2024 final?                  │
├─────────────────────────────────────────────────────────┤
│  [🔧 get_player_stats]  [🔧 clutch_index]  [📊]         │  ← chips animate in as tools run
├─────────────────────────────────────────────────────────┤
│  HEADLINE                                                │
│  Kohli scored 76 in the final, but his clutch index     │
│  in the last 5 overs was only 42/100.                   │
│                                                          │
│  INSIGHT                                                 │
│  Across the final's death overs, Kohli faced 18 balls   │
│  and scored 19 runs (SR 105) — well below his career    │
│  death-overs SR of 138. He played the anchor role…      │
│                                                          │
│  [ mini bar chart: SR by over phase ]                   │
│                                                          │
│  📚 Sources: 47 deliveries from IPL 2024 final          │
│                                                          │
│  Try next:                                              │
│  [Compare with Rohit] [What about chases?] [Why low?]   │
└─────────────────────────────────────────────────────────┘
```

### 9.3 The three wow moments
1. **Tool chips animate in real-time** — judges literally see the agent reasoning.
2. **The clutch_index tool** — a defensible "smart metric" that feels like product, not API wrapping.
3. **Followup chips that actually work** — one click = next demo query, makes the demo feel infinite.

---

## 10. Two-hour build timeline (minute-by-minute)

| Time | Task | Deliverable |
|---|---|---|
| **0:00–0:10** | `npm create cloudflare`, project skeleton, `wrangler.toml`, secret set | Worker that returns "hello" deployed |
| **0:10–0:30** | Download 5 Cricsheet JSONs, write flattener script, produce `data.json` | `data.json` with ~5k deliveries |
| **0:30–0:55** | Implement 5 tools in `tools.js` against `data.json`; quick sanity tests | All tools return correct numbers for demo prompts |
| **0:55–1:20** | `agent.js` — Azure OpenAI loop with function calling + SSE streaming | `curl /api/ask` returns streaming agent output |
| **1:20–1:45** | `public/index.html` + `app.js` — input, SSE consumer, tool chips, answer card, SVG mini-chart | End-to-end working in browser |
| **1:45–1:55** | Run all 3 demo prompts, fix any failures, polish copy | All 3 demos flawless |
| **1:55–2:00** | `wrangler deploy`, take screenshots, write 60-sec pitch | Live URL + pitch ready |

**Slip budget:** If 1:20 hits and SSE isn't working, fall back to non-streaming JSON response and *fake* the chip animation client-side (timed reveals). Demo still works. Never let infra eat the UI polish.

---

## 11. Demo script

### Pitch (60 seconds, verbatim)
> *"Cricket generates more data per match than any other sport — but fans get pie charts. AskCricket is an agent that reads every ball and explains the game like a personal analyst. Watch."*
>
> *[Type prompt 1] "Was Kohli clutch in the 2024 final?"*
>
> *"See the tool calls? The agent isn't hallucinating — it just analyzed 47 deliveries and computed a clutch index. The answer comes with sources and a chart. Click any follow-up, the conversation continues."*
>
> *"This plugs into Dream11 for captain picks, into Hotstar as a sidebar during live matches, into Cricbuzz as a premium feature. Built in 2 hours on Cloudflare Workers + Azure OpenAI. Thanks."*

### Three canonical demo prompts (must work flawlessly)
1. **"Was Kohli clutch in the 2024 final?"** — exercises `get_player_stats`, `clutch_index`, `match_context`
2. **"Compare Bumrah vs Rashid in death overs"** — exercises `compare_players` with phase filter
3. **"Who should I pick captain for CSK vs MI?"** — exercises `head_to_head`, `get_player_stats` across players; agent makes a *reasoned* pick (not random)

---

## 12. Explicitly out of scope (2-hour discipline)

- ❌ User authentication / accounts / history
- ❌ Live match data / real-time feeds
- ❌ More than 5 matches in dataset
- ❌ Mobile responsive polish beyond "doesn't break"
- ❌ Error states beyond a generic "try again" toast
- ❌ Rate limiting, analytics, observability
- ❌ Tests
- ❌ TypeScript, build tooling, frameworks
- ❌ Image generation, voice, video
- ❌ More than 5 tools

If something on this list is tempting mid-build: **stop, ship, polish demo instead.**

---

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Azure rate limit / latency spike during demo | Pre-warm with a dry-run query 30s before pitch; have a recorded backup video |
| GPT-4o-mini hallucinates despite tools | System prompt forbids guessing; JSON mode enforces structure; tool outputs always include source counts |
| SSE flaky on Workers | Fallback: non-streaming endpoint with client-side reveal animation (drop-in swap) |
| Cricsheet JSON shape mismatch | Lock dataset shape at 0:30; downstream code reads only the flattened format |
| Live network at venue fails | Run dev tunnel + have screenshots/video; pitch the architecture even if live demo blips |

---

## 14. Success criteria

**Demo success (primary):**
- All 3 canonical prompts return correct, well-formatted insights with visible tool chips within 10 seconds.
- Deployed at a public URL judges can hit on their phones.

**Judging success (secondary):**
- At least one judge says some variation of "I can see this as a real product."
- Agent architecture is mentioned approvingly during Q&A.

---

## 15. Post-hackathon (only if we win — do not build during the 2 hours)

- Live data via Cricsheet daily updates
- WhatsApp/Telegram bot interface
- Player voice cloning for narrated insights
- Multi-language (Hindi, Gujarati, Tamil)
- Embed SDK for sports-media partners

---

**End of PRD. Ship it.**
