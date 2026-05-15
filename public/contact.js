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
    verifyTitle: "请先完成滑动验证",
    verifySubtitle: "滑到右侧后提交本次内容。",
    verifyDrag: "按住滑块拖到最右侧",
    verifySuccess: "验证通过，正在提交",
    verifyCancel: "取消",
    verifyClose: "关闭验证窗口",
    verifyHandle: "拖动滑块完成验证",
  },
  en: {
    missing: "Please fill in your name, contact info, and note.",
    sending: "Submitting...",
    sent: "Submitted. We will review it soon.",
    failed: "Submission failed. Please try again later.",
    verifyTitle: "Complete the slider check",
    verifySubtitle: "Slide to the right to submit your message.",
    verifyDrag: "Drag the slider all the way to the right",
    verifySuccess: "Verified. Submitting",
    verifyCancel: "Cancel",
    verifyClose: "Close verification dialog",
    verifyHandle: "Drag slider to verify",
  },
};

let verificationModal = null;

function readContactPayload() {
  const formData = new FormData(form);
  return {
    name: String(formData.get("name") || "").trim(),
    contact: String(formData.get("contact") || "").trim(),
    note: String(formData.get("note") || "").trim(),
    source: window.location.pathname,
  };
}

function ensureVerificationModal() {
  if (verificationModal) return verificationModal;

  const overlay = document.createElement("div");
  overlay.className = "verify-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="verify-dialog" role="dialog" aria-modal="true" aria-labelledby="contact-verify-title">
      <button class="verify-close" type="button" data-verify-close aria-label="${copy[locale].verifyClose}">×</button>
      <div class="verify-copy">
        <h3 id="contact-verify-title">${copy[locale].verifyTitle}</h3>
        <p>${copy[locale].verifySubtitle}</p>
      </div>
      <div class="verify-slider" data-verify-slider>
        <div class="verify-slider-fill" data-verify-fill></div>
        <div class="verify-slider-text" data-verify-label>${copy[locale].verifyDrag}</div>
        <button class="verify-thumb" type="button" data-verify-thumb aria-label="${copy[locale].verifyHandle}">
          <span>→</span>
        </button>
      </div>
      <div class="verify-actions">
        <button class="btn btn-secondary btn-small" type="button" data-verify-cancel>${copy[locale].verifyCancel}</button>
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
    label.textContent = copy[locale].verifyDrag;
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
    label.textContent = copy[locale].verifySuccess;
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
  closeBtn?.addEventListener("click", closeVerification);
  cancelBtn?.addEventListener("click", closeVerification);

  verificationModal = {
    open(onSuccess) {
      state.onSuccess = onSuccess;
      overlay.hidden = false;
      document.body.classList.add("verify-open");
      resetVerification();
    },
  };

  return verificationModal;
}

async function submitContact(payload) {
  if (!statusEl) return;

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  statusEl.className = "contact-status";
  statusEl.textContent = copy[locale].sending;

  try {
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: payload.name,
        contact: payload.contact,
        note: payload.note,
        source: payload.source,
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
}

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!statusEl) return;

  const payload = readContactPayload();
  if (!payload.name || !payload.contact || !payload.note) {
    statusEl.className = "contact-status is-fail";
    statusEl.textContent = copy[locale].missing;
    return;
  }

  ensureVerificationModal().open(() => {
    void submitContact(payload);
  });
});
