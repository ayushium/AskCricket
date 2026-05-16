/**
 * Flattens Cricsheet IPL JSON match files into a single src/data.json
 * Usage: node scripts/flatten.js
 * Reads:  ./raw_matches/*.json
 * Writes: ./src/data.json
 */

import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join, basename } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RAW_DIR = join(ROOT, "raw_matches");
const OUT_FILE = join(ROOT, "src", "data.json");

function derivePhase(over) {
  if (over <= 5) return "powerplay";
  if (over <= 14) return "middle";
  return "death";
}

function processMatch(filePath) {
  const raw = JSON.parse(readFileSync(filePath, "utf8"));
  const info = raw.info ?? {};
  const teams = info.teams ?? [];
  const venue = info.venue ?? "Unknown";
  const outcome = info.outcome ?? {};
  const result = outcome.winner ?? outcome.result ?? "no result";
  const matchId = basename(filePath, ".json");
  const date = (info.dates ?? [])[0] ?? "";
  const season = date.startsWith("2025") ? "2025" : date.startsWith("2024") ? "2024" : "unknown";
  const stage = info.event?.stage ?? "";

  const rows = [];

  (raw.innings ?? []).forEach((inning, inningIdx) => {
    const teamBatting = inning.team ?? teams[inningIdx] ?? "Unknown";
    const teamBowling = teams.find((t) => t !== teamBatting) ?? "Unknown";
    const inningsNum = inningIdx + 1;

    (inning.overs ?? []).forEach((overObj) => {
      const overNum = overObj.over ?? 0;
      const phase = derivePhase(overNum);

      (overObj.deliveries ?? []).forEach((delivery, ballIdx) => {
        const runs = delivery.runs ?? {};
        rows.push({
          match_id: matchId,
          season,
          date,
          stage,
          innings: inningsNum,
          over: overNum,
          ball: ballIdx + 1,
          batter: delivery.batter ?? "",
          bowler: delivery.bowler ?? "",
          runs_batter: runs.batter ?? 0,
          runs_extras: runs.extras ?? 0,
          wicket: Array.isArray(delivery.wickets) && delivery.wickets.length > 0,
          phase,
          venue,
          team_batting: teamBatting,
          team_bowling: teamBowling,
          result,
        });
      });
    });
  });

  return rows;
}

// --- Main ---
const files = readdirSync(RAW_DIR).filter((f) => f.endsWith(".json"));

if (files.length === 0) {
  console.error(
    "No JSON files found in ./raw_matches/\n" +
    "Download IPL matches from https://cricsheet.org/downloads/\n" +
    "See README in raw_matches/ for exact files needed."
  );
  process.exit(1);
}

const allRows = [];
let skipped = 0;

for (const file of files) {
  try {
    const rows = processMatch(join(RAW_DIR, file));
    allRows.push(...rows);
    console.log(`  ✓ ${file} — ${rows.length} deliveries`);
  } catch (err) {
    console.warn(`  ✗ ${file} — skipped (${err.message})`);
    skipped++;
  }
}

writeFileSync(OUT_FILE, JSON.stringify(allRows));

const sizeMB = (Buffer.byteLength(JSON.stringify(allRows)) / 1024 / 1024).toFixed(2);
console.log(`\nWrote ${allRows.length} rows to src/data.json (${sizeMB} MB)`);
if (skipped > 0) console.warn(`Skipped ${skipped} files due to errors`);

// Sanity stats
const players = [...new Set(allRows.map((r) => r.batter))];
const matches = [...new Set(allRows.map((r) => r.match_id))];
console.log(`Matches: ${matches.length} | Unique batters: ${players.length}`);
