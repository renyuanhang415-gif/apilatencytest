const form = document.querySelector("[data-test-form]");
const baseUrlInput = document.querySelector("#baseUrl");
const apiKeyInput = document.querySelector("#apiKey");
const modelInput = document.querySelector("#model");
const resultWrap = document.querySelector("[data-results]");
const fetchModelsBtn = document.querySelector("[data-fetch-models]");
const runTestBtn = document.querySelector("[data-run-test]");
const resetFlowBtn = document.querySelector("[data-reset-flow]");
const modelStep = document.querySelector("[data-model-step]");
const commonModelsEl = document.querySelector("[data-common-models]");
const modelPicker = document.querySelector("[data-model-picker]");
const modelSearchInput = document.querySelector("[data-model-search]");
const modelFilterBtns = document.querySelectorAll("[data-model-filter]");
const modelStatus = document.querySelector("[data-model-status]");
const toggleKeyBtn = document.querySelector("[data-toggle-key]");
const scoreEl = document.querySelector("[data-score]");
const statusEl = document.querySelector("[data-status]");
const verdictTitleEl = document.querySelector("[data-verdict-title]");
const verdictTextEl = document.querySelector("[data-verdict-text]");
const resultErrorEl = document.querySelector("[data-result-error]");
const resultStatusSummaryEl = document.querySelector("[data-result-status-summary]");
const testedTargetEl = document.querySelector("[data-tested-target]");
const resultLoadingEl = document.querySelector("[data-result-loading]");
const resultDetailsEl = document.querySelector("[data-result-details]");
const checksEl = document.querySelector("[data-checks]");
const modelGradeEl = document.querySelector("[data-model-grade]");
const modelScoreEl = document.querySelector("[data-model-score]");
const modelScoreNoteEl = document.querySelector("[data-model-score-note]");
const modelScoreFactorsEl = document.querySelector("[data-model-score-factors]");
const scoreRingEl = document.querySelector(".score-ring");
const latencyChatEl = document.querySelector("[data-chat-latency]");
const latencyStreamEl = document.querySelector("[data-stream-latency]");
const streamTotalEl = document.querySelector("[data-stream-total]");
const tokensSpeedEl = document.querySelector("[data-tokens-speed]");
const inputTokensEl = document.querySelector("[data-input-tokens]");
const outputTokensEl = document.querySelector("[data-output-tokens]");
const debugPanelEl = document.querySelector("[data-debug-panel]");
const debugOutputEl = document.querySelector("[data-debug-output]");
const allModels = [];
const commonModels = [
  { key: "opus47", name: "Opus 4.7", id: "claude-opus-4-7", profile: "claude-opus-4-7" },
  { key: "opus46", name: "Opus 4.6", id: "claude-opus-4-5", profile: "claude-opus-4-5" },
  { key: "sonnet46", name: "Sonnet 4.6", id: "claude-sonnet-4-6", profile: "claude-sonnet-4-6" },
  { key: "gemini31pro", name: "Gemini 3.1 Pro", id: "gemini-3.1-pro", profile: "gemini-3.1-pro" },
  { key: "gpt54", name: "GPT 5.4", id: "gpt-5.4", profile: "gpt-5.4" },
  { key: "gpt55", name: "GPT 5.5", id: "gpt-5.5", profile: "gpt-5.5", badge: "NEW" },
];
const defaultCommonModelId = "gpt-5.5";
let selectedModelProfile = defaultCommonModelId;
let selectedModelMode = "fixed";
let selectedCommonModelKey = "gpt55";
const debugMode = new URLSearchParams(window.location.search).get("debug") === "1";

const locale = (document.body.dataset.locale || document.documentElement.lang || "en").toLowerCase().startsWith("zh")
  ? "zh"
  : "en";

const text = {
  en: {
    show: "Show",
    hide: "Hide",
    showKey: "Show API key",
    hideKey: "Hide API key",
    fetchingModels: "Fetching models...",
    loadingModels: "Loading model list...",
    noMatchingModels: "No matching models.",
    commonModels: "Common models",
    selectModel: "Select a model, then start the test.",
    selectedModel: (model) => `Selected ${model}. Start the test when ready.`,
    loadedModels: (count, ms) => `Loaded ${count} models in ${ms} ms.`,
    showingModels: (visible, total) => `Showing ${visible} of ${total} models.`,
    running: "Testing...",
    runningHtml: '<span class="loading-spinner" aria-hidden="true"></span>Testing...',
    supplementing: "Core result is ready. Running supplemental streaming checks...",
    scorePending: "Almost done",
    scorePendingNote: "Final model score is waiting for streaming and speed metrics. Please wait a moment.",
    supplementFailed: "Supplemental streaming check failed. Core checks are still shown above.",
    tested: (baseUrl, model) => `${baseUrl} · ${model}`,
    pass: "Pass",
    partial: "Warning",
    fail: "Fail",
    unavailable: "Unavailable",
    requestFailed: "Request failed.",
    missingCredentials: "API Base URL or API Key is empty. Please enter it first.",
    rawNoStream: "No stream response body.",
    failurePrefix: "Possible reason",
    rawLogPrefix: "raw log",
    requestStatuses: {
      models: "Models (model list)",
      chat: "Chat (test reply)",
      stream: "Stream (live output)",
      timeout: "timeout / aborted",
      missing: "not run",
      ok: "ok",
      badRequest: "bad request",
      unauthorized: "invalid key / no access",
      forbidden: "forbidden",
      notFound: "not found",
      rateLimited: "rate limited",
      serverError: "server error",
    },
    modelScoreFactors: (qa, latency, protocol) => [
      `Knowledge QA ${qa.rate}%`,
      `Latency ${latency}`,
      protocol ? "Protocol OK" : "Protocol warning",
    ],
    scoreNotes: {
      excellent: "The endpoint looks stable in this run: answers, compatibility, streaming, and latency are all strong.",
      good: "The endpoint is usable. A few signals are not perfect, so compare it with another provider before heavy use.",
      watch: "This endpoint has visible risk. Use it for testing only until repeated checks look better.",
      poor: "This endpoint is not reliable enough in this run. Avoid using it as a main production relay.",
    },
    scoreGrades: {
      excellent: "Excellent",
      good: "Good",
      watch: "Watch",
      poor: "High risk",
    },
  },
  zh: {
    show: "显示",
    hide: "隐藏",
    showKey: "显示 API Key",
    hideKey: "隐藏 API Key",
    fetchingModels: "正在获取模型...",
    loadingModels: "正在加载模型列表...",
    noMatchingModels: "没有匹配的模型。",
    commonModels: "常用模型",
    selectModel: "选择一个目标模型，然后开始检测。",
    selectedModel: (model) => `已选择 ${model}，可以开始检测。`,
    loadedModels: (count, ms) => `已获取 ${count} 个模型，用时 ${ms} ms。`,
    showingModels: (visible, total) => `当前显示 ${visible} / ${total} 个模型。`,
    running: "检测中...",
    runningHtml: '<span class="loading-spinner" aria-hidden="true"></span>检测中...',
    supplementing: "核心结论已返回，正在补充流式与速度指标...",
    scorePending: "检测即将结束",
    scorePendingNote: "模型整体评分还在等待流式与速度指标，请稍等。",
    supplementFailed: "流式补充检测失败，当前保留上方核心检测结果。",
    tested: (baseUrl, model) => `${baseUrl} · ${model}`,
    pass: "通过",
    partial: "注意",
    fail: "失败",
    unavailable: "不可用",
    requestFailed: "请求失败。",
    missingCredentials: "API 接口地址或 API Key 为空，请先输入。",
    rawNoStream: "没有流式响应正文。",
    failurePrefix: "可能原因",
    rawLogPrefix: "原始日志",
    requestStatuses: {
      models: "Models（模型列表）",
      chat: "Chat（问答接口）",
      stream: "Stream（流式输出）",
      timeout: "超时 / 中断",
      missing: "未执行",
      ok: "正常返回",
      badRequest: "请求格式有问题",
      unauthorized: "Key 无效或无权限",
      forbidden: "接口被拒绝",
      notFound: "接口不存在",
      rateLimited: "请求过多被限流",
      serverError: "服务端异常",
    },
    modelScoreFactors: (qa, latency, protocol) => [
      `知识问答通过率 ${qa.rate}%`,
      `延迟 ${latency}`,
      protocol ? "协议正常" : "协议需注意",
    ],
    scoreNotes: {
      excellent: "本次检测质量信号较好：答题、兼容性、流式输出和延迟都比较稳定，可以作为候选接口继续观察。",
      good: "本次检测整体可用，但仍有少量信号不够完美。建议和其它中转站再对比几次，不要只看单次结果。",
      watch: "本次检测存在明显风险信号，更适合先做测试，不建议直接作为长期主力接口。",
      poor: "本次检测质量较差，知识问答、兼容性或延迟至少有一项拖后腿，建议谨慎购买或使用。",
    },
    scoreGrades: {
      excellent: "优秀",
      good: "良好",
      watch: "需观察",
      poor: "高风险",
    },
  },
};

const t = text[locale];
let activeModelFilter = "";
const trackedInputSteps = new Set();
let isTesting = false;
let verificationModal = null;
let noticeTimer = null;

function fmtMs(ms) {
  if (ms === null || ms === undefined) return "-";
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function fmtValue(value, suffix = "") {
  if (value === null || value === undefined) return "-";
  return `${value}${suffix}`;
}

function explainFailure(message) {
  const raw = String(message || "").trim();
  const lower = raw.toLowerCase();
  let reason =
    locale === "zh"
      ? "接口连接失败。可能是地址不对、接口不可用、网络超时、Key 无权限、余额不足或上游服务异常。"
      : "The endpoint could not be reached. Possible causes include a wrong URL, unavailable endpoint, timeout, missing access, insufficient balance, or upstream failure.";

  if (/401|invalid api key|api key 无效|unauthorized/.test(lower)) {
    reason = locale === "zh" ? "API Key 无效，或当前 Key 没有访问权限。" : "The API key is invalid or does not have access.";
  } else if (/403|forbidden|无权限|permission/.test(lower)) {
    reason = locale === "zh" ? "接口拒绝访问，可能是 Key 权限不足、模型未授权或账户余额不足。" : "Access was rejected. The key may lack permission, model access, or account balance.";
  } else if (/429|rate limit|too many|限流/.test(lower)) {
    reason = locale === "zh" ? "请求过多被限流，建议稍后重试或换线路。" : "The endpoint is rate limited. Try again later or switch routes.";
  } else if (/timeout|aborted|timed out|超时|中断/.test(lower)) {
    reason = locale === "zh" ? "请求超时或被中断，可能是线路慢、上游卡住或高并发不稳定。" : "The request timed out or was aborted. The route may be slow, stuck upstream, or unstable under load.";
  } else if (/insufficient|balance|quota|credit|余额|额度|欠费/.test(lower)) {
    reason = locale === "zh" ? "账户余额、额度或配额可能不足，请检查中转站后台。" : "The account may have insufficient balance, quota, or credits.";
  } else if (/404|not found/.test(lower)) {
    reason = locale === "zh" ? "接口路径不存在，请检查 API 接口地址是否填到了正确的根地址。" : "The endpoint path was not found. Check whether the API base URL is correct.";
  }

  const rawLog = raw ? ` ${t.rawLogPrefix}: ${raw}` : "";
  return `${t.failurePrefix}: ${reason}${rawLog}`;
}

function requestStatusText(label, result) {
  if (!result) return `${label}: ${t.requestStatuses.missing}`;
  if (Number.isFinite(result.status) && result.status > 0) {
    let meaning = t.requestStatuses.serverError;
    if (result.status >= 200 && result.status < 300) meaning = t.requestStatuses.ok;
    else if (result.status === 400) meaning = t.requestStatuses.badRequest;
    else if (result.status === 401) meaning = t.requestStatuses.unauthorized;
    else if (result.status === 403) meaning = t.requestStatuses.forbidden;
    else if (result.status === 404) meaning = t.requestStatuses.notFound;
    else if (result.status === 429) meaning = t.requestStatuses.rateLimited;
    const wrappedMeaning = locale === "zh" ? `（${meaning}）` : ` (${meaning})`;
    return `${label}: HTTP ${result.status}${wrappedMeaning}`;
  }
  if (result.error || /aborted|timeout/i.test(String(result.text || ""))) return `${label}: ${t.requestStatuses.timeout}`;
  return `${label}: ${t.requestStatuses.missing}`;
}

function renderStatusSummary(data) {
  if (!resultStatusSummaryEl) return;
  const lines = [
    requestStatusText(t.requestStatuses.models, data.results?.models),
    requestStatusText(t.requestStatuses.chat, data.results?.chat),
    requestStatusText(t.requestStatuses.stream, data.results?.streaming),
  ];
  resultStatusSummaryEl.innerHTML = lines.map((line) => `<span>${line}</span>`).join("");
  resultStatusSummaryEl.hidden = false;
}

function setModelStatus(message, kind = "") {
  if (!modelStatus) return;
  modelStatus.textContent = message;
  modelStatus.className = kind ? `hint status-${kind}` : "hint";
}

function showTemporaryNotice(message) {
  let notice = document.querySelector("[data-temporary-notice]");
  if (!notice) {
    notice = document.createElement("div");
    notice.className = "temporary-notice";
    notice.dataset.temporaryNotice = "";
    notice.setAttribute("role", "status");
    notice.setAttribute("aria-live", "polite");
    document.body.appendChild(notice);
  }

  notice.textContent = message;
  notice.classList.add("is-visible");
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    notice.classList.remove("is-visible");
  }, 2200);
}

function fieldHasUserInput(input) {
  if (!input) return false;
  if (input.matches?.(":placeholder-shown")) return false;
  return Boolean(String(input.value || "").trim());
}

function hasRequiredCredentials() {
  return fieldHasUserInput(baseUrlInput) && fieldHasUserInput(apiKeyInput);
}

function requireCredentials() {
  if (hasRequiredCredentials()) return true;
  showTemporaryNotice(t.missingCredentials);
  if (!fieldHasUserInput(baseUrlInput)) {
    baseUrlInput?.focus();
  } else {
    apiKeyInput?.focus();
  }
  return false;
}

function displayPayload(payload) {
  return {
    ...payload,
    apiKey: payload.apiKey ? "[hidden]" : "",
  };
}

function renderJson(el, data) {
  if (!el) return;
  el.textContent = JSON.stringify(data, null, 2);
}

function statusText(status) {
  if (status === "pass") return t.pass;
  if (status === "partial" || status === "warning") return t.partial;
  return t.fail;
}

function modelFamily(model) {
  const value = String(model || "").toLowerCase();
  if (value.includes("gpt") || value.includes("openai")) return "gpt";
  if (value.includes("claude") || value.includes("sonnet") || value.includes("opus")) return "claude";
  if (value.includes("gemini")) return "gemini";
  if (value.includes("deepseek")) return "deepseek";
  if (value.includes("grok")) return "grok";
  if (value.includes("glm")) return "glm";
  if (value.includes("kimi")) return "kimi";
  return "other";
}

function trackEvent(name, params = {}) {
  if (typeof window.gtag !== "function") return;
  window.gtag("event", name, {
    app_locale: locale,
    ...params,
  });
}

function renderChecks(checks) {
  if (!checksEl) return;
  checksEl.innerHTML = "";
  checks.forEach((check) => {
    const row = document.createElement("div");
    row.className = `check-row status-${check.status}`;

    const icon = document.createElement("span");
    icon.className = "check-icon";
    icon.textContent = check.status === "pass" ? "✓" : check.status === "partial" ? "!" : "×";

    const main = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = locale === "zh" ? check.labelZh : check.label;
    const detail = document.createElement("p");
    detail.textContent = locale === "zh" ? check.detailZh : check.detail;
    main.append(title, detail);

    const result = document.createElement("span");
    result.className = "check-status";
    result.textContent = statusText(check.status);

    row.append(icon, main, result);
    checksEl.appendChild(row);
  });
}

function modelGrade(score) {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 60) return "watch";
  return "poor";
}

function scoreRingTone(score) {
  if (score >= 100) return "perfect";
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 60) return "watch";
  return "poor";
}

function qaLatencyCap(qa) {
  const latencies = (qa?.results || [])
    .map((item) => item.latencyMs)
    .filter((value) => Number.isFinite(value));
  if (!latencies.length) return 10;

  const max = Math.max(...latencies);
  const avg = latencies.reduce((sum, value) => sum + value, 0) / latencies.length;
  if (max >= 11000 || avg >= 7000) return 0;
  if (max >= 8000 || avg >= 5000) return 5;
  return 10;
}

function renderModelScore(data) {
  const score = Number(data.score || 0);
  const grade = modelGrade(score);
  const qa = data.summary?.qa || { passed: 0, total: 0, rate: 0 };
  const latency = fmtMs(data.summary?.latencyMs?.chat);
  const protocolOk = data.checks?.every((item) => item.key !== "protocol" || item.status === "pass");

  if (scoreRingEl) {
    scoreRingEl.style.setProperty("--score-progress", `${Math.max(0, Math.min(100, score))}`);
    scoreRingEl.dataset.tone = scoreRingTone(score);
  }
  if (modelGradeEl) modelGradeEl.textContent = t.scoreGrades[grade];
  if (modelScoreEl) modelScoreEl.textContent = `${score}%`;
  if (modelScoreNoteEl) modelScoreNoteEl.textContent = t.scoreNotes[grade];
  if (!modelScoreFactorsEl) return;
  modelScoreFactorsEl.innerHTML = "";
}

function renderDebug(data) {
  if (!debugMode || !debugPanelEl || !debugOutputEl) return;
  debugPanelEl.hidden = false;
  const qa = data.summary?.qa || {};
  debugOutputEl.textContent = JSON.stringify(
    {
      phase: data.phase,
      model: data.input?.model,
      targetModel: data.input?.targetModel,
      selectionMode: data.input?.selectionMode,
      score: data.score,
      qaRate: qa.rate,
      qaMode: qa.mode,
      qaTimings: qa.timings,
      qaBatchError: qa.batchError,
      qaResults: (qa.results || []).map((item) => ({
        id: item.id,
        status: item.status,
        ok: item.ok,
        source: item.source,
        latencyMs: item.latencyMs,
        prompt: item.prompt,
        expected: item.expected,
        answer: item.answer,
        error: item.error,
        rawPreview: item.rawPreview,
      })),
    },
    null,
    2
  );
}

function renderModelScorePending() {
  if (scoreRingEl) {
    scoreRingEl.style.setProperty("--score-progress", "0");
    scoreRingEl.dataset.tone = "pending";
  }
  if (modelGradeEl) {
    modelGradeEl.innerHTML = `<span class="loading-spinner" aria-hidden="true"></span>${t.scorePending}`;
  }
  if (modelScoreEl) modelScoreEl.textContent = "...";
  if (modelScoreNoteEl) modelScoreNoteEl.textContent = t.scorePendingNote;
  if (modelScoreFactorsEl) modelScoreFactorsEl.innerHTML = "";
}

function renderSupplementFailed() {
  if (scoreRingEl) {
    scoreRingEl.style.setProperty("--score-progress", "0");
    scoreRingEl.dataset.tone = "watch";
  }
  if (modelGradeEl) modelGradeEl.textContent = t.partial;
  if (modelScoreEl) modelScoreEl.textContent = "-";
  if (modelScoreNoteEl) modelScoreNoteEl.textContent = t.supplementFailed;
  if (modelScoreFactorsEl) modelScoreFactorsEl.innerHTML = "";
}

function renderRequestFailed(message = "") {
  if (scoreRingEl) {
    scoreRingEl.style.setProperty("--score-progress", "0");
    scoreRingEl.dataset.tone = "poor";
  }
  if (modelGradeEl) modelGradeEl.textContent = "-";
  if (modelScoreEl) modelScoreEl.textContent = "-";
  if (modelScoreNoteEl) modelScoreNoteEl.textContent = locale === "zh" ? "本次检测未完成" : "This test did not complete.";
  if (modelScoreFactorsEl) modelScoreFactorsEl.innerHTML = "";
  latencyChatEl.textContent = "-";
  latencyStreamEl.textContent = "-";
  streamTotalEl.textContent = "-";
  tokensSpeedEl.textContent = "-";
  inputTokensEl.textContent = "-";
  outputTokensEl.textContent = "-";
  if (resultErrorEl) {
    resultErrorEl.hidden = false;
    resultErrorEl.textContent = explainFailure(message);
  }
  if (resultStatusSummaryEl) {
    resultStatusSummaryEl.hidden = true;
    resultStatusSummaryEl.innerHTML = "";
  }
}

function renderTestResult(data, options = {}) {
  const forceFinished = Boolean(data.phase === "quick" && data.pendingSupplement);
  const showFinalScore = options.showFinalScore !== false && (!data.pendingSupplement || forceFinished);
  if (forceFinished) {
    data.pendingSupplement = false;
    const streamCheck = data.checks?.find((item) => item.key === "stream");
    if (streamCheck?.status === "partial") {
      streamCheck.detail = "Streaming result was not finalized in the quick path.";
      streamCheck.detailZh = "快检阶段没有拿到最终流式结果。";
    }
  }
  const kind = data.compatibility === "pass" ? "pass" : data.compatibility === "partial" ? "partial" : "fail";
  if (resultLoadingEl) resultLoadingEl.hidden = true;
  if (resultDetailsEl) resultDetailsEl.hidden = false;
  scoreEl.textContent = `${data.score}%`;
  statusEl.textContent = statusText(kind);
  statusEl.className = `status-pill status-${kind}`;
  verdictTitleEl.textContent = locale === "zh" ? data.verdict.titleZh : data.verdict.title;
  verdictTextEl.textContent = locale === "zh" ? data.verdict.textZh : data.verdict.text;
  if (resultErrorEl) {
    resultErrorEl.hidden = true;
    resultErrorEl.textContent = "";
  }
  if (resultStatusSummaryEl) {
    renderStatusSummary(data);
  }
  testedTargetEl.textContent = t.tested(data.input.baseUrl, data.input.model);

  renderChecks(data.checks || []);
  if (showFinalScore) {
    renderModelScore(data);
  } else {
    renderModelScorePending();
  }
  renderDebug(data);
  latencyChatEl.textContent = fmtMs(data.summary.latencyMs.chat);
  latencyStreamEl.textContent = fmtMs(data.summary.latencyMs.streamingFirstToken);
  streamTotalEl.textContent = fmtMs(data.summary.latencyMs.streamingTotal);
  tokensSpeedEl.textContent = fmtValue(data.summary.tokens?.perSecond);
  inputTokensEl.textContent = fmtValue(data.summary.tokens?.input);
  outputTokensEl.textContent = fmtValue(data.summary.tokens?.output);
}

function mergeSupplementResult(baseData, supplementData) {
  const merged = structuredClone(baseData);
  const stream = supplementData.stream || {};
  const chat = supplementData.chat || {};
  const streamOk = Boolean(stream.ok && String(stream.text || "").includes("data:"));
  const streamCheck = merged.checks?.find((item) => item.key === "stream");
  if (streamCheck) {
    streamCheck.pending = false;
    streamCheck.status = streamOk ? "pass" : "fail";
    streamCheck.detail = streamOk ? "Streaming returned event-style chunks." : "Streaming did not return normal event chunks.";
    streamCheck.detailZh = streamOk ? "流式接口返回了事件格式分片。" : "流式接口没有返回正常事件分片。";
  }

  merged.phase = "supplement";
  merged.pendingSupplement = false;
  merged.summary.latencyMs.streamingFirstToken = stream.timings?.firstByteMs ?? null;
  merged.summary.latencyMs.streamingTotal = stream.timings?.totalMs ?? null;
  merged.summary.supported.streaming = Boolean(stream.ok);

  const outputTokens = chat.usage?.output ?? (chat.outputText ? Math.max(1, Math.round(String(chat.outputText).length / 4)) : null);
  merged.summary.tokens.output = outputTokens;
  merged.summary.tokens.perSecond =
    outputTokens && chat.timings?.totalMs ? Math.round((outputTokens / (chat.timings.totalMs / 1000)) * 10) / 10 : null;

  const failedChecks = merged.checks.filter((item) => item.status === "fail").length;
  const partialChecks = merged.checks.filter((item) => item.status === "partial").length;
  const streamScore = streamOk ? 10 : 0;
  const responseLatencyScore =
    merged.summary.latencyMs.chat <= 2500 && (merged.summary.latencyMs.streamingFirstToken ?? 99999) <= 2500
      ? 10
      : merged.summary.latencyMs.chat <= 6000 && (merged.summary.latencyMs.streamingFirstToken ?? 99999) <= 6000
        ? 5
        : 0;
  const latencyScore = Math.min(responseLatencyScore, qaLatencyCap(merged.summary.qa));
  const previousStreamPendingScore = 0;
  merged.score = Math.min(100, merged.score + streamScore + latencyScore - previousStreamPendingScore);
  merged.compatibility = failedChecks === 0 && partialChecks === 0 ? "pass" : failedChecks <= 1 ? "partial" : "fail";
  return merged;
}

function setFlowModelsLoaded() {
  if (modelStep) modelStep.hidden = false;
  if (modelSearchInput) modelSearchInput.hidden = false;
  if (modelPicker) modelPicker.hidden = false;
  if (modelFilterBtns.length) {
    modelFilterBtns.forEach((button) => {
      button.hidden = false;
    });
  }
  const filtersWrap = document.querySelector("[data-model-filters]");
  if (filtersWrap) filtersWrap.hidden = false;
  if (fetchModelsBtn) fetchModelsBtn.hidden = true;
  if (resetFlowBtn) resetFlowBtn.hidden = false;
}

function resetResults() {
  if (resultWrap) resultWrap.hidden = true;
  if (resultLoadingEl) resultLoadingEl.hidden = false;
  if (resultDetailsEl) resultDetailsEl.hidden = true;
  if (checksEl) checksEl.innerHTML = "";
  if (modelGradeEl) modelGradeEl.textContent = "-";
  if (modelScoreEl) modelScoreEl.textContent = "-";
  if (modelScoreNoteEl) modelScoreNoteEl.textContent = "";
  if (modelScoreFactorsEl) modelScoreFactorsEl.innerHTML = "";
  if (debugPanelEl) debugPanelEl.hidden = true;
  if (debugOutputEl) debugOutputEl.textContent = "{}";
  if (scoreEl) scoreEl.textContent = "-";
  if (statusEl) statusEl.textContent = "-";
  if (resultErrorEl) {
    resultErrorEl.hidden = true;
    resultErrorEl.textContent = "";
  }
  if (resultStatusSummaryEl) {
    resultStatusSummaryEl.hidden = true;
    resultStatusSummaryEl.innerHTML = "";
  }
  if (testedTargetEl) testedTargetEl.textContent = "-";
}

function resetFlow() {
  allModels.length = 0;
  if (modelInput) modelInput.value = defaultCommonModelId;
  selectedModelProfile = defaultCommonModelId;
  selectedModelMode = "fixed";
  selectedCommonModelKey = "gpt55";
  if (modelSearchInput) {
    modelSearchInput.value = "";
    modelSearchInput.hidden = true;
  }
  if (modelPicker) {
    modelPicker.innerHTML = `<span class="hint">${locale === "zh" ? "可直接选择常用模型。" : "Choose a common model above."}</span>`;
    modelPicker.hidden = true;
  }
  if (modelStep) modelStep.hidden = false;
  if (fetchModelsBtn) fetchModelsBtn.hidden = false;
  if (resetFlowBtn) resetFlowBtn.hidden = true;
  activeModelFilter = "";
  modelFilterBtns.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.modelFilter === "");
    button.hidden = true;
  });
  const filtersWrap = document.querySelector("[data-model-filters]");
  if (filtersWrap) filtersWrap.hidden = true;
  renderCommonModels(modelInput?.value || defaultCommonModelId);
  resetResults();
  setModelStatus(
    locale === "zh"
      ? `已默认选择 ${defaultCommonModelId}，可直接开始检测。`
      : `Defaulted to ${defaultCommonModelId}. Start the test when ready.`,
    "pass"
  );
}

function renderModelPicker(models, selectedModel = modelInput?.value) {
  if (!modelPicker || !form) return;
  modelPicker.innerHTML = "";

  if (!models.length) {
    modelPicker.innerHTML = `<span class="hint">${t.noMatchingModels}</span>`;
    return;
  }

  models.forEach((model, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "model-card";
    button.dataset.model = model;
    button.textContent = model;
    button.title = model;
    button.setAttribute("aria-pressed", "false");

    button.addEventListener("click", () => {
      selectModel(model, "model_list");
    });

    if (model === selectedModel || (!selectedModel && index === 0)) {
      modelInput.value = model;
      button.classList.add("is-active");
      button.setAttribute("aria-pressed", "true");
    }

    modelPicker.appendChild(button);
  });
}

function normalizeModelId(model) {
  return String(model || "")
    .trim()
    .toLowerCase()
    .replace(/[._]/g, "-");
}

function modelMatchesCandidate(model, candidateId) {
  const modelId = normalizeModelId(model);
  const candidate = normalizeModelId(candidateId);
  return modelId === candidate || modelId.includes(candidate);
}

function availableCommonModels() {
  return commonModels.map((item) => ({ ...item, model: item.id, source: item }));
}

function selectModel(model, source = "model_list") {
  if (!form || !model) return;
  modelInput.value = model;
  selectedModelProfile = model;
  selectedModelMode = source === "model_list" ? "fetched" : "fixed";
  if (source === "model_list") selectedCommonModelKey = "";
  document.querySelectorAll(".model-card, .common-model-card").forEach((card) => {
    const input = card.querySelector(".common-model-id-input");
    const selected =
      card.classList.contains("common-model-card")
        ? source === "common_model" && card.dataset.commonKey === selectedCommonModelKey
        : card.dataset.model === model;
    if (selected && card.dataset.profileModel) selectedModelProfile = card.dataset.profileModel;
    card.classList.toggle("is-active", selected);
    card.setAttribute("aria-pressed", selected ? "true" : "false");
  });
  setModelStatus(t.selectedModel(model), "pass");
  trackEvent("model_selected", { model_family: modelFamily(model), source });
}

function preferredDefaultModel(models) {
  const current = String(modelInput?.value || "").trim();
  if (current && models.includes(current)) return current;
  return models[0] || "";
}

function renderCommonModels(selectedModel = modelInput?.value) {
  if (!commonModelsEl) return;
  const models = availableCommonModels();
  commonModelsEl.innerHTML = "";
  if (!models.length) return;

  const heading = document.createElement("div");
  heading.className = "common-models-heading";
  heading.textContent = t.commonModels;
  commonModelsEl.appendChild(heading);

  const grid = document.createElement("div");
  grid.className = "common-model-grid";
  models.forEach((item) => {
    const card = document.createElement("div");
    card.className = "common-model-card";
    card.dataset.commonKey = item.key;
    card.dataset.profileModel = item.profile || item.source?.profile || item.id;
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    const isSelected = selectedModelMode === "fixed" ? item.key === selectedCommonModelKey : item.model === selectedModel;
    card.setAttribute("aria-pressed", isSelected ? "true" : "false");
    card.title = item.model;
    if (isSelected) card.classList.add("is-active");

    const title = document.createElement("strong");
    title.textContent = item.name;
    const idText = document.createElement("span");
    idText.className = "common-model-id-text";
    idText.textContent = item.model;
    const idInput = document.createElement("input");
    idInput.className = "common-model-id-input";
    idInput.value = item.model;
    idInput.spellcheck = false;
    idInput.autocomplete = "off";
    idInput.setAttribute("aria-label", `${item.name} model id`);
    idInput.hidden = true;
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "common-model-edit";
    editBtn.setAttribute("aria-label", `Edit ${item.name} model id`);
    editBtn.title = "Edit model id";
    editBtn.innerHTML = "✎";
    card.append(title, idText, idInput, editBtn);

    if (item.badge) {
      const badge = document.createElement("small");
      badge.textContent = item.badge;
      card.appendChild(badge);
    }

    const commitInputValue = () => {
      const nextValue = idInput.value.trim();
      const source = item.source || item;
      source.id = nextValue || source.id;
      item.id = source.id;
      item.model = source.id;
      idInput.value = source.id;
      idText.textContent = source.id;
      card.title = item.id;
      card.classList.remove("is-editing");
      idInput.hidden = true;
      idText.hidden = false;
      if (card.classList.contains("is-active")) {
        modelInput.value = item.id;
        selectedModelProfile = card.dataset.profileModel;
        selectedCommonModelKey = item.key;
        setModelStatus(t.selectedModel(item.id), "pass");
      }
    };

    const openEditor = (event) => {
      event.stopPropagation();
      card.classList.add("is-editing");
      idText.hidden = true;
      idInput.hidden = false;
      idInput.focus();
      idInput.select();
    };

    card.addEventListener("click", () => {
      selectedCommonModelKey = item.key;
      selectModel(idInput.value.trim(), "common_model");
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectedCommonModelKey = item.key;
        selectModel(idInput.value.trim(), "common_model");
      }
    });
    editBtn.addEventListener("click", openEditor);
    idInput.addEventListener("click", (event) => event.stopPropagation());
    idInput.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        commitInputValue();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        idInput.value = item.id;
        card.classList.remove("is-editing");
        idInput.hidden = true;
        idText.hidden = false;
      }
    });
    idInput.addEventListener("change", commitInputValue);
    idInput.addEventListener("blur", commitInputValue);
    grid.appendChild(card);
  });

  commonModelsEl.appendChild(grid);
}

function filteredModels() {
  const keyword = String(modelSearchInput?.value || "").trim().toLowerCase();
  return allModels.filter((model) => {
    const value = model.toLowerCase();
    const matchesKeyword = !keyword || value.includes(keyword);
    const matchesFilter = !activeModelFilter || value.includes(activeModelFilter);
    return matchesKeyword && matchesFilter;
  });
}

function refreshModelPicker() {
  renderCommonModels(modelInput?.value);
  renderModelPicker(filteredModels(), modelInput?.value);
}

function initDefaultModelShortcuts() {
  if (modelInput && !modelInput.value) {
    modelInput.value = defaultCommonModelId;
    selectedModelProfile = defaultCommonModelId;
  }
  renderCommonModels(modelInput?.value || defaultCommonModelId);
  setModelStatus(
    locale === "zh"
      ? `已默认选择 ${modelInput?.value || defaultCommonModelId}，可直接开始检测。`
      : `Defaulted to ${modelInput?.value || defaultCommonModelId}. Start the test when ready.`,
    "pass"
  );
}

function ensureVerificationModal() {
  if (verificationModal) return verificationModal;

  const copy =
    locale === "zh"
      ? {
          title: "请先完成滑动验证",
          subtitle: "滑到右侧后开始本次检测。",
          drag: "按住滑块拖到最右侧",
          success: "验证通过，正在开始检测",
          cancel: "取消",
          close: "关闭验证窗口",
          handle: "拖动滑块完成验证",
        }
      : {
          title: "Complete the slider check",
          subtitle: "Slide to the right to start this test.",
          drag: "Drag the slider all the way to the right",
          success: "Verified. Starting the test",
          cancel: "Cancel",
          close: "Close verification dialog",
          handle: "Drag slider to verify",
        };

  const overlay = document.createElement("div");
  overlay.className = "verify-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="verify-dialog" role="dialog" aria-modal="true" aria-labelledby="verify-title">
      <button class="verify-close" type="button" data-verify-close aria-label="${copy.close}">×</button>
      <div class="verify-copy">
        <h3 id="verify-title">${copy.title}</h3>
        <p>${copy.subtitle}</p>
      </div>
      <div class="verify-slider" data-verify-slider>
        <div class="verify-slider-fill" data-verify-fill></div>
        <div class="verify-slider-text" data-verify-label>${copy.drag}</div>
        <button class="verify-thumb" type="button" data-verify-thumb aria-label="${copy.handle}">
          <span>→</span>
        </button>
      </div>
      <div class="verify-actions">
        <button class="btn btn-secondary btn-small" type="button" data-verify-cancel>${copy.cancel}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const slider = overlay.querySelector("[data-verify-slider]");
  const fill = overlay.querySelector("[data-verify-fill]");
  const label = overlay.querySelector("[data-verify-label]");
  const thumb = overlay.querySelector("[data-verify-thumb]");
  const closeBtn = overlay.querySelector("[data-verify-close]");
  const cancelBtn = overlay.querySelector("[data-verify-cancel]");

  const state = {
    overlay,
    slider,
    fill,
    label,
    thumb,
    closeBtn,
    cancelBtn,
    dragText: copy.drag,
    successText: copy.success,
    onSuccess: null,
    dragging: false,
    startX: 0,
    startOffset: 0,
    offset: 0,
  };

  function maxOffset() {
    return Math.max(0, slider.clientWidth - thumb.offsetWidth - 8);
  }

  function applyOffset(nextOffset) {
    const max = maxOffset();
    const clamped = Math.min(max, Math.max(0, nextOffset));
    state.offset = clamped;
    thumb.style.transform = `translateX(${clamped}px)`;
    fill.style.width = `${clamped + thumb.offsetWidth}px`;
    return max ? clamped / max : 0;
  }

  function resetVerification() {
    state.dragging = false;
    slider.classList.remove("is-success");
    label.textContent = state.dragText;
    applyOffset(0);
  }

  function closeVerification() {
    overlay.hidden = true;
    document.body.classList.remove("verify-open");
    state.onSuccess = null;
    resetVerification();
  }

  function completeVerification() {
    slider.classList.add("is-success");
    label.textContent = state.successText;
    trackEvent("human_verify_success");
    const onSuccess = state.onSuccess;
    window.setTimeout(() => {
      closeVerification();
      onSuccess?.();
    }, 220);
  }

  function handlePointerMove(event) {
    if (!state.dragging) return;
    const ratio = applyOffset(state.startOffset + event.clientX - state.startX);
    if (ratio >= 0.98) {
      state.dragging = false;
      completeVerification();
    }
  }

  function handlePointerUp() {
    if (!state.dragging) return;
    state.dragging = false;
    resetVerification();
  }

  thumb.addEventListener("pointerdown", (event) => {
    if (slider.classList.contains("is-success")) return;
    state.dragging = true;
    state.startX = event.clientX;
    state.startOffset = state.offset;
    thumb.setPointerCapture?.(event.pointerId);
  });

  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", handlePointerUp);
  closeBtn?.addEventListener("click", () => {
    trackEvent("human_verify_cancel");
    closeVerification();
  });
  cancelBtn?.addEventListener("click", () => {
    trackEvent("human_verify_cancel");
    closeVerification();
  });

  verificationModal = {
    open(onSuccess) {
      state.onSuccess = onSuccess;
      overlay.hidden = false;
      document.body.classList.add("verify-open");
      resetVerification();
      trackEvent("human_verify_open");
    },
    close: closeVerification,
  };

  return verificationModal;
}

async function runTestSubmission() {
  if (isTesting) return;
  isTesting = true;

  if (!modelInput.value && allModels[0]) modelInput.value = allModels[0];

  resultWrap.hidden = false;
  if (resultLoadingEl) resultLoadingEl.hidden = false;
  if (resultDetailsEl) resultDetailsEl.hidden = true;
  scoreEl.textContent = "...";
  statusEl.textContent = t.running;
  statusEl.className = "status-pill status-partial";
  verdictTitleEl.innerHTML = t.runningHtml;
  verdictTextEl.textContent = locale === "zh" ? "正在检查兼容性、延迟、流式输出和响应结构。" : "Checking compatibility, latency, streaming, and response shape.";
  checksEl.innerHTML = "";

  const payload = {
    baseUrl: baseUrlInput.value,
    apiKey: apiKeyInput.value,
    model: modelInput.value,
    targetModel: selectedModelMode === "fetched" ? modelInput.value : (selectedModelProfile || modelInput.value),
    selectionMode: selectedModelMode,
  };
  trackEvent("test_start", {
    model_family: modelFamily(payload.model),
    has_api_key: Boolean(String(payload.apiKey || "").trim()),
  });

  try {
    const quickRes = await fetch("/api/test?phase=quick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const quickData = await quickRes.json();
    if (!quickRes.ok) throw new Error(quickData.error || t.requestFailed);

    renderTestResult(quickData);
    trackEvent("test_success", {
      model_family: modelFamily(payload.model),
      score: quickData.score,
      compatibility: quickData.compatibility,
      qa_rate: quickData.summary?.qa?.rate ?? null,
      latency_ms: quickData.summary?.latencyMs?.chat ?? null,
    });
  } catch (error) {
    if (resultLoadingEl) resultLoadingEl.hidden = true;
    if (resultDetailsEl) resultDetailsEl.hidden = false;
    scoreEl.textContent = "-";
    statusEl.textContent = t.fail;
    statusEl.className = "status-pill status-fail";
    verdictTitleEl.textContent = t.unavailable;
    verdictTextEl.textContent = locale === "zh" ? "接口连接失败，请查看下面的原因提示。" : "The endpoint could not be tested. See the reason below.";
    checksEl.innerHTML = "";
    renderRequestFailed(error.message);
    trackEvent("test_failure", {
      model_family: modelFamily(payload.model),
    });
  } finally {
    isTesting = false;
  }
}

toggleKeyBtn?.addEventListener("click", () => {
  const isHidden = apiKeyInput.type === "password";
  apiKeyInput.type = isHidden ? "text" : "password";
  toggleKeyBtn.textContent = isHidden ? t.hide : t.show;
  toggleKeyBtn.setAttribute("aria-label", isHidden ? t.hideKey : t.showKey);
  toggleKeyBtn.title = isHidden ? t.hideKey : t.showKey;
});

modelSearchInput?.addEventListener("input", () => {
  const visibleCount = filteredModels().length;
  refreshModelPicker();
  if (allModels.length) {
    setModelStatus(t.showingModels(visibleCount, allModels.length), visibleCount ? "pass" : "partial");
  }
});

modelFilterBtns.forEach((button) => {
  button.addEventListener("click", () => {
    activeModelFilter = button.dataset.modelFilter || "";
    modelFilterBtns.forEach((item) => item.classList.toggle("is-active", item === button));
    const visibleCount = filteredModels().length;
    refreshModelPicker();
    if (allModels.length) {
      setModelStatus(t.showingModels(visibleCount, allModels.length), visibleCount ? "pass" : "partial");
    }
  });
});

resetFlowBtn?.addEventListener("click", resetFlow);

baseUrlInput?.addEventListener("blur", () => {
  if (trackedInputSteps.has("base_url")) return;
  if (!String(baseUrlInput.value || "").trim()) return;
  trackedInputSteps.add("base_url");
  trackEvent("base_url_entered");
});

apiKeyInput?.addEventListener("blur", () => {
  if (trackedInputSteps.has("api_key")) return;
  if (!String(apiKeyInput.value || "").trim()) return;
  trackedInputSteps.add("api_key");
  trackEvent("api_key_entered");
});

fetchModelsBtn?.addEventListener("click", async () => {
  if (!requireCredentials()) return;
  resetResults();
  setModelStatus(t.fetchingModels, "partial");
  trackEvent("models_fetch_start", {
    has_api_key: Boolean(String(apiKeyInput.value || "").trim()),
  });
  if (modelStep) modelStep.hidden = false;
  if (modelPicker) modelPicker.innerHTML = `<span class="hint">${t.loadingModels}</span>`;

  try {
    const res = await fetch("/api/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseUrl: baseUrlInput.value,
        apiKey: apiKeyInput.value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to fetch models.");

    allModels.length = 0;
    allModels.push(...data.models);
    if (modelSearchInput) modelSearchInput.value = "";
    activeModelFilter = "";
    modelFilterBtns.forEach((button) => button.classList.toggle("is-active", button.dataset.modelFilter === ""));
    const defaultModel = preferredDefaultModel(data.models);
    if (defaultModel) {
      modelInput.value = defaultModel;
      selectedModelProfile = defaultModel;
      selectedModelMode = "fetched";
    }
    renderCommonModels(defaultModel);
    renderModelPicker(filteredModels(), defaultModel);
    if (defaultModel) selectModel(defaultModel, "model_list");
    setFlowModelsLoaded();
    setModelStatus(
      defaultModel
        ? `${t.loadedModels(data.models.length, data.timings.totalMs)} ${t.selectedModel(defaultModel)}`
        : `${t.loadedModels(data.models.length, data.timings.totalMs)} ${t.selectModel}`,
      "pass"
    );
    trackEvent("models_fetch_success", {
      model_count: data.models.length,
      latency_ms: data.timings.totalMs,
    });
  } catch (error) {
    setModelStatus(error.message, "fail");
    if (modelPicker) modelPicker.innerHTML = `<span class="hint">${error.message}</span>`;
    trackEvent("models_fetch_failure");
  }
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (isTesting) return;
  if (!requireCredentials()) return;
  ensureVerificationModal().open(() => {
    void runTestSubmission();
  });
});

initDefaultModelShortcuts();
