/**
 * Azure OpenAI Responses API wrapper.
 *
 * gpt-5.4-mini uses /openai/responses, not /openai/deployments/{name}/chat/completions.
 * Key differences from Chat Completions:
 *   - system message → `instructions` field (not part of `input`)
 *   - assistant tool calls → type:"function_call" items in `input`
 *   - tool results → type:"function_call_output" items in `input`
 *   - response text lives in output[].content[].text, not choices[].message.content
 *
 * normaliseToChatCompletions() maps the response back to Chat Completions shape
 * so agent.js requires no changes.
 */

export async function callAzureChat(env, { messages, tools, tool_choice, response_format, temperature, max_tokens }) {
  const url =
    `${env.AZURE_OPENAI_ENDPOINT}/openai/responses` +
    `?api-version=${env.AZURE_OPENAI_API_VERSION}`;

  const systemMsg = messages.find(m => m.role === "system");
  const nonSystem = messages.filter(m => m.role !== "system");

  const input = nonSystem.map(m => {
    if (m.role === "tool") {
      return {
        type: "function_call_output",
        call_id: m.tool_call_id,
        output: m.content,
      };
    }
    if (m.role === "assistant" && m.tool_calls) {
      return m.tool_calls.map(tc => ({
        type: "function_call",
        call_id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      }));
    }
    return {
      role: m.role,
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    };
  }).flat();

  const body = {
    model: env.AZURE_OPENAI_DEPLOYMENT,
    instructions: systemMsg?.content,
    input,
    max_output_tokens: Math.max(16, max_tokens ?? 1024),
    temperature: temperature ?? 0.3,
  };

  if (tools) {
    body.tools = tools.map(t => ({
      type: "function",
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    }));
  }

  if (response_format?.type === "json_object") {
    body.text = { format: { type: "json_object" } };
    // The word "json" must appear in the input array itself — putting it only in
    // `instructions` triggers a 400: "must contain the word 'json' in some form".
    const lastMsg = body.input.findLast?.(i => i.role === "user") ?? body.input[body.input.length - 1];
    if (lastMsg && typeof lastMsg.content === "string") {
      lastMsg.content += " Respond in JSON format.";
    }
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": env.AZURE_OPENAI_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Azure OpenAI error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return normaliseToChatCompletions(data);
}

function normaliseToChatCompletions(data) {
  if (data.error) throw new Error(`Azure error: ${data.error.message}`);

  const output = data.output ?? [];
  const toolCalls = [];
  let textContent = null;

  for (const item of output) {
    if (item.type === "function_call") {
      toolCalls.push({
        id: item.call_id,
        type: "function",
        function: { name: item.name, arguments: item.arguments },
      });
    }
    if (item.type === "message") {
      const textPart = (item.content ?? []).find(c => c.type === "output_text");
      if (textPart) textContent = textPart.text;
    }
  }

  const message =
    toolCalls.length > 0
      ? { role: "assistant", content: null, tool_calls: toolCalls }
      : { role: "assistant", content: textContent ?? "" };

  return {
    choices: [{ message, finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop" }],
    _raw: data,
  };
}
