/**
 * Thin fetch wrapper for Azure OpenAI chat completions.
 * Uses api-key header auth (Azure convention, not Bearer).
 */

export async function callAzureChat(env, { messages, tools, tool_choice, response_format, temperature, max_tokens }) {
  const url =
    `${env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${env.AZURE_OPENAI_DEPLOYMENT}` +
    `/chat/completions?api-version=${env.AZURE_OPENAI_API_VERSION}`;

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
      "api-key": env.AZURE_OPENAI_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Azure OpenAI error ${res.status}: ${errText}`);
  }

  return await res.json();
}
