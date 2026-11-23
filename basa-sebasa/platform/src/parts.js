// Parts network, Phase 1: job-linked sourcing.
// The pro asks the nearest verified suppliers for a price; suppliers answer through a private link;
// the customer sees up to 3 options (price, condition, warranty, shop, suburb, distance), nearest first,
// and picks one. The pro buys the part and fits it; the customer pays it back in the balance after testing.
// No money passes through Basa for parts, and commission never applies to them.
import { randomBytes } from "node:crypto";
import { one, all, run, logEvent, tx } from "./db.js";
import { wa } from "./whatsapp.js";
import { RULES, r2, usd, serviceById } from "./rules.js";
import { SUBURBS, findSuburb, roadKm } from "./places.js";
import { config } from "./config.js";

const P = RULES.parts;
export const CONDITIONS = { new: "New", refurbished: "Refurbished", used: "Used" };
export const CHECK_NAME = { id: "ID seen", shop: "Shop photo", ecocash: "EcoCash name matches", visit: "Shop visited" };

const parseSupplier = (s) => s && { ...s, checks: JSON.parse(s.checks || "{}"), trades: String(s.trades || "").split(",").filter(Boolean) };
export const getSupplier = (id) => parseSupplier(one("SELECT * FROM suppliers WHERE id = ?", id));
export const listSuppliers = () => all("SELECT * FROM suppliers ORDER BY status, shop").map(parseSupplier);

// ---------- suppliers (added by the ops team after meeting them) ----------
export function addSupplier({ name, shop, phone, suburb, trades }, by) {
  const sub = findSuburb(suburb), tr = (Array.isArray(trades) ? trades : String(trades || "").split(",")).map((t) => String(t).trim()).filter((t) => serviceById(t));
  const err = [];
  if (!String(name || "").trim()) err.push("contact name");
  if (!String(shop || "").trim()) err.push("shop name");
  if (!/^2637[1378]\d{7}$/.test(phone || "")) err.push("a Zimbabwe mobile number");
  if (!sub) err.push("suburb");
  if (!tr.length) err.push("at least one trade");
  if (err.length) return { error: "Please check: " + err.join(", ") };
  if (one("SELECT id FROM suppliers WHERE phone = ?", phone)) return { error: "A supplier with this number is already listed." };
  const [lat, lng] = SUBURBS[sub], now = Date.now();
  const r = run("INSERT INTO suppliers (phone, name, shop, suburb, lat, lng, trades, status, checks, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    phone, String(name).trim().slice(0, 60), String(shop).trim().slice(0, 80), sub, lat, lng, tr.join(","), "pending", "{}", now, now);
  logEvent(null, "parts", `Supplier added by ${by}: ${String(shop).trim()} (${sub}), ${tr.map((t) => serviceById(t).name).join(", ")}.`);
  return { ok: true, id: Number(r.lastInsertRowid) };
}

export function setSupplierCheck(id, check, value, by) {
  const s = getSupplier(id); if (!s) return { error: "No such supplier." };
  if (!CHECK_NAME[check]) return { error: "Unknown check." };
  s.checks[check] = value ? { at: Date.now(), by } : undefined;
  run("UPDATE suppliers SET checks = ?, updated_at = ? WHERE id = ?", JSON.stringify(s.checks), Date.now(), id);
  return { ok: true };
}

export async function setSupplierStatus(id, status, by, note = "") {
  const s = getSupplier(id); if (!s) return { error: "No such supplier." };
  if (status === "verified") {
    const missing = P.supplierChecks.filter((c) => !s.checks[c]);
    if (missing.length) return { error: "Still to do: " + missing.map((c) => CHECK_NAME[c]).join(", ") + "." };
  }
  if (!["verified", "suspended"].includes(status)) return { error: "Unknown status." };
  run("UPDATE suppliers SET status = ?, note = ?, updated_at = ? WHERE id = ?", status, String(note).slice(0, 200), Date.now(), id);
  logEvent(null, "parts", `Supplier ${s.shop}: ${status === "verified" ? "verified" : "suspended"} by ${by}${note ? ` (${note})` : ""}.`);
  if (status === "verified" && s.status !== "verified")
    await wa.text(s.phone, `Welcome to Basa seBasa, ${s.name.split(" ")[0]}! ${s.shop} is now a verified parts supplier. When a Basa pro nearby needs a part, we'll send you a private link to quote your price.`);
  return { ok: true };
}

// ---------- a pro asks for a part ----------
export function openRequestForJob(jobId) { return one("SELECT * FROM part_requests WHERE job_id = ? AND status = 'open' ORDER BY id DESC", jobId); }
export function latestRequestForJob(jobId) { return one("SELECT * FROM part_requests WHERE job_id = ? AND status != 'cancelled' ORDER BY id DESC", jobId); }

export async function requestPart(job, pro, description) {
  const desc = String(description || "").trim().replace(/\s+/g, " ");
  if (desc.length < 3) return { error: "Describe the part (name, size or model number)." };
  const sups = all("SELECT * FROM suppliers WHERE status = 'verified'").map(parseSupplier)
    .filter((s) => s.trades.includes(job.service))
    .map((s) => ({ s, km: roadKm(s.lat, s.lng, job.data.lat, job.data.lng) }))
    .sort((a, b) => a.km - b.km).slice(0, P.askSuppliers);
  if (!sups.length) return { error: "No verified suppliers for this trade yet. Enter the part price yourself in the quote." };
  const now = Date.now();
  const reqId = tx(() => {
    // One request at a time per job: a new one replaces an older open one.
    for (const r of all("SELECT id FROM part_requests WHERE job_id = ? AND status = 'open'", job.id)) {
      run("UPDATE part_requests SET status = 'cancelled' WHERE id = ?", r.id);
      run("UPDATE part_quotes SET status = 'withdrawn' WHERE request_id = ? AND status IN ('invited','quoted')", r.id);
    }
    const id = Number(run("INSERT INTO part_requests (job_id, pro_id, trade, description, status, created_at, closes_at) VALUES (?,?,?,?,?,?,?)",
      job.id, pro.id, job.service, desc.slice(0, 200), "open", now, now + P.replyMinutes * 60e3).lastInsertRowid);
    for (const { s, km } of sups) run("INSERT INTO part_quotes (request_id, supplier_id, token, km, status, created_at) VALUES (?,?,?,?,?,?)", id, s.id, randomBytes(18).toString("base64url"), km, "invited", now);
    return id;
  });
  for (const q of all("SELECT q.token, q.km, s.phone, s.name FROM part_quotes q JOIN suppliers s ON s.id = q.supplier_id WHERE q.request_id = ?", reqId))
    await wa.text(q.phone, `🔧 *Basa seBasa part request*\n${serviceById(job.service).name}: *${desc}*\nFor a job in ${job.data.suburb} (${q.km} km from your shop).\n\nQuote your price here within ${P.replyMinutes} minutes:\n${config.baseUrl}/supplier/?t=${q.token}`);
  logEvent(job.id, "parts", `${pro.name} asked ${sups.length} verified supplier${sups.length > 1 ? "s" : ""} for: ${desc}.`);
  return { ok: true, asked: sups.length };
}

// ---------- the supplier's private quote link ----------
const quoteByToken = (t) => (t && String(t).length >= 20 ? one("SELECT * FROM part_quotes WHERE token = ?", String(t)) : null);

export function supplierView(token) {
  const q = quoteByToken(token); if (!q) return null;
  const r = one("SELECT * FROM part_requests WHERE id = ?", q.request_id), s = getSupplier(q.supplier_id);
  const suburb = one("SELECT json_extract(data,'$.suburb') sub FROM jobs WHERE id = ?", r.job_id)?.sub;
  const open = r.status === "open" && Date.now() < r.closes_at && ["invited", "quoted"].includes(q.status) && s.status === "verified";
  return {
    shop: s.shop, part: r.description, trade: serviceById(r.trade)?.name, suburb, km: q.km, closesAt: r.closes_at, open,
    status: q.status, quote: q.price != null ? { price: q.price, condition: q.condition, warrantyDays: q.warranty_days, note: q.note, validUntil: q.valid_until } : null,
    conditions: CONDITIONS, priceValidHours: P.priceValidHours,
  };
}

export function supplierRespond(token, b) {
  const q = quoteByToken(token); if (!q) return { error: "This link isn't valid." };
  const v = supplierView(token); if (!v.open) return { error: "This request has closed." };
  if (b.action === "decline") {
    run("UPDATE part_quotes SET status = 'declined', quoted_at = ? WHERE id = ?", Date.now(), q.id);
    logEvent(one("SELECT job_id FROM part_requests WHERE id = ?", q.request_id).job_id, "parts", `${v.shop} doesn't have the part.`);
    return { ok: true };
  }
  const price = r2(Number(b.price)), warranty = Math.round(Number(b.warrantyDays || 0));
  if (!(price > 0) || price > 5000) return { error: "Enter your price in US dollars." };
  if (!CONDITIONS[b.condition]) return { error: "Choose the part's condition." };
  if (!(warranty >= 0) || warranty > 730) return { error: "Warranty must be between 0 and 730 days." };
  const now = Date.now();
  run("UPDATE part_quotes SET price = ?, condition = ?, warranty_days = ?, note = ?, valid_until = ?, status = 'quoted', quoted_at = ? WHERE id = ?",
    price, b.condition, warranty, String(b.note || "").slice(0, 200), now + P.priceValidHours * 3600e3, now, q.id);
  logEvent(one("SELECT job_id FROM part_requests WHERE id = ?", q.request_id).job_id, "parts", `${v.shop} quoted ${usd(price)} (${CONDITIONS[b.condition].toLowerCase()}, ${warranty} days warranty).`);
  return { ok: true };
}

// ---------- what the pro sees ----------
// Quotes that are still valid, nearest shop first.
export function liveQuotes(requestId) {
  return all("SELECT q.*, s.shop, s.suburb FROM part_quotes q JOIN suppliers s ON s.id = q.supplier_id WHERE q.request_id = ? AND q.status = 'quoted' AND q.valid_until > ? AND s.status = 'verified' ORDER BY q.km, q.price", requestId, Date.now());
}
export const optionView = (q) => ({ quoteId: q.id, shop: q.shop, suburb: q.suburb, km: q.km, price: q.price, condition: q.condition, conditionName: CONDITIONS[q.condition], warrantyDays: q.warranty_days, note: q.note || "", validUntil: q.valid_until });

export function partsForPro(job) {
  const r = latestRequestForJob(job.id); if (!r) return null;
  const counts = Object.fromEntries(all("SELECT status, COUNT(*) n FROM part_quotes WHERE request_id = ? GROUP BY status", r.id).map((x) => [x.status, x.n]));
  return { id: r.id, part: r.description, status: r.status, closesAt: r.closes_at, asked: Object.values(counts).reduce((a, n) => a + n, 0),
    waiting: counts.invited || 0, declined: counts.declined || 0, options: liveQuotes(r.id).map(optionView) };
}

// The pro picks which quotes go to the customer (default: the nearest 3). Returns the options, nearest first.
export function pickOptions(job, quoteIds) {
  const r = latestRequestForJob(job.id); if (!r) return { error: "No part request for this job." };
  const live = liveQuotes(r.id);
  const ids = (Array.isArray(quoteIds) ? quoteIds : []).map(Number);
  const chosen = ids.length ? live.filter((q) => ids.includes(q.id)) : live.slice(0, P.maxOptions);
  if (ids.length && chosen.length !== ids.length) return { error: "One of those prices has expired or been withdrawn. Refresh and pick again." };
  if (!chosen.length) return { error: "No supplier prices yet." };
  if (chosen.length > P.maxOptions) return { error: `Pick up to ${P.maxOptions} options.` };
  return { request: r, options: chosen.map(optionView) };
}

// Mark quotes once the pro has sent them to the customer.
export function markOffered(requestId, quoteIds) {
  tx(() => {
    run("UPDATE part_requests SET status = 'sent' WHERE id = ?", requestId);
    for (const id of quoteIds) run("UPDATE part_quotes SET status = 'offered' WHERE id = ?", id);
    run("UPDATE part_quotes SET status = 'expired' WHERE request_id = ? AND status = 'invited'", requestId);
  });
}

// The customer chose (or postponed). Tell each supplier where they stand.
export async function settleQuotes(requestId, chosenQuoteId, job, pro) {
  const rows = all("SELECT q.*, s.phone, s.shop, s.name FROM part_quotes q JOIN suppliers s ON s.id = q.supplier_id WHERE q.request_id = ? AND q.status IN ('offered','quoted')", requestId);
  const r = one("SELECT * FROM part_requests WHERE id = ?", requestId);
  tx(() => {
    run("UPDATE part_requests SET status = 'closed' WHERE id = ?", requestId);
    for (const q of rows) run("UPDATE part_quotes SET status = ? WHERE id = ?", q.id === chosenQuoteId ? "chosen" : "not_chosen", q.id);
  });
  for (const q of rows) {
    if (q.id === chosenQuoteId) await wa.text(q.phone, `✅ *Your price was chosen.*\nPart: ${r.description}, ${usd(q.price)}.\nBasa pro *${pro.name.split(" ")[0]}* will collect it with order code *P-${q.id}* and pays you directly on collection.`);
    else if (q.status === "offered") await wa.text(q.phone, chosenQuoteId ? `Thanks for quoting on "${r.description}". The customer chose another option this time.` : `Thanks for quoting on "${r.description}". The customer has postponed the repair.`);
  }
}

export function markCollected(quoteId) { run("UPDATE part_quotes SET status = 'collected' WHERE id = ? AND status = 'chosen'", quoteId); }

// Requests whose reply window has passed: suppliers who didn't answer are marked, the request stays visible to the pro.
export function sweepParts(now = Date.now()) {
  for (const r of all("SELECT id, job_id FROM part_requests WHERE status = 'open' AND closes_at < ?", now)) {
    const quoted = one("SELECT COUNT(*) n FROM part_quotes WHERE request_id = ? AND status = 'quoted'", r.id).n;
    tx(() => { run("UPDATE part_quotes SET status = 'expired' WHERE request_id = ? AND status = 'invited'", r.id); run("UPDATE part_requests SET status = 'closed' WHERE id = ?", r.id); });
    logEvent(r.job_id, "parts", quoted ? `Part request closed with ${quoted} price${quoted > 1 ? "s" : ""}.` : "Part request closed: no supplier replied.");
  }
}

// What the ops desk shows.
// testLinks: only while WhatsApp is simulated, so the team can answer as a supplier from the ops desk.
export function partsOverview({ testLinks = false } = {}) {
  const requests = all("SELECT * FROM part_requests ORDER BY id DESC LIMIT 50").map((r) => ({ ...r, trade: serviceById(r.trade)?.name,
    quotes: all("SELECT q.id, q.status, q.price, q.condition, q.warranty_days, q.km, q.token, s.shop, s.suburb FROM part_quotes q JOIN suppliers s ON s.id = q.supplier_id WHERE q.request_id = ? ORDER BY q.km", r.id)
      .map(({ token, ...q }) => (testLinks ? { ...q, link: `/supplier/?t=${token}` } : q)) }));
  return { suppliers: listSuppliers(), requests, checks: P.supplierChecks.map((c) => ({ id: c, name: CHECK_NAME[c] })) };
}
