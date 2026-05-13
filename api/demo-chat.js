import { readJson, sendJson } from "./_utils.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  let payload = {};
  try {
    payload = await readJson(req);
  } catch {
    payload = {};
  }

  await new Promise((resolve) => setTimeout(resolve, 180));

  if (payload.stream) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.write(
      'data: {"id":"chatcmpl-demo","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n'
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    res.write(
      'data: {"id":"chatcmpl-demo","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n'
    );
    res.end("data: [DONE]\n\n");
    return;
  }

  return sendJson(res, 200, {
    id: "chatcmpl-demo",
    object: "chat.completion",
    model: payload.model || "gpt-4o-mini",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: "Hello from the demo endpoint." },
        finish_reason: "stop",
      },
    ],
  });
}
