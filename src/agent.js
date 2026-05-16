import { callAzureChat } from "./azure.js";
import { TOOLS, TOOL_SCHEMAS } from "./tools.js";

const SYSTEM_PROMPT = `You are AskCricket, an expert analyst exclusively for IPL 2024 and IPL 2025 cricket.

Scope:
- You ONLY answer questions about IPL 2024 and IPL 2025 matches, players, teams, and statistics.
- If the user asks about anything outside IPL 2024/2025 (other sports, other cricket tournaments, general knowledge, coding, etc.), respond with this exact JSON:
  {"headline":"Outside my scope","insight":"I can only answer questions about IPL 2024 and IPL 2025 cricket. Try asking about a player, match, or stat from either season.","chart":{"type":"none","labels":[],"values":[],"unit":""},"sources":"","followups":["How did Kohli perform in IPL 2025?","Compare Bumrah vs Rashid Khan in death overs","Who was the most clutch batter in IPL 2025?"]}

Rules:
1. ALWAYS call at least one tool before writing your final answer. Never guess stats.
2. Use multiple tools if needed to fully answer the question.
2a. SEASON AWARENESS: If the question mentions "IPL 2024" or "2024 season", always pass season="2024" to tools. For "IPL 2025" or "2025 season", pass season="2025". For "final" or "winner" questions, call find_matches first with the correct season to get the right match_id before calling match_context.
3. After gathering data, respond ONLY with this exact JSON structure:
{
  "headline": "<one punchy sentence, max 15 words>",
  "insight": "<3-4 sentences, plain English, concrete numbers, no jargon>",
  "chart": {
    "type": "bar" | "line" | "none",
    "labels": ["label1", "label2"],
    "values": [42, 87],
    "unit": "Strike Rate"
  },
  "sources": "<e.g. '47 deliveries from IPL 2024'>",
  "followups": ["<follow-up question 1>", "<follow-up question 2>", "<follow-up question 3>"]
}
4. If data is missing or insufficient, say so honestly in the insight field.
5. Prefer concrete numbers over adjectives. Show your working in the insight.`;

const MAX_ROUNDS = 5;

export async function* runAgent(env, userQuestion) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userQuestion },
  ];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const completion = await callAzureChat(env, {
      messages,
      tools: TOOL_SCHEMAS,
      // "required" on round 0 prevents the model from skipping straight to a guessed answer
      tool_choice: round === 0 ? "required" : "auto",
      // json_object mode only after round 0 — the first round must be a tool call, not a JSON response
      response_format: round > 0 ? { type: "json_object" } : undefined,
    });

    const msg = completion.choices?.[0]?.message;
    if (!msg) throw new Error("Empty response from Azure OpenAI");
    messages.push(msg);

    // Handle tool calls
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      for (const tc of msg.tool_calls) {
        let args = {};
        try {
          args = JSON.parse(tc.function.arguments);
        } catch {
          args = {};
        }

        // Yield before executing so the UI chip appears while the tool runs
        yield { type: "tool_call", name: tc.function.name, args };

        const fn = TOOLS[tc.function.name];
        let result;
        try {
          result = fn ? fn(args) : { error: `Unknown tool: ${tc.function.name}` };
        } catch (err) {
          result = { error: err.message };
        }

        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
      continue;
    }

    let payload;
    try {
      payload = JSON.parse(msg.content);
    } catch {
      // Model occasionally returns prose instead of JSON despite the format constraint
      payload = {
        headline: "Analysis complete",
        insight: msg.content || "No structured response returned.",
        chart: { type: "none", labels: [], values: [], unit: "" },
        sources: "",
        followups: [],
      };
    }

    yield { type: "final", payload };
    return;
  }

  // Reached MAX_ROUNDS without a conclusive answer — surface a graceful fallback
  yield {
    type: "final",
    payload: {
      headline: "Analysis incomplete",
      insight: "The agent reached its reasoning limit. Try a more specific question.",
      chart: { type: "none", labels: [], values: [], unit: "" },
      sources: "",
      followups: ["Try asking about a specific player", "Ask about a specific match phase"],
    },
  };
}
