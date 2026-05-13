const form = document.querySelector("[data-test-form]");
const resultWrap = document.querySelector("[data-results]");
const fetchModelsBtn = document.querySelector("[data-fetch-models]");
const runTestBtn = document.querySelector("[data-run-test]");
const resetFlowBtn = document.querySelector("[data-reset-flow]");
const modelStep = document.querySelector("[data-model-step]");
const modelPicker = document.querySelector("[data-model-picker]");
const modelSearchInput = document.querySelector("[data-model-search]");
const modelFilterBtns = document.querySelectorAll("[data-model-filter]");
const modelStatus = document.querySelector("[data-model-status]");
const toggleKeyBtn = document.querySelector("[data-toggle-key]");
const scoreEl = document.querySelector("[data-score]");
const statusEl = document.querySelector("[data-status]");
const verdictTitleEl = document.querySelector("[data-verdict-title]");
const verdictTextEl = document.querySelector("[data-verdict-text]");
const testedTargetEl = document.querySelector("[data-tested-target]");
const resultLoadingEl = document.querySelector("[data-result-loading]");
const resultDetailsEl = document.querySelector("[data-result-details]");
const checksEl = document.querySelector("[data-checks]");
const modelGradeEl = document.querySelector("[data-model-grade]");
const modelScoreEl = document.querySelector("[data-model-score]");
const modelScoreNoteEl = document.querySelector("[data-model-score-note]");
const modelScoreFactorsEl = document.querySelector("[data-model-score-factors]");
const latencyChatEl = document.querySelector("[data-chat-latency]");
const latencyStreamEl = document.querySelector("[data-stream-latency]");
const streamTotalEl = document.querySelector("[data-stream-total]");
const tokensSpeedEl = document.querySelector("[data-tokens-speed]");
const inputTokensEl = document.querySelector("[data-input-tokens]");
const outputTokensEl = document.querySelector("[data-output-tokens]");
const allModels = [];

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
    selectModel: "Select a model, then start the test.",
    selectedModel: (model) => `Selected ${model}. Start the test when ready.`,
    loadedModels: (count, ms) => `Loaded ${count} models in ${ms} ms.`,
    showingModels: (visible, total) => `Showing ${visible} of ${total} models.`,
    running: "Testing...",
    runningHtml: '<span class="loading-spinner" aria-hidden="true"></span>Testing...',
    tested: (baseUrl, model) => `${baseUrl} · ${model}`,
    pass: "Pass",
    partial: "Warning",
    fail: "Fail",
    unavailable: "Unavailable",
    requestFailed: "Request failed.",
    rawNoStream: "No stream response body.",
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
    selectModel: "选择一个目标模型，然后开始检测。",
    selectedModel: (model) => `已选择 ${model}，可以开始检测。`,
    loadedModels: (count, ms) => `已获取 ${count} 个模型，用时 ${ms} ms。`,
    showingModels: (visible, total) => `当前显示 ${visible} / ${total} 个模型。`,
    running: "检测中...",
    runningHtml: '<span class="loading-spinner" aria-hidden="true"></span>检测中...',
    tested: (baseUrl, model) => `${baseUrl} · ${model}`,
    pass: "通过",
    partial: "注意",
    fail: "失败",
    unavailable: "不可用",
    requestFailed: "请求失败。",
    rawNoStream: "没有流式响应正文。",
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

function fmtMs(ms) {
  if (ms === null || ms === undefined) return "-";
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function fmtValue(value, suffix = "") {
  if (value === null || value === undefined) return "-";
  return `${value}${suffix}`;
}

function setModelStatus(message, kind = "") {
  if (!modelStatus) return;
  modelStatus.textContent = message;
  modelStatus.className = kind ? `hint status-${kind}` : "hint";
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

function renderModelScore(data) {
  const grade = modelGrade(data.score || 0);
  const qa = data.summary?.qa || { passed: 0, total: 0, rate: 0 };
  const latency = fmtMs(data.summary?.latencyMs?.chat);
  const protocolOk = data.checks?.every((item) => item.key !== "protocol" || item.status === "pass");

  if (modelGradeEl) modelGradeEl.textContent = t.scoreGrades[grade];
  if (modelScoreEl) modelScoreEl.textContent = `${data.score}%`;
  if (modelScoreNoteEl) modelScoreNoteEl.textContent = t.scoreNotes[grade];
  if (!modelScoreFactorsEl) return;

  modelScoreFactorsEl.innerHTML = "";
  t.modelScoreFactors(qa, latency, protocolOk).forEach((item) => {
    const badge = document.createElement("span");
    badge.textContent = item;
    modelScoreFactorsEl.appendChild(badge);
  });
}

function setFlowModelsLoaded() {
  if (modelStep) modelStep.hidden = false;
  if (fetchModelsBtn) fetchModelsBtn.hidden = true;
  if (runTestBtn) runTestBtn.hidden = false;
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
  if (scoreEl) scoreEl.textContent = "-";
  if (statusEl) statusEl.textContent = "-";
  if (testedTargetEl) testedTargetEl.textContent = "-";
}

function resetFlow() {
  allModels.length = 0;
  if (form?.model) form.model.value = "";
  if (modelSearchInput) modelSearchInput.value = "";
  if (modelPicker) modelPicker.innerHTML = `<span class="hint">${locale === "zh" ? "先获取模型列表。" : "Fetch models first."}</span>`;
  if (modelStep) modelStep.hidden = true;
  if (fetchModelsBtn) fetchModelsBtn.hidden = false;
  if (runTestBtn) runTestBtn.hidden = true;
  if (resetFlowBtn) resetFlowBtn.hidden = true;
  activeModelFilter = "";
  modelFilterBtns.forEach((button) => button.classList.toggle("is-active", button.dataset.modelFilter === ""));
  resetResults();
  setModelStatus(locale === "zh" ? "不需要注册。API Key 只用于本次实时检测。" : "No account. API keys are used only for this live test.");
}

function renderModelPicker(models, selectedModel = form?.model?.value) {
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
    button.textContent = model;
    button.title = model;
    button.setAttribute("aria-pressed", "false");

    button.addEventListener("click", () => {
      form.model.value = model;
      document.querySelectorAll(".model-card").forEach((card) => {
        card.classList.remove("is-active");
        card.setAttribute("aria-pressed", "false");
      });
      button.classList.add("is-active");
      button.setAttribute("aria-pressed", "true");
      setModelStatus(t.selectedModel(model), "pass");
    });

    if (model === selectedModel || (!selectedModel && index === 0)) {
      form.model.value = model;
      button.classList.add("is-active");
      button.setAttribute("aria-pressed", "true");
    }

    modelPicker.appendChild(button);
  });
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
  renderModelPicker(filteredModels(), form?.model?.value);
}

toggleKeyBtn?.addEventListener("click", () => {
  const isHidden = form.apiKey.type === "password";
  form.apiKey.type = isHidden ? "text" : "password";
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

fetchModelsBtn?.addEventListener("click", async () => {
  resetResults();
  setModelStatus(t.fetchingModels, "partial");
  if (modelStep) modelStep.hidden = false;
  if (modelPicker) modelPicker.innerHTML = `<span class="hint">${t.loadingModels}</span>`;

  try {
    const res = await fetch("/api/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseUrl: form.baseUrl.value,
        apiKey: form.apiKey.value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to fetch models.");

    allModels.length = 0;
    allModels.push(...data.models);
    if (modelSearchInput) modelSearchInput.value = "";
    activeModelFilter = "";
    modelFilterBtns.forEach((button) => button.classList.toggle("is-active", button.dataset.modelFilter === ""));
    renderModelPicker(filteredModels(), data.models[0]);
    setFlowModelsLoaded();
    setModelStatus(`${t.loadedModels(data.models.length, data.timings.totalMs)} ${t.selectModel}`, "pass");
  } catch (error) {
    setModelStatus(error.message, "fail");
    if (modelPicker) modelPicker.innerHTML = `<span class="hint">${error.message}</span>`;
  }
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.model.value && allModels[0]) form.model.value = allModels[0];

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
    baseUrl: form.baseUrl.value,
    apiKey: form.apiKey.value,
    model: form.model.value,
    prompt: form.prompt.value,
  };

  try {
    const res = await fetch("/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || t.requestFailed);

    const kind = data.compatibility === "pass" ? "pass" : data.compatibility === "partial" ? "partial" : "fail";
    if (resultLoadingEl) resultLoadingEl.hidden = true;
    if (resultDetailsEl) resultDetailsEl.hidden = false;
    scoreEl.textContent = `${data.score}%`;
    statusEl.textContent = statusText(kind);
    statusEl.className = `status-pill status-${kind}`;
    verdictTitleEl.textContent = locale === "zh" ? data.verdict.titleZh : data.verdict.title;
    verdictTextEl.textContent = locale === "zh" ? data.verdict.textZh : data.verdict.text;
    testedTargetEl.textContent = t.tested(data.input.baseUrl, data.input.model);

    renderChecks(data.checks || []);
    renderModelScore(data);
    latencyChatEl.textContent = fmtMs(data.summary.latencyMs.chat);
    latencyStreamEl.textContent = fmtMs(data.summary.latencyMs.streamingFirstToken);
    streamTotalEl.textContent = fmtMs(data.summary.latencyMs.streamingTotal);
    tokensSpeedEl.textContent = fmtValue(data.summary.tokens?.perSecond);
    inputTokensEl.textContent = fmtValue(data.summary.tokens?.input);
    outputTokensEl.textContent = fmtValue(data.summary.tokens?.output);

  } catch (error) {
    if (resultLoadingEl) resultLoadingEl.hidden = true;
    if (resultDetailsEl) resultDetailsEl.hidden = false;
    scoreEl.textContent = "0%";
    statusEl.textContent = t.fail;
    statusEl.className = "status-pill status-fail";
    verdictTitleEl.textContent = t.unavailable;
    verdictTextEl.textContent = error.message;
    renderModelScore({ score: 0, summary: { qa: { passed: 0, total: 5, rate: 0 }, latencyMs: {} }, checks: [] });
  }
});
