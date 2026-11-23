// The job lifecycle: matching, payments, the visit, the quote, completion, payout, safety.
// Customer messages go out on WhatsApp; the pro sees everything in the Pro app.
import { randomInt } from "node:crypto";
import { one, all, run, getJob, saveJob, insertJob, getPro, savePro, logEvent, tx, metaGet, metaSet, backupTo, dbPath } from "./db.js";
import { withLock } from "./lock.js";
import { markPaid, setFailedHandler } from "./payments.js";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join as pjoin } from "node:path";
import { wa } from "./whatsapp.js";
import { RULES, money, usd, r2, serviceById } from "./rules.js";
import { roadKm, SUBURBS } from "./places.js";
import { requestPayment, setPaidHandler } from "./payments.js";
import { scrub } from "./scrub.js";
import { raiseAlert, checkPin, closeAlert, URGENT } from "./safety.js";
import { config } from "./config.js";
import { probationJobDone } from "./onboarding.js";
import * as PARTS from "./parts.js";
import { applyTrust, addTrustEvent, trustOf } from "./trust.js";

export const ACTIVE = ["searching", "offered", "await_confirm", "await_callout", "ready", "travelling", "arrived", "diagnosing", "quote_sent", "working", "confirm", "await_final"];
export const ONSITE = ["arrived", "diagnosing", "quote_sent", "working", "confirm", "await_final"];
export const CLOSED = ["paid", "cancelled", "deferred", "noshow"];
const first = (name) => String(name || "").split(" ")[0];

export const STAGE_LABEL = {
  searching: "Looking for a pro", offered: "Offered to a pro", await_confirm: "Waiting for the customer to confirm", await_callout: "Waiting for the call-out payment", ready: "Confirmed: pro getting ready",
  travelling: "Pro on the way", arrived: "Pro at the gate", diagnosing: "Pro diagnosing", quote_sent: "Quote with the customer", working: "Work in progress",
  confirm: "Customer checking the work", await_final: "Waiting for the final payment", paid: "Paid and closed", cancelled: "Cancelled",
  deferred: "Repair saved for later", noshow: "Closed: customer not home",
};

function newJobId() {
  for (;;) { const id = "BSB-" + randomInt(1000, 10000); if (!one("SELECT id FROM jobs WHERE id = ?", id)) return id; }
}
export const jobMoney = (job) => money({ travel: job.data.travel ?? 0, labour: job.data.quote?.labour || 0, parts: job.data.quote?.parts || 0 });
export function activeJobForCustomer(phone) { const j = one(`SELECT id FROM jobs WHERE customer = ? AND stage IN (${ACTIVE.map(() => "?").join(",")}) ORDER BY created_at DESC`, phone, ...ACTIVE); return j ? getJob(j.id) : null; }
export function currentJobForPro(proId) {
  const j = one(`SELECT id FROM jobs WHERE pro_id = ? AND stage IN (${ACTIVE.filter((s) => s !== "offered").map(() => "?").join(",")}) ORDER BY created_at DESC`, proId, ...ACTIVE.filter((s) => s !== "offered"));
  return j ? getJob(j.id) : null;
}
// A finished job stays on the pro's screen until they check out safely.
export function unfinishedCheckout(proId) {
  const j = one("SELECT id FROM jobs WHERE pro_id = ? AND stage IN ('paid','noshow','cancelled','deferred') AND json_extract(data,'$.safety.tracking') = 1 ORDER BY updated_at DESC", proId);
  return j ? getJob(j.id) : null;
}
export function offerForPro(proId) { const j = one("SELECT id FROM jobs WHERE stage = 'offered' AND json_extract(data,'$.offer.pro') = ?", proId); return j ? getJob(j.id) : null; }

// ---------- booking and matching ----------
export async function createJob(customer, d) {
  const job = insertJob({ id: newJobId(), customer, service: d.service, stage: "searching", data: {
    desc: d.desc || "", media: d.media || null, suburb: d.suburb, lat: d.lat, lng: d.lng, landmark: d.landmark || "", when: d.when || "As soon as possible",
    declined: [], preferred: d.preferred || null, thread: [], safety: {}, codeTries: 0,
  } });
  logEvent(job.id, "server", `New booking: ${serviceById(d.service)?.name} in ${d.suburb}. "${d.desc || ""}"`);
  await offerNext(job);
  return getJob(job.id);
}

function candidates(job) {
  const busy = new Set(all(`SELECT pro_id FROM jobs WHERE stage IN (${ACTIVE.map(() => "?").join(",")}) AND pro_id IS NOT NULL`, ...ACTIVE).map((r) => r.pro_id));
  for (const r of all("SELECT data FROM jobs WHERE stage = 'offered'")) { const o = JSON.parse(r.data).offer; if (o) busy.add(o.pro); }
  return all("SELECT * FROM pros WHERE status = 'verified' AND online = 1 AND trade = ?", job.service)
    .map((p) => ({ ...p, data: JSON.parse(p.data || "{}") }))
    .filter((p) => !busy.has(p.id) && !job.data.declined.includes(p.id) && !unfinishedCheckout(p.id))
    .map((p) => ({ p, km: roadKm(p.lat, p.lng, job.data.lat, job.data.lng) }))
    .sort((a, b) => (b.p.name === job.data.preferred) - (a.p.name === job.data.preferred) || (a.km - b.p.trust / 10) - (b.km - a.p.trust / 10));
}

export async function offerNext(job) {
  const c = candidates(job)[0];
  if (!c) {
    if (job.stage !== "searching") { job.stage = "searching"; }
    job.data.offer = null;
    if (!job.data.searchingSince) {
      job.data.searchingSince = Date.now();
      await wa.text(job.customer, `We're finding the right verified ${serviceById(job.service).name.toLowerCase()} pro for you. We'll message you here as soon as one accepts.`);
    }
    saveJob(job);
    if (Date.now() - job.data.searchingSince > 3 * 60e3) raiseAlert(job.id, null, "unmatched", `${serviceById(job.service).name} in ${job.data.suburb}`);
    return null;
  }
  job.stage = "offered";
  job.data.offer = { pro: c.p.id, km: c.km, expires: Date.now() + RULES.offerSeconds * 1000 };
  saveJob(job);
  logEvent(job.id, "server", `Offered to ${c.p.name} (${c.km} km away, trust ${c.p.trust}). ${RULES.offerSeconds} s to accept.`);
  // The Pro app shows the offer straight away; a WhatsApp nudge helps if the app is in the background.
  await wa.text(c.p.phone, `New Basa seBasa job: ${serviceById(job.service).name} in ${job.data.suburb}, ${c.km} km away. Open your Pro app to accept within ${RULES.offerSeconds} seconds: ${config.baseUrl}/pro`);
  return c.p;
}

// Harare date, e.g. "Tue 22 Dec".
export const hDate = (t) => new Date(t + 2 * 3600e3).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
export const savedUntil = (job) => job.data.deferredAt + RULES.diagnosisValidDays * 864e5;
export function savedRepairFor(phone) {
  const r = one("SELECT id FROM jobs WHERE customer = ? AND stage = 'deferred' AND json_extract(data,'$.expired') IS NULL ORDER BY updated_at DESC", phone);
  const job = r && getJob(r.id); return job && Date.now() < savedUntil(job) ? job : null;
}

// The customer goes ahead with a saved repair: no new call-out, the quote they saw is the price,
// and the pro who diagnosed it gets first refusal.
export async function customerResume(job, when) {
  if (job.stage !== "deferred" || job.data.expired || Date.now() > savedUntil(job)) return { error: "expired" };
  const first0 = job.data.firstPro || job.pro_id, orig = getPro(first0);
  job.data.firstPro = first0; job.data.resumed = { at: Date.now(), when }; job.data.when = when; job.data.declined = [];
  job.data.quote.approvedAt = Date.now(); job.pro_id = null;
  const busy = orig && currentJobForPro(orig.id);
  if (orig && orig.status === "verified" && !busy) {
    job.stage = "offered"; job.data.offer = { pro: orig.id, km: job.data.km, expires: Date.now() + RULES.firstRefusalHours * 3600e3, firstRefusal: true };
    saveJob(job);
    logEvent(job.id, "wa", `Customer is going ahead with the saved repair (${when}). ${orig.name} has first refusal for ${RULES.firstRefusalHours} h.`);
    await wa.text(job.customer, `Great! We've asked *${first(orig.name)}* first, because they diagnosed it. We'll confirm here as soon as they accept.
If they can't make it, we'll send another verified pro at the same price.`);
    await wa.text(orig.phone, `Basa seBasa: the customer in ${job.data.suburb} wants to go ahead with the repair you diagnosed (${job.id}). You have first refusal for ${RULES.firstRefusalHours} hours. Open your Pro app: ${config.baseUrl}/pro`);
  } else {
    job.stage = "searching"; saveJob(job);
    logEvent(job.id, "wa", `Customer is going ahead with the saved repair (${when}). The original pro isn't available, so offering other pros.`);
    await wa.text(job.customer, `Great! We're finding a verified pro for your saved repair. The price stays as quoted.`);
    await offerNext(getJob(job.id));
  }
  return { ok: true };
}

export async function proAccept(pro, jobId) {
  const job = getJob(jobId);
  if (!job || job.stage !== "offered" || job.data.offer?.pro !== pro.id) return { error: "This offer is no longer open." };
  const km = job.data.offer.km;
  if (job.data.resumed) {
    // Saved repair: the call-out was paid at the first visit, so the pro just gets ready.
    job.pro_id = pro.id; job.stage = "ready";
    job.data.pro = { id: pro.id, name: pro.name, trust: pro.trust, rating: pro.rating_n ? r2(pro.rating_sum / pro.rating_n) : null, jobs: pro.jobs_done, home: pro.suburb };
    job.data.offer = null; job.data.searchingSince = null; job.data.safety = {}; job.data.codeTries = 0; saveJob(job);
    logEvent(job.id, "app", `${pro.name} accepted the saved repair${pro.id === job.data.firstPro ? " (first refusal)" : ""}.`);
    if (pro.id !== job.data.firstPro && pro.data?.photo) await wa.image(job.customer, `${config.baseUrl}/media/pro/${pro.id}`, `${pro.name}, your Basa pro`);
    await wa.text(job.customer, `✅ *${pro.name}* accepted your saved repair (${job.data.when}).
No call-out to pay: your first visit covers it. You'll get a new Basa Code when ${first(pro.name)} sets off.`);
    return { ok: true };
  }
  // No payment before the visit; the customer confirms the booking and the inspection-and-travel cost first (founder, 23 Nov 2026).
  job.pro_id = pro.id; job.stage = "await_confirm"; job.data.confirmBy = Date.now() + RULES.confirmMinutes * 60e3;
  job.data.km = km; job.data.travel = r2(Math.max(0, km - RULES.freeKm) * RULES.perKm); // frozen once accepted
  job.data.pro = { id: pro.id, name: pro.name, trust: pro.trust, rating: pro.rating_n ? r2(pro.rating_sum / pro.rating_n) : null, jobs: pro.jobs_done, home: pro.suburb };
  job.data.offer = null; job.data.searchingSince = null;
  saveJob(job);
  logEvent(job.id, "app", `${pro.name} accepted. Waiting for the customer to confirm the booking and the ${usd(jobMoney(job).pay1)} inspection and travel.`);
  if (pro.data?.photo) await wa.image(job.customer, `${config.baseUrl}/media/pro/${pro.id}`, `${pro.name}, your Basa pro`);
  await sendBookingConfirm(job, pro);
  return { ok: true };
}

// The customer sees the pro and the exact inspection-and-travel cost, and confirms before the pro sets off.
async function sendBookingConfirm(job, pro) {
  const m = jobMoney(job), km = job.data.km;
  const travel = job.data.travel > 0 ? `\nThis includes ${usd(m.pay1 - RULES.callout - RULES.calloutCharges)} extra travel (${km} km away; the first ${RULES.freeKm} km are free).` : "";
  await wa.buttons(job.customer, `✅ *${pro.name}* can come: ${job.data.when}.\nTrust Score ${pro.trust}${job.data.pro.rating ? ` · ★${job.data.pro.rating}` : ""} · ID and trade checked in person by Basa seBasa.\n\n*Inspection and travel: ${usd(m.pay1)}* (EcoCash charges included).${travel}\n\n• Nothing to pay now: you pay at the end on EcoCash, together with any repair.\n• ${first(pro.name)} will show you a full quote and the total before any work starts. You approve or decline.\n• If you decline the repair, or you're not home when ${first(pro.name)} arrives, only the ${usd(m.pay1)} is payable.\n\nDo you confirm this booking?`, [{ id: "book:yes", title: "Confirm booking" }, { id: "book:no", title: "Cancel" }]);
}

export async function customerConfirmBooking(job) {
  if (job.stage !== "await_confirm") return;
  const pro = getPro(job.pro_id);
  job.stage = "ready"; job.data.bookingConfirmedAt = Date.now(); delete job.data.confirmBy; saveJob(job);
  logEvent(job.id, "wa", `Customer confirmed the booking and the ${usd(jobMoney(job).pay1)} inspection and travel.`);
  await wa.text(job.customer, `Booked ✓ ${first(pro.name)} will let you know when they set off. You'll get your *Basa Code* then.`);
  await wa.text(pro.phone, `Basa seBasa: the customer confirmed ${job.id}. Open your Pro app when you're ready to set off.`);
  return { ok: true };
}

export async function proDecline(pro, jobId, reason = "declined") {
  const job = getJob(jobId);
  if (!job || job.stage !== "offered" || job.data.offer?.pro !== pro.id) return { error: "This offer is no longer open." };
  job.data.declined.push(pro.id); job.data.offer = null; saveJob(job);
  logEvent(job.id, "app", `${pro.name} ${reason === "expired" ? "didn't answer in time" : "declined"}. Offering the next pro.`);
  await offerNext(job);
  return { ok: true };
}

// Trust Score: worked out from the pro's record (milestones minus recent penalties); tell the pro when it changes level.
export async function updateTrust(proId, jobId = null) {
  const pro = getPro(proId); if (!pro || pro.status !== "verified") return;
  const ch = applyTrust(pro); savePro(pro);
  if (ch.before.score === ch.after.score) return;
  logEvent(jobId, "trust", `${pro.name}: Trust Score ${ch.before.score} → ${ch.after.score}${ch.before.level !== ch.after.level ? `, level ${ch.before.level} → ${ch.after.level}` : ""}.`);
  if (ch.after.score > ch.before.score && ch.before.level !== ch.after.level) {
    const nx = trustOf(pro).next;
    await wa.text(pro.phone, `🎉 Well done ${first(pro.name)}! You've reached *${ch.after.level}* on Basa seBasa. Your Trust Score is now *${ch.after.score}*, and customers see it before they book you.${nx ? `\nNext: ${nx.level} (${nx.score}) at ${nx.what.toLowerCase()}.` : ""}`);
  }
}

// ---------- what the customer owes ----------
export const calloutPaid = (job) => !!one("SELECT id FROM payments WHERE job_id = ? AND kind = 'callout' AND status = 'paid'", job.id);
// At the end: the repair, plus the call-out if it hasn't been paid (it usually hasn't: it's paid at the end).
export function finalAmount(job) { const m = jobMoney(job); return r2(m.pay2 + (calloutPaid(job) ? 0 : m.pay1)); }
// A call-out still owed for a visit that ended without a repair (saved for later, not home, cancelled on the way).
export function owedCallout(phone) {
  return one(`SELECT p.*, j.stage FROM payments p JOIN jobs j ON j.id = p.job_id WHERE j.customer = ? AND p.kind = 'callout' AND p.status IN ('pending','failed')
    AND j.stage IN ('deferred','noshow','cancelled') AND NOT EXISTS (SELECT 1 FROM payments x WHERE x.job_id = p.job_id AND x.kind = 'callout' AND x.status = 'paid') ORDER BY p.id DESC`, phone) || null;
}
export async function payOwedCallout(phone) {
  const o = owedCallout(phone); if (!o) return false;
  const job = getJob(o.job_id);
  if (o.status === "pending") run("UPDATE payments SET status = 'failed', note = COALESCE(note,'') || ' replaced by a new request', updated_at = ? WHERE id = ?", Date.now(), o.id);
  const pay = await requestPayment(job, "callout", o.amount, phone);
  await wa.text(phone, `Inspection and travel for ${job.id}: *${usd(o.amount)}*.\n\n${pay.instructions}`);
  return true;
}

// ---------- payments arriving ----------
setPaidHandler((p) => withLock("job:" + p.job_id, async () => {
  const job = getJob(p.job_id); if (!job) return;
  const pro = job.pro_id ? getPro(job.pro_id) : null;
  if (p.kind === "callout" && ["deferred", "noshow", "cancelled"].includes(job.stage) && pro) {
    // The call-out for a visit with no repair (saved for later, not home, cancelled on the way): now the pro's share is owed.
    if (!job.data.calloutPayoutDone) tx(() => { // once only, even if the customer paid twice
      job.data.calloutPayoutDone = true; job.data.calloutPaidAt = Date.now(); saveJob(job);
      run("INSERT INTO payouts (job_id, pro_id, amount, due_at) VALUES (?,?,?,?)", job.id, pro.id, jobMoney(job).calloutShare, Date.now() + RULES.payoutHours * 3600e3);
      logEvent(job.id, "pay", `Call-out paid. Payout of ${usd(jobMoney(job).calloutShare)} to ${pro.name} due within ${RULES.payoutHours} h.`); });
    await wa.text(job.customer, `Payment received: *${usd(p.amount)}*, ref ${p.ref}. Thank you!`);
    return;
  }
  if (p.kind === "callout" && job.stage === "await_callout") {
    job.stage = "ready"; job.data.calloutPaidAt = Date.now(); saveJob(job);
    await wa.text(job.customer, `Payment received: *${usd(p.amount)}*, ref ${p.ref}. Thank you.\n\n${first(pro.name)} is getting ready and will let you know when they set off. You'll get your *Basa Code* then.`);
  }
  if (p.kind === "final" && job.stage === "await_final") {
    const m = jobMoney(job);
    // A saved repair: the pro who diagnosed it already got the call-out share at the first visit.
    // Another pro finishing it gets the call-out share too, paid by Basa (provisional, to confirm).
    const amount = job.data.resumed && job.pro_id === job.data.firstPro ? r2(m.payout - m.calloutShare) : m.payout;
    // Job closed, payout owed and pro's record updated together, or not at all.
    tx(() => {
      job.stage = "paid"; job.data.paidAt = Date.now();
      if (pro.data?.probation?.left > 0) job.data.probation = true;
      saveJob(job);
      if (job.data.resumed && job.pro_id !== job.data.firstPro) logEvent(job.id, "rule", `Provisional: Basa covers the ${usd(m.calloutShare)} call-out share for ${pro.name}, who finished a repair another pro diagnosed.`);
      run("INSERT INTO payouts (job_id, pro_id, amount, due_at) VALUES (?,?,?,?)", job.id, job.pro_id, amount, Date.now() + RULES.payoutHours * 3600e3);
      pro.jobs_done += 1; applyTrust(pro); savePro(pro);
      if (job.data.probation) probationJobDone(pro.id, job.id);
      logEvent(job.id, "pay", `Payout of ${usd(amount)} to ${pro.name} due within ${RULES.payoutHours} h. Basa keeps ${usd(m.platform)}.`);
    });
    await wa.text(job.customer, `Payment received: *${usd(p.amount)}*, ref ${p.ref}. Thank you!\n\n*Receipt ${job.id}*\nInspection and travel: ${usd(m.pay1)}\nLabour: ${usd(m.labour)}\nParts: ${usd(m.parts)}\nEcoCash charges: ${usd(m.charges2)}\nTotal paid: *${usd(m.pay1 + m.pay2)}*`);
    await wa.list(job.customer, `How did ${first(pro.name)} do? Your rating helps keep Basa seBasa trusted.`, "Rate the job", [5, 4, 3, 2, 1].map((n) => ({ id: `rate:${n}`, title: "★".repeat(n), description: ["", "Poor", "Not great", "OK", "Good", "Excellent"][n] })));
  }
}));

setFailedHandler((p) => withLock("job:" + p.job_id, async () => {
  const job = getJob(p.job_id); if (!job) return;
  const owed = p.kind === "callout" && ["deferred", "noshow", "cancelled"].includes(job.stage);
  if (!owed && !["await_callout", "await_final"].includes(job.stage)) return;
  await wa.buttons(job.customer, `Your EcoCash payment of *${usd(p.amount)}* didn't go through. Please check you have enough balance, then tap *Try again*. Nothing has been taken.`, [{ id: owed ? "pay:due" : "pay:retry", title: "Try again" }, { id: "help", title: "Talk to us" }]);
}));

// The customer tries a failed payment again (only the payment this job is waiting for).
export async function customerRetryPayment(job) {
  const kind = job.stage === "await_callout" ? "callout" : job.stage === "await_final" ? "final" : null;
  if (!kind) return;
  const m = jobMoney(job), amount = kind === "callout" ? m.pay1 : finalAmount(job);
  const pay = await requestPayment(job, kind, amount, job.customer);
  if (pay.duplicate) return wa.text(job.customer, pay.paid ? "That payment has already been received. Thank you!" : "Your payment request is still open. Please approve the EcoCash prompt on your phone.");
  await wa.text(job.customer, pay.instructions);
}

// ---------- the visit ----------
const proOwns = (pro, job) => job && job.pro_id === pro.id;

export async function proTrip(pro, jobId) {
  const job = getJob(jobId); if (!proOwns(pro, job) || job.stage !== "ready") return { error: "Not ready to travel." };
  job.stage = "travelling"; job.data.code = String(randomInt(1000, 10000)); job.data.setOffAt = Date.now();
  job.data.safety = { tracking: 1, since: Date.now() };
  saveJob(job);
  const eta = Math.max(10, Math.round((job.data.km || 5) * 2.5));
  logEvent(job.id, "app", `${pro.name} set off. Basa Code created. Location sharing on.`);
  await wa.text(job.customer, `🚗 *${first(pro.name)} is on the way*, about ${eta} minutes.\n\nYour Basa Code is *${job.data.code}*.\nOnly give it to ${first(pro.name)} at your gate, after checking it's the right person. Never share it over the phone.`);
  return { ok: true };
}

export async function proArrive(pro, jobId) {
  const job = getJob(jobId); if (!proOwns(pro, job) || job.stage !== "travelling") return { error: "Not on the way." };
  job.stage = "arrived"; job.data.arrivedAt = Date.now(); saveJob(job);
  logEvent(job.id, "app", `${pro.name} arrived at the gate.`);
  await wa.text(job.customer, `📍 *${first(pro.name)} is at your gate.*\nCheck it's the right person (name and photo in this chat), then give them your Basa Code.`);
  return { ok: true };
}

export async function proVerify(pro, jobId, code) {
  const job = getJob(jobId); if (!proOwns(pro, job) || job.stage !== "arrived") return { error: "Not at the gate." };
  if (String(code).trim() !== job.data.code) {
    job.data.codeTries = (job.data.codeTries || 0) + 1; saveJob(job);
    logEvent(job.id, "trust", `Wrong Basa Code entered (${job.data.codeTries}/3).`);
    if (job.data.codeTries >= 3) { raiseAlert(job.id, pro.id, "code"); await wa.text(job.customer, `The code ${first(pro.name)} entered didn't match three times. Our Harare admin will call you now. Please don't let anyone in until then.`); }
    return { error: "That code doesn't match. Ask the customer to read it from WhatsApp." };
  }
  const resourcePart = job.data.resumed && job.data.quote?.options && !job.data.quote.chosen;
  job.stage = job.data.resumed && !resourcePart ? "working" : "diagnosing"; job.data.codeOk = Date.now();
  job.data.safety = { ...job.data.safety, visitAt: Date.now(), checkDue: Date.now() + RULES.checkinMinutes * 60e3, firstDone: false };
  saveJob(job);
  logEvent(job.id, "trust", `Basa Code confirmed at the gate. Safety check-in due in ${RULES.checkinMinutes} min.`);
  await wa.text(job.customer, resourcePart
    ? `✅ Basa Code confirmed. ${first(pro.name)} is getting today's supplier prices for the part. Labour stays at ${usd(job.data.quote.labour)} as quoted, and you'll choose the part before anything is bought.`
    : job.data.resumed
    ? `✅ Basa Code confirmed. ${first(pro.name)} is starting the repair you approved: labour ${usd(job.data.quote.labour)}, parts ${usd(job.data.quote.parts)}.`
    : `✅ Basa Code confirmed. ${first(pro.name)} is checking the problem now. You'll get a full quote before any repair starts.`);
  return { ok: true };
}

export async function proNoShow(pro, jobId) {
  const job = getJob(jobId); if (!proOwns(pro, job) || job.stage !== "arrived") return { error: "Not at the gate." };
  if (Date.now() - job.data.arrivedAt < RULES.noShowWaitMinutes * 60e3 && !job.data.testFastNoShow) return { error: `Please wait ${RULES.noShowWaitMinutes} minutes and try calling through the app first.` };
  job.stage = "noshow"; saveJob(job);
  const m = jobMoney(job);
  logEvent(job.id, "server", `Visit closed: customer not home. Call-out ${usd(m.pay1)} requested; ${pro.name}'s ${usd(m.calloutShare)} share is paid out once it's collected.`);
  const pay = await requestPayment(job, "callout", m.pay1, job.customer);
  await wa.text(job.customer, `${first(pro.name)} waited ${RULES.noShowWaitMinutes} minutes at your gate and couldn't reach you, so this visit is closed. As you confirmed when booking, the inspection and travel is payable for the trip: *${usd(m.pay1)}*.\n\n${pay.instructions}`);
  return { ok: true };
}

export async function proQuote(pro, jobId, { labour, parts, note, partOptions }) {
  const job = getJob(jobId); if (!proOwns(pro, job) || job.stage !== "diagnosing") return { error: "Not diagnosing." };
  labour = r2(Number(labour)); parts = r2(Number(parts || 0));
  // A saved repair keeps the labour price the customer was given.
  if (job.data.resumed && job.data.quote?.labour != null) labour = job.data.quote.labour;
  if (!(labour > 0) || labour > 2000 || parts < 0 || parts > 5000) return { error: "Check the labour and parts amounts." };
  note = String(note || "").slice(0, 400);
  if (Array.isArray(partOptions)) {
    // Part prices from verified suppliers: the customer chooses one.
    const pick = PARTS.pickOptions(job, partOptions); if (pick.error) return pick;
    job.data.quote = { labour, parts: 0, note, at: Date.now(), part: pick.request.description, requestId: pick.request.id, options: pick.options.map((o, i) => ({ ...o, n: i + 1 })) };
    job.stage = "quote_sent"; saveJob(job);
    PARTS.markOffered(pick.request.id, pick.options.map((o) => o.quoteId));
    logEvent(job.id, "app", `Quote sent: labour ${usd(labour)}, part "${pick.request.description}" with ${pick.options.length} supplier option${pick.options.length > 1 ? "s" : ""}.`);
    await sendOptionsQuote(job);
    return { ok: true };
  }
  job.data.quote = { labour, parts, note, at: Date.now() };
  job.stage = "quote_sent"; saveJob(job);
  const m = jobMoney(job);
  logEvent(job.id, "app", `Quote sent: labour ${usd(labour)}, parts ${usd(parts)}.`);
  const co = calloutPaid(job) ? 0 : m.pay1;
  await wa.buttons(job.customer, `*Quote for ${job.id}*\n${scrub(note).text || "Repair as diagnosed."}\n\n${co ? `Inspection and travel: ${usd(co)}\n` : ""}Labour: ${usd(labour)}\nParts: ${parts ? usd(parts) : "none needed"}\nEcoCash charges: ${usd(m.charges2)}\n*To pay after it's fixed and tested: ${usd(r2(m.pay2 + co))}*\n\nNothing starts until you approve. If you decline, only the inspection and travel (${usd(m.pay1)}) is payable for today's visit, and your quote is saved for ${RULES.diagnosisValidDays} days.`, [{ id: "quote:approve", title: "Approve quote" }, { id: "quote:later", title: "Decline for now" }]);
  return { ok: true };
}

// The total the customer pays after testing if they pick this option (part at cost, no commission on it).
// Includes the call-out when it hasn't been paid yet (it's paid at the end, with the repair).
export const optionTotal = (job, o) => { const m = money({ travel: job.data.travel ?? 0, labour: job.data.quote.labour, parts: o.price }); return r2(m.pay2 + (calloutPaid(job) ? 0 : m.pay1)); };
const optionLine = (job, o) => `*${o.n}.* ${usd(o.price)} · ${o.conditionName} · ${o.warrantyDays ? `${o.warrantyDays}-day warranty` : "no warranty"}\n    ${o.shop}, ${o.suburb} (${o.km} km)\n    Total after it's fixed and tested: *${usd(optionTotal(job, o))}*`;

async function sendOptionsQuote(job) {
  const q = job.data.quote;
  const co = calloutPaid(job) ? 0 : jobMoney(job).pay1;
  const body = `*Quote for ${job.id}*\n${scrub(q.note).text || "Repair as diagnosed."}\n\n${co ? `Inspection and travel: ${usd(co)}\n` : ""}Labour: ${usd(q.labour)}\nPart needed: *${q.part}*\n\nPrices from Basa-verified suppliers, nearest first:\n${q.options.map((o) => optionLine(job, o)).join("\n")}\n\nTotals include ${co ? "inspection, travel and " : ""}EcoCash charges. You pay only after it's fixed and tested; parts are charged at the supplier's price. Nothing is bought until you choose.`;
  await wa.list(job.customer, body, "Choose a part", [
    ...q.options.map((o) => ({ id: `quote:opt:${o.n}`, title: `Option ${o.n} · ${usd(o.price)}`, description: `${o.conditionName}, ${o.shop}, ${o.suburb} (${o.km} km)` })),
    { id: "quote:later", title: "Decline for now", description: `Pay only the ${usd(jobMoney(job).pay1)} inspection; quote saved 30 days` },
  ]);
}

export async function customerQuote(job, approve, optionN = null) {
  if (job.stage !== "quote_sent") return;
  const pro = getPro(job.pro_id), q = job.data.quote;
  if (approve && q.options && !q.chosen) {
    const o = q.options.find((x) => x.n === Number(optionN));
    if (!o) return sendOptionsQuote(job); // "approve" without a choice: show the options again
    if (o.validUntil < Date.now()) {
      job.stage = "diagnosing"; job.data.quote = { labour: q.labour, note: q.note, expiredOptions: true }; saveJob(job);
      logEvent(job.id, "parts", `Customer picked option ${o.n}, but that price had expired. Back to ${pro.name} for fresh prices.`);
      await wa.text(pro.phone, `Basa seBasa: the supplier prices for ${job.id} have expired. Please open the Pro app and ask again.`);
      return wa.text(job.customer, `Sorry, that supplier price has expired. ${first(pro.name)} is getting fresh prices now; you'll choose again before anything is bought.`);
    }
    q.parts = o.price; q.chosen = o.n; q.approvedAt = Date.now();
    job.data.part = { quoteId: o.quoteId, shop: o.shop, suburb: o.suburb, km: o.km, price: o.price, status: "to_collect", code: `P-${o.quoteId}` };
    job.stage = "working"; saveJob(job);
    const sup = one("SELECT s.phone, s.name FROM part_quotes x JOIN suppliers s ON s.id = x.supplier_id WHERE x.id = ?", o.quoteId);
    job.data.part.supplierPhone = sup?.phone || null; job.data.part.supplierName = sup?.name || null; saveJob(job);
    logEvent(job.id, "wa", `Customer chose option ${o.n}: ${o.shop}, ${o.suburb}, ${usd(o.price)}. Quote approved.`);
    await PARTS.settleQuotes(q.requestId, o.quoteId, job, pro);
    await wa.text(job.customer, `Approved ✓ Option ${o.n}: ${q.part} from ${o.shop}, ${o.suburb}, ${usd(o.price)}.\n${first(pro.name)} will collect the part and fit it. You pay *${usd(optionTotal(job, o))}* only once it's fixed and tested.`);
    return;
  }
  if (approve) {
    job.stage = "working"; job.data.quote.approvedAt = Date.now(); saveJob(job);
    logEvent(job.id, "wa", "Customer approved the quote.");
    await wa.text(job.customer, `Approved ✓. ${first(pro.name)} is starting the repair. You pay the rest only once it's fixed and tested.`);
  } else {
    // A saved repair put on hold again keeps its original 30 days, and the call-out share was already paid out.
    const again = !!job.data.resumed;
    job.stage = "deferred"; if (!again) job.data.deferredAt = Date.now();
    if (again) job.data.resumed = null; // the pro on site keeps the job until they check out; first refusal stays with data.firstPro
    saveJob(job);
    if (q.options && !q.chosen) await PARTS.settleQuotes(q.requestId, null, job, pro);
    const m = jobMoney(job);
    logEvent(job.id, "wa", `Customer chose to repair later. Diagnosis valid ${RULES.diagnosisValidDays} days; ${pro.name} gets ${RULES.firstRefusalHours} h first refusal.`);
    // Today's visit: the call-out is paid now (it was never taken up front). Not again for a saved repair put back on hold.
    if (!again && !calloutPaid(job)) {
      const pay = await requestPayment(job, "callout", m.pay1, job.customer);
      await wa.text(job.customer, `For today's inspection and travel, please pay *${usd(m.pay1)}*.\n\n${pay.instructions}`);
    }
    await wa.buttons(job.customer, `Your diagnosis and quote are saved until *${hDate(savedUntil(job))}*, so you won't pay for another inspection to go ahead before then.${q.options && !q.chosen ? `\n\nLabour stays at ${usd(q.labour)}. Supplier prices change, so you'll choose the part again from fresh prices when you go ahead.` : ""}

When you're ready, just message us here and tap *Go ahead with repair*. We'll send a reminder before it expires.`, [{ id: `resume:${job.id}`, title: "Go ahead with repair" }]);
  }
}

// What a saved repair will cost, in words (a part still to be chosen is priced on the day).
export function savedPriceText(job) {
  const q = job.data.quote || {};
  return q.options && !q.chosen ? `${usd(jobMoney(job).pay2)} for labour, plus the part at the supplier's price on the day` : usd(jobMoney(job).pay2);
}

// The pro has the part in hand (bought from the chosen supplier).
export async function proPartCollected(pro, jobId) {
  const job = getJob(jobId); if (!proOwns(pro, job) || job.stage !== "working" || job.data.part?.status !== "to_collect") return { error: "No part waiting to be collected." };
  job.data.part.status = "collected"; job.data.part.collectedAt = Date.now(); saveJob(job);
  PARTS.markCollected(job.data.part.quoteId);
  logEvent(job.id, "parts", `${pro.name} collected the part from ${job.data.part.shop} (order ${job.data.part.code}).`);
  await wa.text(job.customer, `🔧 ${first(pro.name)} has collected your part from ${job.data.part.shop} and is fitting it now.`);
  return { ok: true };
}

export async function proRequestPart(pro, jobId, description) {
  const job = getJob(jobId); if (!proOwns(pro, job) || job.stage !== "diagnosing") return { error: "You can ask for parts while diagnosing." };
  return PARTS.requestPart(job, pro, description);
}

export async function proComplete(pro, jobId, checks = []) {
  const job = getJob(jobId); if (!proOwns(pro, job) || job.stage !== "working") return { error: "Work isn't in progress." };
  if (checks.length < 2) return { error: "Tick the safety and test checks first." };
  if (job.data.part?.status === "to_collect") return { error: "Confirm you've collected the part first." };
  job.stage = "confirm"; job.data.completedAt = Date.now(); job.data.checks = checks;
  job.data.onJobMinutes = job.data.codeOk ? Math.round((job.data.completedAt - job.data.codeOk) / 60e3) : null; saveJob(job);
  logEvent(job.id, "app", `${pro.name} finished and tested${job.data.onJobMinutes != null ? ` after ${job.data.onJobMinutes} min on the job` : ""}: ${checks.join("; ")}.`);
  await wa.buttons(job.customer, `${first(pro.name)} says the repair is done and tested.\nPlease check it now. Is it working?`, [{ id: "work:yes", title: "Yes, it works" }, { id: "work:no", title: "Not yet" }]);
  return { ok: true };
}

export async function customerConfirm(job, works) {
  if (job.stage !== "confirm") return;
  const pro = getPro(job.pro_id);
  if (!works) {
    job.stage = "working"; saveJob(job);
    raiseAlert(job.id, pro.id, "issue");
    await wa.text(job.customer, `Thanks for telling us. ${first(pro.name)} will take another look now, and our Harare admin will call you. You don't pay until it works.`);
    return;
  }
  job.stage = "await_final"; saveJob(job);
  const m = jobMoney(job), withCallout = !calloutPaid(job), amount = finalAmount(job);
  const pay = await requestPayment(job, "final", amount, job.customer);
  await wa.text(job.customer, `Great! Please pay *${usd(amount)}*:\n${withCallout ? `Inspection and travel: ${usd(m.pay1)}\n` : ""}Labour: ${usd(m.labour)}\n${m.parts ? `Parts: ${usd(m.parts)}\n` : ""}EcoCash charges: ${usd(m.charges2)}\n\n${pay.instructions}`);
}

export async function customerRate(job, n) {
  if (job.stage !== "paid" || job.data.rating) return;
  job.data.rating = n; saveJob(job);
  let pro = getPro(job.pro_id); pro.rating_sum += n; pro.rating_n += 1;
  if (n <= 2) addTrustEvent(pro, "lowRating", `${n}★ on ${job.id}`); // a poor rating costs points for 12 months
  savePro(pro);
  if (job.data.probation) probationJobDone(pro.id, job.id, n);
  logEvent(job.id, "wa", `Customer rated ${pro.name} ${n}★.`);
  await updateTrust(pro.id, job.id);
  await wa.text(job.customer, n >= 4 ? `Thank you! ⭐ We've passed that on to ${first(pro.name)}.` : `Thank you for being honest. Our Harare admin will follow up with you.`);
}

export async function customerCancel(job) {
  if (!ACTIVE.includes(job.stage) || ONSITE.includes(job.stage)) return { error: "can't cancel now" };
  if (job.data.resumed && ["offered", "searching", "ready", "travelling"].includes(job.stage)) {
    if (job.stage === "travelling") return { error: "can't cancel now" };
    job.stage = "deferred"; job.data.offer = null; job.pro_id = job.data.firstPro; job.data.resumed = null; saveJob(job);
    logEvent(job.id, "wa", "Customer put the saved repair back on hold.");
    await wa.text(job.customer, `Okay, your saved repair is back on hold until *${hDate(savedUntil(job))}*. Message us when you're ready.`);
    return { ok: true };
  }
  const was = job.stage, pro = job.pro_id ? getPro(job.pro_id) : null;
  job.stage = "cancelled"; job.data.cancelledFrom = was; job.data.offer = null; saveJob(job);
  const paid = one("SELECT * FROM payments WHERE job_id = ? AND kind = 'callout' AND status = 'paid'", job.id);
  if (was === "travelling" && paid) {
    run("INSERT INTO payouts (job_id, pro_id, amount, due_at) VALUES (?,?,?,?)", job.id, pro.id, jobMoney(job).calloutShare, Date.now() + RULES.payoutHours * 3600e3);
    logEvent(job.id, "wa", "Customer cancelled after the pro set off: call-out covers the trip.");
    await wa.text(job.customer, `Cancelled. ${first(pro.name)} was already on the way, so the inspection and travel covers the trip. Message us any time to book again.`);
  } else if (was === "travelling") {
    const m = jobMoney(job);
    logEvent(job.id, "wa", `Customer cancelled after the pro set off: call-out ${usd(m.pay1)} requested for the trip.`);
    const pay = await requestPayment(job, "callout", m.pay1, job.customer);
    await wa.text(job.customer, `Cancelled. ${first(pro.name)} was already on the way, so the inspection and travel is payable for the trip: *${usd(m.pay1)}*.\n\n${pay.instructions}`);
  } else if (paid) {
    logEvent(job.id, "wa", "Customer cancelled after paying the call-out, before the pro set off: refund to review on the ops desk.");
    await wa.text(job.customer, `Cancelled. Our Harare admin will contact you about your payment. Message us any time to book again.`);
  } else {
    run("UPDATE payments SET status = 'cancelled' WHERE job_id = ? AND status = 'pending'", job.id);
    logEvent(job.id, "wa", "Customer cancelled before paying.");
    await wa.text(job.customer, `Cancelled. There's nothing to pay. Message us any time to book again.`);
  }
  return { ok: true };
}

// ---------- messages between customer and pro (through the platform, contacts removed) ----------
export async function relay(job, sender, text) {
  const s = scrub(text);
  job.data.thread = job.data.thread || [];
  job.data.thread.push({ from: sender, text: s.text, at: Date.now() });
  job.data.thread = job.data.thread.slice(-200);
  if (sender === "customer") job.data.proUnread = (job.data.proUnread || 0) + 1;
  saveJob(job);
  run("INSERT INTO messages (job_id, sender, body, scrubbed, at) VALUES (?,?,?,?,?)", job.id, sender, s.text, s.scrubbed ? 1 : 0, Date.now());
  if (s.scrubbed) logEvent(job.id, "trust", `Contact details removed from a ${sender} message.`);
  if (sender === "pro") await wa.text(job.customer, `💬 *${first(job.data.pro?.name)} (your Basa pro):* ${s.text}`);
  return s;
}

// ---------- safety ----------
export async function proCheckin(pro, jobId, pin, kind = "checkin") {
  const job = getJob(jobId); if (!proOwns(pro, job)) return { error: "No job." };
  const duress = checkPin(pin, pro.duress_hash), ok = duress || checkPin(pin, pro.pin_hash);
  if (!ok) return { error: "That PIN isn't right. Try again." };
  const sf = job.data.safety || {};
  if (duress) raiseAlert(job.id, pro.id, "duress", kind === "checkout" ? "duress PIN used when checking out" : "duress PIN used at check-in");
  if (kind === "checkout") {
    if (!duress) { sf.tracking = 0; sf.checkedOutAt = Date.now(); logEvent(job.id, "app", `${pro.name} checked out with their safety PIN. Location sharing stopped.`); }
    else sf.fakeCheckout = Date.now(); // the pro's screen looks normal; tracking stays on
  } else {
    sf.firstDone = true; sf.checkDue = null; sf.lastCheckin = Date.now();
    for (const a of all("SELECT id FROM alerts WHERE job_id = ? AND kind = 'missed' AND closed = 0", job.id)) if (!duress) closeAlert(a.id, "system", "pro checked in");
    if (!duress) logEvent(job.id, "app", `${pro.name} checked in safely (${RULES.checkinMinutes} min into the visit).`);
  }
  job.data.safety = sf; saveJob(job);
  return { ok: true }; // identical reply for the duress PIN, so nothing on the screen gives it away
}
export function proSafetyAlert(pro, jobId, kind) {
  const job = getJob(jobId); if (!proOwns(pro, job) || !["sos", "uneasy"].includes(kind)) return { error: "No job." };
  raiseAlert(job.id, pro.id, kind, kind === "sos" ? "SOS pressed in the Pro app" : "pro asked for a check-in call");
  return { ok: true };
}
export function proLocation(pro, jobId, lat, lng) {
  const job = getJob(jobId); if (!proOwns(pro, job) || !job.data.safety?.tracking) return { ok: false };
  job.data.safety.last = { lat: Number(lat), lng: Number(lng), at: Date.now() }; saveJob(job);
  return { ok: true };
}

// ---------- timers (run every 15 s) ----------
export async function sweep() {
  const now = Date.now(), lock = (id, fn) => withLock("job:" + id, fn);
  for (const r of all("SELECT id FROM jobs WHERE stage = 'offered' AND json_extract(data,'$.offer.expires') < ?", now)) await lock(r.id, async () => {
    const job = getJob(r.id); if (job.stage === "offered" && job.data.offer && job.data.offer.expires < Date.now()) await proDecline(getPro(job.data.offer.pro), job.id, "expired");
  });
  // A booking the customer didn't confirm in time is released, so the pro is free for other jobs.
  for (const r of all("SELECT id FROM jobs WHERE stage = 'await_confirm' AND json_extract(data,'$.confirmBy') < ?", now)) await lock(r.id, async () => {
    const job = getJob(r.id); if (job.stage !== "await_confirm" || !(job.data.confirmBy < Date.now())) return;
    const pro = getPro(job.pro_id); job.stage = "cancelled"; job.data.cancelledFrom = "await_confirm"; saveJob(job);
    logEvent(job.id, "server", `Booking not confirmed within ${RULES.confirmMinutes} minutes: released.`);
    await wa.text(job.customer, `We didn't hear back, so this booking has been released. Nothing to pay. Message us any time to book again.`);
    if (pro) await wa.text(pro.phone, `Basa seBasa: the customer didn't confirm ${job.id}, so it's cancelled. You're free for other jobs.`);
  });
  for (const r of all("SELECT id FROM jobs WHERE stage = 'searching'")) await lock(r.id, async () => { const job = getJob(r.id); if (job.stage === "searching") await offerNext(job); });
  for (const r of all(`SELECT id FROM jobs WHERE stage IN (${ONSITE.map(() => "?").join(",")}) AND json_extract(data,'$.safety.checkDue') < ? AND json_extract(data,'$.safety.missedRaised') IS NULL`, ...ONSITE, now - RULES.checkinGraceMinutes * 60e3)) await lock(r.id, async () => {
    const job = getJob(r.id), sf = job.data.safety || {};
    if (!ONSITE.includes(job.stage) || !sf.checkDue || sf.firstDone || sf.missedRaised) return;
    sf.missedRaised = true; job.data.safety = sf; saveJob(job);
    const pro = getPro(job.pro_id);
    raiseAlert(job.id, pro.id, "missed", `${RULES.checkinMinutes}-minute check-in is ${RULES.checkinGraceMinutes} minutes overdue`);
    await wa.text(pro.phone, `Basa seBasa safety check: please open your Pro app and check in with your PIN now.`);
  });
  for (const r of all("SELECT id FROM jobs WHERE stage = 'deferred' AND json_extract(data,'$.expired') IS NULL AND json_extract(data,'$.deferredAt') < ?", now - 7 * 864e5)) await lock(r.id, async () => {
    const job = getJob(r.id); if (job.stage !== "deferred" || job.data.expired) return;
    const days = (Date.now() - job.data.deferredAt) / 864e5, rm = job.data.reminders || [];
    if (Date.now() >= savedUntil(job)) { job.data.expired = Date.now(); saveJob(job); logEvent(job.id, "server", "Saved diagnosis expired after 30 days."); return; }
    for (const d of [7, 25]) if (days >= d && !rm.includes(d)) {
      rm.push(d); job.data.reminders = rm; saveJob(job);
      // Outside WhatsApp's 24-hour window this must be an approved template (see README).
      await wa.buttons(job.customer, `Hi from Basa seBasa 👋 Your saved ${serviceById(job.service).name.toLowerCase()} repair (${job.id}) is still waiting: ${savedPriceText(job)} as quoted, no new inspection charge, until *${hDate(savedUntil(job))}*.`, [{ id: `resume:${job.id}`, title: "Go ahead with repair" }, { id: "saved:later", title: "Not yet" }]);
      logEvent(job.id, "wa", `Saved-repair reminder sent (day ${d}).`);
    }
  });
  if (config.payments.mode === "manual") {
    for (const p of all("SELECT * FROM payments WHERE status = 'pending' AND created_at < ?", now - 20 * 60e3)) raiseAlert(p.job_id, null, "payment", `${p.kind} ${usd(p.amount)}, ref ${p.ref}`);
  }
  // Simulated payments confirm on a timer; if the server restarted in between, finish them here.
  if (config.payments.mode === "sim") for (const p of all("SELECT id FROM payments WHERE status = 'pending' AND provider = 'sim' AND created_at < ?", now - config.payments.simDelayMs - 5000)) markPaid(p.id, `SIM${String(now).slice(-6)}`, "sim");
  PARTS.sweepParts(now);
  housekeeping(now);
  metaSet("lastSweep", now);
}

// Old rows nobody needs, and a daily copy of the database (last 7 kept).
function housekeeping(now) {
  if (now - Number(metaGet("lastHousekeeping") || 0) < 3600e3) return;
  metaSet("lastHousekeeping", now);
  run("DELETE FROM seen WHERE at < ?", now - 7 * 864e5);
  run("DELETE FROM sessions WHERE expires < ?", now);
  run("DELETE FROM otps WHERE expires < ?", now - 864e5);
  run("DELETE FROM outbox WHERE status IN ('sent','sim') AND at < ?", now - 30 * 864e5);
  if (dbPath() !== ":memory:" && now - Number(metaGet("lastBackup") || 0) > 864e5) {
    try {
      const dir = pjoin(dirname(dbPath()), "backups"); mkdirSync(dir, { recursive: true });
      const f = pjoin(dir, `basa-${new Date(now).toISOString().slice(0, 10)}.db`); rmSync(f, { force: true });
      backupTo(f); metaSet("lastBackup", now);
      readdirSync(dir).filter((x) => x.endsWith(".db")).sort().slice(0, -7).forEach((x) => rmSync(pjoin(dir, x), { force: true }));
      logEvent(null, "server", `Daily database backup saved (${f.split("/").pop()}).`);
    } catch (e) { logEvent(null, "error", `Daily backup failed: ${e.message}`); }
  }
}

export function urgentOpen() { return all(`SELECT * FROM alerts WHERE closed = 0 AND kind IN (${URGENT.map(() => "?").join(",")})`, ...URGENT); }
export { SUBURBS };
