# AskCricket — Agentic IPL Analyst

A conversational cricket co-pilot that turns ball-by-ball IPL data into instant insights. Ask anything about IPL 2024 & 2025 — the agent reads every delivery to answer.

Built with **Azure OpenAI gpt-5.4-mini** (Responses API), **Cloudflare Workers**, and vanilla JS. No database. No backend framework. Runs entirely at the edge.

---

## Demo

**Live:** http://askcricket.ayushmakwana.com

Try asking:
- *"Was Kohli clutch in IPL 2024?"*
- *"Compare Bumrah vs Rashid Khan in death overs"*
- *"Who won IPL 2025 and by how much?"*
- *"Who should I pick as captain for CSK vs MI?"*

---

## How it works

```
User question
      │
      ▼
  Cloudflare Worker  ──SSE──►  Browser
      │
      ▼
  Agent loop (src/agent.js)
      │  MAX_ROUNDS = 5
      │  tool_choice = "required" on round 0
      │
      ├── get_player_stats   — batting/bowling splits by phase & season
      ├── compare_players    — side-by-side metric comparison
      ├── find_matches       — lookup finals/playoffs by season & stage
      ├── match_context      — scores, teams, result for a match ID
      ├── clutch_index       — composite 0–100 pressure-performance score
      └── head_to_head       — batter vs bowler matchup stats
      │
      ▼
  Azure OpenAI Responses API
  (gpt-5.4-mini, /openai/responses)
      │
      ▼
  JSON answer card → SSE → Browser renders chart + insight
```

The agent is an **async generator** that yields `tool_call` events (shown as animated chips in the UI) and a final `final` event with a structured JSON payload. All tools are pure synchronous JS over a 34 k-delivery in-memory dataset — no network calls, no latency.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Cloudflare Workers | Edge, zero cold starts, free tier |
| AI | Azure OpenAI gpt-5.4-mini | Responses API with native function calling |
| Data | Cricsheet ball-by-ball JSON | 145 matches, 34 388 deliveries, bundled as ES module |
| Frontend | Vanilla JS + Tailwind CDN | No build step, no framework overhead |
| Streaming | Server-Sent Events (SSE) | Simpler than WebSockets, works with Workers' `TransformStream` |

---

## Project structure

```
├── src/
│   ├── worker.js      # Cloudflare Worker entry — routes /api/ask → SSE
│   ├── agent.js       # Agentic loop (async generator, MAX_ROUNDS=5)
│   ├── azure.js       # Azure Responses API wrapper + response normaliser
│   ├── tools.js       # 6 pure-JS tools + OpenAI function-calling schemas
│   └── data.json      # Flattened IPL 2024+2025 ball-by-ball dataset
├── public/
│   ├── index.html     # Chat UI shell
│   └── app.js         # SSE client, chart renderer, UI logic
├── scripts/
│   ├── flatten.js     # Cricsheet JSON → src/data.json flattener
│   └── test-demo.js   # End-to-end demo test harness
├── wrangler.jsonc     # Cloudflare Worker config
└── .dev.vars          # Local secrets (gitignored — see Setup)
```

---

## Setup

### Prerequisites

- Node.js 18+
- A Cloudflare account (free)
- Azure OpenAI resource with **gpt-5.4-mini** deployed

### 1. Install

```bash
git clone https://github.com/ayushium/AskCricket.git
cd AskCricket
npm install
```

### 2. Configure local secrets

Create `.dev.vars` (gitignored — never commit this):

```
AZURE_OPENAI_KEY=your_key_here
AZURE_OPENAI_ENDPOINT=https://your-resource.cognitiveservices.azure.com
AZURE_OPENAI_DEPLOYMENT=gpt-5.4-mini
AZURE_OPENAI_API_VERSION=2025-04-01-preview
```

### 3. Run locally

```bash
npm run dev
# → http://localhost:8787
```

### 4. Deploy to Cloudflare

```bash
# Set production secrets (once)
npx wrangler secret put AZURE_OPENAI_KEY
npx wrangler secret put AZURE_OPENAI_ENDPOINT

# Deploy
npm run deploy
```

---

## Data

The dataset (`src/data.json`) is pre-built from [Cricsheet](https://cricsheet.org/downloads/) ball-by-ball JSONs.

| Field | Description |
|---|---|
| `match_id` | Cricsheet match ID |
| `season` | `"2024"` or `"2025"` |
| `date` | Match date (`YYYY-MM-DD`) |
| `stage` | `"Final"`, `"Qualifier 1"`, etc. (empty for league games) |
| `innings` | 1 or 2 |
| `over` | Over number (0-indexed) |
| `ball` | Ball within the over |
| `batter` / `bowler` | Player names |
| `runs_batter` | Runs off the bat |
| `runs_extras` | Extras on that delivery |
| `wicket` | Boolean |
| `phase` | `"powerplay"` / `"middle"` / `"death"` |
| `venue` | Stadium name |
| `team_batting` / `team_bowling` | Team names |
| `result` | Winning team (or `"no result"`) |

To rebuild the dataset from raw Cricsheet files:

```bash
# Download IPL 2024+2025 JSON files from https://cricsheet.org/downloads/
# Place them in ./raw_matches/
npm run flatten
```

---

## Tools reference

| Tool | Parameters | Use for |
|---|---|---|
| `get_player_stats` | `player`, `season?`, `phase?`, `vs_team?` | Any player stat question |
| `compare_players` | `players[]`, `metric`, `filters?` | "X vs Y" comparisons |
| `find_matches` | `season?`, `stage?`, `team?` | Finding finals, playoffs, team fixtures |
| `match_context` | `match_id` | Match scores, result, teams |
| `clutch_index` | `player`, `season?` | Pressure performance (0–100 composite) |
| `head_to_head` | `batter`, `bowler`, `season?` | Specific batter-vs-bowler matchup |

---

## Built at

**Build with AI · Agentic Premier League — GDG Baroda hackathon** (Problem Statement #2: Data & Insights)

---

## License

MIT — see [LICENSE](LICENSE)
