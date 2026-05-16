/**
 * Agentic function-calling loop over Azure OpenAI gpt-4o-mini.
 * Yields SSE-ready events: { type: 'tool_call', name, args } | { type: 'final', payload }
 */

import { callAzureChat } from "./azure.js";
import { TOOLS, TOOL_SCHEMAS } from "./tools.js";

const SYSTEM_PROMPT = `You are AskCricket, an expert IPL cricket analyst agent.

Rules:
1. ALWAYS call at least one tool before writing your final answer. Never guess stats.
2. Use multiple tools if needed to fully answer the question.
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
      // Force tool use on first round so the agent never skips straight to answer
      tool_choice: round === 0 ? "required" : "auto",
      // Only enable json_object mode after tools have been called (round > 0)
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

        // Emit tool_call event BEFORE executing so UI chips animate in real-time
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

    // No tool calls → parse final answer
    let payload;
    try {
      payload = JSON.parse(msg.content);
    } catch {
      // Model returned non-JSON — wrap gracefully
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

  // Safety: hit MAX_ROUNDS without a final answer
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
