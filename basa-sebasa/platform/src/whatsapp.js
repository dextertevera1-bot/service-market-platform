// WhatsApp Cloud API: sending messages and reading the webhook.
// In simulation mode (no WHATSAPP_TOKEN) every message is stored in the outbox and shown on /sim.
import { createHmac, timingSafeEqual } from "node:crypto";
import { config, simulated } from "./config.js";
import { run } from "./db.js";

const clip = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + "…" : String(s));

async function send(to, payload) {
  const body = { messaging_product: "whatsapp", recipient_type: "individual", to, ...payload };
  if (simulated.whatsapp) {
    run("INSERT INTO outbox (to_phone, payload, status, at) VALUES (?,?,?,?)", to, JSON.stringify(body), "sim", Date.now());
    return { ok: true, sim: true };
  }
  const url = `https://graph.facebook.com/${config.whatsapp.apiVersion}/${config.whatsapp.phoneNumberId}/messages`;
  try {
    const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${config.whatsapp.token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    run("INSERT INTO outbox (to_phone, payload, status, error, at) VALUES (?,?,?,?,?)", to, JSON.stringify(body), res.ok ? "sent" : "failed", res.ok ? null : JSON.stringify(json.error || json), Date.now());
    return { ok: res.ok, json };
  } catch (e) {
    run("INSERT INTO outbox (to_phone, payload, status, error, at) VALUES (?,?,?,?,?)", to, JSON.stringify(body), "failed", String(e), Date.now());
    return { ok: false, error: String(e) };
  }
}

export const wa = {
  text: (to, text) => send(to, { type: "text", text: { body: clip(text, 4096), preview_url: false } }),
  // Up to 3 reply buttons, titles up to 20 characters.
  buttons: (to, text, buttons, header) => send(to, { type: "interactive", interactive: {
    type: "button", ...(header ? { header: { type: "text", text: clip(header, 60) } } : {}),
    body: { text: clip(text, 1024) },
    action: { buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: clip(b.title, 20) } })) } } }),
  // A list of up to 10 rows, row titles up to 24 characters.
  list: (to, text, buttonLabel, rows) => send(to, { type: "interactive", interactive: {
    type: "list", body: { text: clip(text, 1024) },
    action: { button: clip(buttonLabel, 20), sections: [{ title: "Choose one", rows: rows.slice(0, 10).map((r) => ({ id: r.id, title: clip(r.title, 24), ...(r.description ? { description: clip(r.description, 72) } : {}) })) }] } } }),
  locationRequest: (to, text) => send(to, { type: "interactive", interactive: { type: "location_request_message", body: { text: clip(text, 1024) }, action: { name: "send_location" } } }),
  image: (to, link, caption) => send(to, { type: "image", image: { link, caption: clip(caption || "", 1024) } }),
  // Authentication template for log-in codes (needs an approved template on the live account).
  otp: (to, code) => config.whatsapp.otpTemplate && !simulated.whatsapp
    ? send(to, { type: "template", template: { name: config.whatsapp.otpTemplate, language: { code: "en" }, components: [{ type: "body", parameters: [{ type: "text", text: code }] }, { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] }] } })
    : send(to, { type: "text", text: { body: `Your Basa seBasa Pro log-in code is ${code}. It expires in 10 minutes. Don't share it with anyone.` } }),
};

// Turn a webhook POST body into simple inbound messages.
export function parseWebhook(body) {
  const out = [];
  for (const entry of body?.entry || []) for (const ch of entry.changes || []) {
    const v = ch.value || {};
    const names = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile?.name]));
    for (const m of v.messages || []) {
      const msg = { id: m.id, from: m.from, name: names[m.from] || null, type: m.type, at: Number(m.timestamp || 0) * 1000 || Date.now() };
      if (m.type === "text") msg.text = m.text?.body || "";
      if (m.type === "interactive") msg.reply = m.interactive?.button_reply?.id || m.interactive?.list_reply?.id || "";
      if (m.type === "button") msg.reply = m.button?.payload || m.button?.text || "";
      if (m.type === "location") msg.location = { lat: m.location.latitude, lng: m.location.longitude, name: m.location.name || m.location.address || "" };
      if (["image", "audio", "video", "document"].includes(m.type)) { msg.media = { kind: m.type, id: m[m.type]?.id, caption: m[m.type]?.caption || "" }; msg.text = msg.media.caption; }
      out.push(msg);
    }
  }
  return out;
}

export function verifySignature(rawBody, header) {
  if (!config.whatsapp.appSecret) return simulated.whatsapp; // live mode must have the app secret set
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", config.whatsapp.appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(header.slice(7)), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
