// To run locally: `npx wrangler dev`
// To deploy:      `npx wrangler deploy`
// To set secret:  `npx wrangler secret put AZURE_OPENAI_KEY`

import { runAgent } from "./agent.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/ask") {
      const q = url.searchParams.get("q");
      if (!q) return new Response("Missing q", { status: 400 });

      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();

      const send = (event, data) =>
        writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

      ctx.waitUntil((async () => {
        try {
          for await (const evt of runAgent(env, q)) {
            await send(evt.type, evt);
          }
        } catch (e) {
          await send("error", { message: e.message });
        } finally {
          await writer.close();
        }
      })());

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "Access-Control-Allow-Origin": "*",
        }
      });
    }

    return env.ASSETS.fetch(request);
  }
};
