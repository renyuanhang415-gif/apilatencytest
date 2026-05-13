import { sendJson } from "./_utils.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  await new Promise((resolve) => setTimeout(resolve, 180));
  return sendJson(res, 200, {
    object: "list",
    data: [
      { id: "gpt-4o-mini", object: "model", owned_by: "openai" },
      { id: "gpt-4.1-mini", object: "model", owned_by: "openai" },
      { id: "claude-3-5-sonnet", object: "model", owned_by: "anthropic" },
      { id: "gemini-1.5-pro", object: "model", owned_by: "google" },
      { id: "deepseek-chat", object: "model", owned_by: "deepseek" },
    ],
  });
}
