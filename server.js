import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildModelsResult, buildQuickTestResult, buildSupplementTestResult, buildTestResult } from "./lib/api-core.js";
import contactHandler from "./api/contact.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 3000);

const pages = {
  "/": "index.html",
  "/zh": "zh.html",
  "/en": "en.html",
  "/contact": "contact.html",
  "/zh/contact": "contact.html",
  "/en/contact": "contact-en.html",
  "/openai-api-validator": "openai-api-validator.html",
  "/openai-compatible-api-checker": "openai-compatible-api-checker.html",
};

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".ico": "image/x-icon",
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data, null, 2));
}

function sendText(res, statusCode, text, type = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, {
    "Content-Type": type,
    "Cache-Control": "no-store",
  });
  res.end(text);
}

function safePath(urlPath) {
  const normalized = path.posix.normalize(urlPath || "/");
  if (normalized === "/") return "/";
  if (normalized.includes("..")) return "/";
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function contentTypeFor(filePath) {
  return contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function demoAnswer(payload) {
  const prompt = JSON.stringify(payload?.messages || "").toLowerCase();
  if (prompt.includes("c1.") && prompt.includes("c2.") && prompt.includes("g2.")) {
    return ["C1=PURPLE", "C2=45", 'C3={"ok":true}', "G1=a-b-c", "G2=OK|2026"].join("\n");
  }
  if (prompt.includes("purple")) return "PURPLE";
  if (prompt.includes("capital of france")) return "Paris";
  if (prompt.includes("法国首都")) return "Paris";
  if (prompt.includes("17 + 28")) return "45";
  if (prompt.includes("ok") && prompt.includes("true")) return '{"ok":true}';
  if (prompt.includes("join")) return "a-b-c";
  if (prompt.includes("第一行 ok") || prompt.includes("second line 2026")) return "OK\n2026";
  if (prompt.includes("苹果")) return "10";
  if (prompt.includes("model_family")) return '{"model_family":"claude"}';
  if (prompt.includes("紫色")) return "purple";
  if (prompt.includes("第三个词")) return "stone";
  if (prompt.includes("金的化学符号")) return "Au";
  return "Hello from the demo endpoint.";
}

async function fileExists(filePath) {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}

async function serveStatic(req, res, filePath) {
  const type = contentTypeFor(filePath);
  const info = await stat(filePath);
  res.writeHead(200, {
    "Content-Type": type,
    "Content-Length": info.size,
    "Cache-Control": "no-store",
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
}

async function handleApiTest(req, res) {
  let body = "";
  for await (const chunk of req) body += chunk;

  let payload;
  try {
    payload = JSON.parse(body || "{}");
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body." });
  }

  const phase = String(new URL(req.url, `http://${req.headers.host}`).searchParams.get("phase") || payload.phase || "").toLowerCase();
  try {
    const result =
      phase === "quick"
        ? await buildQuickTestResult(payload, req.headers.host)
        : phase === "supplement"
          ? await buildSupplementTestResult(payload, req.headers.host)
          : await buildTestResult(payload, req.headers.host);
    return sendJson(res, result.status, result.body);
  } catch (error) {
    return sendJson(res, 502, { error: error.message || "Test request failed." });
  }
}

async function handleApiModels(req, res) {
  let body = "";
  for await (const chunk of req) body += chunk;

  let payload;
  try {
    payload = JSON.parse(body || "{}");
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body." });
  }

  try {
    const result = await buildModelsResult(payload, req.headers.host);
    return sendJson(res, result.status, result.body);
  } catch (error) {
    return sendJson(res, 502, { error: error.message || "Models request failed." });
  }
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "POST" && url.pathname === "/api/test") {
    return handleApiTest(req, res);
  }

  if (req.method === "POST" && url.pathname === "/api/models") {
    return handleApiModels(req, res);
  }

  if (req.method === "POST" && url.pathname === "/api/contact") {
    return contactHandler(req, res);
  }

  if (url.pathname === "/v1/models" || url.pathname === "/v1/chat/completions") {
    const delayMs = 180;
    const isStream = req.method === "POST" && url.pathname === "/v1/chat/completions";

    if (url.pathname === "/v1/models") {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
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

    if (url.pathname === "/v1/chat/completions") {
      let body = "";
      for await (const chunk of req) body += chunk;
      let parsed = {};
      try {
        parsed = JSON.parse(body || "{}");
      } catch {
        parsed = {};
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));

      const answer = demoAnswer(parsed);

      if (parsed.stream) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        });
        res.write(
          `data: ${JSON.stringify({
            id: "chatcmpl-demo",
            object: "chat.completion.chunk",
            choices: [{ index: 0, delta: { content: answer }, finish_reason: null }],
          })}\n\n`
        );
        setTimeout(() => {
          res.write(
            'data: {"id":"chatcmpl-demo","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n'
          );
          res.end("data: [DONE]\n\n");
        }, 150);
        return;
      }

      return sendJson(res, 200, {
        id: "chatcmpl-demo",
        object: "chat.completion",
        model: parsed.model || "gpt-4o-mini",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: answer },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 9,
          completion_tokens: answer === "Paris" ? 1 : 6,
          total_tokens: answer === "Paris" ? 10 : 15,
        },
      });
    }
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return sendText(res, 405, "Method not allowed");
  }

  const pathname = safePath(url.pathname);
  const mapped = pages[pathname];

  if (mapped) {
    return serveStatic(req, res, path.join(publicDir, mapped));
  }

  const candidate = path.join(publicDir, pathname.slice(1));
  if (candidate.startsWith(publicDir) && (await fileExists(candidate))) {
    return serveStatic(req, res, candidate);
  }

  return sendText(res, 404, "Not found");
}

http.createServer(handleRequest).listen(port, "0.0.0.0", () => {
  console.log(`AI API Latency Test MVP running at http://localhost:${port}`);
});
