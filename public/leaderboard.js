const boards = [
  {
    name: "GPT 6 Astra", modelId: "gpt-6-astra", kind: "chat",
    rows: [
      ["Modelflare", "origin.modelflare.dev", "100%", "4.5", "1.01"],
      ["云渡", "yundu.lol", "96%", "4.1", "1.3"],
      ["SevnX", "sevnx.lol", "95%", "5.8", "2.5"],
      ["灵算", "lingsuan.top", "98%", "4.0", "—"],
      ["木易 (MueMod)", "muemod.top", "71%", "4.6", "2"],
      ["ToolCode", "toolcode.top", "95%", "4.2", "1.3"],
    ],
  },
  {
    name: "GPT 6 Sol", modelId: "gpt-6-sol", kind: "chat",
    rows: [
      ["Modelflare", "origin.modelflare.dev", "100%", "4.0", "0.404"],
      ["SudoCode", "sudocode.chat", "100%", "7.6", "0.72"],
      ["RunAPI", "runapi.host", "95%", "8.9", "0.996"],
      ["云渡", "yundu.lol", "96%", "4.0", "0.2"],
      ["木易 (MueMod)", "muemod.top", "66%", "4.3", "0.3"],
      ["灵算", "lingsuan.top", "98%", "3.5", "—"],
    ],
  },
  {
    name: "GPT 5.6 Sol", modelId: "gpt-5.6-sol", kind: "chat",
    rows: [
      ["Modelflare", "origin.modelflare.dev", "98%", "4.5", "0.505"],
      ["灵算", "lingsuan.top", "98%", "4.4", "—"],
      ["AIGateHub", "api.vllmproxy.com", "100%", "6.6", "1.1"],
      ["ToolCode", "toolcode.top", "96%", "3.8", "0.6"],
      ["hao.ai", "hao.ai", "100%", "6.0", "4.08"],
      ["DragonAPI", "newapi.dragon3api.com", "98%", "7.7", "0.825"],
    ],
  },
  {
    name: "DeepSeek V4.1 Flash", modelId: "deepseek-v4.1-flash", kind: "chat",
    rows: [
      ["Modelflare", "origin.modelflare.dev", "100%", "2.6", "1.303"],
      ["SudoCode", "sudocode.chat", "100%", "2.3", "0.6"],
      ["LLM Free", "llmfree.work", "100%", "3.1", "0.3"],
      ["DragonAPI", "newapi.dragon3api.com", "100%", "2.5", "0.3"],
      ["GGAPI", "api.521cgg.com", "100%", "3.2", "—"],
      ["天天中转站", "tiantianapi.kdns.fr", "100%", "2.7", "0.403"],
    ],
  },
  {
    name: "Opus 5.5", modelId: "claude-opus-5-5", kind: "chat",
    rows: [
      ["Modelflare", "origin.modelflare.dev", "100%", "6.2", "8.48"],
      ["SudoCode", "sudocode.chat", "98%", "8.3", "4"],
      ["智流 (FluxLane)", "fluxlane.cn", "85%", "7.0", "6.4"],
      ["灵算", "lingsuan.top", "100%", "3.8", "—"],
      ["ZNB.ai", "znbcode.com", "100%", "5.3", "4"],
      ["9527code", "9527.codes", "100%", "5.8", "5.8"],
    ],
  },
  {
    name: "Fable 5.1", modelId: "claude-fable-5-1", kind: "chat",
    rows: [
      ["Modelflare", "origin.modelflare.dev", "100%", "5.5", "21.2"],
      ["SudoCode", "sudocode.chat", "100%", "7.1", "10"],
      ["hao.ai", "hao.ai", "98%", "4.7", "17"],
      ["灵算", "lingsuan.top", "100%", "5.6", "—"],
      ["ttflows", "api.ttflows.com", "98%", "5.7", "11.8"],
      ["9527code", "9527.codes", "100%", "6.2", "14.5"],
    ],
  },
  {
    name: "Gemini 3.8 Flash", modelId: "gemini-3.8-flash", kind: "chat",
    rows: [
      ["Modelflare", "origin.modelflare.dev", "100%", "2.5", "1.514"],
      ["9527code", "9527.codes", "100%", "4.5", "0.375"],
      ["MuzeAI", "api.muzeai.top", "89%", "4.4", "0.3"],
      ["88API", "88api.ai", "100%", "4.6", "1.05"],
      ["LoopAPI", "loopapi.cn", "100%", "4.0", "0.27"],
      ["8sToken", "8stoken.com", "100%", "4.6", "0.225"],
    ],
  },
  {
    name: "Seedance 2.5", modelId: "doubao-seedance-2.5", kind: "video",
    note: "该模型仅有 4 条有效公开结果；快照中 4 家在线率均为 0%，且没有延迟数据。",
    noteEn: "Only four valid public results are included for this model. All four show 0% uptime and no latency in the snapshot.",
    rows: [
      ["Modelflare", "origin.modelflare.dev", "0%", "—", "97.245"],
      ["河图", "hetune.top", "0%", "—", "0.6"],
      ["ALRO", "alro.huazhiweilai.com", "0%", "—", "0.595"],
      ["Lietio", "lietio.com", "0%", "—", "75"],
    ],
  },
  {
    name: "GPT Image 2", modelId: "gpt-image-2", kind: "image",
    rows: [
      ["Modelflare", "origin.modelflare.dev", "100%", "31.6", "—"],
      ["灵算", "lingsuan.top", "98%", "30.5", "—"],
      ["AIGateHub", "api.vllmproxy.com", "100%", "35.3", "0.02"],
      ["DragonAPI", "newapi.dragon3api.com", "100%", "33.7", "—"],
      ["GGUUAI", "gguuai.com", "93%", "31.2", "—"],
      ["88API", "88api.ai", "100%", "37.1", "—"],
    ],
  },
  {
    name: "Grok 4.7", modelId: "grok-4.7", kind: "chat",
    rows: [
      ["Modelflare", "origin.modelflare.dev", "100%", "2.6", "—"],
      ["ZNB.ai", "znbcode.com", "100%", "3.5", "0.3"],
      ["智流 (FluxLane)", "fluxlane.cn", "100%", "3.4", "1"],
      ["CUN.ai", "cun.ai", "100%", "3.5", "1.46"],
      ["GGUUAI", "gguuai.com", "96%", "6.0", "0.3"],
      ["88API", "88api.ai", "96%", "3.1", "0.7"],
    ],
  },
  {
    name: "GPT 5.6 Terra", modelId: "gpt-5.6-terra", kind: "chat",
    rows: [
      ["灵算", "lingsuan.top", "96%", "3.1", "—"],
      ["9527code", "9527.codes", "93%", "14.3", "0.6"],
      ["AIGateHub", "api.vllmproxy.com", "100%", "5.5", "0.44"],
      ["EiRouter", "eirouter.ai", "98%", "10.9", "1.34"],
      ["RunAPI", "runapi.host", "95%", "7.9", "0.996"],
      ["Portdan AI", "portdan.com", "98%", "17.1", "0.2"],
    ],
  },
  {
    name: "Kimi K3", modelId: "kimi-k3", kind: "chat",
    rows: [
      ["Modelflare", "origin.modelflare.dev", "100%", "21.4", "12.499"],
      ["DuiAPI", "duiapi.com", "100%", "4.6", "20"],
      ["T8 API", "t8api.com", "100%", "3.2", "12"],
      ["天天中转站", "tiantianapi.kdns.fr", "100%", "5.1", "4.028"],
      ["88API", "88api.ai", "100%", "6.6", "14"],
      ["CUN.ai", "cun.ai", "100%", "4.9", "10.22"],
    ],
  },
  {
    name: "GLM 5.3", modelId: "glm-5.3", kind: "chat",
    rows: [
      ["DuiAPI", "duiapi.com", "100%", "1.6", "8"],
      ["9527code", "9527.codes", "100%", "2.3", "4.8"],
      ["Ccode-AI", "ccode.dev", "100%", "14.1", "5.005"],
      ["DragonAPI", "newapi.dragon3api.com", "100%", "12.1", "1.2"],
      ["Apiko", "a-piko.top", "100%", "12.6", "1.44"],
      ["88API", "88api.ai", "100%", "12.7", "4"],
    ],
  },
];

const locale = document.body.dataset.locale === "en" ? "en" : "zh";
const labels = {
  zh: { supported: "支持文本聊天测试", unsupported: "非文本聊天模型", supportNote: "使用聊天兼容接口", unsupportedNote: "图片/视频类型", latency: (value) => value === "—" ? "—" : `${value} 秒`, price: (value) => value === "—" ? "—" : `¥${value} / 百万 tokens`, testHref: (id) => `/zh?model=${encodeURIComponent(id)}#test-tool` },
  en: { supported: "Text chat test available", unsupported: "Not a chat model", supportNote: "Requires a chat-compatible API", unsupportedNote: "Image/video modality", latency: (value) => value === "—" ? "—" : `${value} s`, price: (value) => value === "—" ? "—" : `¥${value} / 1M tokens`, testHref: (id) => `/en?model=${encodeURIComponent(id)}#test-tool` },
}[locale];

const tabs = document.querySelector("[data-leaderboard-models]");
const modelName = document.querySelector("[data-model-name]");
const modelId = document.querySelector("[data-model-id]");
const resultCount = document.querySelector("[data-result-count]");
const testSupport = document.querySelector("[data-test-support]");
const testSupportNote = document.querySelector("[data-test-support-note]");
const testLink = document.querySelector("[data-test-link]");
const noTest = document.querySelector("[data-no-test]");
const modelNote = document.querySelector("[data-model-note]");
const tableTitle = document.querySelector("[data-table-title]");
const rowsTarget = document.querySelector("[data-leaderboard-rows]");
let selectedIndex = 0;

function render() {
  const current = boards[selectedIndex];
  tabs.innerHTML = boards.map((item, index) =>
    `<button class="filter-chip ${index === selectedIndex ? "is-active" : ""}" type="button" data-model-index="${index}">${item.name}</button>`
  ).join("");

  modelName.textContent = current.name;
  modelId.textContent = current.modelId;
  resultCount.textContent = String(current.rows.length);
  testSupport.textContent = current.kind === "chat" ? labels.supported : labels.unsupported;
  testSupportNote.textContent = current.kind === "chat" ? labels.supportNote : labels.unsupportedNote;
  testLink.hidden = current.kind !== "chat";
  noTest.hidden = current.kind === "chat";
  testLink.href = labels.testHref(current.modelId);
  modelNote.textContent = locale === "en" ? (current.noteEn || "") : (current.note || "");
  modelNote.hidden = !modelNote.textContent;
  tableTitle.textContent = `${current.name} ${locale === "en" ? "snapshot" : "榜单快照"}`;
  rowsTarget.innerHTML = current.rows.map((row, index) => `
    <tr>
      <td>${index + 1}</td>
      <td><strong>${row[0]}</strong><br /><span class="leaderboard-domain">${row[1]}</span></td>
      <td>${row[2]}</td>
      <td>${labels.latency(row[3])}</td>
      <td>${labels.price(row[4])}</td>
    </tr>
  `).join("");
}

tabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-model-index]");
  if (!button) return;
  selectedIndex = Number(button.dataset.modelIndex);
  render();
});

render();
