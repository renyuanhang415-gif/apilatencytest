import http from "node:http";
import { lookup } from "node:dns/promises";
import { readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

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

function normalizeBaseUrl(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) throw new Error("baseUrl is required");
  const url = new URL(trimmed);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("baseUrl must start with http:// or https://");
  }
  return url.origin + url.pathname.replace(/\/+$/, "");
}

function hostWithoutPort(host = "") {
  return String(host).split(":")[0].toLowerCase();
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  if (net.isIPv6(ip)) {
    const value = ip.toLowerCase();
    return value === "::1" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80:");
  }

  return false;
}

async function assertPublicTarget(baseUrl, req) {
  const target = new URL(baseUrl);
  const targetHost = target.hostname.toLowerCase();
  const requestHost = hostWithoutPort(req.headers.host);

  if (targetHost === requestHost) return;
  if (targetHost === "localhost" || targetHost.endsWith(".localhost")) {
    throw new Error("Private or local Base URL is not allowed on the public tester.");
  }

  if (net.isIP(targetHost)) {
    if (isPrivateIp(targetHost)) {
      throw new Error("Private or local Base URL is not allowed on the public tester.");
    }
    return;
  }

  const addresses = await lookup(targetHost, { all: true });
  if (addresses.some((item) => isPrivateIp(item.address))) {
    throw new Error("Private or local Base URL is not allowed on the public tester.");
  }
}

function headersWithKey(apiKey) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

async function timedFetch(url, options, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const firstByteAt = performance.now();
    const bodyText = await response.text();
    const endedAt = performance.now();
    return {
      ok: response.ok,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      text: bodyText,
      timings: {
        firstByteMs: Math.round(firstByteAt - startedAt),
        totalMs: Math.round(endedAt - startedAt),
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

async function timedStreamFetch(url, options, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    if (!response.body) {
      const text = await response.text();
      return {
        ok: response.ok,
        status: response.status,
        text,
        stream: false,
        timings: {
          firstByteMs: null,
          totalMs: Math.round(performance.now() - startedAt),
        },
      };
    }

    const reader = response.body.getReader();
    let firstByteMs = null;
    let totalBytes = 0;
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.length) {
        totalBytes += value.length;
        text += new TextDecoder().decode(value, { stream: true });
        if (firstByteMs === null) {
          firstByteMs = Math.round(performance.now() - startedAt);
        }
      }
    }
    text += new TextDecoder().decode();
    return {
      ok: response.ok,
      status: response.status,
      stream: true,
      totalBytes,
      text,
      timings: {
        firstByteMs,
        totalMs: Math.round(performance.now() - startedAt),
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

function extractJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function compatibilityNotes(modelsResult, chatResult, streamResult) {
  const notes = [];

  if (!modelsResult.ok) {
    notes.push("GET /v1/models did not return 2xx.");
  } else {
    const modelsJson = extractJson(modelsResult.text);
    if (!modelsJson || !Array.isArray(modelsJson.data)) {
      notes.push("models response is not a standard OpenAI-style { data: [] } payload.");
    }
  }

  if (!chatResult.ok) {
    notes.push("POST /v1/chat/completions did not return 2xx.");
  } else {
    const chatJson = extractJson(chatResult.text);
    if (!chatJson || !Array.isArray(chatJson.choices)) {
      notes.push("chat completion response is not a standard OpenAI-style { choices: [] } payload.");
    }
  }

  if (streamResult.status >= 400) {
    notes.push("streaming request failed.");
  }

  return notes;
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

  let baseUrl;
  try {
    baseUrl = normalizeBaseUrl(payload.baseUrl);
    await assertPublicTarget(baseUrl, req);
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }

  const apiKey = String(payload.apiKey || "").trim();
  const model = String(payload.model || "gpt-4o-mini").trim();

  const modelsUrl = new URL("/v1/models", baseUrl).toString();
  const chatUrl = new URL("/v1/chat/completions", baseUrl).toString();

  const modelsResult = await timedFetch(modelsUrl, {
    method: "GET",
    headers: headersWithKey(apiKey),
  });

  const chatPrompt = payload.prompt || "Say hello in one short sentence.";
  const chatResult = await timedFetch(
    chatUrl,
    {
      method: "POST",
      headers: headersWithKey(apiKey),
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: chatPrompt }],
        temperature: 0,
      }),
    },
    20000
  );

  const streamResult = await timedStreamFetch(
    chatUrl,
    {
      method: "POST",
      headers: {
        ...headersWithKey(apiKey),
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: chatPrompt }],
        temperature: 0,
        stream: true,
      }),
    },
    25000
  );

  const notes = compatibilityNotes(modelsResult, chatResult, streamResult);
  const score = Math.max(0, 100 - notes.length * 20);

  return sendJson(res, 200, {
    input: {
      baseUrl,
      model,
    },
    score,
    compatibility: notes.length === 0 ? "pass" : notes.length <= 2 ? "partial" : "fail",
    notes,
    results: {
      models: {
        ...modelsResult,
        json: extractJson(modelsResult.text),
      },
      chat: {
        ...chatResult,
        json: extractJson(chatResult.text),
      },
      streaming: {
        ...streamResult,
        json: extractJson(streamResult.text),
      },
    },
    summary: {
      latencyMs: {
        models: modelsResult.timings.firstByteMs,
        chat: chatResult.timings.firstByteMs,
        streamingFirstToken: streamResult.timings.firstByteMs,
        streamingTotal: streamResult.timings.totalMs,
      },
      supported: {
        modelsEndpoint: modelsResult.ok,
        chatCompletions: chatResult.ok,
        streaming: streamResult.ok,
      },
    },
  });
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

  let baseUrl;
  try {
    baseUrl = normalizeBaseUrl(payload.baseUrl);
    await assertPublicTarget(baseUrl, req);
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }

  const apiKey = String(payload.apiKey || "").trim();
  const modelsUrl = new URL("/v1/models", baseUrl).toString();

  try {
    const modelsResult = await timedFetch(modelsUrl, {
      method: "GET",
      headers: headersWithKey(apiKey),
    });
    const json = extractJson(modelsResult.text);
    if (!modelsResult.ok) {
      return sendJson(res, 502, {
        error: `Models request failed with status ${modelsResult.status}.`,
        status: modelsResult.status,
        body: modelsResult.text.slice(0, 1200),
        timings: modelsResult.timings,
      });
    }
    if (!json || !Array.isArray(json.data)) {
      return sendJson(res, 502, {
        error: "Models response is not an OpenAI-style { data: [] } payload.",
        status: modelsResult.status,
        body: modelsResult.text.slice(0, 1200),
        timings: modelsResult.timings,
      });
    }

    return sendJson(res, 200, {
      baseUrl,
      count: json.data.length,
      models: json.data
        .map((item) => item?.id)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
      timings: modelsResult.timings,
      raw: json,
    });
  } catch (error) {
    return sendJson(res, 502, { error: error.message });
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
