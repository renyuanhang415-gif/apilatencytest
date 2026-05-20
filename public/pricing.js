const locale = document.body.dataset.locale === "en" ? "en" : "zh";

const copy = {
  zh: {
    lowest: "最低",
    empty: "暂无",
    titleSuffix: "价格排行",
    countSuffix: "条",
    currency: "¥",
    sorts: {
      price: "价格最低",
      output: "输出最低",
      name: "名称",
    },
  },
  en: {
    lowest: "Lowest",
    empty: "N/A",
    titleSuffix: "price ranking",
    countSuffix: "",
    currency: "¥",
    sorts: {
      price: "Lowest input",
      output: "Lowest output",
      name: "Name",
    },
  },
};

const modelConfigs = [
  { key: "gpt55", label: "gpt-5.5" },
  { key: "opus47", label: "claude-opus-4-7" },
  { key: "gpt54", label: "gpt-5.4" },
  { key: "opus46", label: "claude-opus-4-6" },
];

const providerSets = {
  gpt55: [
    { name: "Yunwu", url: "https://yunwu.ai/register", group: "限时特价", input: 1.5, output: 9 },
    { name: "LinkAPI", url: "https://linkapi.ai/register", group: "default", input: 2.5, output: 15 },
    { name: "JiKe AI", url: "https://magic666.top/register", group: "default", input: 5, output: 30 },
    { name: "Plato", url: "https://api.bltcy.ai/register", group: "default", input: 5, output: 30 },
    { name: "V-API", url: "https://api.gpt.ge/register", group: "default", input: 12.5, output: 75 },
    { name: "DMX", url: "https://www.dmxapi.com/register", group: "default", input: 25, output: 150 },
    { name: "AIHubMix", url: "https://aihubmix.com", group: "tier1", input: 36.5, output: 219 },
    { name: "PoloAPI", url: "https://poloai.top/register", group: "Claude-code稳定", input: 75, output: 450 },
    { name: "ZetaTechs", url: "https://api.zetatechs.com/register", group: "reverse", input: 75, output: 450 },
    { name: "BEST AI", url: "https://api.oaibest.com/register", group: "default", input: 225, output: 1350 },
    { name: "Qianduoduo", url: "https://api2.aigcbest.top/register", group: "default", input: 262.5, output: 1575 },
  ],
  opus47: [
    { name: "Packy", url: "https://www.packyapi.com/register", group: "aws-q", input: 1.5, output: 7.5 },
    { name: "LinkAPI", url: "https://linkapi.ai/register", group: "claudecheap", input: 2.5, output: 12.5 },
    { name: "Yunwu", url: "https://yunwu.ai/register", group: "default", input: 2.5, output: 12.5 },
    { name: "Plato", url: "https://api.bltcy.ai/register", group: "cc", input: 4, output: 20 },
    { name: "V-API", url: "https://api.gpt.ge/register", group: "claude_kiro", input: 4.375, output: 21.875 },
    { name: "JiKe AI", url: "https://magic666.top/register", group: "default", input: 5, output: 25 },
    { name: "PoloAPI", url: "https://poloai.top/register", group: "Claude-code稳定", input: 5, output: 25 },
    { name: "ZetaTechs", url: "https://api.zetatechs.com/register", group: "27%", input: 10, output: 50 },
    { name: "BEST AI", url: "https://api.oaibest.com/register", group: "default", input: 15, output: 75 },
    { name: "Qianduoduo", url: "https://api2.aigcbest.top/register", group: "default", input: 17.5, output: 87.5 },
    { name: "DMX", url: "https://www.dmxapi.com/register", group: "default", input: 25, output: 125 },
    { name: "AIHubMix", url: "https://aihubmix.com", group: "tier1", input: 36.5, output: 182.5 },
  ],
  gpt54: [
    { name: "JiKe AI", url: "https://magic666.top/register", group: "gpt特惠", input: 0.125, output: 0.75 },
    { name: "ZeroCode", url: "https://www.zerocode.sbs/register", group: "畅享满血GPT", input: 0.275, output: 1.65 },
    { name: "Now Coding", url: "https://nowcoding.ai/register", group: "Codex 官方", input: 0.375, output: 2.25 },
    { name: "Xcode Best", url: "https://xcode.best/register", group: "default", input: 0.375, output: 2.25 },
    { name: "Spark Code", url: "https://sparkcode.top/register", group: "codex", input: 0.4995, output: 3.996 },
    { name: "IKun Code", url: "https://api.ikuncode.cc/register", group: "Codex", input: 0.5, output: 3 },
    { name: "Right Code", url: "https://www.right.codes/register", group: "Codex 日抛plus", input: 0.5, output: 3 },
    { name: "VBCode", url: "https://vbcode.io/register", group: "codex", input: 0.5, output: 3 },
    { name: "Doro", url: "https://doro.lol/register", group: "openai gpt codex", input: 0.5, output: 4 },
    { name: "Fox Code", url: "https://foxcode.rjj.cc/auth/register", group: "Codex满血官渠", input: 0.585, output: 3.51 },
    { name: "AiYa", url: "https://api.aiyahmm.com/register", group: "codex", input: 0.75, output: 4.5 },
    { name: "ByteCat", url: "https://www.bytecatcode.org/register", group: "codex", input: 0.75, output: 4.5 },
    { name: "DawCode", url: "https://dawclaudecode.com/register", group: "codex-stu", input: 0.75, output: 4.5 },
    { name: "Yunwu", url: "https://yunwu.ai/register", group: "限时特价", input: 0.75, output: 4.5 },
    { name: "Monking", url: "https://www.monking.ai/register", group: "codex-Pro", input: 0.875, output: 7 },
    { name: "Neko", url: "https://nekocode.ai", group: "按量-[Codex]-VIP", input: 0.9, output: 5.4 },
    { name: "17NAS", url: "https://ai.17nas.com/register", group: "cn", input: 0.912, output: 5.472 },
    { name: "ClaudeCN", url: "https://claudecn.top/register", group: "CodeX", input: 1.25, output: 7.5 },
    { name: "LinkAPI", url: "https://linkapi.ai/register", group: "default", input: 1.25, output: 7.5 },
    { name: "OneXModel", url: "https://1xm.ai/register", group: "openai(x0.5)", input: 1.25, output: 7.5 },
    { name: "AI Go Code", url: "https://aigocode.com", group: "Codex", input: 1.75, output: 10.5 },
    { name: "Duck Coding", url: "https://www.duckcoding.ai/register", group: "CodeX专用（Droid/OpenClaw）", input: 2, output: 12 },
    { name: "Plato", url: "https://api.bltcy.ai/register", group: "default", input: 2.5, output: 15 },
    { name: "PoloAPI", url: "https://poloai.top/register", group: "Claude-code稳定", input: 2.5, output: 15 },
  ],
  opus46: [
    { name: "Doro", url: "https://doro.lol/register", group: "Claude 逆向A1", input: 0.4, output: 2 },
    { name: "ZeroCode", url: "https://www.zerocode.sbs/register", group: "无缓claude", input: 0.95, output: 4.75 },
    { name: "ByteCat", url: "https://www.bytecatcode.org/register", group: "kiro", input: 1, output: 5 },
    { name: "Now Coding", url: "https://nowcoding.ai/register", group: "Claude Code 特惠", input: 1, output: 5 },
    { name: "Xcode Best", url: "https://xcode.best/register", group: "claude逆向特价", input: 1.25, output: 6.25 },
    { name: "Packy", url: "https://www.packyapi.com/register", group: "aws-q", input: 1.5, output: 7.5 },
    { name: "Right Code", url: "https://www.right.codes/register", group: "Claude awsq", input: 1.5, output: 7.5 },
    { name: "AiYa", url: "https://api.aiyahmm.com/register", group: "default", input: 1.75, output: 8.75 },
    { name: "Spark Code", url: "https://sparkcode.top/register", group: "cc逆向1", input: 1.998, output: 9.99 },
    { name: "Duck Coding", url: "https://www.duckcoding.ai/register", group: "Claude Code专用-逆向", input: 2, output: 10 },
    { name: "IKun Code", url: "https://api.ikuncode.cc/register", group: "cc逆向", input: 2, output: 10 },
    { name: "Neko", url: "https://nekocode.ai", group: "按量-[ClaudeCode-KIRO]", input: 2, output: 10 },
    { name: "VBCode", url: "https://vbcode.io/register", group: "cc-windsurf", input: 2, output: 10 },
    { name: "DawCode", url: "https://dawclaudecode.com/register", group: "cc-tehui", input: 2.25, output: 11.25 },
    { name: "Fox Code", url: "https://foxcode.rjj.cc/auth/register", group: "Ultra特价CC", input: 2.34, output: 11.7 },
    { name: "LinkAPI", url: "https://linkapi.ai/register", group: "claudecheap", input: 2.5, output: 12.5 },
    { name: "OneXModel", url: "https://1xm.ai/register", group: "cc-windsurf", input: 2.5, output: 12.5 },
    { name: "Yunwu", url: "https://yunwu.ai/register", group: "default", input: 2.5, output: 12.5 },
    { name: "Chintao", url: "https://chintao.cn/register", group: "default", input: 3, output: 15 },
    { name: "AI Go Code", url: "https://aigocode.com", group: "Claude 普通型", input: 3.5, output: 17.5 },
    { name: "Plato", url: "https://api.bltcy.ai/register", group: "cc", input: 4, output: 20 },
    { name: "V-API", url: "https://api.gpt.ge/register", group: "claude_kiro", input: 4.375, output: 21.875 },
    { name: "17NAS", url: "https://ai.17nas.com/register", group: "vip", input: 4.4, output: 22 },
    { name: "EasyChat", url: "https://easychat.site/#/user/login", group: "default", input: 4.5455, output: 22.7273 },
  ],
};

const state = {
  model: "gpt55",
  sort: "price",
};

const modelTabs = document.querySelector("[data-price-models]");
const sortTabs = document.querySelector("[data-price-sorts]");
const rowsTarget = document.querySelector("[data-price-rows]");
const tableTitle = document.querySelector("[data-table-title]");
const lowestInput = document.querySelector("[data-lowest-input]");
const lowestOutput = document.querySelector("[data-lowest-output]");
const sampleCount = document.querySelector("[data-sample-count]");
const updatedAt = document.querySelector("[data-updated-at]");

function activeRows() {
  return providerSets[state.model] || [];
}

function sortedRows() {
  const rows = [...activeRows()];
  rows.sort((left, right) => {
    if (state.sort === "output") return left.output - right.output;
    if (state.sort === "name") return left.name.localeCompare(right.name, locale === "zh" ? "zh-Hans-CN" : "en");
    return left.input - right.input;
  });
  return rows;
}

function formatPrice(price) {
  if (price == null) return copy[locale].empty;
  const decimals = price < 1 ? 4 : 2;
  const formatted = price.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "");
  return `${copy[locale].currency}${formatted}`;
}

function renderTabs() {
  modelTabs.innerHTML = modelConfigs
    .map(
      (model) =>
        `<button class="filter-chip ${model.key === state.model ? "is-active" : ""}" type="button" data-model="${model.key}">${model.label}</button>`
    )
    .join("");

  sortTabs.innerHTML = [
    ["price", copy[locale].sorts.price],
    ["output", copy[locale].sorts.output],
    ["name", copy[locale].sorts.name],
  ]
    .map(
      ([value, label]) =>
        `<button class="filter-chip ${value === state.sort ? "is-active" : ""}" type="button" data-sort="${value}">${label}</button>`
    )
    .join("");
}

function renderTable() {
  const rows = sortedRows();
  const activeModel = modelConfigs.find((model) => model.key === state.model);
  const minInput = Math.min(...rows.map((row) => row.input));
  const minOutput = Math.min(...rows.map((row) => row.output));

  tableTitle.textContent = `${activeModel.label} ${copy[locale].titleSuffix}`;
  lowestInput.textContent = formatPrice(minInput);
  lowestOutput.textContent = formatPrice(minOutput);
  sampleCount.textContent = locale === "zh" ? `${rows.length} ${copy[locale].countSuffix}` : String(rows.length);
  updatedAt.textContent = "2026-05-20";

  rowsTarget.innerHTML = rows
    .map((row) => {
      const inputMark = row.input === minInput ? `<small>${copy[locale].lowest}</small>` : "";
      const outputMark = row.output === minOutput ? `<small>${copy[locale].lowest}</small>` : "";

      return `<tr>
        <td><a href="${row.url}" target="_blank" rel="noopener noreferrer">${row.name}</a></td>
        <td>${row.group}</td>
        <td><strong class="${row.input === minInput ? "is-lowest" : ""}">${formatPrice(row.input)}</strong>${inputMark}</td>
        <td><strong class="${row.output === minOutput ? "is-lowest" : ""}">${formatPrice(row.output)}</strong>${outputMark}</td>
      </tr>`;
    })
    .join("");
}

function render() {
  renderTabs();
  renderTable();
}

modelTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-model]");
  if (!button) return;
  state.model = button.dataset.model;
  render();
});

sortTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-sort]");
  if (!button) return;
  state.sort = button.dataset.sort;
  render();
});

render();
