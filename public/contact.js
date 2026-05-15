const form = document.querySelector("[data-contact-form]");
const statusEl = document.querySelector("[data-contact-status]");
const locale = (document.body.dataset.locale || document.documentElement.lang || "en").toLowerCase().startsWith("zh")
  ? "zh"
  : "en";

const copy = {
  zh: {
    missing: "请把称呼、联系方式和备注都填一下。",
    sending: "正在提交...",
    sent: "已提交，我们会尽快查看。",
    failed: "提交失败，请稍后再试。",
  },
  en: {
    missing: "Please fill in your name, contact info, and note.",
    sending: "Submitting...",
    sent: "Submitted. We will review it soon.",
    failed: "Submission failed. Please try again later.",
  },
};

form?.addEventListener("submit", async (event) => {
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

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  statusEl.className = "contact-status";
  statusEl.textContent = copy[locale].sending;

  try {
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        contact,
        note,
        source: window.location.pathname,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || copy[locale].failed);

    form.reset();
    statusEl.className = "contact-status is-pass";
    statusEl.textContent = copy[locale].sent;
  } catch (error) {
    statusEl.className = "contact-status is-fail";
    statusEl.textContent = error.message || copy[locale].failed;
  } finally {
    submitBtn.disabled = false;
  }
});
