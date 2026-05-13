import { lookup } from "node:dns/promises";
import net from "node:net";
import { performance } from "node:perf_hooks";

export function normalizeBaseUrl(input) {
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

export async function assertPublicTarget(baseUrl, hostHeader) {
  const target = new URL(baseUrl);
  const targetHost = target.hostname.toLowerCase();
  const requestHost = hostWithoutPort(hostHeader);

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
    const response = await fetch(url, { ...options, signal: controller.signal });
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
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.length) {
        totalBytes += value.length;
        text += decoder.decode(value, { stream: true });
        if (firstByteMs === null) {
          firstByteMs = Math.round(performance.now() - startedAt);
        }
      }
    }
    text += decoder.decode();
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

export function extractJson(text) {
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

export async function buildTestResult(payload, hostHeader) {
  let baseUrl;
  try {
    baseUrl = normalizeBaseUrl(payload.baseUrl);
    await assertPublicTarget(baseUrl, hostHeader);
  } catch (error) {
    return { status: 400, body: { error: error.message } };
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

  return {
    status: 200,
    body: {
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
    },
  };
}

export async function buildModelsResult(payload, hostHeader) {
  let baseUrl;
  try {
    baseUrl = normalizeBaseUrl(payload.baseUrl);
    await assertPublicTarget(baseUrl, hostHeader);
  } catch (error) {
    return { status: 400, body: { error: error.message } };
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
      return {
        status: 502,
        body: {
          error: `Models request failed with status ${modelsResult.status}.`,
          status: modelsResult.status,
          body: modelsResult.text.slice(0, 1200),
          timings: modelsResult.timings,
        },
      };
    }
    if (!json || !Array.isArray(json.data)) {
      return {
        status: 502,
        body: {
          error: "Models response is not an OpenAI-style { data: [] } payload.",
          status: modelsResult.status,
          body: modelsResult.text.slice(0, 1200),
          timings: modelsResult.timings,
        },
      };
    }

    return {
      status: 200,
      body: {
        baseUrl,
        count: json.data.length,
        models: json.data
          .map((item) => item?.id)
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b)),
        timings: modelsResult.timings,
        raw: json,
      },
    };
  } catch (error) {
    return { status: 502, body: { error: error.message } };
  }
}
