const form = document.querySelector("[data-contact-form]");
const statusEl = document.querySelector("[data-contact-status]");
const locale = (document.body.dataset.locale || document.documentElement.lang || "en").toLowerCase().startsWith("zh")
  ? "zh"
  : "en";

const copy = {
  zh: {
    missing: "请把称呼、联系方式和备注都填一下。",
    ready: "内容已整理好，真实提交通道接入后就可以直接发送。",
  },
  en: {
    missing: "Please fill in your name, contact info, and note.",
    ready: "Your message is ready. It can be sent directly after the submission endpoint is connected.",
  },
};

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!statusEl) return;

  const formData = new FormData(form);
  const name = String(formData.get("name") || "").trim();
  const contact = String(formData.get("contact") || "").trim();
  const note = String(formData.get("note") || "").trim();

  if (!name || !contact || !note) {
    statusEl.className = "contact-status is-fail";
    statusEl.textContent = copy[locale].missing;
    return;
  }

  statusEl.className = "contact-status is-pass";
  statusEl.textContent = copy[locale].ready;
});
