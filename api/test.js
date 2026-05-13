import { buildTestResult } from "../lib/api-core.js";
import { methodNotAllowed, readJson, sendJson } from "./_utils.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);

  let payload;
  try {
    payload = await readJson(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body." });
  }

  const result = await buildTestResult(payload, req.headers.host);
  return sendJson(res, result.status, result.body);
}
