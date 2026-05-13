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
    ],
  });
}
