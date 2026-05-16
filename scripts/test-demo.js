/**
 * Demo prompt test harness — verifies all 3 canonical prompts work end-to-end.
 * Usage: BASE_URL=https://askcricket.<id>.workers.dev node scripts/test-demo.js
 *    or: BASE_URL=http://localhost:8787 node scripts/test-demo.js
 */

const BASE = process.env.BASE_URL || "http://localhost:8787";

const PROMPTS = [
  "Was Kohli clutch in the 2024 final?",
  "Compare Bumrah vs Rashid in death overs",
  "Who should I pick captain for CSK vs MI?",
];

let passed = 0;
let failed = 0;

for (const q of PROMPTS) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`▶  ${q}`);

  try {
    const res = await fetch(`${BASE}/api/ask?q=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let toolCalls = 0;
    let finalPayload = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      let idx;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);

        const lines = chunk.split("\n");
        const event = lines.find((l) => l.startsWith("event: "))?.slice(7);
        const dataLine = lines.find((l) => l.startsWith("data: "))?.slice(6);

        if (!event || !dataLine) continue;

        if (event === "tool_call") {
          const data = JSON.parse(dataLine);
          toolCalls++;
          console.log(`   🔧 ${data.name}(${JSON.stringify(data.args).slice(0, 80)})`);
        }

        if (event === "final") {
          finalPayload = JSON.parse(dataLine).payload;
        }

        if (event === "error") {
          throw new Error(`Agent error: ${dataLine}`);
        }
      }
    }

    // Assertions
    const ok =
      toolCalls > 0 &&
      finalPayload?.headline?.length > 0 &&
      finalPayload?.insight?.length > 0;

    if (ok) {
      console.log(`   ✅ ${finalPayload.headline}`);
      console.log(`   📚 ${finalPayload.sources}`);
      passed++;
    } else {
      console.error(`   ❌ Assertion failed`);
      console.error(`      tool_calls: ${toolCalls}`);
      console.error(`      headline: ${finalPayload?.headline}`);
      failed++;
    }
  } catch (err) {
    console.error(`   ❌ ${err.message}`);
    failed++;
  }
}

console.log(`\n${"═".repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
