// EcoCash payments in three modes:
//  sim    – confirms itself after a short delay (testing only)
//  manual – the customer pays the Basa seBasa merchant code; the Harare admin confirms it on the ops desk
//  paynow – an EcoCash prompt is pushed to the customer's phone through Paynow; we poll for the result
import { createHash } from "node:crypto";
import { config } from "./config.js";
import { run, one, all, logEvent } from "./db.js";
import { usd } from "./rules.js";

let onPaid = () => {}, onFailed = () => {};
export function setPaidHandler(fn) { onPaid = fn; }
export function setFailedHandler(fn) { onFailed = fn; }

// A payment that didn't go through (declined, cancelled, not enough balance). The customer is told and can try again.
export function markFailed(id, reason) {
  const p = one("SELECT * FROM payments WHERE id = ?", id);
  if (!p || p.status !== "pending") return false;
  run("UPDATE payments SET status = 'failed', note = ?, updated_at = ? WHERE id = ?", String(reason).slice(0, 200), Date.now(), id);
  logEvent(p.job_id, "pay", `EcoCash ${p.kind} ${usd(p.amount)} didn't go through (${reason}).`);
  onFailed({ ...p, status: "failed", reason });
  return true;
}

const PAYNOW_INIT = "https://www.paynow.co.zw/interface/remotetransaction";

// Paynow signs every message: SHA-512 of all values in order, followed by the integration key, upper-case hex.
export function paynowHash(fields, key) {
  const s = Object.entries(fields).filter(([k]) => k.toLowerCase() !== "hash").map(([, v]) => String(v ?? "")).join("") + key;
  return createHash("sha512").update(s, "utf8").digest("hex").toUpperCase();
}
const toForm = (o) => new URLSearchParams(Object.entries(o).map(([k, v]) => [k, String(v ?? "")])).toString();
const fromForm = (s) => Object.fromEntries(new URLSearchParams(s));
const localPhone = (p) => String(p).replace(/^\+?263/, "0"); // 2637xxxxxxxx -> 07xxxxxxxx

// Ask for a payment. Returns { id, instructions } – what to tell the customer.
export async function requestPayment(job, kind, amount, customerPhone) {
  // Never two open requests of the same kind for a job (stops double-charging on repeated taps).
  const open = one("SELECT * FROM payments WHERE job_id = ? AND kind = ? AND status IN ('pending','paid')", job.id, kind);
  if (open) return { id: open.id, duplicate: true, paid: open.status === "paid", instructions: null };
  const now = Date.now(), mode = config.payments.mode;
  const ref = `${job.id}-${kind}`.toUpperCase();
  const info = run("INSERT INTO payments (job_id, kind, amount, status, provider, ref, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)", job.id, kind, amount, "pending", mode, ref, now, now);
  const id = Number(info.lastInsertRowid);
  logEvent(job.id, "pay", `Payment requested: ${kind} ${usd(amount)} via ${mode}.`);

  if (mode === "sim") {
    // The simulated customer approves the prompt, unless the booking was cancelled meanwhile.
    setTimeout(() => { if (one("SELECT status FROM payments WHERE id = ?", id)?.status === "pending") markPaid(id, `SIM${String(Date.now()).slice(-6)}`, "sim"); }, config.payments.simDelayMs).unref();
    return { id, instructions: `An EcoCash prompt for *${usd(amount)}* is on your phone (simulated). Enter your PIN to approve.` };
  }
  if (mode === "manual") {
    return { id, instructions: `Please pay *${usd(amount)}* with EcoCash to merchant code *${config.payments.merchantCode}* (${config.payments.merchantName}).\nUse reference *${ref}*.\nWe'll confirm here as soon as it lands.` };
  }
  // Paynow express checkout (EcoCash).
  const f = {
    id: config.payments.paynowId, reference: ref, amount: amount.toFixed(2), additionalinfo: `Basa seBasa ${kind}`,
    returnurl: `${config.baseUrl}/`, resulturl: `${config.baseUrl}/payments/paynow/result`, authemail: config.payments.paynowAuthEmail,
    phone: localPhone(customerPhone), method: "ecocash", status: "Message",
  };
  f.hash = paynowHash(f, config.payments.paynowKey);
  try {
    const res = await fetch(PAYNOW_INIT, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: toForm(f) });
    const r = fromForm(await res.text());
    if (String(r.status).toLowerCase() !== "ok") throw new Error(r.error || r.status || "Paynow refused the request");
    if (r.hash && paynowHash(r, config.payments.paynowKey) !== r.hash) throw new Error("Paynow reply failed the hash check");
    run("UPDATE payments SET poll_url = ?, note = ?, updated_at = ? WHERE id = ?", r.pollurl, r.paynowreference || "", Date.now(), id);
    return { id, instructions: `An EcoCash prompt for *${usd(amount)}* has been sent to your phone. Enter your PIN to approve it.` };
  } catch (e) {
    run("UPDATE payments SET status = 'failed', note = ?, updated_at = ? WHERE id = ?", String(e.message || e), Date.now(), id);
    logEvent(job.id, "pay", `Paynow error: ${e.message || e}`);
    return { id, failed: true, instructions: `We couldn't send the EcoCash prompt just now. Please pay *${usd(amount)}* to merchant code *${config.payments.merchantCode}* with reference *${ref}*, and we'll confirm it.` };
  }
}

// Mark a payment as paid exactly once, then let the job move on.
export function markPaid(id, ref, by = "system") {
  const p = one("SELECT * FROM payments WHERE id = ?", id);
  if (!p || p.status === "paid") return false;
  if (p.status === "cancelled") {
    // Money arrived for a booking that was already cancelled (e.g. the customer approved the EcoCash prompt
    // after cancelling). Record it truthfully and put it in front of the admin as a refund; the job stays cancelled.
    run("UPDATE payments SET status = 'paid', ref = ?, note = COALESCE(note,'') || ?, updated_at = ? WHERE id = ?", ref || p.ref, ` arrived after cancellation; refund due (${by})`, Date.now(), id);
    logEvent(p.job_id, "pay", `EcoCash ${p.kind} ${usd(p.amount)} arrived after the booking was cancelled (ref ${ref || p.ref}). Refund due.`);
    run("INSERT INTO alerts (job_id, kind, note, at) VALUES (?,?,?,?)", p.job_id, "payment", `Refund due: ${usd(p.amount)} paid after cancellation`, Date.now());
    return true;
  }
  run("UPDATE payments SET status = 'paid', ref = ?, note = COALESCE(note,'') || ?, updated_at = ? WHERE id = ?", ref || p.ref, ` confirmed by ${by}`, Date.now(), id);
  logEvent(p.job_id, "pay", `EcoCash ${p.kind} ${usd(p.amount)} confirmed (ref ${ref || p.ref}) by ${by}.`);
  onPaid({ ...p, status: "paid", ref: ref || p.ref });
  return true;
}

// Paynow result callback (Paynow posts here when the status changes).
export function handlePaynowResult(form) {
  const f = typeof form === "string" ? fromForm(form) : form;
  if (!f.hash || paynowHash(f, config.payments.paynowKey) !== f.hash) return false;
  const p = one("SELECT * FROM payments WHERE ref = ? AND status = 'pending'", f.reference);
  if (!p) return true;
  const st = String(f.status || "").toLowerCase();
  if (st === "paid" || st === "awaiting delivery" || st === "delivered") markPaid(p.id, f.paynowreference || f.reference, "paynow");
  if (st === "cancelled" || st === "failed") markFailed(p.id, `Paynow: ${f.status}`);
  return true;
}

// Poll Paynow for pending payments (backup for a missed callback).
export async function pollPending() {
  if (config.payments.mode !== "paynow") return;
  for (const p of all("SELECT * FROM payments WHERE status = 'pending' AND poll_url IS NOT NULL AND created_at > ?", Date.now() - 30 * 60e3)) {
    try { const r = await fetch(p.poll_url, { method: "POST" }); handlePaynowResult(await r.text()); } catch { /* try again next sweep */ }
  }
}
