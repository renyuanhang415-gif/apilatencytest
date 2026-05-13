const form = document.querySelector("[data-test-form]");
const resultWrap = document.querySelector("[data-results]");
const fetchModelsBtn = document.querySelector("[data-fetch-models]");
const modelPicker = document.querySelector("[data-model-picker]");
const modelSearchInput = document.querySelector("[data-model-search]");
const modelStatus = document.querySelector("[data-model-status]");
const toggleKeyBtn = document.querySelector("[data-toggle-key]");
const statusEl = document.querySelector("[data-status]");
const scoreEl = document.querySelector("[data-score]");
const performanceEl = document.querySelector("[data-performance]");
const latencyModelsEl = document.querySelector("[data-models-latency]");
const latencyChatEl = document.querySelector("[data-chat-latency]");
const latencyStreamEl = document.querySelector("[data-stream-latency]");
const streamTotalEl = document.querySelector("[data-stream-total]");
const streamStatusEl = document.querySelector("[data-stream-status]");
const notesEl = document.querySelector("[data-notes]");
const payloadEl = document.querySelector("[data-payload]");
const demoBtn = document.querySelector("[data-load-demo]");
const allModels = [];
const locale = (document.body.dataset.locale || document.documentElement.lang || "en").toLowerCase().startsWith("zh")
  ? "zh"
  : "en";

const messages = {
  en: {
    noData: "No data",
    fast: "Fast",
    ok: "OK",
    slow: "Slow",
    verySlow: "Very slow",
    usable: "Usable",
    supported: "Supported",
    failed: "Failed",
    unavailable: "Unavailable",
    running: "Running...",
    show: "Show",
    hide: "Hide",
    showKey: "Show API key",
    hideKey: "Hide API key",
    noMatchingModels: "No matching models.",
    loadingModels: "Loading model list...",
    selectedModel: (model) => `Selected ${model}. Now click Test API.`,
    showingModels: (visible, total) => `Showing ${visible} of ${total} models.`,
    loadedDemo: "Loaded demo models. Click one or run the test directly.",
    fetchingModels: "Fetching models...",
    loadedModels: (count, ms) => `Loaded ${count} models from /v1/models in ${ms} ms.`,
    compatibilityText: {
      pass: "PASS",
      partial: "PARTIAL",
      fail: "FAIL",
    },
    compatibleNote: "Endpoint looks OpenAI-compatible for the tested calls.",
    ttftVerySlow: "Compatibility passed, but streaming first token is very slow. For chat UX, this endpoint will feel delayed.",
    ttftSlow: "Compatibility passed, but streaming first token is slow. Use this as a relay quality warning.",
    ttftOkay: "Streaming first token time is acceptable for a first MVP test.",
    chatVerySlow: "Non-stream chat latency is very slow. Test again later or compare another endpoint before trusting this route.",
    chatSlow: "Non-stream chat latency is slow, even though the API shape may be compatible.",
    requestFailed: "Request failed.",
  },
  zh: {
    noData: "无数据",
    fast: "快",
    ok: "一般",
    slow: "慢",
    verySlow: "很慢",
    usable: "可用",
    supported: "支持",
    failed: "失败",
    unavailable: "不可用",
    running: "检测中...",
    show: "显示",
    hide: "隐藏",
    showKey: "显示 API Key",
    hideKey: "隐藏 API Key",
    noMatchingModels: "没有匹配的模型。",
    loadingModels: "正在加载模型列表...",
    selectedModel: (model) => `已选择 ${model}，现在可以点击开始检测。`,
    showingModels: (visible, total) => `当前显示 ${visible} / ${total} 个模型。`,
    loadedDemo: "已加载演示模型。可以直接点击模型，或直接开始检测。",
    fetchingModels: "正在获取模型...",
    loadedModels: (count, ms) => `已从 /v1/models 获取 ${count} 个模型，用时 ${ms} ms。`,
    compatibilityText: {
      pass: "通过",
      partial: "部分通过",
      fail: "失败",
    },
    compatibleNote: "本次检测的几个核心调用看起来符合 OpenAI 兼容接口格式。",
    ttftVerySlow: "兼容性虽然通过，但首个 Token 延迟很高。对聊天体验来说，这个接口会明显发木。",
    ttftSlow: "兼容性虽然通过，但首个 Token 偏慢，可以把它当作中转质量风险信号。",
    ttftOkay: "首个 Token 延迟处于这个 MVP 工具可接受的范围内。",
    chatVerySlow: "非流式聊天延迟很高。建议稍后重测，或和别的接口对比后再决定是否长期使用。",
    chatSlow: "非流式聊天延迟偏慢，即使接口格式本身是兼容的。",
    requestFailed: "请求失败。",
  },
};

const t = messages[locale];

function fmt(ms) {
  if (ms === null || ms === undefined) return "-";
  return `${ms} ms`;
}

function latencyRating(ms) {
  if (ms === null || ms === undefined) {
    return { label: t.noData, kind: "partial" };
  }
  if (ms < 2000) return { label: t.fast, kind: "pass" };
  if (ms < 6000) return { label: t.ok, kind: "partial" };
  if (ms < 12000) return { label: t.slow, kind: "warning" };
  return { label: t.verySlow, kind: "fail" };
}

function setMetric(el, ms) {
  const rating = latencyRating(ms);
  el.className = `value status-${rating.kind}`;
  el.textContent = `${fmt(ms)} - ${rating.label}`;
}

function performanceRating(summary) {
  const ratings = [
    latencyRating(summary.chat),
    latencyRating(summary.streamingFirstToken),
    latencyRating(summary.streamingTotal),
  ];
  if (ratings.some((item) => item.kind === "fail")) return { label: t.verySlow, kind: "fail" };
  if (ratings.some((item) => item.kind === "warning")) return { label: t.slow, kind: "warning" };
  if (ratings.some((item) => item.kind === "partial")) return { label: t.usable, kind: "partial" };
  return { label: t.fast, kind: "pass" };
}

function setPerformance(summary) {
  const rating = performanceRating(summary);
  performanceEl.className = `value status-${rating.kind}`;
  performanceEl.textContent = rating.label;
}

function setStatus(kind, text) {
  statusEl.className = `value status-${kind}`;
  statusEl.textContent = text;
}

function setStreamStatus(isSupported) {
  streamStatusEl.className = `value status-${isSupported ? "pass" : "fail"}`;
  streamStatusEl.textContent = isSupported ? t.supported : t.failed;
}

function renderJson(el, data) {
  el.textContent = JSON.stringify(data, null, 2);
}

function renderStreamResult(result) {
  if (result.json) return JSON.stringify(result.json, null, 2);
  if (result.text) {
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
        preview.push(line.slice(0, 180));
        continue;
      }

      const payloadText = line.slice(6).trim();
      try {
        const payload = JSON.parse(payloadText);
        const choice = payload.choices?.[0];
        if (choice?.delta?.content) {
          preview.push(`chunk: content="${choice.delta.content}"`);
        } else if (choice?.delta?.role) {
          preview.push(`chunk: role=${choice.delta.role}`);
        } else if (choice?.finish_reason) {
          preview.push(`chunk: finish=${choice.finish_reason}`);
        } else if (payload.usage) {
          preview.push(`chunk: usage prompt=${payload.usage.prompt_tokens ?? 0} completion=${payload.usage.completion_tokens ?? 0}`);
        } else {
          preview.push(`chunk: ${payload.object || "data"}`);
        }
      } catch {
        preview.push(payloadText.slice(0, 180));
      }

      if (preview.length >= 8) break;
    }

    if (lines.length > preview.length) {
      const omitted = lines.length - preview.length;
      preview.push(`... ${omitted} more lines omitted`);
    }

    return preview.join("\n");
  }
  return "No stream response body.";
}

function displayPayload(payload) {
  return {
    ...payload,
    apiKey: payload.apiKey ? "[hidden]" : "",
  };
}

function addNote(text) {
  const li = document.createElement("li");
  li.textContent = text;
  notesEl.appendChild(li);
}

function setModelStatus(text, kind = "") {
  if (!modelStatus) return;
  modelStatus.textContent = text;
  modelStatus.className = kind ? `hint status-${kind}` : "hint";
}

function renderModelPicker(models, selectedModel = form.model.value) {
  if (!modelPicker) return;
  modelPicker.innerHTML = "";

  if (!models.length) {
    modelPicker.innerHTML = `<span class="hint">${t.noMatchingModels}</span>`;
    return;
  }

  models.forEach((model, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "model-chip";
    button.textContent = model;
    button.title = model;
    button.setAttribute("aria-pressed", "false");

    button.addEventListener("click", () => {
      form.model.value = model;
      document.querySelectorAll(".model-chip").forEach((chip) => {
        chip.classList.remove("is-active");
        chip.setAttribute("aria-pressed", "false");
      });
      button.classList.add("is-active");
      button.setAttribute("aria-pressed", "true");
      setModelStatus(t.selectedModel(model), "pass");
    });

    if (model === selectedModel || (!selectedModel && index === 0)) {
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
  renderModelPicker(filteredModels(), form.model.value);
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

demoBtn?.addEventListener("click", () => {
  const origin = window.location.origin;
  form.baseUrl.value = origin;
  form.apiKey.value = "";
  form.model.value = "gpt-4o-mini";
  form.prompt.value = "Say hello in one short sentence.";
  allModels.length = 0;
  allModels.push("gpt-4o-mini", "gpt-4.1-mini");
  if (modelSearchInput) modelSearchInput.value = "";
  refreshModelPicker();
  setModelStatus(t.loadedDemo, "pass");
});

fetchModelsBtn?.addEventListener("click", async () => {
  setModelStatus(t.fetchingModels, "partial");
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

    if (data.models.length > 0) {
      form.model.value = data.models[0];
    }
    allModels.length = 0;
    allModels.push(...data.models);
    if (modelSearchInput) modelSearchInput.value = "";
    refreshModelPicker();

    setModelStatus(t.loadedModels(data.models.length, data.timings.totalMs), "pass");
  } catch (error) {
    setModelStatus(error.message, "fail");
  }
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("partial", t.running);
  statusEl.style.display = "inline";
  resultWrap.hidden = false;
  scoreEl.textContent = "...";
  performanceEl.textContent = "...";
  streamStatusEl.textContent = "...";
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
    setStatus(kind, t.compatibilityText[data.compatibility] || t.compatibilityText.fail);
    scoreEl.textContent = String(data.score);
    scoreEl.className = `value status-${kind}`;
    setPerformance(data.summary.latencyMs);
    setMetric(latencyModelsEl, data.summary.latencyMs.models);
    setMetric(latencyChatEl, data.summary.latencyMs.chat);
    setMetric(latencyStreamEl, data.summary.latencyMs.streamingFirstToken);
    setMetric(streamTotalEl, data.summary.latencyMs.streamingTotal);
    setStreamStatus(data.summary.supported.streaming);
    notesEl.innerHTML = "";
    if (data.notes.length === 0) {
      addNote(t.compatibleNote);
    } else {
      data.notes.forEach(addNote);
    }

    const ttft = data.summary.latencyMs.streamingFirstToken;
    const chatLatency = data.summary.latencyMs.chat;
    if (ttft >= 12000) {
      addNote(t.ttftVerySlow);
    } else if (ttft >= 6000) {
      addNote(t.ttftSlow);
    } else if (ttft !== null && ttft !== undefined) {
      addNote(t.ttftOkay);
    }

    if (chatLatency >= 12000) {
      addNote(t.chatVerySlow);
    } else if (chatLatency >= 6000) {
      addNote(t.chatSlow);
    }

    document.querySelector("[data-models-json]").textContent = JSON.stringify(data.results.models.json, null, 2);
    document.querySelector("[data-chat-json]").textContent = JSON.stringify(data.results.chat.json, null, 2);
    document.querySelector("[data-stream-json]").textContent = renderStreamResult(data.results.streaming);
  } catch (error) {
    setStatus("fail", t.compatibilityText.fail);
    scoreEl.textContent = "0";
    scoreEl.className = "value status-fail";
    performanceEl.textContent = t.unavailable;
    performanceEl.className = "value status-fail";
    streamStatusEl.textContent = t.unavailable;
    streamStatusEl.className = "value status-fail";
    notesEl.innerHTML = `<li>${error.message}</li>`;
  }
});
