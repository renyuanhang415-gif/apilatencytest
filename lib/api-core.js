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

function normalizeAnswer(answer) {
  return String(answer || "").trim();
}

function exactAnswer(expected, options = {}) {
  return (answer) => {
    const value = normalizeAnswer(answer);
    return options.caseSensitive ? value === expected : value.toLowerCase() === expected.toLowerCase();
  };
}

function patternAnswer(pattern) {
  return (answer) => pattern.test(normalizeAnswer(answer));
}

function jsonFieldAnswer(field, expected) {
  return (answer) => {
    const json = extractJson(normalizeAnswer(answer));
    return json?.[field] === expected;
  };
}

function exactLinesAnswer(lines) {
  return (answer) => {
    const value = String(answer || "")
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim());
    return value.length === lines.length && value.every((line, index) => line === lines[index]);
  };
}

const qaBanks = {
  common: [
    {
      id: "C1",
      dimension: "Instruction following",
      dimensionZh: "指令跟随",
      prompt: "只输出 PURPLE，不要解释。",
      expected: "PURPLE",
      score: 10,
      judge: exactAnswer("PURPLE"),
    },
    {
      id: "C2",
      dimension: "Basic math",
      dimensionZh: "基础数学",
      prompt: "只输出数字：17 + 28 = ?",
      expected: "45",
      score: 10,
      judge: exactAnswer("45", { caseSensitive: true }),
    },
    {
      id: "C3",
      dimension: "JSON format",
      dimensionZh: "JSON 格式",
      prompt: '只输出 JSON：{"ok":true}',
      expected: '{"ok":true}',
      score: 10,
      judge: jsonFieldAnswer("ok", true),
    },
  ],
  gpt: [
    {
      id: "G1",
      dimension: "Code understanding",
      dimensionZh: "代码理解",
      prompt: '只输出结果：["a","b","c"].join("-") 的结果是什么？',
      expected: "a-b-c",
      score: 10,
      judge: exactAnswer("a-b-c", { caseSensitive: true }),
    },
    {
      id: "G2",
      dimension: "Strict formatting",
      dimensionZh: "严格格式",
      prompt: "只输出两行。第一行 OK，第二行 2026。",
      expected: "OK\\n2026",
      score: 10,
      judge: exactLinesAnswer(["OK", "2026"]),
    },
  ],
  claude: [
    {
      id: "CL1",
      dimension: "Reading calculation",
      dimensionZh: "阅读计算",
      prompt: "小明有12个苹果，给小红5个，又买了3个。只输出剩余数量。",
      expected: "10",
      score: 10,
      judge: exactAnswer("10", { caseSensitive: true }),
    },
    {
      id: "CL2",
      dimension: "Structured output",
      dimensionZh: "结构化输出",
      prompt: '只输出 JSON：{"model_family":"claude"}',
      expected: '{"model_family":"claude"}',
      score: 10,
      judge: jsonFieldAnswer("model_family", "claude"),
    },
  ],
  gemini: [
    {
      id: "GE1",
      dimension: "Multilingual mapping",
      dimensionZh: "多语言映射",
      prompt: "只输出英文：中文“紫色”对应的英文单词是什么？",
      expected: "purple",
      score: 10,
      judge: patternAnswer(/^purple$/i),
    },
    {
      id: "GE2",
      dimension: "Context lookup",
      dimensionZh: "短上下文定位",
      prompt: "记住这些词：river, cloud, stone, mirror。只输出第三个词。",
      expected: "stone",
      score: 10,
      judge: exactAnswer("stone"),
    },
  ],
  generic: [
    {
      id: "GN1",
      dimension: "Common knowledge",
      dimensionZh: "常识",
      prompt: "只输出英文单词：法国首都是哪里？",
      expected: "Paris",
      score: 10,
      judge: patternAnswer(/^paris$/i),
    },
    {
      id: "GN2",
      dimension: "Science fact",
      dimensionZh: "科学常识",
      prompt: "只输出元素符号：金的化学符号是什么？",
      expected: "Au",
      score: 10,
      judge: exactAnswer("Au"),
    },
  ],
};

const qaBankLabels = {
  gpt: "GPT",
  claude: "Claude",
  gemini: "Gemini",
  generic: "通用",
};

function qaBankForModel(model) {
  const value = String(model || "").toLowerCase();
  if (/gpt|openai|o1|o3|o4|gpt-4|gpt-5/.test(value)) return "gpt";
  if (/claude|sonnet|opus|haiku/.test(value)) return "claude";
  if (/gemini|flash|pro/.test(value)) return "gemini";
  return "generic";
}

function qaCasesForModel(model) {
  const bank = qaBankForModel(model);
  return {
    bank,
    bankLabel: qaBankLabels[bank],
    cases: [...qaBanks.common, ...qaBanks[bank]],
  };
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

function pendingStreamResult() {
  return {
    ok: false,
    status: 0,
    stream: false,
    pending: true,
    text: "",
    timings: {
      firstByteMs: null,
      totalMs: null,
    },
  };
}

function buildQualityChecks({ model, modelsJson, chatResult, chatJson, streamResult, qaScore }) {
  const models = Array.isArray(modelsJson?.data) ? modelsJson.data : [];
  const modelIds = models.map((item) => item?.id).filter(Boolean);
  const modelExists = modelIds.includes(model);
  const chatContentType = String(chatResult.headers?.["content-type"] || "");
  const streamText = String(streamResult.text || "");

  const knowledgeStatus = qaScore.passed === qaScore.total ? "pass" : qaScore.passed > 0 ? "partial" : "fail";
  const qaRate = qaScore.total ? Math.round((qaScore.passed / qaScore.total) * 100) : 0;
  const protocolOk = chatResult.ok && chatContentType.includes("json");
  const responseOk = Boolean(chatJson && Array.isArray(chatJson.choices) && chatJson.choices.length > 0);
  const streamPending = Boolean(streamResult.pending);
  const streamOk = Boolean(streamResult.ok && streamResult.stream && streamText.includes("data:"));

  return [
    {
      key: "knowledge",
      label: "Knowledge QA",
      labelZh: "知识问答校验",
      status: knowledgeStatus,
      detail: `Knowledge QA pass rate ${qaRate}%. Matched ${qaScore.bankLabel} question bank.`,
      detailZh: `知识问答通过率 ${qaRate}%，已匹配 ${qaScore.bankLabel} 题库。`,
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
      status: streamPending ? "partial" : statusLabel(streamOk, streamResult.ok),
      pending: streamPending,
      detail: streamPending
        ? "Supplemental streaming check is still running."
        : streamOk
          ? "Streaming returned event-style chunks."
          : "Streaming did not return normal event chunks.",
      detailZh: streamPending
        ? "流式补充检测正在进行。"
        : streamOk
          ? "流式接口返回了事件格式分片。"
          : "流式接口没有返回正常事件分片。",
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

function latencyScore(latencyMs) {
  const chat = latencyMs.chat ?? 99999;
  const ttft = latencyMs.streamingFirstToken ?? 99999;
  if (chat <= 2500 && ttft <= 2500) return 10;
  if (chat <= 6000 && ttft <= 6000) return 5;
  return 0;
}

async function qaResultForCase({ chatUrl, apiKey, model, qaCase, timeoutMs = 12000 }) {
  try {
    const result = await timedFetch(
      chatUrl,
      {
        method: "POST",
        headers: headersWithKey(apiKey),
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: qaCase.prompt }],
          temperature: 0,
        }),
      },
      timeoutMs
    );
    const json = extractJson(result.text);
    const answer = chatContent(json);
    return {
      id: qaCase.id,
      dimension: qaCase.dimension,
      dimensionZh: qaCase.dimensionZh,
      prompt: qaCase.prompt,
      answer,
      expected: qaCase.expected,
      ok: result.ok && qaCase.judge(answer),
      latencyMs: result.timings.firstByteMs,
    };
  } catch (error) {
    return {
      id: qaCase.id,
      dimension: qaCase.dimension,
      dimensionZh: qaCase.dimensionZh,
      prompt: qaCase.prompt,
      answer: "",
      expected: qaCase.expected,
      ok: false,
      error: error.message,
      latencyMs: null,
    };
  }
}

function buildQaScore(qaBank, qaResults) {
  const score = {
    bank: qaBank.bank,
    bankLabel: qaBank.bankLabel,
    passed: qaResults.filter((item) => item.ok).length,
    total: qaResults.length,
    score: qaResults.reduce((sum, item) => sum + (item.ok ? 10 : 0), 0),
    results: qaResults,
  };
  score.rate = score.total ? Math.round((score.passed / score.total) * 100) : 0;
  return score;
}

function buildResponseBody({
  baseUrl,
  model,
  modelsResult,
  modelsJson,
  chatResult,
  chatJson,
  streamResult,
  streamJson,
  qaScore,
  phase = "complete",
}) {
  const notes = compatibilityNotes(modelsResult, chatResult, streamResult);
  const latencyMs = {
    models: modelsResult.timings.firstByteMs,
    chat: chatResult.timings.firstByteMs,
    streamingFirstToken: streamResult.timings.firstByteMs,
    streamingTotal: streamResult.timings.totalMs,
  };
  const checks = buildQualityChecks({ model, modelsJson, chatResult, chatJson, streamResult, qaScore });
  const usage = usageTokens(chatJson);
  const chatPrompt = qaScore.results?.[0]?.prompt || "";
  const inputTokens = usage.input ?? estimatedTokens(chatPrompt);
  const outputTokens = usage.output ?? estimatedTokens(chatContent(chatJson));
  const tokensPerSecond =
    outputTokens && chatResult.timings.totalMs
      ? Math.round((outputTokens / (chatResult.timings.totalMs / 1000)) * 10) / 10
      : null;
  const models = Array.isArray(modelsJson?.data) ? modelsJson.data : [];
  const modelExists = models.map((item) => item?.id).filter(Boolean).includes(model);
  const protocolOk = chatResult.ok && String(chatResult.headers?.["content-type"] || "").includes("json");
  const responseOk = Boolean(chatJson && Array.isArray(chatJson.choices) && chatJson.choices.length > 0);
  const streamOk = Boolean(streamResult.ok && streamResult.stream && String(streamResult.text || "").includes("data:"));
  const score =
    qaScore.score +
    (modelExists ? 10 : 0) +
    (protocolOk ? 10 : 0) +
    (responseOk ? 10 : 0) +
    (streamResult.pending ? 0 : streamOk ? 10 : 0) +
    (streamResult.pending ? 0 : latencyScore(latencyMs));
  const failedChecks = checks.filter((item) => item.status === "fail").length;
  const partialChecks = checks.filter((item) => item.status === "partial").length;
  const verdict = buildVerdict(checks, latencyMs);

  return {
    input: {
      baseUrl,
      model,
    },
    score,
    phase,
    pendingSupplement: Boolean(streamResult.pending),
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
      qa: qaScore,
      tokens: {
        input: inputTokens,
        output: outputTokens,
        perSecond: streamResult.pending ? null : tokensPerSecond,
      },
      supported: {
        modelsEndpoint: modelsResult.ok,
        chatCompletions: chatResult.ok,
        streaming: streamResult.pending ? null : streamResult.ok,
      },
    },
  };
}

async function prepareCoreResults(payload, hostHeader) {
  let baseUrl;
  try {
    baseUrl = normalizeBaseUrl(payload.baseUrl);
    await assertPublicTarget(baseUrl, hostHeader);
  } catch (error) {
    return { status: 400, error: error.message };
  }

  const apiKey = String(payload.apiKey || "").trim();
  const model = String(payload.model || "gpt-4o-mini").trim();
  const qaBank = qaCasesForModel(model);
  const modelsUrl = new URL("/v1/models", baseUrl).toString();
  const chatUrl = new URL("/v1/chat/completions", baseUrl).toString();

  const chatPrompt = payload.prompt || qaBank.cases[0].prompt;
  const [modelsResult, chatResult] = await Promise.all([
    timedFetch(
      modelsUrl,
      {
        method: "GET",
        headers: headersWithKey(apiKey),
      },
      12000
    ),
    timedFetch(
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
      12000
    ),
  ]);
  const chatJson = extractJson(chatResult.text);
  const qaResults = await Promise.all(
    qaBank.cases.map((qaCase, index) => {
      if (index === 0) {
        const answer = chatContent(chatJson);
        return Promise.resolve({
          id: qaCase.id,
          dimension: qaCase.dimension,
          dimensionZh: qaCase.dimensionZh,
          prompt: qaCase.prompt,
          answer,
          expected: qaCase.expected,
          ok: chatResult.ok && qaCase.judge(answer),
          latencyMs: chatResult.timings.firstByteMs,
        });
      }
      return qaResultForCase({ chatUrl, apiKey, model, qaCase });
    })
  );
  return {
    status: 200,
    baseUrl,
    apiKey,
    model,
    qaBank,
    chatPrompt,
    modelsResult,
    chatResult,
    modelsJson: extractJson(modelsResult.text),
    chatJson,
    qaResults,
    chatUrl,
  };
}

export async function buildTestResult(payload, hostHeader) {
  const prepared = await prepareCoreResults(payload, hostHeader);
  if (prepared.status !== 200) {
    return { status: prepared.status, body: { error: prepared.error } };
  }

  const streamResult = await timedStreamFetch(
    prepared.chatUrl,
    {
      method: "POST",
      headers: {
        ...headersWithKey(prepared.apiKey),
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: prepared.model,
        messages: [{ role: "user", content: prepared.chatPrompt }],
        temperature: 0,
        stream: true,
      }),
    },
    25000
  );

  const streamJson = extractJson(streamResult.text);
  const qaScore = buildQaScore(prepared.qaBank, prepared.qaResults);

  return {
    status: 200,
    body: buildResponseBody({
      baseUrl: prepared.baseUrl,
      model: prepared.model,
      modelsResult: prepared.modelsResult,
      modelsJson: prepared.modelsJson,
      chatResult: prepared.chatResult,
      chatJson: prepared.chatJson,
      streamResult,
      streamJson,
      qaScore,
      phase: "complete",
    }),
  };
}

export async function buildQuickTestResult(payload, hostHeader) {
  const prepared = await prepareCoreResults(payload, hostHeader);
  if (prepared.status !== 200) {
    return { status: prepared.status, body: { error: prepared.error } };
  }

  const qaScore = buildQaScore(prepared.qaBank, prepared.qaResults);
  return {
    status: 200,
    body: buildResponseBody({
      baseUrl: prepared.baseUrl,
      model: prepared.model,
      modelsResult: prepared.modelsResult,
      modelsJson: prepared.modelsJson,
      chatResult: prepared.chatResult,
      chatJson: prepared.chatJson,
      streamResult: pendingStreamResult(),
      streamJson: null,
      qaScore,
      phase: "quick",
    }),
  };
}

export async function buildSupplementTestResult(payload, hostHeader) {
  const prepared = await prepareCoreResults(payload, hostHeader);
  if (prepared.status !== 200) {
    return { status: prepared.status, body: { error: prepared.error } };
  }

  const streamResult = await timedStreamFetch(
    prepared.chatUrl,
    {
      method: "POST",
      headers: {
        ...headersWithKey(prepared.apiKey),
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: prepared.model,
        messages: [{ role: "user", content: prepared.chatPrompt }],
        temperature: 0,
        stream: true,
      }),
    },
    18000
  );
  const qaScore = buildQaScore(prepared.qaBank, prepared.qaResults);
  return {
    status: 200,
    body: buildResponseBody({
      baseUrl: prepared.baseUrl,
      model: prepared.model,
      modelsResult: prepared.modelsResult,
      modelsJson: prepared.modelsJson,
      chatResult: prepared.chatResult,
      chatJson: prepared.chatJson,
      streamResult,
      streamJson: extractJson(streamResult.text),
      qaScore,
      phase: "supplement",
    }),
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
