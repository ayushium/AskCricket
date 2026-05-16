# AskCricket — Project Plan

**Companion to:** `PRD.md`
**Total budget:** 120 minutes (2 hours)
**Methodology:** Time-boxed waterfall with hard exit gates. Each phase must hit its milestone before the next begins. If a phase slips, the **slip absorption rules** in §8 apply.

---

## 1. Plan at a glance

| Phase | Name | Window | Duration | Milestone (exit gate) |
|---|---|---|---|---|
| **P0** | Foundation Setup | 0:00 – 0:15 | 15 min | `M0` — "Hello World" Worker deployed on a public `*.workers.dev` URL |
| **P1** | Data Layer | 0:15 – 0:35 | 20 min | `M1` — `data.json` bundled into Worker, sample query returns valid rows |
| **P2** | Tools Layer | 0:35 – 0:55 | 20 min | `M2` — All 5 tools return correct numbers for the 3 canonical demo prompts (verified manually) |
| **P3** | Agent Layer | 0:55 – 1:20 | 25 min | `M3` — `curl /api/ask` streams a valid JSON insight for prompt #1 end-to-end |
| **P4** | Frontend Layer | 1:20 – 1:45 | 25 min | `M4` — Browser flow works for all 3 prompts: chips animate, JSON renders, chart draws |
| **P5** | Demo Hardening | 1:45 – 2:00 | 15 min | `M5` — Deployed, dry-run rehearsed, pitch ready, backup video recorded |

Critical path: **P0 → P1 → P2 → P3 → P4 → P5** (strictly sequential — no parallelism for a solo dev).

---

## 2. Phase 0 — Foundation Setup (0:00 – 0:15)

### Goal
Stand up the deployment pipeline first. **Never debug deployment with 10 minutes left.**

### Entry criteria
- Azure OpenAI resource exists with `gpt-4o-mini` deployment
- Cloudflare account exists and `wrangler` is authenticated (`wrangler login` done)
- Node.js installed locally

### Tasks
| # | Task | Est. |
|---|---|---|
| 0.1 | `npm create cloudflare@latest askcricket` → choose "Hello World" Worker, JS, no Git, deploy=yes | 5 min |
| 0.2 | Edit `wrangler.toml` to add `[assets]` binding for `./public` and `[vars]` for Azure endpoint/deployment/API version | 3 min |
| 0.3 | `wrangler secret put AZURE_OPENAI_KEY` (paste key) | 2 min |
| 0.4 | Create folder structure: `src/`, `public/`, empty stub files (`agent.js`, `tools.js`, `azure.js`, `index.html`, `app.js`) | 3 min |
| 0.5 | `wrangler deploy` → confirm public URL responds | 2 min |

### Exit criteria (M0)
- [x] Public URL returns "Hello AskCricket"
- [x] `wrangler secret list` shows `AZURE_OPENAI_KEY`
- [x] File skeleton in place

### Deliverable
A deployed, empty Worker on a real URL. **You are no longer at risk of "doesn't deploy" being a 1:55 surprise.**

### Risk + fallback
- *Risk:* `wrangler login` flow fails / 2FA loop. **Fallback:** use `CLOUDFLARE_API_TOKEN` env var instead.
- *Risk:* Account doesn't auto-provision `*.workers.dev` subdomain. **Fallback:** Cloudflare dashboard → Workers → enable subdomain manually (60 sec).

---

## 3. Phase 1 — Data Layer (0:15 – 0:35)

### Goal
Produce a single static `data.json` with enough deliveries to power all 3 demo prompts. **Lock the schema now**; everything downstream depends on it.

### Entry criteria
- M0 complete
- Internet access for Cricsheet downloads

### Tasks
| # | Task | Est. |
|---|---|---|
| 1.1 | Download 5 match JSONs from cricsheet.org/downloads/ (IPL 2024 Final, a Bumrah death-overs game, a Kohli chase, a CSK vs MI, a Rashid Khan game) | 5 min |
| 1.2 | Write a 30-line Node script `scripts/flatten.js` that walks `innings[].overs[].deliveries[]` and emits flat rows | 8 min |
| 1.3 | Define and lock the flat row schema: `{match_id, innings, over, ball, batter, bowler, runs_batter, runs_extras, wicket, phase, venue, result}` where `phase = "powerplay"\|"middle"\|"death"` derived from over number | 2 min |
| 1.4 | Run flattener → output `src/data.json`; sanity check size (<5 MB) and row count (>5,000) | 3 min |
| 1.5 | Add `import data from './data.json'` in `tools.js`; log row count from Worker to confirm bundling works | 2 min |

### Exit criteria (M1)
- [x] `src/data.json` exists, valid JSON, <5 MB
- [x] Contains rows for: Kohli (≥30 balls in 2024 final), Bumrah (death overs), Rashid Khan, CSK vs MI deliveries
- [x] `wrangler dev` shows correct row count in console

### Deliverable
A frozen, queryable dataset. **No more data changes after this gate** — if a tool needs missing data, it adapts; the dataset does not.

### Risk + fallback
- *Risk:* Cricsheet schema variation between match files. **Fallback:** wrap each match-file read in try/catch; skip malformed; ensure ≥3 matches load cleanly.
- *Risk:* Bundle exceeds 10 MB after import. **Fallback:** drop `extras` detail fields; keep only the 11 columns above.

---

## 4. Phase 2 — Tools Layer (0:35 – 0:55)

### Goal
Implement all 5 tools as pure JS functions. Each must be **fast (<50ms), deterministic, and return small payloads (<2KB)**.

### Entry criteria
- M1 complete
- Schema locked

### Tasks
| # | Task | Est. |
|---|---|---|
| 2.1 | `get_player_stats(player, tournament?, phase?, vs_team?)` — filter+aggregate | 4 min |
| 2.2 | `compare_players(players[], metric, filters?)` — reuses 2.1 internals | 3 min |
| 2.3 | `match_context(match_id)` — lookup teams, venue, toss, result | 2 min |
| 2.4 | `clutch_index(player, definition?)` — composite of (SR in death overs in chases) + (% balls faced in last 5 overs) + (boundary % under pressure). Returns 0–100 + breakdown. **This is the signature "smart" tool.** | 6 min |
| 2.5 | `head_to_head(batter, bowler)` — filter dataset where batter+bowler match | 3 min |
| 2.6 | Quick sanity script: call each tool once with demo-prompt inputs, log outputs, eyeball for correctness | 2 min |

### Exit criteria (M2)
- [x] All 5 tools exported from `tools.js`
- [x] Each returns a JS object that JSON-serializes cleanly
- [x] Manual run confirms: `get_player_stats('Kohli', phase:'death')` returns >0 balls; `clutch_index('Kohli')` returns a number 0–100; `head_to_head('Bumrah', batter not relevant)` works
- [x] Tool schema definitions ready (the OpenAI function-calling JSON spec for each tool)

### Deliverable
A `tools.js` module that the agent layer can call without further changes.

### Risk + fallback
- *Risk:* `clutch_index` formula returns nonsense (e.g., 0 for everyone). **Fallback:** simplify to just "SR in last 5 overs / career SR × 100"; ship, polish later if time.
- *Risk:* Player name matching fails (e.g., "Kohli" vs "V Kohli"). **Fallback:** add case-insensitive substring matching in every tool's player filter.

---

## 5. Phase 3 — Agent Layer (0:55 – 1:20)

### Goal
Wire GPT-4o-mini via Azure to the tools, stream the reasoning trace + final answer to the client via SSE.

### Entry criteria
- M2 complete
- Tools callable in-process

### Tasks
| # | Task | Est. |
|---|---|---|
| 3.1 | `azure.js` — thin fetch wrapper: POST to `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=...` with auth header `api-key: ${AZURE_OPENAI_KEY}` | 4 min |
| 3.2 | `agent.js` — function-calling loop: (a) send messages+tools, (b) on `tool_calls`, dispatch to `tools.js`, append results, loop; (c) on text completion, parse JSON, return | 8 min |
| 3.3 | Tool-call streaming events: emit SSE event `tool_call` with `{name, args}` *before* executing each tool, so UI chips can animate in real-time | 4 min |
| 3.4 | System prompt (per PRD §6.3); set `response_format: {type:"json_object"}`, `temperature: 0.3`, `max_tokens: 800` | 2 min |
| 3.5 | Wire `/api/ask` route in `worker.js`: parse `?q=` (or POST body), set SSE headers (`Content-Type: text/event-stream`), pipe agent events to response stream | 5 min |
| 3.6 | `curl -N 'https://.../api/ask?q=...'` end-to-end test for demo prompt #1 | 2 min |

### Exit criteria (M3)
- [x] `curl` streams: ≥1 `tool_call` event, then final JSON `{headline, insight, chart, sources, followups}`
- [x] Tool-call events arrive *before* the final text (not all at once)
- [x] No 401/429 from Azure on a single request
- [x] Round-trip latency for prompt #1 < 10 seconds

### Deliverable
A working agentic API endpoint. **Backend feature-complete.**

### Risk + fallback
- *Risk:* SSE doesn't work on Workers due to buffering. **Fallback:** return a single non-streaming JSON response; client fakes chip animation with `setTimeout`. Demo still works.
- *Risk:* GPT-4o-mini ignores tools and tries to answer directly. **Fallback:** strengthen system prompt with "You MUST call at least one tool before responding"; set `tool_choice: "required"` on first turn.
- *Risk:* JSON mode produces invalid JSON. **Fallback:** wrap parse in try/catch; on failure, return raw text in `insight` and skip chart.

---

## 6. Phase 4 — Frontend Layer (1:20 – 1:45)

### Goal
Single-page UI that consumes the SSE stream and renders the wow moments.

### Entry criteria
- M3 complete
- Backend stable on a public URL

### Tasks
| # | Task | Est. |
|---|---|---|
| 4.1 | `index.html` — Tailwind CDN, dark theme, centered input, three suggestion chips wired to the canonical prompts | 5 min |
| 4.2 | `app.js` — on submit, open `new EventSource('/api/ask?q=...')`; handle event types `tool_call`, `final`; render to DOM | 6 min |
| 4.3 | Tool-call chip component — slides in from the left, shows tool name + truncated args, ~250ms entrance animation (Tailwind `transition`) | 4 min |
| 4.4 | Answer card — render `headline` (big), `insight` (body), `sources` (pill), `followups` (3 clickable chips that re-trigger flow) | 4 min |
| 4.5 | SVG mini-chart renderer — given `{type, labels, values, unit}`, draw a 300×120 bar or line chart in inline SVG (no library) | 5 min |
| 4.6 | Loading + error states (toasts) | 1 min |

### Exit criteria (M4)
- [x] All 3 demo prompts work end-to-end in a real browser
- [x] Tool chips visibly animate during streaming
- [x] Chart renders correctly for at least 2 of 3 prompts
- [x] Followup chips trigger a fresh flow with no full page reload
- [x] No console errors in DevTools

### Deliverable
A demoable product on a public URL.

### Risk + fallback
- *Risk:* `EventSource` doesn't support POST. **Fallback:** put the question in a query param (URL-encoded). Acceptable for hackathon.
- *Risk:* Chart math breaks on edge cases. **Fallback:** skip chart for that prompt — answer card alone is still demo-worthy.
- *Risk:* Tailwind CDN loads slowly. **Fallback:** inline ~30 lines of critical CSS.

---

## 7. Phase 5 — Demo Hardening (1:45 – 2:00)

### Goal
Convert "it works" into "it wins."

### Entry criteria
- M4 complete

### Tasks
| # | Task | Est. |
|---|---|---|
| 5.1 | Run all 3 canonical demo prompts twice each, fix any flaky output (usually system-prompt tweaks) | 5 min |
| 5.2 | Take 4 screenshots (landing, mid-stream with chips, final answer, followup expanded) | 2 min |
| 5.3 | Record a 30-second screen capture as backup video (in case live demo fails) | 3 min |
| 5.4 | Final `wrangler deploy` (in case of last-minute changes); verify public URL still works | 2 min |
| 5.5 | Rehearse the 60-sec pitch out loud once | 3 min |

### Exit criteria (M5)
- [x] Public URL live and responsive
- [x] Backup video saved locally
- [x] Screenshots saved
- [x] Pitch rehearsed
- [x] Demo prompts memorized — no fumbling at the podium

### Deliverable
**Ship-ready submission.**

---

## 8. Slip absorption rules

If a phase runs over, recover from these in order:

1. **Drop polish, never function.** Cut animation timings, skip the chart for one prompt, drop one of the 5 tools (in priority order: drop `head_to_head` first, then `compare_players`, never drop `clutch_index`).
2. **Drop the 3rd demo prompt** (captain pick). 2 working prompts beat 3 flaky ones.
3. **Drop streaming.** Fall back to a single JSON response with client-side faked chip animation. The Phase 3 fallback is already designed for this.
4. **Hardcode one answer.** If the agent is hopelessly broken at 1:50, hardcode the response for prompt #1 and demo it as a "preview". Honest about limitations beats no demo.

**Never sacrificed, in any scenario:**
- Deployed public URL
- At least one prompt working live
- The 60-sec pitch

---

## 9. Dependency map

```
P0 (deploy) ──► P1 (data) ──► P2 (tools) ──► P3 (agent) ──► P4 (frontend) ──► P5 (demo prep)
                                                  │
                                                  └─► tool schema defs (shared with P3)
```

No phase can start before its predecessor's milestone passes. The only soft parallelism: **the system prompt and the tool JSON schemas can be drafted on paper during P2** so P3 starts faster.

---

## 10. Decision log (record during build)

Use this section to log mid-flight decisions so you don't second-guess later.

| Time | Decision | Reason |
|---|---|---|
| — | — | — |

---

## 11. Definition of Done (project-level)

The project is **done** when *all* of the following are true:

- [ ] Public Cloudflare Workers URL is live and serves the UI
- [ ] All 3 canonical demo prompts return valid, well-formatted answers with visible tool chips in <10s
- [ ] Backup video and screenshots exist locally
- [ ] 60-sec pitch is rehearsed
- [ ] Submission form (if any) is filled with the URL + pitch

Anything beyond this is post-hackathon work and **must not be attempted during the 2 hours.**

---

**End of plan. Execute sequentially. Trust the gates.**
