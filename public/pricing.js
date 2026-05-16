const locale = document.body.dataset.locale === "en" ? "en" : "zh";

const copy = {
  zh: {
    lowest: "最低",
    normal: "正常",
    watch: "观察",
    danger: "高风险",
    empty: "暂无",
    sorts: {
      price: "价格最低",
      stability: "最稳定",
      rating: "评分最高",
    },
    titleSuffix: "价格采样",
    countSuffix: "个",
    currency: "¥",
  },
  en: {
    lowest: "Lowest",
    normal: "Normal",
    watch: "Watch",
    danger: "High risk",
    empty: "N/A",
    sorts: {
      price: "Lowest price",
      stability: "Most stable",
      rating: "Highest rating",
    },
    titleSuffix: "Sample pricing",
    countSuffix: "",
    currency: "¥",
  },
};

const modelConfigs = [
  { key: "gpt4o", label: "GPT-4o" },
  { key: "claude35", label: "Claude-3.5" },
];

const providerSets = {
  gpt4o: [
    { name: "KFCV50 API", slug: "kfcv50", risk: "danger", stability: 2.8, rating: 2.5, input: 0.2, output: 0.2 },
    { name: "GPTGod", slug: "gptgod", risk: "danger", stability: 2.5, rating: 2.8, input: 0.6, output: 0.6 },
    { name: "发现AI", slug: "findcg", risk: "watch", stability: 3.5, rating: 3.5, input: 0.63, output: 3.8 },
    { name: "AZAPI", slug: "azapi", risk: "safe", stability: 4.0, rating: 4.0, input: 0.8, output: 0.8 },
    { name: "DawCode", slug: "dawcode", risk: "watch", stability: 4.0, rating: 3.8, input: 1.0, output: 6.0 },
    { name: "Nio API", slug: "nio", risk: "safe", stability: 3.8, rating: 3.8, input: 1.0, output: 1.0 },
    { name: "RightCode", slug: "rightcodes", risk: "safe", stability: 4.2, rating: 4.3, input: 1.25, output: 7.5 },
    { name: "OpenAI Next", slug: "openai-next", risk: "safe", stability: null, rating: null, input: 1.5, output: 4.8 },
    { name: "OpenAI SB", slug: "openai-sb", risk: "watch", stability: 3.6, rating: 3.7, input: 1.8, output: 5.5 },
    { name: "PackyCode", slug: "packycode", risk: "safe", stability: 4.5, rating: 4.5, input: 2.4, output: 12.0 },
  ],
  claude35: [
    { name: "鸡哥API", slug: "youseapi", risk: "safe", stability: 4.3, rating: 4.3, input: 0.04, output: 0.04 },
    { name: "AI派", slug: "aipaibox", risk: "safe", stability: 4.3, rating: 4.3, input: 0.9, output: 4.5 },
    { name: "OpenAI Next", slug: "openai-next", risk: "safe", stability: null, rating: null, input: 1.8, output: 7.0 },
    { name: "OpenAI SB", slug: "openai-sb", risk: "watch", stability: 3.6, rating: 3.7, input: 2.0, output: 8.0 },
    { name: "N1N.ai", slug: "n1n-ai", risk: "safe", stability: null, rating: null, input: 2.2, output: 9.0 },
    { name: "星辰中转 API", slug: "xingchen-api", risk: "safe", stability: null, rating: null, input: 2.5, output: 9.8 },
    { name: "KK云计算", slug: "kkclouds", risk: "safe", stability: null, rating: null, input: 2.6, output: 10.5 },
    { name: "AIHubMix", slug: "aihubmix", risk: "safe", stability: null, rating: null, input: 2.6, output: 10.0 },
    { name: "one-api", slug: "one-api", risk: "safe", stability: null, rating: null, input: 2.6, output: 10.2 },
    { name: "Qu-API", slug: "qu-api", risk: "safe", stability: null, rating: null, input: 2.7, output: 10.5 },
  ],
};

const state = {
  model: modelConfigs[0].key,
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

function riskLabel(risk) {
  if (risk === "danger") return copy[locale].danger;
  if (risk === "watch") return copy[locale].watch;
  return copy[locale].normal;
}

function activeRows() {
  return providerSets[state.model] || [];
}

function sortedRows() {
  const rows = [...activeRows()];
  rows.sort((left, right) => {
    if (state.sort === "rating") return (right.rating ?? 0) - (left.rating ?? 0);
    if (state.sort === "stability") return (right.stability ?? 0) - (left.stability ?? 0);
    return left.input - right.input;
  });
  return rows;
}

function sourceHref(slug) {
  return `https://www.token1000.com/zhan/${slug}`;
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
    ["stability", copy[locale].sorts.stability],
    ["rating", copy[locale].sorts.rating],
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
  lowestInput.textContent = `${copy[locale].currency}${minInput.toFixed(2)}`;
  lowestOutput.textContent = `${copy[locale].currency}${minOutput.toFixed(2)}`;
  sampleCount.textContent = locale === "zh" ? `${rows.length} ${copy[locale].countSuffix}` : String(rows.length);
  updatedAt.textContent = "2026-05-16";

  rowsTarget.innerHTML = rows
    .map((row) => {
      const rating = row.rating == null ? copy[locale].empty : row.rating.toFixed(1);
      const stability = row.stability == null ? copy[locale].empty : row.stability.toFixed(1);
      const inputMark = row.input === minInput ? `<small>${copy[locale].lowest}</small>` : "";
      const outputMark = row.output === minOutput ? `<small>${copy[locale].lowest}</small>` : "";

      return `<tr>
        <td><a href="${sourceHref(row.slug)}" target="_blank" rel="noopener noreferrer">${row.name}</a></td>
        <td><span class="risk-pill risk-${row.risk}">${riskLabel(row.risk)}</span></td>
        <td>${stability}</td>
        <td>${rating}</td>
        <td><strong class="${row.input === minInput ? "is-lowest" : ""}">${copy[locale].currency}${row.input.toFixed(2)}</strong>${inputMark}</td>
        <td><strong class="${row.output === minOutput ? "is-lowest" : ""}">${copy[locale].currency}${row.output.toFixed(2)}</strong>${outputMark}</td>
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
