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

function chatContent(chatJson) {
  const choice = chatJson?.choices?.[0];
  return String(choice?.message?.content || choice?.text || "").trim();
}

function usageTokens(chatJson) {
  const usage = chatJson?.usage || {};
  return {
    input:
      usage.prompt_tokens ??
      usage.input_tokens ??
      usage.promptTokens ??
      null,
    output:
      usage.completion_tokens ??
      usage.output_tokens ??
      usage.completionTokens ??
      null,
  };
}

function estimatedTokens(text) {
  const value = String(text || "").trim();
  if (!value) return 0;
  return Math.max(1, Math.round(value.length / 4));
}

function statusLabel(ok, partial = false) {
  if (ok) return "pass";
  return partial ? "partial" : "fail";
}

function buildQualityChecks({ model, modelsJson, chatResult, chatJson, streamResult }) {
  const content = chatContent(chatJson);
  const models = Array.isArray(modelsJson?.data) ? modelsJson.data : [];
  const modelIds = models.map((item) => item?.id).filter(Boolean);
  const modelExists = modelIds.includes(model);
  const chatContentType = String(chatResult.headers?.["content-type"] || "");
  const streamText = String(streamResult.text || "");

  const knowledgeOk = /paris/i.test(content);
  const protocolOk = chatResult.ok && chatContentType.includes("json");
  const responseOk = Boolean(chatJson && Array.isArray(chatJson.choices) && chatJson.choices.length > 0);
  const streamOk = Boolean(streamResult.ok && streamResult.stream && streamText.includes("data:"));

  return [
    {
      key: "knowledge",
      label: "Knowledge QA",
      labelZh: "知识问答校验",
      status: statusLabel(knowledgeOk, responseOk),
      detail: knowledgeOk ? "Answered the control question correctly." : "The response did not clearly answer the control question.",
      detailZh: knowledgeOk ? "控制问题回答正确。" : "回答没有明确命中控制问题。",
    },
    {
      key: "model",
      label: "Model availability",
      labelZh: "模型存在校验",
      status: statusLabel(modelExists, modelIds.length > 0),
      detail: modelExists ? "Selected model appears in /v1/models." : "Selected model was not found in /v1/models.",
      detailZh: modelExists ? "所选模型出现在 /v1/models 中。" : "所选模型没有出现在 /v1/models 中。",
    },
    {
      key: "protocol",
      label: "Protocol consistency",
      labelZh: "协议一致性",
      status: statusLabel(protocolOk),
      detail: protocolOk ? "Chat completion returned a 2xx JSON response." : "Chat completion did not return a normal JSON response.",
      detailZh: protocolOk ? "聊天接口返回 2xx JSON 响应。" : "聊天接口没有返回正常 JSON 响应。",
    },
    {
      key: "shape",
      label: "Response structure",
      labelZh: "响应结构",
      status: statusLabel(responseOk),
      detail: responseOk ? "Response includes an OpenAI-style choices array." : "Response is missing the expected choices array.",
      detailZh: responseOk ? "响应包含 OpenAI 风格的 choices 数组。" : "响应缺少预期的 choices 数组。",
    },
    {
      key: "stream",
      label: "Streaming quality",
      labelZh: "流式质量",
      status: statusLabel(streamOk, streamResult.ok),
      detail: streamOk ? "Streaming returned event-style chunks." : "Streaming did not return normal event chunks.",
      detailZh: streamOk ? "流式接口返回了事件格式分片。" : "流式接口没有返回正常事件分片。",
    },
  ];
}

function buildVerdict(checks, latencyMs) {
  const failCount = checks.filter((item) => item.status === "fail").length;
  const partialCount = checks.filter((item) => item.status === "partial").length;
  const ttft = latencyMs.streamingFirstToken;
  const chat = latencyMs.chat;

  if (failCount >= 2) {
    return {
      level: "high-risk",
      title: "High risk",
      titleZh: "高风险",
      text: "Multiple core checks failed. Do not rely on this endpoint before comparing another provider.",
      textZh: "多个核心检测项失败。建议先换一个接口对比，不要直接长期使用。",
    };
  }

  if (failCount || partialCount >= 2 || ttft >= 6000 || chat >= 6000) {
    return {
      level: "watch",
      title: "Usable, but watch it",
      titleZh: "可用，但要谨慎",
      text: "The endpoint works, but speed or compatibility signals are not clean. Test again before production use.",
      textZh: "接口能跑通，但速度或兼容性信号不够干净。正式使用前建议多测几次。",
    };
  }

  return {
    level: "good",
    title: "Looks clean",
    titleZh: "质量信号较好",
    text: "Core compatibility, streaming, and latency signals look good in this single test.",
    textZh: "本次测试里，核心兼容性、流式输出和延迟信号都比较好。",
  };
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

  const chatPrompt = payload.prompt || "What is the capital of France? Answer with one word.";
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

  const modelsJson = extractJson(modelsResult.text);
  const chatJson = extractJson(chatResult.text);
  const streamJson = extractJson(streamResult.text);
  const notes = compatibilityNotes(modelsResult, chatResult, streamResult);
  const latencyMs = {
    models: modelsResult.timings.firstByteMs,
    chat: chatResult.timings.firstByteMs,
    streamingFirstToken: streamResult.timings.firstByteMs,
    streamingTotal: streamResult.timings.totalMs,
  };
  const checks = buildQualityChecks({ model, modelsJson, chatResult, chatJson, streamResult });
  const failedChecks = checks.filter((item) => item.status === "fail").length;
  const partialChecks = checks.filter((item) => item.status === "partial").length;
  const score = Math.max(0, 100 - failedChecks * 20 - partialChecks * 10);
  const usage = usageTokens(chatJson);
  const inputTokens = usage.input ?? estimatedTokens(chatPrompt);
  const outputTokens = usage.output ?? estimatedTokens(chatContent(chatJson));
  const tokensPerSecond =
    outputTokens && chatResult.timings.totalMs
      ? Math.round((outputTokens / (chatResult.timings.totalMs / 1000)) * 10) / 10
      : null;
  const verdict = buildVerdict(checks, latencyMs);

  return {
    status: 200,
    body: {
      input: {
        baseUrl,
        model,
      },
      score,
      compatibility: failedChecks === 0 && partialChecks === 0 ? "pass" : failedChecks <= 1 ? "partial" : "fail",
      verdict,
      checks,
      notes,
      results: {
        models: {
          ...modelsResult,
          json: modelsJson,
        },
        chat: {
          ...chatResult,
          json: chatJson,
        },
        streaming: {
          ...streamResult,
          json: streamJson,
        },
      },
      summary: {
        latencyMs,
        tokens: {
          input: inputTokens,
          output: outputTokens,
          perSecond: tokensPerSecond,
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
