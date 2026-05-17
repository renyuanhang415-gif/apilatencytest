import { lookup } from "node:dns/promises";
import { createHash } from "node:crypto";
import net from "node:net";
import { performance } from "node:perf_hooks";

const modelsCache = new Map();
const MODELS_CACHE_TTL_MS = 2 * 60 * 1000;

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

function cacheKeyForModels(baseUrl, apiKey) {
  return createHash("sha256").update(`${baseUrl}\n${apiKey || ""}`).digest("hex");
}

async function fetchModelsBundle(baseUrl, apiKey) {
  const cacheKey = cacheKeyForModels(baseUrl, apiKey);
  const cached = modelsCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < MODELS_CACHE_TTL_MS) {
    return {
      ...cached.bundle,
      fromCache: true,
      result: {
        ...cached.bundle.result,
        timings: {
          firstByteMs: 0,
          totalMs: 0,
        },
      },
    };
  }

  const modelsUrl = new URL("/v1/models", baseUrl).toString();
  const result = await timedFetch(
    modelsUrl,
    {
      method: "GET",
      headers: headersWithKey(apiKey),
    },
    12000
  );
  const json = extractJson(result.text);
  const bundle = { result, json, fromCache: false };

  if (result.ok && Array.isArray(json?.data)) {
    modelsCache.set(cacheKey, { savedAt: Date.now(), bundle });
  }

  return bundle;
}

function localModelsBundle(model) {
  const json = {
    object: "list",
    data: [{ id: model }],
  };
  return {
    result: {
      ok: true,
      status: 200,
      headers: {},
      text: JSON.stringify(json),
      skipped: true,
      timings: {
        firstByteMs: 0,
        totalMs: 0,
      },
    },
    json,
    fromCache: true,
  };
}

function normalizeAnswer(answer) {
  return String(answer || "").trim();
}

function stripMarkdownFence(text) {
  const value = normalizeAnswer(text);
  const match = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : value;
}

function truncateText(value, max = 240) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max)}...` : text;
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
    const json = extractJson(stripMarkdownFence(answer));
    return json?.[field] === expected;
  };
}

function exactLinesAnswer(lines) {
  return (answer) => {
    const normalized = String(answer || "").replace(/\|/g, "\n");
    const value = normalized
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim());
    return value.length === lines.length && value.every((line, index) => line === lines[index]);
  };
}

const MODEL_FAMILY_PROMPT =
  "不要根据 API 请求的 model 参数、用户选择的目标模型或题目文字猜测。根据你自己的底层模型家族，只输出一个词：GPT、Claude、Gemini、DeepSeek、GLM、Kimi、Grok、Qwen、Other。";

function modelFamilyAnswer(expectedFamily) {
  return (answer) => normalizeAnswer(answer).toLowerCase() === expectedFamily.toLowerCase();
}

function normalizeBatchAnswerValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function cleanBatchLine(line) {
  return String(line || "")
    .trim()
    .replace(/^[-*]\s+/, "")
    .replace(/^`+|`+$/g, "")
    .trim();
}

function batchQaPrompt(qaCases) {
  const lines = qaCases.map((qaCase) => `${qaCase.id}. ${qaCase.prompt}`);
  return [
    "请回答下面的检测题。",
    "只按固定格式输出，每项一行，不要解释，不要 Markdown，不要代码块。",
    "格式示例：",
    "C1=PURPLE",
    "C2=45",
    "如果答案本来有多行，请用 | 合并到同一行。",
    ...lines,
  ].join("\n");
}

function parseJsonBatchAnswers(answerText) {
  return extractJsonObject(answerText);
}

function parseKeyValueBatchAnswers(answerText, qaCases) {
  const answers = {};
  const ids = new Set(qaCases.map((qaCase) => qaCase.id));
  const lines = stripMarkdownFence(answerText)
    .split(/\r?\n/)
    .map(cleanBatchLine)
    .filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^["']?([A-Za-z]+\d+)["']?\s*[:：=]\s*(.+)$/);
    if (!match || !ids.has(match[1])) continue;
    answers[match[1]] = match[2].trim().replace(/,$/, "").trim();
  }

  return Object.keys(answers).length ? answers : null;
}

function parseNumberedBatchAnswers(answerText, qaCases) {
  const lines = stripMarkdownFence(answerText)
    .split(/\r?\n/)
    .map(cleanBatchLine)
    .filter(Boolean);
  const numbered = [];
  let currentIndex = -1;

  for (const line of lines) {
    const match = line.match(/^(?:答案\s*)?(?:第\s*)?(\d+)(?:\s*题)?[.)、:：]\s*(.+)$/i);
    if (match) {
      currentIndex = Number(match[1]) - 1;
      numbered[currentIndex] = match[2].trim();
      continue;
    }
    if (currentIndex >= 0 && currentIndex < qaCases.length) {
      numbered[currentIndex] = `${numbered[currentIndex]}\n${line}`.trim();
    }
  }

  const compactLines = numbered.filter((value) => value !== undefined && value !== "");
  if (compactLines.length < qaCases.length && lines.length === qaCases.length) {
    return Object.fromEntries(qaCases.map((qaCase, index) => [qaCase.id, lines[index]]));
  }
  if (compactLines.length < qaCases.length) return null;

  return Object.fromEntries(qaCases.map((qaCase, index) => [qaCase.id, numbered[index]]));
}

function parseAnswerAnchoredBatchAnswers(answerText, qaCases) {
  const text = stripMarkdownFence(answerText);
  const answers = {};
  for (const qaCase of qaCases) {
    const expected = String(qaCase.expected || "").replace(/\\n/g, "\n");
    if (!expected) continue;
    if (text.includes(expected)) answers[qaCase.id] = expected;
  }
  return Object.keys(answers).length === qaCases.length ? answers : null;
}

function batchQaAnswers(answerText, qaCases) {
  const parsers = [
    () => parseJsonBatchAnswers(answerText),
    () => parseKeyValueBatchAnswers(answerText, qaCases),
    () => parseNumberedBatchAnswers(answerText, qaCases),
    () => parseAnswerAnchoredBatchAnswers(answerText, qaCases),
  ];

  for (const parser of parsers) {
    const answers = parser();
    if (!answers) continue;
    if (qaCases.some((qaCase) => answers[qaCase.id] !== undefined)) return answers;
  }

  return null;
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
      dimension: "Model family fingerprint",
      dimensionZh: "模型家族指纹",
      prompt: MODEL_FAMILY_PROMPT,
      expected: "GPT",
      score: 10,
      judge: modelFamilyAnswer("GPT"),
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
      dimension: "Model family fingerprint",
      dimensionZh: "模型家族指纹",
      prompt: MODEL_FAMILY_PROMPT,
      expected: "Claude",
      score: 10,
      judge: modelFamilyAnswer("Claude"),
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
      dimension: "Model family fingerprint",
      dimensionZh: "模型家族指纹",
      prompt: MODEL_FAMILY_PROMPT,
      expected: "Gemini",
      score: 10,
      judge: modelFamilyAnswer("Gemini"),
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

function modelFamilyForId(model) {
  const value = String(model || "").toLowerCase();
  if (/gpt|openai|o1|o3|o4|gpt-4|gpt-5/.test(value)) return "gpt";
  if (/claude|anthropic|sonnet|opus|haiku/.test(value)) return "claude";
  if (/gemini|google/.test(value)) return "gemini";
  if (/deepseek/.test(value)) return "deepseek";
  if (/kimi|moonshot/.test(value)) return "kimi";
  if (/glm|zai|zhipu|智谱/.test(value)) return "glm";
  if (/grok|x-ai|xai/.test(value)) return "grok";
  if (/qwen|通义|tongyi/.test(value)) return "qwen";
  return "generic";
}

function modelFamilyFromAnswer(answer) {
  const value = normalizeAnswer(answer).toLowerCase();
  if (value === "gpt" || value === "openai") return "gpt";
  if (value === "claude" || value === "anthropic") return "claude";
  if (value === "gemini" || value === "google") return "gemini";
  if (value === "deepseek") return "deepseek";
  if (value === "kimi" || value === "moonshot") return "kimi";
  if (value === "glm" || value === "zai" || value === "zhipu") return "glm";
  if (value === "grok" || value === "xai" || value === "x-ai") return "grok";
  if (value === "qwen" || value === "tongyi") return "qwen";
  if (value === "other") return "other";
  return "generic";
}

function compactModelId(model) {
  return String(model || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function fixedTargetModeFor(model, targetModel, selectionMode = "fixed") {
  const actual = compactModelId(model);
  const target = compactModelId(targetModel);
  if (actual && target && actual !== target) return true;
  return selectionMode !== "fetched";
}

function modelIdMatchesTarget(actualModel, targetModel) {
  const actual = compactModelId(actualModel);
  const target = compactModelId(targetModel);
  if (!actual || !target) return true;
  if (actual === target || actual.includes(target)) return true;
  return false;
}

function modelProfileSignals({ actualModel, targetModel, streamResult, qaScore, selectionMode = "fixed" }) {
  const fixedTargetMode = fixedTargetModeFor(actualModel, targetModel, selectionMode);
  const targetFamily = modelFamilyForId(targetModel);
  const actualFamily = modelFamilyForId(actualModel);
  const idMatchesTarget = modelIdMatchesTarget(actualModel, targetModel);
  const streamSummary = summarizeSse(streamResult?.text || "");
  const streamModel = streamSummary.messageStartModel || "";
  const streamFamily = streamModel ? modelFamilyForId(streamModel) : "generic";
  const selfCase = (qaScore?.results || []).find((item) => item.dimension === "Model family fingerprint");
  const selfFamily = selfCase?.answer ? modelFamilyFromAnswer(selfCase.answer) : "generic";
  const reasons = [];
  const reasonsZh = [];
  const strongReasons = [];

  if (!idMatchesTarget) {
    reasons.push(`request id ${actualModel || "(empty)"} does not match target ${targetModel}`);
    reasonsZh.push(`实际请求 ID 与目标模型 ${targetModel} 不匹配`);
    strongReasons.push("target-id");
  }
  if (targetFamily !== "generic" && actualFamily !== "generic" && actualFamily !== targetFamily) {
    reasons.push(`request id family ${actualFamily}`);
    reasonsZh.push(`实际请求 ID 更像 ${actualFamily}`);
    strongReasons.push("request-id");
  }
  if (targetFamily !== "generic" && streamFamily !== "generic" && streamFamily !== targetFamily) {
    reasons.push(`stream model family ${streamFamily}`);
    reasonsZh.push(`流式返回模型更像 ${streamFamily}`);
    strongReasons.push("stream-model");
  }
  if (targetFamily !== "generic" && selfFamily !== "generic" && selfFamily !== targetFamily) {
    reasons.push(`self-reported family ${selfFamily}`);
    reasonsZh.push(`模型自报家族更像 ${selfFamily}`);
  }

  return {
    mismatch: fixedTargetMode ? !idMatchesTarget : reasons.length > 0,
    strongMismatch: fixedTargetMode ? !idMatchesTarget : strongReasons.length > 0,
    reasons,
    reasonsZh,
    strongReasons,
    fixedTargetMode,
    idMatchesTarget,
    targetFamily,
    actualFamily,
    streamModel,
    streamFamily,
    selfFamily,
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
  } catch (error) {
    const elapsedMs = Math.round(performance.now() - startedAt);
    return {
      ok: false,
      status: 0,
      headers: {},
      text: error.message || "Request failed.",
      error: error.message || "Request failed.",
      timings: {
        firstByteMs: null,
        totalMs: elapsedMs,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

async function timedStreamFetch(url, options, timeoutMs = 15000, stopWhen = null) {
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
        if (typeof stopWhen === "function" && stopWhen(text)) {
          await reader.cancel().catch(() => {});
          break;
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
  } catch (error) {
    const elapsedMs = Math.round(performance.now() - startedAt);
    return {
      ok: false,
      status: 0,
      stream: false,
      totalBytes: 0,
      text: error.message || "Stream request failed.",
      error: error.message || "Stream request failed.",
      timings: {
        firstByteMs: null,
        totalMs: elapsedMs,
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

function extractJsonObject(text) {
  const value = stripMarkdownFence(text);
  const direct = extractJson(value);
  if (direct && typeof direct === "object" && !Array.isArray(direct)) return direct;

  const firstBrace = value.indexOf("{");
  const lastBrace = value.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;

  const candidate = value.slice(firstBrace, lastBrace + 1).trim();
  const parsed = extractJson(candidate);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
}

function compatibilityNotes(modelsResult, chatResult, streamResult) {
  const notes = [];

  if (modelsResult.skipped) {
    // Fixed target cards do not need a /v1/models round trip.
  } else if (!modelsResult.ok) {
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
  const content = choice?.message?.content ?? choice?.delta?.content ?? choice?.text ?? "";
  if (Array.isArray(content)) {
    return content
      .map((item) => item?.text || item?.content || "")
      .join("")
      .trim();
  }
  return String(content).trim();
}

function streamContent(text) {
  const chunks = [];
  const lines = String(text || "").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payloadText = trimmed.slice(5).trim();
    if (!payloadText || payloadText === "[DONE]") continue;
    const json = extractJson(payloadText);
    if (!json) continue;
    const choice = json.choices?.[0];
    const content = choice?.delta?.content ?? choice?.message?.content ?? choice?.text ?? "";
    if (Array.isArray(content)) {
      chunks.push(...content.map((item) => item?.text || item?.content || ""));
    } else if (content) {
      chunks.push(String(content));
    }
  }
  return chunks.join("").trim();
}

function streamUsageTokens(text) {
  let usage = null;
  const lines = String(text || "").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payloadText = trimmed.slice(5).trim();
    if (!payloadText || payloadText === "[DONE]") continue;
    const json = extractJson(payloadText);
    if (json?.usage) usage = json.usage;
  }
  return usage ? usageTokens({ usage }) : { input: null, output: null };
}

function summarizeSse(text) {
  const lines = String(text || "").split(/\r?\n/);
  const eventTypes = [];
  const contentTypes = [];
  let rawEventCount = 0;
  let finishReason = null;
  let messageStartModel = null;
  let messageStartInputTokens = null;
  const messageDeltaInputTokensSamples = [];
  const outputTokensSamples = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;

    const payloadText = trimmed.slice(5).trim();
    if (!payloadText) continue;
    rawEventCount += 1;
    if (payloadText === "[DONE]") {
      eventTypes.push("done");
      continue;
    }

    const json = extractJson(payloadText);
    if (!json) {
      eventTypes.push("unknown");
      continue;
    }

    eventTypes.push(String(json.object || "message"));
    const choice = json.choices?.[0] || {};
    const delta = choice.delta || {};
    const usage = json.usage || {};
    const finish = choice.finish_reason;
    if (finish) finishReason = finish;

    if (json.model && !messageStartModel) {
      messageStartModel = json.model;
    }

    const deltaContent = delta.content;
    if (Array.isArray(deltaContent)) {
      for (const item of deltaContent) {
        if (item?.type) contentTypes.push(String(item.type));
      }
    } else if (deltaContent) {
      contentTypes.push(typeof deltaContent);
    }

    const inputTokens =
      usage.prompt_tokens ??
      usage.input_tokens ??
      usage.promptTokens ??
      null;
    const outputTokens =
      usage.completion_tokens ??
      usage.output_tokens ??
      usage.completionTokens ??
      null;

    if (messageStartInputTokens === null && inputTokens !== null) {
      messageStartInputTokens = inputTokens;
    }
    if (inputTokens !== null) {
      messageDeltaInputTokensSamples.push(inputTokens);
    }
    if (outputTokens !== null) {
      outputTokensSamples.push(outputTokens);
    }
  }

  return {
    rawEventCount,
    eventTypes: [...new Set(eventTypes)],
    contentTypes: [...new Set(contentTypes)],
    finishReason,
    messageStartModel,
    messageStartInputTokens,
    messageDeltaInputTokensSamples,
    outputTokensSamples,
  };
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

function isAuthFailureStatus(status) {
  return status === 401 || status === 403;
}

function authFailureMessage(status) {
  if (status === 403) return "API Key 无权限访问该接口或模型，请检查额度、权限或模型授权。";
  return "API Key 无效，请检查后重试。";
}

function authFailureFromResults(modelsResult, qaResults) {
  if (isAuthFailureStatus(modelsResult.status)) {
    return { status: modelsResult.status, error: authFailureMessage(modelsResult.status) };
  }

  const qaAuthFailure = qaResults.find((item) => isAuthFailureStatus(item.status));
  if (qaAuthFailure) {
    return { status: qaAuthFailure.status, error: authFailureMessage(qaAuthFailure.status) };
  }

  return null;
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

function buildQualityChecks({ model, targetModel, modelsResult, modelsJson, chatResult, chatJson, streamResult, qaScore, selectionMode = "fixed" }) {
  const models = Array.isArray(modelsJson?.data) ? modelsJson.data : [];
  const modelIds = models.map((item) => item?.id).filter(Boolean);
  const modelExists = modelIds.includes(model);
  const profileSignals = modelProfileSignals({ actualModel: model, targetModel, streamResult, qaScore, selectionMode });
  const streamText = String(streamResult.text || "");

  const knowledgeStatus = qaScore.passed === qaScore.total ? "pass" : qaScore.passed > 0 ? "partial" : "fail";
  const qaRate = qaScore.total ? Math.round((qaScore.passed / qaScore.total) * 100) : 0;
  const responseOk = Boolean(chatJson && Array.isArray(chatJson.choices) && chatJson.choices.length > 0);
  const responseModelMismatch = profileSignals.fixedTargetMode
    ? !profileSignals.idMatchesTarget
    : profileSignals.targetFamily !== "generic" &&
        profileSignals.streamFamily !== "generic" &&
        profileSignals.streamFamily !== profileSignals.targetFamily;
  const protocolOk = chatResult.ok && responseOk && !responseModelMismatch;
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
      detail: modelsResult?.skipped
        ? modelExists
          ? "Selected model id is used for this request."
          : "Selected model id is missing."
        : modelExists
          ? "Selected model appears in /v1/models."
          : "Selected model was not found in /v1/models.",
      detailZh: modelsResult?.skipped
        ? modelExists
          ? "当前使用所选模型 ID 发起检测。"
          : "缺少所选模型 ID。"
        : modelExists
          ? "所选模型出现在 /v1/models 中。"
          : "所选模型没有出现在 /v1/models 中。",
    },
    {
      key: "profile",
      label: "Model profile",
      labelZh: "模型特征校验",
      status: statusLabel(!profileSignals.mismatch),
      detail: profileSignals.mismatch
        ? "Result mismatch."
        : "Requested model matches the selected target family.",
      detailZh: profileSignals.mismatch
        ? "返回结果不匹配。"
        : "实际发送模型与所选目标模型家族一致。",
    },
    {
      key: "protocol",
      label: "Protocol consistency",
      labelZh: "协议一致性",
      status: statusLabel(protocolOk),
      detail: protocolOk
        ? "Chat completion returned a 2xx JSON response."
        : responseModelMismatch
          ? "Result mismatch."
          : "Chat completion did not return a normal JSON response.",
      detailZh: protocolOk
        ? "聊天接口返回 2xx JSON 响应。"
        : responseModelMismatch
          ? "返回结果不匹配。"
          : "聊天接口没有返回正常 JSON 响应。",
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

function qaLatencyCap(qaScore) {
  const latencies = (qaScore?.results || [])
    .map((item) => item.latencyMs)
    .filter((value) => Number.isFinite(value));
  if (!latencies.length) return 10;

  const max = Math.max(...latencies);
  const avg = latencies.reduce((sum, value) => sum + value, 0) / latencies.length;
  if (max > 20000 || avg > 20000) return 0;
  return 10;
}

function latencyScore(latencyMs, qaScore) {
  const chat = latencyMs.chat ?? 99999;
  const ttft = latencyMs.streamingFirstToken ?? 99999;
  let score = 0;
  if (chat <= 20000 && ttft <= 20000) score = 10;
  return Math.min(score, qaLatencyCap(qaScore));
}

async function qaResultForCase({ chatUrl, apiKey, model, qaCase, timeoutMs = 8000, allowChatFallback = true }) {
  const streamAttempt = async () => {
    return timedStreamFetch(
      chatUrl,
      {
        method: "POST",
        headers: {
          ...headersWithKey(apiKey),
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: qaCase.prompt }],
          temperature: 0,
          stream: true,
        }),
      },
      timeoutMs,
      (text) => {
        const answer = streamContent(text);
        return Boolean(answer && qaCase.judge(answer));
      }
    );
  };

  const chatAttempt = async () => {
    return timedFetch(
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
  };

  const resultFromStream = (streamResult) => {
    const answer = streamContent(streamResult.text);
    const streamSummary = summarizeSse(streamResult.text);
    return {
      answer,
      status: streamResult.status,
      latencyMs: streamResult.timings.firstByteMs,
      totalMs: streamResult.timings.totalMs,
      rawPreview: truncateText(streamResult.text),
      streamEventCount: streamSummary.rawEventCount,
      streamText: streamResult.text,
      ok: streamResult.ok && Boolean(answer),
    };
  };

  try {
    const streamResult = await streamAttempt();
    const streamAnswer = resultFromStream(streamResult);
    if (streamAnswer.ok) {
      const answer = streamAnswer.answer;
      return {
        id: qaCase.id,
        dimension: qaCase.dimension,
        dimensionZh: qaCase.dimensionZh,
        prompt: qaCase.prompt,
        status: streamAnswer.status,
        answer,
        expected: qaCase.expected,
        ok: qaCase.judge(answer),
        latencyMs: streamAnswer.latencyMs,
        streamTotalMs: streamAnswer.totalMs,
        streamEventCount: streamAnswer.streamEventCount,
        source: "stream",
        rawPreview: streamAnswer.rawPreview,
      };
    }

    if (allowChatFallback) {
      const result = await chatAttempt();
      const json = extractJson(result.text);
      const answer = chatContent(json);
      return {
        id: qaCase.id,
        dimension: qaCase.dimension,
        dimensionZh: qaCase.dimensionZh,
        prompt: qaCase.prompt,
        status: result.status,
        answer,
        expected: qaCase.expected,
        ok: result.ok && qaCase.judge(answer),
        latencyMs: result.timings.firstByteMs,
        source: "chat-fallback",
        rawPreview: truncateText(result.text),
      };
    }

    return {
      id: qaCase.id,
      dimension: qaCase.dimension,
      dimensionZh: qaCase.dimensionZh,
      prompt: qaCase.prompt,
      status: streamAnswer.status,
      answer: streamAnswer.answer,
      expected: qaCase.expected,
      ok: false,
      latencyMs: streamAnswer.latencyMs,
      streamTotalMs: streamAnswer.totalMs,
      streamEventCount: streamAnswer.streamEventCount,
      source: "stream-incomplete",
      rawPreview: streamAnswer.rawPreview,
    };
  } catch (error) {
    if (allowChatFallback) {
      try {
        const result = await chatAttempt();
        const json = extractJson(result.text);
        const answer = chatContent(json);
        return {
          id: qaCase.id,
          dimension: qaCase.dimension,
          dimensionZh: qaCase.dimensionZh,
          prompt: qaCase.prompt,
          status: result.status,
          answer,
          expected: qaCase.expected,
          ok: result.ok && qaCase.judge(answer),
          latencyMs: result.timings.firstByteMs,
          source: "chat-fallback",
          rawPreview: truncateText(result.text),
        };
      } catch {
        // The error response below reports the original stream failure.
      }
    }

    return {
      id: qaCase.id,
      dimension: qaCase.dimension,
      dimensionZh: qaCase.dimensionZh,
      prompt: qaCase.prompt,
      status: 0,
      answer: "",
      expected: qaCase.expected,
      ok: false,
      error: error.message,
      latencyMs: null,
      source: "error",
      rawPreview: "",
    };
  }
}

async function runBatchQaCases({ chatUrl, apiKey, model, qaCases, timeoutMs = 3000 }) {
  const prompt = batchQaPrompt(qaCases);
  const source = "single-prompt";
  const result = await timedStreamFetch(
    chatUrl,
    {
      method: "POST",
      headers: {
        ...headersWithKey(apiKey),
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        stream: true,
      }),
    },
    timeoutMs
  );
  const answerText = streamContent(result.text);
  const streamUsage = streamUsageTokens(result.text);
  const probeJson = {
    id: "single-prompt-stream",
    object: "chat.completion",
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: answerText,
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: streamUsage.input ?? estimatedTokens(prompt),
      completion_tokens: streamUsage.output ?? estimatedTokens(answerText),
      total_tokens:
        (streamUsage.input ?? estimatedTokens(prompt)) + (streamUsage.output ?? estimatedTokens(answerText)),
    },
  };

  const answers = batchQaAnswers(answerText, qaCases);
  if (!answers) {
    const results = qaCases.map((qaCase) => ({
      id: qaCase.id,
      dimension: qaCase.dimension,
      dimensionZh: qaCase.dimensionZh,
      prompt: qaCase.prompt,
      status: result.status,
      answer: "",
      expected: qaCase.expected,
      ok: false,
      latencyMs: result.timings.firstByteMs,
      source: isAuthFailureStatus(result.status) ? source : "single-prompt-unparseable",
      rawPreview: truncateText(result.text),
    }));
    return {
      results,
      prompt,
      mode: "single-prompt",
      batchError: isAuthFailureStatus(result.status) ? null : "Single prompt QA response was not parseable.",
      timings: {
        batchElapsedMs: result.timings.totalMs,
        fallbackElapsedMs: 0,
        totalElapsedMs: result.timings.totalMs,
      },
      probeResult: {
        ok: result.ok,
        status: result.status,
        headers: {},
        text: result.text,
        timings: result.timings,
      },
      probeJson,
      streamResult: result,
    };
  }

  const results = qaCases.map((qaCase) => {
    const answer = normalizeBatchAnswerValue(answers[qaCase.id] ?? "");
    return {
      id: qaCase.id,
      dimension: qaCase.dimension,
      dimensionZh: qaCase.dimensionZh,
      prompt: qaCase.prompt,
      status: result.status,
      answer,
      expected: qaCase.expected,
      ok: result.ok && qaCase.judge(answer),
      latencyMs: result.timings.firstByteMs,
      source,
      rawPreview: truncateText(result.text),
    };
  });

  return {
    results,
    prompt,
    mode: "single-prompt",
    batchError: null,
    timings: {
      batchElapsedMs: result.timings.totalMs,
      fallbackElapsedMs: 0,
      totalElapsedMs: result.timings.totalMs,
    },
    probeResult: {
      ok: result.ok,
      status: result.status,
      headers: {},
      text: result.text,
      timings: result.timings,
    },
    probeJson,
    streamResult: result,
  };
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

async function runQaCases({
  chatUrl,
  apiKey,
  model,
  qaCases,
  tryBatch = true,
  batchTimeoutMs = 3000,
  qaCaseTimeoutMs = 8000,
  allowChatFallback = true,
}) {
  const startedAt = Date.now();
  let batchError = null;
  if (tryBatch) {
    try {
      const batchBundle = await runBatchQaCases({ chatUrl, apiKey, model, qaCases, timeoutMs: batchTimeoutMs });
      const totalElapsedMs = Date.now() - startedAt;
      return {
        ...batchBundle,
        mode: "batch-stream",
        timings: {
          batchElapsedMs: totalElapsedMs,
          fallbackElapsedMs: 0,
          totalElapsedMs,
        },
      };
    } catch (error) {
      // Some relays/models do not follow batched JSON instructions; keep the slower path as a fallback.
      batchError = error;
    }
  }

  const fallbackStartedAt = Date.now();
  const results = [];
  const prompt = qaCases.map((qaCase) => qaCase.prompt).join("\n");
  const concurrency = Math.min(qaCases.length, 5);
  for (let index = 0; index < qaCases.length; index += concurrency) {
    const batch = qaCases.slice(index, index + concurrency);
    results.push(
      ...(await Promise.all(
        batch.map((qaCase) =>
          qaResultForCase({
            chatUrl,
            apiKey,
            model,
            qaCase,
            timeoutMs: qaCaseTimeoutMs,
            allowChatFallback,
          })
        )
      ))
    );
  }
  const fallbackElapsedMs = Date.now() - fallbackStartedAt;
  const totalElapsedMs = Date.now() - startedAt;
  const ok = results.some((item) => item.status >= 200 && item.status < 300);
  const streamedResults = results.filter((item) => item.source === "stream" && item.streamEventCount > 0);
  const streamed = streamedResults.length > 0;
  const maxLatencyMs = Math.max(...results.map((item) => item.latencyMs || 0));
  const maxStreamTotalMs = Math.max(...results.map((item) => item.streamTotalMs || item.latencyMs || 0));
  const totalStreamEvents = streamedResults.reduce((sum, item) => sum + (item.streamEventCount || 0), 0);
  const probeJson = {
    model,
    choices: [
      {
        message: {
          role: "assistant",
          content: results.map((item) => `${item.id}:${item.answer}`).join("\n"),
        },
        finish_reason: "stop",
      },
    ],
  };
  return {
    results,
    prompt,
    mode: "stream-fallback",
    batchError: batchError?.message || null,
    timings: {
      batchElapsedMs: fallbackStartedAt - startedAt,
      fallbackElapsedMs,
      totalElapsedMs,
    },
    probeResult: {
      ok,
      status: ok ? 200 : 0,
      headers: {},
      text: JSON.stringify(probeJson),
      timings: {
        firstByteMs: maxLatencyMs,
        totalMs: maxStreamTotalMs,
      },
    },
    probeJson,
    streamResult: {
      ok,
      status: ok ? 200 : 0,
      stream: streamed,
      text: streamed ? `data: ${JSON.stringify({ event_count: totalStreamEvents })}\n\n` : "",
      fallback: true,
      timings: {
        firstByteMs: maxLatencyMs,
        totalMs: maxStreamTotalMs,
      },
    },
  };
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
  targetModel = model,
  selectionMode = "fixed",
}) {
  const notes = compatibilityNotes(modelsResult, chatResult, streamResult);
  const latencyMs = {
    models: modelsResult.timings.firstByteMs,
    chat: chatResult.timings.firstByteMs,
    streamingFirstToken: streamResult.timings.firstByteMs,
    streamingTotal: streamResult.timings.totalMs,
  };
  const checks = buildQualityChecks({ model, targetModel, modelsResult, modelsJson, chatResult, chatJson, streamResult, qaScore, selectionMode });
  const usage = usageTokens(chatJson);
  const chatPrompt = qaScore.prompt || qaScore.results?.[0]?.prompt || "";
  const inputTokens = usage.input ?? estimatedTokens(chatPrompt);
  const outputTokens = usage.output ?? estimatedTokens(chatContent(chatJson));
  const tokensPerSecond =
    outputTokens && chatResult.timings.totalMs
      ? Math.round((outputTokens / (chatResult.timings.totalMs / 1000)) * 10) / 10
      : null;
  const models = Array.isArray(modelsJson?.data) ? modelsJson.data : [];
  const modelExists = models.map((item) => item?.id).filter(Boolean).includes(model);
  const responseOk = Boolean(chatJson && Array.isArray(chatJson.choices) && chatJson.choices.length > 0);
  const profileSignals = modelProfileSignals({ actualModel: model, targetModel, streamResult, qaScore, selectionMode });
  const responseModelMismatch = profileSignals.fixedTargetMode
    ? !profileSignals.idMatchesTarget
    : profileSignals.targetFamily !== "generic" &&
        profileSignals.streamFamily !== "generic" &&
        profileSignals.streamFamily !== profileSignals.targetFamily;
  const protocolOk = chatResult.ok && responseOk && !responseModelMismatch;
  const streamOk = Boolean(streamResult.ok && streamResult.stream && String(streamResult.text || "").includes("data:"));
  const baseScore =
    qaScore.score +
    (modelExists ? 10 : 0) +
    (protocolOk ? 10 : 0) +
    (responseOk ? 10 : 0) +
    (streamResult.pending ? 0 : streamOk ? 10 : 0) +
    (streamResult.pending ? 0 : latencyScore(latencyMs, qaScore));
  const scoreBeforeMismatchPenalty = baseScore + (responseModelMismatch && chatResult.ok && responseOk ? 10 : 0);
  const score = profileSignals.fixedTargetMode && !profileSignals.idMatchesTarget
    ? Math.max(0, scoreBeforeMismatchPenalty - mismatchPenalty())
    : profileSignals.strongMismatch
      ? Math.min(baseScore, 70)
      : profileSignals.mismatch
        ? Math.max(0, baseScore - 40)
        : baseScore;
  const failedChecks = checks.filter((item) => item.status === "fail").length;
  const partialChecks = checks.filter((item) => item.status === "partial").length;
  const verdict = buildVerdict(checks, latencyMs);

  return {
    input: {
      baseUrl,
      model,
      targetModel,
      selectionMode,
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
        modelsEndpoint: modelsResult.skipped ? null : modelsResult.ok,
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
  const selectionMode = payload.selectionMode === "fetched" ? "fetched" : "fixed";
  const targetModel = selectionMode === "fetched" ? model : String(payload.targetModel || model).trim();
  const qaBank = qaCasesForModel(targetModel);
  const chatUrl = new URL("/v1/chat/completions", baseUrl).toString();

  const [modelsBundle, qaBundle, streamResult] = await Promise.all([
    selectionMode === "fetched" ? fetchModelsBundle(baseUrl, apiKey) : localModelsBundle(model),
    runBatchQaCases({
      chatUrl,
      apiKey,
      model,
      qaCases: qaBank.cases,
      timeoutMs: 15000,
    }),
    timedStreamFetch(
      chatUrl,
      {
        method: "POST",
        headers: {
          ...headersWithKey(apiKey),
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "只输出 OK，不要解释。" }],
          temperature: 0,
          stream: true,
        }),
      },
      15000
    ),
  ]);
  const authFailure = authFailureFromResults(modelsBundle.result, qaBundle.results);
  if (authFailure) {
    return authFailure;
  }

  if (isAuthFailureStatus(streamResult.status)) {
    return { status: streamResult.status, error: authFailureMessage(streamResult.status) };
  }

  return {
    status: 200,
    baseUrl,
    apiKey,
    model,
    targetModel,
    selectionMode,
    qaBank,
    modelsResult: modelsBundle.result,
    chatResult: qaBundle.probeResult,
    modelsJson: modelsBundle.json,
    chatJson: qaBundle.probeJson,
    qaResults: qaBundle.results,
    qaPrompt: qaBundle.prompt,
    qaMode: qaBundle.mode,
    qaTimings: qaBundle.timings,
    qaBatchError: qaBundle.batchError,
    streamResult,
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
        messages: [{ role: "user", content: "Answer with exactly one word: OK" }],
        temperature: 0,
        stream: true,
      }),
    },
    25000
  );

  const streamJson = extractJson(streamResult.text);
  const qaScore = buildQaScore(prepared.qaBank, prepared.qaResults);
  qaScore.prompt = prepared.qaPrompt;
  qaScore.mode = prepared.qaMode;
  qaScore.timings = prepared.qaTimings;
  qaScore.batchError = prepared.qaBatchError || null;

  return {
    status: 200,
    body: buildResponseBody({
      baseUrl: prepared.baseUrl,
      model: prepared.model,
      targetModel: prepared.targetModel,
      modelsResult: prepared.modelsResult,
      modelsJson: prepared.modelsJson,
      chatResult: prepared.chatResult,
      chatJson: prepared.chatJson,
      streamResult,
      streamJson,
      qaScore,
      phase: "complete",
      selectionMode: prepared.selectionMode,
    }),
  };
}

function mismatchPenalty() {
  return 35 + Math.floor(Math.random() * 6);
}

export async function buildQuickTestResult(payload, hostHeader) {
  const prepared = await prepareCoreResults(payload, hostHeader);
  if (prepared.status !== 200) {
    return { status: prepared.status, body: { error: prepared.error } };
  }

  const qaScore = buildQaScore(prepared.qaBank, prepared.qaResults);
  qaScore.prompt = prepared.qaPrompt;
  qaScore.mode = prepared.qaMode;
  qaScore.timings = prepared.qaTimings;
  qaScore.batchError = prepared.qaBatchError || null;
  return {
    status: 200,
    body: buildResponseBody({
      baseUrl: prepared.baseUrl,
      model: prepared.model,
      targetModel: prepared.targetModel,
      modelsResult: prepared.modelsResult,
      modelsJson: prepared.modelsJson,
      chatResult: prepared.chatResult,
      chatJson: prepared.chatJson,
      streamResult: prepared.streamResult,
      streamJson: null,
      qaScore,
      phase: "quick",
      selectionMode: prepared.selectionMode,
    }),
  };
}

export async function buildSupplementTestResult(payload, hostHeader) {
  let baseUrl;
  try {
    baseUrl = normalizeBaseUrl(payload.baseUrl);
    await assertPublicTarget(baseUrl, hostHeader);
  } catch (error) {
    return { status: 400, body: { error: error.message } };
  }

  const apiKey = String(payload.apiKey || "").trim();
  const model = String(payload.model || "gpt-4o-mini").trim();
  const chatUrl = new URL("/v1/chat/completions", baseUrl).toString();
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
        messages: [{ role: "user", content: "Answer with exactly one word: OK" }],
        temperature: 0,
        stream: true,
      }),
    },
    18000
  );
  const streamUsage = streamUsageTokens(streamResult.text);
  const streamOutputText = streamContent(streamResult.text);
  return {
    status: 200,
    body: {
      phase: "supplement",
      input: {
        baseUrl,
        model,
      },
      stream: {
        ok: streamResult.ok,
        status: streamResult.status,
        pending: false,
        timings: streamResult.timings,
        text: streamResult.text,
      },
      chat: {
        ok: null,
        status: null,
        timings: {
          firstByteMs: null,
          totalMs: streamResult.timings.totalMs,
        },
        usage: streamUsage,
        outputText: streamOutputText,
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

  try {
    const modelsBundle = await fetchModelsBundle(baseUrl, apiKey);
    const modelsResult = modelsBundle.result;
    const json = modelsBundle.json;
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
        timings: {
          ...modelsResult.timings,
          cached: modelsBundle.fromCache,
        },
        raw: json,
      },
    };
  } catch (error) {
    return { status: 502, body: { error: error.message } };
  }
}
