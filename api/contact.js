import { createHmac } from "node:crypto";
import { methodNotAllowed, readJson, sendJson } from "./_utils.js";

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function feishuSign(timestamp, secret) {
  return createHmac("sha256", `${timestamp}\n${secret}`).digest("base64");
}

function feishuMessage(payload, req) {
  const submittedAt = new Date().toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
  });
  const source = cleanText(payload.source, 200) || req.headers.referer || "-";

  return {
    msg_type: "text",
    content: {
      text: [
        "新联系我们提交",
        "",
        `称呼：${payload.name}`,
        `联系方式：${payload.contact}`,
        `备注：${payload.note}`,
        `来源：${source}`,
        `时间：${submittedAt}`,
      ].join("\n"),
    },
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);

  const webhook = process.env.FEISHU_CONTACT_WEBHOOK;
  const secret = process.env.FEISHU_CONTACT_SECRET;
  if (!webhook || !secret) {
    return sendJson(res, 500, { error: "Contact notification is not configured." });
  }

  let payload;
  try {
    payload = await readJson(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body." });
  }

  const data = {
    name: cleanText(payload.name, 40),
    contact: cleanText(payload.contact, 120),
    note: cleanText(payload.note, 1000),
    source: cleanText(payload.source, 200),
  };
  if (!data.name || !data.contact || !data.note) {
    return sendJson(res, 400, { error: "Name, contact, and note are required." });
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      timestamp: String(timestamp),
      sign: feishuSign(timestamp, secret),
      ...feishuMessage(data, req),
    }),
  });

  let result = {};
  try {
    result = await response.json();
  } catch {
    result = {};
  }

  if (!response.ok || result.code !== 0) {
    return sendJson(res, 502, { error: result.msg || "Failed to send contact notification." });
  }

  return sendJson(res, 200, { ok: true });
}
