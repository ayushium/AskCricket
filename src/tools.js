/**
 * Tool implementations — pure JS functions over the bundled delivery dataset.
 * No I/O, no async, no side effects. All functions are safe to call from the agent loop.
 *
 * Dataset shape (per delivery row):
 * { match_id, season, date, stage, innings, over, ball, batter, bowler,
 *   runs_batter, runs_extras, wicket, phase, venue, team_batting, team_bowling, result }
 */

import DELIVERIES from "./data.json" with { type: "json" };

// ─── helpers ────────────────────────────────────────────────────────────────

function matches(str, query) {
  return str.toLowerCase().includes(query.toLowerCase());
}

function safe(n, d = 0) {
  return isFinite(n) ? Math.round(n * 100) / 100 : d;
}

function mapClamp(v, inMin, inMax, outMin = 0, outMax = 100) {
  const t = Math.max(0, Math.min(1, (v - inMin) / (inMax - inMin)));
  return Math.round(outMin + t * (outMax - outMin));
}

function battingStats(rows) {
  if (rows.length === 0) return null;
  const runs = rows.reduce((s, r) => s + r.runs_batter, 0);
  const balls = rows.length;
  const dismissals = rows.filter((r) => r.wicket).length;
  const fours = rows.filter((r) => r.runs_batter === 4).length;
  const sixes = rows.filter((r) => r.runs_batter === 6).length;
  return {
    balls,
    runs,
    dismissals,
    strike_rate: safe(balls ? (runs / balls) * 100 : 0),
    average: safe(dismissals ? runs / dismissals : runs),
    boundary_pct: safe(balls ? ((fours + sixes) / balls) * 100 : 0),
  };
}

function bowlingStats(rows) {
  if (rows.length === 0) return null;
  const balls = rows.length;
  const runs_conceded = rows.reduce((s, r) => s + r.runs_batter + r.runs_extras, 0);
  const wickets = rows.filter((r) => r.wicket).length;
  const dots = rows.filter((r) => r.runs_batter === 0 && r.runs_extras === 0).length;
  return {
    balls,
    runs_conceded,
    wickets,
    economy: safe(balls ? (runs_conceded / balls) * 6 : 0),
    dot_pct: safe(balls ? (dots / balls) * 100 : 0),
  };
}

// ─── T2.1 — get_player_stats ─────────────────────────────────────────────────

export function get_player_stats({ player, phase, vs_team, season }) {
  if (!player) return { error: "player is required" };

  let rows = DELIVERIES;
  if (season) rows = rows.filter((r) => r.season === String(season));
  if (phase) rows = rows.filter((r) => r.phase === phase);
  if (vs_team) rows = rows.filter((r) => matches(r.team_bowling, vs_team) || matches(r.team_batting, vs_team));

  const battingRows = rows.filter((r) => matches(r.batter, player));
  const bowlingRows = rows.filter((r) => matches(r.bowler, player));

  return {
    player,
    filters: { season: season || "all", phase: phase || "all", vs_team: vs_team || "all" },
    batting: battingStats(battingRows),
    bowling: bowlingStats(bowlingRows),
  };
}

// ─── T2.2 — compare_players ──────────────────────────────────────────────────

export function compare_players({ players, metric, filters = {} }) {
  if (!players || players.length < 2) return { error: "provide at least 2 players" };

  const validMetrics = ["strike_rate", "average", "economy", "boundary_pct", "wickets", "runs", "dot_pct"];
  if (!validMetrics.includes(metric)) {
    return { error: `metric must be one of: ${validMetrics.join(", ")}` };
  }

  // filters may include { phase, vs_team, season }
  const rows = players.map((player) => {
    const stats = get_player_stats({ player, ...filters });
    const isBowlingMetric = ["economy", "wickets", "dot_pct"].includes(metric);
    const src = isBowlingMetric ? stats.bowling : stats.batting;
    const value = src ? (src[metric] ?? null) : null;
    const sample_size = src ? src.balls : 0;
    return { player, value, sample_size };
  });

  // Sort: economy lower is better, everything else higher is better
  const sorted = rows.sort((a, b) => {
    if (a.value === null) return 1;
    if (b.value === null) return -1;
    return metric === "economy" ? a.value - b.value : b.value - a.value;
  });

  return { metric, filters, rows: sorted };
}

// ─── T2.3 — match_context ────────────────────────────────────────────────────

export function match_context({ match_id }) {
  if (!match_id) return { error: "match_id is required" };

  const rows = DELIVERIES.filter((r) => r.match_id === match_id);
  if (rows.length === 0) {
    const available = [...new Set(DELIVERIES.map((r) => r.match_id))];
    return { error: "match not found", available_matches: available };
  }

  const inn1 = rows.filter((r) => r.innings === 1);
  const inn2 = rows.filter((r) => r.innings === 2);
  const sample = rows[0];

  const teams = [...new Set(rows.map((r) => r.team_batting))];

  return {
    match_id,
    season: sample.season,
    date: sample.date,
    stage: sample.stage,
    teams,
    venue: sample.venue,
    result: sample.result,
    total_runs_innings1: inn1.reduce((s, r) => s + r.runs_batter + r.runs_extras, 0),
    total_runs_innings2: inn2.reduce((s, r) => s + r.runs_batter + r.runs_extras, 0),
    wickets_innings1: inn1.filter((r) => r.wicket).length,
    wickets_innings2: inn2.filter((r) => r.wicket).length,
  };
}

// ─── T2.3b — find_matches ────────────────────────────────────────────────────

export function find_matches({ season, stage, team }) {
  const matchMap = new Map();
  for (const r of DELIVERIES) {
    if (season && r.season !== String(season)) continue;
    if (stage && !r.stage.toLowerCase().includes(stage.toLowerCase())) continue;
    if (team && !matches(r.team_batting, team) && !matches(r.team_bowling, team)) continue;
    if (!matchMap.has(r.match_id)) {
      matchMap.set(r.match_id, {
        match_id: r.match_id,
        season: r.season,
        date: r.date,
        stage: r.stage,
        venue: r.venue,
        result: r.result,
        teams: new Set(),
      });
    }
    matchMap.get(r.match_id).teams.add(r.team_batting);
  }

  const result = [...matchMap.values()].map((m) => ({ ...m, teams: [...m.teams] }));
  result.sort((a, b) => a.date.localeCompare(b.date));

  return { filters: { season, stage, team }, matches: result };
}

// ─── T2.4 — clutch_index ─────────────────────────────────────────────────────

export function clutch_index({ player, season, definition }) {
  if (!player) return { error: "player is required" };

  // Scope: death overs in 2nd innings (chases) — the highest-pressure situation
  let deathRows = DELIVERIES.filter(
    (r) => r.phase === "death" && r.innings === 2
  );
  if (season) deathRows = deathRows.filter((r) => r.season === String(season));

  const battingRows = deathRows.filter((r) => matches(r.batter, player));
  const bowlingRows = deathRows.filter((r) => matches(r.bowler, player));

  const role = battingRows.length >= bowlingRows.length ? "batter" : "bowler";
  const relevantRows = role === "batter" ? battingRows : bowlingRows;
  const sample_size = relevantRows.length;

  if (sample_size === 0) {
    return {
      player,
      definition: definition || "death overs in 2nd innings (chases)",
      score: null,
      breakdown: null,
      interpretation: "Insufficient data — player not found in death-over chase situations.",
    };
  }

  let performance_component, pressure_component;

  if (role === "batter") {
    const stats = battingStats(battingRows);
    // SR: 80→0, 200→100
    performance_component = mapClamp(stats.strike_rate, 80, 200);
    // boundary %: 0→0, 40→100
    pressure_component = mapClamp(stats.boundary_pct, 0, 40);
  } else {
    const stats = bowlingStats(bowlingRows);
    // economy: 12→0, 6→100 (lower economy = better)
    performance_component = mapClamp(stats.economy, 12, 6);
    // dot %: 0→0, 60→100
    pressure_component = mapClamp(stats.dot_pct, 0, 60);
  }

  // Confidence: caps at 50 balls for full weight
  const confidence_component = mapClamp(sample_size, 0, 50);

  const score = Math.round(
    0.4 * performance_component +
    0.3 * pressure_component +
    0.3 * confidence_component
  );

  const level =
    score >= 75 ? "Elite clutch performer" :
    score >= 55 ? "Above-average clutch performer" :
    score >= 35 ? "Average under pressure" :
    "Struggles in clutch situations";

  return {
    player,
    definition: definition || "death overs in 2nd innings (chases)",
    score,
    breakdown: {
      role,
      sample_size,
      performance_component,
      pressure_component,
      confidence_component,
    },
    interpretation: `${level} in death-over chases (score: ${score}/100, based on ${sample_size} balls).`,
  };
}

// ─── T2.5 — head_to_head ─────────────────────────────────────────────────────

export function head_to_head({ batter, bowler, season }) {
  if (!batter || !bowler) return { error: "batter and bowler are required" };

  let rows = DELIVERIES.filter(
    (r) => matches(r.batter, batter) && matches(r.bowler, bowler)
  );
  if (season) rows = rows.filter((r) => r.season === String(season));

  if (rows.length === 0) {
    return { batter, bowler, balls: 0, runs: 0, dismissals: 0, strike_rate: 0, dot_pct: 0, boundary_pct: 0 };
  }

  const stats = battingStats(rows);
  const dismissals = rows.filter((r) => r.wicket).length;

  return {
    batter,
    bowler,
    balls: stats.balls,
    runs: stats.runs,
    dismissals,
    strike_rate: stats.strike_rate,
    dot_pct: safe(stats.balls ? (rows.filter((r) => r.runs_batter === 0 && r.runs_extras === 0).length / stats.balls) * 100 : 0),
    boundary_pct: stats.boundary_pct,
  };
}

// ─── T2.6 — Tool registry + OpenAI function-calling schemas ──────────────────

export const TOOLS = {
  get_player_stats,
  compare_players,
  match_context,
  find_matches,
  clutch_index,
  head_to_head,
};

export const TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "get_player_stats",
      description:
        "Get batting and/or bowling stats for a cricket player filtered by phase or opponent. Always call this before making any claim about a player's performance.",
      parameters: {
        type: "object",
        properties: {
          player: { type: "string", description: "Player name, e.g. 'Kohli', 'Bumrah'" },
          season: { type: "string", enum: ["2024", "2025"], description: "IPL season to filter by — ALWAYS set this when the question mentions a specific year" },
          phase: {
            type: "string",
            enum: ["powerplay", "middle", "death"],
            description: "Over phase to filter by",
          },
          vs_team: { type: "string", description: "Opponent team name to filter by" },
        },
        required: ["player"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_players",
      description:
        "Compare two or more players side-by-side on a specific metric. Use for 'X vs Y' questions.",
      parameters: {
        type: "object",
        properties: {
          players: {
            type: "array",
            items: { type: "string" },
            description: "List of player names to compare (2–4 players)",
          },
          metric: {
            type: "string",
            enum: ["strike_rate", "average", "economy", "boundary_pct", "wickets", "runs", "dot_pct"],
            description: "The metric to compare on",
          },
          filters: {
            type: "object",
            description: "Optional filters: { phase, vs_team, season }",
            properties: {
              phase: { type: "string", enum: ["powerplay", "middle", "death"] },
              vs_team: { type: "string" },
              season: { type: "string", enum: ["2024", "2025"] },
            },
          },
        },
        required: ["players", "metric"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "match_context",
      description:
        "Get match metadata — teams, venue, scores, result — for a given match ID. Use to provide background context for a specific game. Response now includes season, date, and stage fields.",
      parameters: {
        type: "object",
        properties: {
          match_id: {
            type: "string",
            description: "Cricsheet match ID (filename without .json)",
          },
        },
        required: ["match_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_matches",
      description:
        "Find matches by season (2024 or 2025), stage (e.g. 'Final', 'Qualifier'), or team. Use this FIRST when the question mentions 'IPL 2024 final', 'IPL 2025 winner', 'playoffs', etc. Returns match_id, date, stage, teams, result.",
      parameters: {
        type: "object",
        properties: {
          season: { type: "string", enum: ["2024", "2025"], description: "IPL season" },
          stage: { type: "string", description: "Match stage, e.g. 'Final', 'Qualifier 1', 'Eliminator'" },
          team: { type: "string", description: "Filter to matches involving this team" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "clutch_index",
      description:
        "Compute a player's clutch index (0–100) — a composite score measuring performance in death overs during chases. Use for 'was X clutch?' or 'who performs under pressure?' questions.",
      parameters: {
        type: "object",
        properties: {
          player: { type: "string", description: "Player name" },
          season: { type: "string", enum: ["2024", "2025"], description: "IPL season to scope the calculation" },
          definition: {
            type: "string",
            description: "Optional custom definition of 'clutch' (default: death overs in 2nd innings)",
          },
        },
        required: ["player"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "head_to_head",
      description:
        "Get head-to-head stats between a specific batter and bowler — balls faced, runs, dismissals, strike rate. Use for matchup questions.",
      parameters: {
        type: "object",
        properties: {
          batter: { type: "string", description: "Batter's name" },
          bowler: { type: "string", description: "Bowler's name" },
          season: { type: "string", enum: ["2024", "2025"], description: "IPL season to filter" },
        },
        required: ["batter", "bowler"],
      },
    },
  },
];

export function getDeliveryCount() {
  return DELIVERIES.length;
}
