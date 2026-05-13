import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildModelsResult, buildTestResult } from "./lib/api-core.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 3000);

const pages = {
  "/": "index.html",
  "/openai-api-validator": "openai-api-validator.html",
  "/openai-compatible-api-checker": "openai-compatible-api-checker.html",
};

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
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

async function fileExists(filePath) {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}

async function serveStatic(res, filePath) {
  const type = contentTypeFor(filePath);
  res.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": "no-store",
  });
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

  const result = await buildTestResult(payload, req.headers.host);
  return sendJson(res, result.status, result.body);
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

  const result = await buildModelsResult(payload, req.headers.host);
  return sendJson(res, result.status, result.body);
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "POST" && url.pathname === "/api/test") {
    return handleApiTest(req, res);
  }

  if (req.method === "POST" && url.pathname === "/api/models") {
    return handleApiModels(req, res);
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

      if (parsed.stream) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        });
        res.write(
          'data: {"id":"chatcmpl-demo","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n'
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
            message: { role: "assistant", content: "Hello from the demo endpoint." },
            finish_reason: "stop",
          },
        ],
      });
    }
  }

  if (req.method !== "GET") {
    return sendText(res, 405, "Method not allowed");
  }

  const pathname = safePath(url.pathname);
  const mapped = pages[pathname];

  if (mapped) {
    return serveStatic(res, path.join(publicDir, mapped));
  }

  const candidate = path.join(publicDir, pathname.slice(1));
  if (candidate.startsWith(publicDir) && (await fileExists(candidate))) {
    return serveStatic(res, candidate);
  }

  return sendText(res, 404, "Not found");
}

http.createServer(handleRequest).listen(port, "0.0.0.0", () => {
  console.log(`AI API Latency Test MVP running at http://localhost:${port}`);
});
