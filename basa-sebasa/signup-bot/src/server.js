/*
 * Basa seBasa sign-up bot: WhatsApp Cloud API server.
 * No dependencies: needs Node 18 or newer. Start with:  node src/server.js
 * All settings come from environment variables (see README.md and .env.example).
 */
"use strict";
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const E = require("./engine.js");

// ------------------------------------------------------------------ settings
loadDotEnv(path.join(__dirname, "..", ".env"));
const env = process.env;
const SET = {
  port: Number(env.PORT || 3000),
  token: env.WHATSAPP_TOKEN || "",
  phoneNumberId: env.PHONE_NUMBER_ID || "",
  verifyToken: env.VERIFY_TOKEN || "",
  appSecret: env.APP_SECRET || "",
  graph: `https://graph.facebook.com/${env.GRAPH_VERSION || "v23.0"}`,
  dataDir: path.resolve(env.DATA_DIR || path.join(__dirname, "..", "data")),
  templateLang: env.TEMPLATE_LANG || "en",
};
const CONFIG = {
  founderPhones: (env.FOUNDER_PHONES || "").split(",").map((s) => s.replace(/\D/g, "")).filter(Boolean),
  botNumber: (env.BOT_NUMBER || "").replace(/\D/g, ""),
  publicUrl: (env.PUBLIC_URL || "").replace(/\/$/, ""),
  adminKey: env.ADMIN_KEY || "",
  launchDate: env.LAUNCH_DATE || "15 December",
  ...(env.OPEN_TRADES ? { trades: E.DEFAULTS.trades.map((t) => ({ ...t, open: env.OPEN_TRADES.split(",").map((s) => s.trim()).includes(t.id) })) } : {}),
};
const missing = ["WHATSAPP_TOKEN", "PHONE_NUMBER_ID", "VERIFY_TOKEN", "APP_SECRET", "FOUNDER_PHONES", "ADMIN_KEY"].filter((k) => !env[k]);
if (missing.length) console.warn("⚠ Missing settings:", missing.join(", "), "(see README.md)");

// ------------------------------------------------------------------ storage: one JSON file, written safely
fs.mkdirSync(path.join(SET.dataDir, "uploads"), { recursive: true });
const STORE_FILE = path.join(SET.dataDir, "store.json");
let store = E.newStore();
try { store = { ...store, ...JSON.parse(fs.readFileSync(STORE_FILE, "utf8")) }; console.log(`Loaded ${Object.keys(store.apps).length} applications`); } catch (e) { if (e.code !== "ENOENT") throw e; }
store.seen = store.seen || [];
function persist() { const tmp = STORE_FILE + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(store)); fs.renameSync(tmp, STORE_FILE); }
// one message at a time, so two messages can't overwrite each other's changes
let queue = Promise.resolve();
const serial = (fn) => (queue = queue.then(fn).catch((e) => console.error("✗", e)));

// ------------------------------------------------------------------ WhatsApp API
async function graph(method, url, body) {
  const res = await fetch(url.startsWith("http") ? url : `${SET.graph}/${url}`, { method, headers: { Authorization: `Bearer ${SET.token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error(json.error?.message || res.statusText); err.code = json.error?.code; err.details = json.error; throw err; }
  return json;
}
function toApi(m) {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to: m.to };
  if (m.kind === "buttons") return { ...base, type: "interactive", interactive: { type: "button", body: { text: m.body }, action: { buttons: m.buttons.map((b) => ({ type: "reply", reply: b })) } } };
  if (m.kind === "list") return { ...base, type: "interactive", interactive: { type: "list", body: { text: m.body }, action: { button: m.button, sections: [{ title: "Options", rows: m.rows }] } } };
  return { ...base, type: "text", text: { body: m.body, preview_url: true } };
}
async function send(m) {
  try { await graph("POST", `${SET.phoneNumberId}/messages`, toApi(m)); }
  catch (e) {
    // 131047: more than 24 hours since the person last wrote, so only an approved template can be sent
    if (e.code === 131047 && m.fallbackTemplate) {
      const t = m.fallbackTemplate;
      try { await graph("POST", `${SET.phoneNumberId}/messages`, { messaging_product: "whatsapp", to: m.to, type: "template", template: { name: t.name, language: { code: SET.templateLang }, components: [{ type: "body", parameters: t.params.map((p) => ({ type: "text", text: String(p) })) }] } }); return; }
      catch (e2) { console.error(`✗ template ${t.name} to ${m.to}:`, e2.message); return; }
    }
    console.error(`✗ send to ${m.to}:`, e.message);
  }
}
const EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf" };
async function fetchMedia({ appId, field, mediaId }) {
  try {
    const meta = await graph("GET", mediaId);
    const res = await fetch(meta.url, { headers: { Authorization: `Bearer ${SET.token}` } });
    if (!res.ok) throw new Error("download " + res.status);
    const dir = path.join(SET.dataDir, "uploads", appId); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, field + (EXT[meta.mime_type] || ""));
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    const app = store.apps[appId]; if (app && app.docs[field]) { app.docs[field].file = path.relative(SET.dataDir, file); app.docs[field].mime = meta.mime_type; persist(); }
  } catch (e) { console.error(`✗ media ${appId}/${field}:`, e.message); }
}
async function run(result) {
  for (const m of result.messages) await send(m);
  for (const fx of result.effects) {
    if (fx.type === "media") await fetchMedia(fx);
    if (fx.type === "delete_files") fs.rmSync(path.join(SET.dataDir, "uploads", fx.appId), { recursive: true, force: true });
  }
}

// incoming webhook message → engine input
function toInput(msg) {
  switch (msg.type) {
    case "text": return { type: "text", text: msg.text.body };
    case "interactive": { const r = msg.interactive.button_reply || msg.interactive.list_reply; return { type: "button", id: r.id, title: r.title }; }
    case "button": return { type: "text", text: msg.button.text }; // a tap on a template's quick-reply button
    case "image": return { type: "image", mediaId: msg.image.id, mime: msg.image.mime_type };
    case "document": return { type: "document", mediaId: msg.document.id, mime: msg.document.mime_type, filename: msg.document.filename };
    case "location": return { type: "location", lat: msg.location.latitude, lng: msg.location.longitude, name: msg.location.name, address: msg.location.address };
    default: return { type: "text", text: "" }; // stickers, voice notes etc.: the bot re-asks its question
  }
}
function onWebhook(payload) {
  for (const entry of payload.entry || []) for (const change of entry.changes || []) {
    for (const msg of change.value?.messages || []) {
      if (store.seen.includes(msg.id)) continue; // WhatsApp can deliver the same message twice
      store.seen.push(msg.id); if (store.seen.length > 1000) store.seen.splice(0, 200);
      serial(async () => { const result = E.handle(CONFIG, store, msg.from, toInput(msg), Number(msg.timestamp) * 1000 || Date.now()); persist(); await run(result); });
    }
  }
}
setInterval(() => serial(async () => { const r = E.tick(CONFIG, store, Date.now()); if (r.messages.length) { persist(); await run(r); } }), 60e3);

// ------------------------------------------------------------------ admin pages (documents, export)
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>body{font:15px/1.45 system-ui,sans-serif;margin:0;padding:16px;background:#F5F1E6;color:#14120D}h1{font-size:22px}table{border-collapse:collapse;width:100%;background:#fff}td,th{padding:8px;border-bottom:1px solid #e3ddcf;text-align:left;vertical-align:top}a{color:#8A6400}.docs{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}.docs figure{margin:0;background:#fff;padding:8px;border-radius:8px}.docs img{width:100%;border-radius:6px}.flag{color:#a33}.pill{padding:2px 8px;border-radius:99px;background:#ece6d6;font-size:13px}</style></head><body>${body}</body></html>`;
function admin(req, res, url) {
  const key = url.searchParams.get("key"), k = `key=${encodeURIComponent(key || "")}`;
  if (!CONFIG.adminKey || key !== CONFIG.adminKey) { res.writeHead(403); return res.end("Forbidden"); }
  const parts = url.pathname.split("/").filter(Boolean); // admin, P1001, file, selfie
  const C = E.makeConfig(CONFIG), tradeName = (id) => (C.trades.find((t) => t.id === id) || {}).name || "-";
  if (parts[1] === "export.csv") {
    const rows = [["id", "status", "name", "phone", "trade", "area", "ecocash", "eco_name", "reference", "call_harare", "flags", "creator_code", "submitted"]].concat(Object.values(store.apps).map((a) => [a.id, a.status, a.name, a.phone, tradeName(a.trade), a.area, a.ecoNum, a.ecoName, a.ref, a.slot ? E._.slotFounder(a.slot, C) : "", (a.flags || []).join("; "), a.refCode || "", a.submittedAt ? new Date(a.submittedAt).toISOString() : ""]));
    const wl = [["phone", "service", "area", "creator_code", "joined"]].concat(store.waitlist.map((w) => [w.phone, w.service, w.area, w.refCode || "", new Date(w.at).toISOString()]));
    const csv = (r) => r.map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    res.writeHead(200, { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=basa-signups.csv" });
    return res.end(csv(rows) + "\n\n" + csv(wl));
  }
  const app = parts[1] && store.apps[parts[1]];
  if (app && parts[2] === "file") {
    const d = app.docs[parts[3]]; if (!d || !d.file) { res.writeHead(404); return res.end("Not downloaded yet"); }
    res.writeHead(200, { "Content-Type": d.mime || "application/octet-stream", "Cache-Control": "private, no-store" });
    return fs.createReadStream(path.join(SET.dataDir, d.file)).pipe(res);
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  if (app) {
    const docs = Object.entries(app.docs).map(([f, d]) => `<figure>${d.file && /^image\//.test(d.mime) ? `<img src="/admin/${app.id}/file/${f}?${k}" alt="${esc(f)}">` : `<a href="/admin/${app.id}/file/${f}?${k}">Open ${esc(f)}</a>`}<figcaption>${esc(f)}${d.file ? "" : " (still downloading)"}</figcaption></figure>`).join("");
    return res.end(page(app.id, `<p><a href="/admin?${k}">← All applications</a></p><h1>${esc(app.id)} · ${esc(app.name)} <span class="pill">${esc(app.status)}</span></h1><table>${[["Phone", "+" + app.phone], ["Trade", tradeName(app.trade)], ["Area", app.area], ["EcoCash", `${app.ecoNum} (${app.ecoName})`], ["Reference", app.ref || "none"], ["Video call", app.slot ? E._.slotFounder(app.slot, C) : "not booked"], ["Safety pre-check", `${(app.safety || []).filter(Boolean).length}/${(app.safety || []).length}`], ["Creator code", app.refCode || "-"]].map(([a, b]) => `<tr><th>${a}</th><td>${esc(b)}</td></tr>`).join("")}${app.flags.length ? `<tr><th>Flags</th><td class="flag">${app.flags.map(esc).join("<br>")}</td></tr>` : ""}</table><h2>Documents</h2><div class="docs">${docs || "None"}</div><p>Decide on WhatsApp: <code>APPROVE ${esc(app.id)}</code>, <code>REJECT ${esc(app.id)} reason</code> or <code>FIX ${esc(app.id)} what's needed</code>.</p>`));
  }
  const list = Object.values(store.apps).filter((a) => a.status !== "draft").sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
  return res.end(page("Basa seBasa sign-ups", `<h1>Pro applications (${list.length})</h1><p><a href="/admin/export.csv?${k}">Download everything as CSV</a> · Customer waitlist: ${store.waitlist.length}</p><table><tr><th>ID</th><th>Name</th><th>Trade</th><th>Area</th><th>Status</th><th>Call</th><th>Flags</th></tr>${list.map((a) => `<tr><td><a href="/admin/${a.id}?${k}">${esc(a.id)}</a></td><td>${esc(a.name)}</td><td>${esc(tradeName(a.trade))}</td><td>${esc(a.area)}</td><td><span class="pill">${esc(a.status)}</span></td><td>${a.slot ? esc(E._.slotFounder(a.slot, C)) : "-"}</td><td class="flag">${a.flags.length || ""}</td></tr>`).join("")}</table>`));
}

// ------------------------------------------------------------------ HTTP
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/webhook" && req.method === "GET") {
    // Meta calls this once when you save the webhook URL
    if (url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === SET.verifyToken) { res.writeHead(200); return res.end(url.searchParams.get("hub.challenge")); }
    res.writeHead(403); return res.end();
  }
  if (url.pathname === "/webhook" && req.method === "POST") {
    const chunks = []; let size = 0;
    req.on("data", (c) => { size += c.length; if (size < 5e6) chunks.push(c); });
    req.on("end", () => {
      const raw = Buffer.concat(chunks);
      const sig = req.headers["x-hub-signature-256"] || "", want = "sha256=" + crypto.createHmac("sha256", SET.appSecret).update(raw).digest("hex");
      if (!SET.appSecret || sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) { res.writeHead(401); return res.end(); }
      res.writeHead(200); res.end(); // answer Meta at once, then do the work
      try { onWebhook(JSON.parse(raw.toString("utf8"))); } catch (e) { console.error("✗ webhook", e.message); }
    });
    return;
  }
  if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) return admin(req, res, url);
  if (url.pathname === "/health") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ ok: true, applications: Object.keys(store.apps).length, waitlist: store.waitlist.length })); }
  res.writeHead(200, { "Content-Type": "text/plain" }); res.end("Basa seBasa sign-up bot is running.");
});
if (require.main === module) server.listen(SET.port, () => console.log(`Basa seBasa sign-up bot on port ${SET.port}`));
module.exports = { server, onWebhook, toInput, toApi, _store: () => store };

function loadDotEnv(file) {
  try { fs.readFileSync(file, "utf8").split(/\r?\n/).forEach((line) => { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }); } catch (e) {}
}
