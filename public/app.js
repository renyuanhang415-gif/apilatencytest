const form = document.querySelector("[data-test-form]");
const resultWrap = document.querySelector("[data-results]");
const fetchModelsBtn = document.querySelector("[data-fetch-models]");
const runTestBtn = document.querySelector("[data-run-test]");
const resetFlowBtn = document.querySelector("[data-reset-flow]");
const modelStep = document.querySelector("[data-model-step]");
const modelPicker = document.querySelector("[data-model-picker]");
const modelSearchInput = document.querySelector("[data-model-search]");
const modelStatus = document.querySelector("[data-model-status]");
const toggleKeyBtn = document.querySelector("[data-toggle-key]");
const scoreEl = document.querySelector("[data-score]");
const statusEl = document.querySelector("[data-status]");
const verdictTitleEl = document.querySelector("[data-verdict-title]");
const verdictTextEl = document.querySelector("[data-verdict-text]");
const testedTargetEl = document.querySelector("[data-tested-target]");
const checksEl = document.querySelector("[data-checks]");
const latencyChatEl = document.querySelector("[data-chat-latency]");
const latencyStreamEl = document.querySelector("[data-stream-latency]");
const streamTotalEl = document.querySelector("[data-stream-total]");
const tokensSpeedEl = document.querySelector("[data-tokens-speed]");
const inputTokensEl = document.querySelector("[data-input-tokens]");
const outputTokensEl = document.querySelector("[data-output-tokens]");
const notesEl = document.querySelector("[data-notes]");
const payloadEl = document.querySelector("[data-payload]");
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
    cleanNote: "No major compatibility issue found in this single test.",
    requestFailed: "Request failed.",
    rawNoStream: "No stream response body.",
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
    cleanNote: "本次检测没有发现明显兼容性问题。",
    requestFailed: "请求失败。",
    rawNoStream: "没有流式响应正文。",
  },
};

const t = text[locale];

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

function renderStreamResult(result) {
  if (result?.json) return JSON.stringify(result.json, null, 2);
  if (!result?.text) return t.rawNoStream;

  const lines = result.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const preview = [];

  for (const line of lines) {
    if (line === "data: [DONE]") {
      preview.push("[DONE]");
      continue;
    }
    if (!line.startsWith("data: ")) {
      preview.push(line.slice(0, 160));
      continue;
    }

    const payloadText = line.slice(6).trim();
    try {
      const payload = JSON.parse(payloadText);
      const choice = payload.choices?.[0];
      if (choice?.delta?.content) {
        preview.push(`content: ${choice.delta.content}`);
      } else if (choice?.delta?.role) {
        preview.push(`role: ${choice.delta.role}`);
      } else if (choice?.finish_reason) {
        preview.push(`finish: ${choice.finish_reason}`);
      } else if (payload.usage) {
        preview.push(`usage: prompt=${payload.usage.prompt_tokens ?? 0}, completion=${payload.usage.completion_tokens ?? 0}`);
      } else {
        preview.push(payload.object || "data");
      }
    } catch {
      preview.push(payloadText.slice(0, 160));
    }

    if (preview.length >= 8) break;
  }

  if (lines.length > preview.length) preview.push(`... ${lines.length - preview.length} more lines omitted`);
  return preview.join("\n");
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

function renderNotes(notes) {
  if (!notesEl) return;
  notesEl.innerHTML = "";
  const values = notes?.length ? notes : [t.cleanNote];
  values.forEach((note) => {
    const li = document.createElement("li");
    li.textContent = note;
    notesEl.appendChild(li);
  });
}

function setFlowModelsLoaded() {
  if (modelStep) modelStep.hidden = false;
  if (fetchModelsBtn) fetchModelsBtn.hidden = true;
  if (runTestBtn) runTestBtn.hidden = false;
  if (resetFlowBtn) resetFlowBtn.hidden = false;
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
  if (resultWrap) resultWrap.hidden = true;
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
  if (!keyword) return [...allModels];
  return allModels.filter((model) => model.toLowerCase().includes(keyword));
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

resetFlowBtn?.addEventListener("click", resetFlow);

fetchModelsBtn?.addEventListener("click", async () => {
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
    renderModelPicker(allModels, data.models[0]);
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
  scoreEl.textContent = "...";
  statusEl.textContent = t.running;
  statusEl.className = "status-pill status-partial";
  verdictTitleEl.innerHTML = t.runningHtml;
  verdictTextEl.textContent = locale === "zh" ? "正在检查兼容性、延迟、流式输出和响应结构。" : "Checking compatibility, latency, streaming, and response shape.";
  checksEl.innerHTML = "";
  notesEl.innerHTML = "";

  const payload = {
    baseUrl: form.baseUrl.value,
    apiKey: form.apiKey.value,
    model: form.model.value,
    prompt: form.prompt.value,
  };

  renderJson(payloadEl, displayPayload(payload));

  try {
    const res = await fetch("/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || t.requestFailed);

    const kind = data.compatibility === "pass" ? "pass" : data.compatibility === "partial" ? "partial" : "fail";
    scoreEl.textContent = `${data.score}%`;
    statusEl.textContent = statusText(kind);
    statusEl.className = `status-pill status-${kind}`;
    verdictTitleEl.textContent = locale === "zh" ? data.verdict.titleZh : data.verdict.title;
    verdictTextEl.textContent = locale === "zh" ? data.verdict.textZh : data.verdict.text;
    testedTargetEl.textContent = t.tested(data.input.baseUrl, data.input.model);

    renderChecks(data.checks || []);
    latencyChatEl.textContent = fmtMs(data.summary.latencyMs.chat);
    latencyStreamEl.textContent = fmtMs(data.summary.latencyMs.streamingFirstToken);
    streamTotalEl.textContent = fmtMs(data.summary.latencyMs.streamingTotal);
    tokensSpeedEl.textContent = fmtValue(data.summary.tokens?.perSecond);
    inputTokensEl.textContent = fmtValue(data.summary.tokens?.input);
    outputTokensEl.textContent = fmtValue(data.summary.tokens?.output);
    renderNotes(data.notes);

    document.querySelector("[data-models-json]").textContent = JSON.stringify(data.results.models.json, null, 2);
    document.querySelector("[data-chat-json]").textContent = JSON.stringify(data.results.chat.json, null, 2);
    document.querySelector("[data-stream-json]").textContent = renderStreamResult(data.results.streaming);
  } catch (error) {
    scoreEl.textContent = "0%";
    statusEl.textContent = t.fail;
    statusEl.className = "status-pill status-fail";
    verdictTitleEl.textContent = t.unavailable;
    verdictTextEl.textContent = error.message;
    renderNotes([error.message]);
  }
});
