// Basa seBasa platform server: WhatsApp webhook, Pro app API, ops desk API, payments callbacks.
// Built on Node's standard library only, so there is nothing to install.
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { randomBytes, randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
import { config, simulated, isDev } from "./config.js";
import { openDb, one, all, run, getJob, getPro, getProByPhone, savePro, logEvent, saveJob } from "./db.js";
import { parseWebhook, verifySignature, wa } from "./whatsapp.js";
import { handleInbound } from "./bot.js";
import { handlePaynowResult, pollPending, markPaid } from "./payments.js";
import * as J from "./jobs.js";
import { hashPin, weakPin, LADDERS, ALERT_NAME, stepAlert, closeAlert, openAlerts } from "./safety.js";
import { RULES, serviceById, SERVICES, usd, money, r2 } from "./rules.js";
import { SUBURBS, findSuburb } from "./places.js";
import * as OB from "./onboarding.js";

const PUBLIC = fileURLToPath(new URL("../public/", import.meta.url));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml" };

// ---------- helpers ----------
const send = (res, code, body, headers = {}) => {
  const isJson = typeof body !== "string" && !Buffer.isBuffer(body);
  res.writeHead(code, { "Content-Type": isJson ? "application/json" : "text/plain; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(isJson ? JSON.stringify(body) : body);
};
const readBody = (req, limit = 1e6) => new Promise((resolve, reject) => {
  const chunks = []; let n = 0;
  req.on("data", (c) => { n += c.length; if (n > limit) { reject(new Error("too large")); req.destroy(); } else chunks.push(c); });
  req.on("end", () => resolve(Buffer.concat(chunks))); req.on("error", reject);
});
const json = (buf) => { try { return JSON.parse(buf.toString("utf8") || "{}"); } catch { return {}; } };
export const normPhone = (p) => { let d = String(p || "").replace(/\D/g, ""); if (d.startsWith("00")) d = d.slice(2); if (d.startsWith("0")) d = "263" + d.slice(1); return d; };
const validZimMobile = (p) => /^2637[1378]\d{7}$/.test(p);

function newSession(role, ref, days) { const t = randomBytes(24).toString("base64url"); run("INSERT INTO sessions (token, role, ref, expires) VALUES (?,?,?,?)", t, role, String(ref), Date.now() + days * 864e5); return t; }
function session(req, role) {
  const t = (req.headers.authorization || "").replace(/^Bearer /, "");
  const s = t && one("SELECT * FROM sessions WHERE token = ? AND role = ? AND expires > ?", t, role, Date.now());
  return s || null;
}

async function serveStatic(res, path) {
  let p = normalize(path).replace(/^(\.\.[/\\])+/, "");
  if (p.endsWith("/")) p += "index.html";
  if (!extname(p)) p += "/index.html";
  const file = join(PUBLIC, p);
  if (!file.startsWith(PUBLIC) || !existsSync(file)) return send(res, 404, "Not found");
  const headers = { "Content-Type": TYPES[extname(file)] || "application/octet-stream", "Cache-Control": extname(file) === ".html" ? "no-cache" : "public, max-age=3600" };
  if (p.endsWith("sw.js")) headers["Service-Worker-Allowed"] = "/pro/";
  res.writeHead(200, headers); res.end(await readFile(file));
}

async function savePhotos(id, b) {
  const dir = join(config.uploadDir, `pro-${id}`); await mkdir(dir, { recursive: true });
  const files = {};
  for (const k of ["idFront", "idBack", "selfie", "certificate"]) {
    const v = String(b[k] || ""); const mm = v.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/); if (!mm) continue;
    const name = `pro-${id}/${k}-${Date.now().toString(36)}.${mm[1] === "jpeg" ? "jpg" : mm[1]}`; await writeFile(join(config.uploadDir, name), Buffer.from(mm[2], "base64")); files[k] = name;
  }
  return files;
}

// ---------- what the Pro app shows ----------
function proState(pro) {
  const offer = J.offerForPro(pro.id);
  const job = J.currentJobForPro(pro.id) || J.unfinishedCheckout(pro.id);
  const dayStart = new Date(); dayStart.setUTCHours(-2, 0, 0, 0); // midnight in Harare
  const today = all("SELECT * FROM payouts WHERE pro_id = ? AND due_at - ? > ?", pro.id, RULES.payoutHours * 3600e3, dayStart.getTime());
  const last = one("SELECT id FROM jobs WHERE pro_id = ? AND stage IN ('paid','noshow','deferred','cancelled') ORDER BY updated_at DESC", pro.id);
  const lastJob = last ? getJob(last.id) : null;
  const lastPayout = lastJob ? one("SELECT * FROM payouts WHERE job_id = ?", lastJob.id) : null;
  return {
    pro: { id: pro.id, name: pro.name, trade: serviceById(pro.trade)?.name, suburb: pro.suburb, trust: pro.trust, online: !!pro.online, status: pro.status,
      rating: pro.rating_n ? r2(pro.rating_sum / pro.rating_n) : null, jobsDone: pro.jobs_done },
    offer: offer && {
      id: offer.id, service: serviceById(offer.service).name, suburb: offer.data.suburb, desc: offer.data.desc, when: offer.data.when, km: offer.data.offer.km,
      expires: offer.data.offer.expires, earnings: money({ km: offer.data.offer.km }).calloutShare,
    },
    job: job && proJobView(job),
    home: { jobsToday: today.length, earnedToday: r2(today.reduce((a, p) => a + p.amount, 0)),
      last: lastJob && { id: lastJob.id, service: serviceById(lastJob.service).name, suburb: lastJob.data.suburb, stage: lastJob.stage, label: J.STAGE_LABEL[lastJob.stage], rating: lastJob.data.rating || null,
        payout: lastPayout && { amount: lastPayout.amount, paid: !!lastPayout.paid_at, ref: lastPayout.ref } } },
    rules: { checkinMinutes: RULES.checkinMinutes, payoutHours: RULES.payoutHours, noShowWaitMinutes: RULES.noShowWaitMinutes },
    onboarding: pro.status === "verified" ? null : OB.onboardingView(pro),
    probation: pro.data?.probation || null, level: pro.data?.level || null,
    now: Date.now(),
  };
}
function proJobView(job) {
  const m = J.jobMoney(job), sf = job.data.safety || {};
  return {
    id: job.id, stage: job.stage, label: J.STAGE_LABEL[job.stage], service: serviceById(job.service).name,
    suburb: job.data.suburb, landmark: job.data.landmark, desc: job.data.desc, when: job.data.when, km: job.data.km,
    lat: job.data.lat, lng: job.data.lng, exactPin: !!job.data.exact,
    customer: `Customer in ${job.data.suburb}`, // name and number stay private
    quote: job.data.quote || null, arrivedAt: job.data.arrivedAt || null, codeTries: job.data.codeTries || 0,
    money: { calloutShare: m.calloutShare, travel: m.travel, labour: m.labour, parts: m.parts, fee: m.fee, payout: m.payout },
    thread: (job.data.thread || []).slice(-60), unread: job.data.proUnread || 0,
    safety: { tracking: !!sf.tracking, checkDue: sf.checkDue || null, firstDone: !!sf.firstDone, needsCheckout: J.CLOSED.includes(job.stage) && !!sf.tracking },
    rating: job.data.rating || null, checks: serviceById(job.service).checks,
  };
}

// ---------- what the ops desk shows ----------
function opsOverview() {
  const jobs = all("SELECT * FROM jobs ORDER BY updated_at DESC LIMIT 60").map((r) => { const j = { ...r, data: JSON.parse(r.data) }; const m = J.jobMoney(j);
    const paid = one("SELECT COALESCE(SUM(amount),0) s FROM payments WHERE job_id = ? AND status = 'paid'", j.id).s;
    return { id: j.id, stage: j.stage, label: J.STAGE_LABEL[j.stage], service: serviceById(j.service)?.name, suburb: j.data.suburb, when: j.data.when, pro: j.data.pro?.name || null,
      customer: j.customer, paid: r2(paid), payout: m.payout, tracking: !!j.data.safety?.tracking, loc: j.data.safety?.last || null, updated: j.updated_at, created: j.created_at }; });
  const alerts = openAlerts().map((a) => ({ ...a, name: ALERT_NAME[a.kind] || a.kind, ladder: LADDERS[a.kind] || [], pro: a.pro_id ? (() => { const p = getPro(a.pro_id); return p && { name: p.name, phone: p.phone, em_name: p.em_name, em_phone: p.em_phone }; })() : null,
    job: a.job_id ? (() => { const j = getJob(a.job_id); return j && { id: j.id, suburb: j.data.suburb, landmark: j.data.landmark, customer: j.customer, loc: j.data.safety?.last || { lat: j.data.lat, lng: j.data.lng } }; })() : null }));
  const pending = all("SELECT * FROM payments WHERE status = 'pending' ORDER BY created_at");
  const payouts = all("SELECT p.*, pr.name, pr.ecocash FROM payouts p JOIN pros pr ON pr.id = p.pro_id WHERE p.paid_at IS NULL ORDER BY p.due_at");
  const pros = all("SELECT id, name, phone, trade, suburb, status, online, trust, jobs_done, rating_sum, rating_n, ecocash, em_name, em_phone, data, created_at FROM pros ORDER BY status, name")
    .map((p) => { const full = { ...p, data: JSON.parse(p.data || "{}") };
      return { ...full, trade: serviceById(p.trade)?.name || p.trade, onboarding: p.status === "applied" ? { steps: OB.steps(full), ready: OB.readyToApprove(full), trustIfApproved: OB.startingTrust(full), ob: full.data.onboarding } : null }; });
  const probationCalls = jobs.filter((j) => j.stage === "paid").map((j) => getJob(j.id)).filter((j) => j.data.probation && !j.data.probationCall)
    .map((j) => ({ id: j.id, pro: j.data.pro?.name, customer: j.customer, rating: j.data.rating || null }));
  const events = all("SELECT * FROM events ORDER BY id DESC LIMIT 120");
  const refunds = jobs.filter((j) => j.stage === "cancelled" && j.paid > 0 && !one("SELECT id FROM payouts WHERE job_id = ?", j.id));
  return { jobs, alerts, pending, payouts, pros, events, refunds, probationCalls, mode: { whatsapp: simulated.whatsapp ? "simulated" : "live", payments: config.payments.mode }, now: Date.now() };
}

// ---------- routes ----------
async function route(req, res) {
  const url = new URL(req.url, "http://x"), path = url.pathname, method = req.method;

  if (path === "/health") return send(res, 200, { ok: true, whatsapp: simulated.whatsapp ? "simulated" : "live", payments: config.payments.mode });
  if (path === "/") return send(res, 302, "", { Location: "/pro/" });

  // WhatsApp webhook
  if (path === "/webhook/whatsapp" && method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === config.whatsapp.verifyToken;
    return send(res, ok ? 200 : 403, ok ? url.searchParams.get("hub.challenge") || "" : "Forbidden");
  }
  if (path === "/webhook/whatsapp" && method === "POST") {
    const raw = await readBody(req);
    if (!verifySignature(raw, req.headers["x-hub-signature-256"])) return send(res, 401, "Bad signature");
    send(res, 200, "OK"); // answer Meta at once; handle the messages after
    for (const m of parseWebhook(json(raw))) handleInbound(m).catch((e) => logEvent(null, "error", `Inbound message failed: ${e.message}`));
    return;
  }
  if (path === "/payments/paynow/result" && method === "POST") { handlePaynowResult((await readBody(req)).toString()); return send(res, 200, "OK"); }

  // Pro photos (only verified pros, for customers' WhatsApp)
  let m;
  if ((m = path.match(/^\/media\/pro\/(\d+)$/))) {
    const p = getPro(Number(m[1])); const f = p?.data?.photo && join(config.uploadDir, p.data.photo);
    if (!f || p.status !== "verified" || !existsSync(f)) return send(res, 404, "Not found");
    res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=3600" }); return res.end(await readFile(f));
  }

  // ----- pro applications (the join form) -----
  if (path === "/api/join" && method === "POST") {
    const b = json(await readBody(req, 12e6));
    const phone = normPhone(b.phone), err = [];
    if (!b.name || String(b.name).trim().length < 3) err.push("Full name");
    if (!validZimMobile(phone)) err.push("A Zimbabwe mobile number");
    if (!serviceById(b.trade)) err.push("Trade");
    if (!findSuburb(b.suburb)) err.push("Base suburb");
    if (!validZimMobile(normPhone(b.ecocash))) err.push("EcoCash number");
    if (!b.emName || !validZimMobile(normPhone(b.emPhone)) || normPhone(b.emPhone) === phone) err.push("An emergency contact (a different number from yours)");
    if (weakPin(String(b.pin || "")) || weakPin(String(b.duress || "")) || b.pin === b.duress) err.push("Two different 4-digit PINs (no 1234, 0000 or repeated digits)");
    if (!b.idFront || !b.selfie) err.push("Photos of your ID and a selfie holding it");
    if (!b.consent) err.push("Your consent");
    if (err.length) return send(res, 400, { error: "Please check: " + err.join(", ") });
    if (getProByPhone(phone)) return send(res, 409, { error: "This number has already applied. We'll be in touch on WhatsApp." });
    const sub = findSuburb(b.suburb), [lat, lng] = SUBURBS[sub], now = Date.now();
    const r = run("INSERT INTO pros (phone, name, trade, suburb, lat, lng, status, ecocash, pin_hash, duress_hash, em_name, em_phone, data, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      phone, String(b.name).trim().slice(0, 60), b.trade, sub, lat, lng, "applied", normPhone(b.ecocash), hashPin(b.pin), hashPin(b.duress), String(b.emName).slice(0, 60), normPhone(b.emPhone),
      JSON.stringify({ experience: String(b.experience || "").slice(0, 400), referees: String(b.referees || "").slice(0, 400), consentAt: now }), now, now);
    const id = Number(r.lastInsertRowid), files = await savePhotos(id, b);
    const p = getPro(id); p.data = { ...p.data, files, photo: files.selfie || null }; savePro(p);
    logEvent(null, "onboarding", `New pro application: ${p.name}, ${serviceById(p.trade).name}, ${sub}.`);
    await wa.text(phone, `Thanks for applying to Basa seBasa, ${p.name.split(" ")[0]}! Log in to the Pro app to follow every step of your application: ${config.baseUrl}/pro`);
    return send(res, 200, { ok: true });
  }

  // ----- Pro app -----
  if (path === "/api/pro/login" && method === "POST") {
    const phone = normPhone(json(await readBody(req)).phone), pro = getProByPhone(phone);
    if (!pro) return send(res, 403, { error: "This number isn't registered yet. Apply to join first." });
    if (pro.status === "rejected") return send(res, 403, { error: `Your application wasn't approved (${pro.data.rejectedReason || "see WhatsApp"}). You may reapply after 3 months.` });
    if (pro.status === "suspended") return send(res, 403, { error: "Your account is paused. Please contact Basa seBasa." });
    const code = String(randomInt(100000, 1000000));
    run("INSERT INTO otps (phone, code, expires, tries) VALUES (?,?,?,0) ON CONFLICT(phone) DO UPDATE SET code = excluded.code, expires = excluded.expires, tries = 0", phone, code, Date.now() + 10 * 60e3);
    await wa.otp(phone, code);
    return send(res, 200, { ok: true, ...(simulated.whatsapp ? { devCode: code } : {}) });
  }
  if (path === "/api/pro/verify" && method === "POST") {
    const b = json(await readBody(req)), phone = normPhone(b.phone), o = one("SELECT * FROM otps WHERE phone = ?", phone);
    if (!o || o.expires < Date.now() || o.tries >= 5) return send(res, 400, { error: "That code has expired. Ask for a new one." });
    if (String(b.code).trim() !== o.code) { run("UPDATE otps SET tries = tries + 1 WHERE phone = ?", phone); return send(res, 400, { error: "That code isn't right." }); }
    run("DELETE FROM otps WHERE phone = ?", phone);
    const pro = getProByPhone(phone); OB.markLoggedIn(pro); return send(res, 200, { token: newSession("pro", pro.id, 30) });
  }
  if (path.startsWith("/api/pro/")) {
    const s = session(req, "pro"); if (!s) return send(res, 401, { error: "Please log in again." });
    const pro = getPro(Number(s.ref)); if (!pro || !["verified", "applied"].includes(pro.status)) return send(res, 403, { error: "Your account is paused. Please contact Basa seBasa." });
    const b = method === "POST" ? json(await readBody(req, path.endsWith("/docs") ? 12e6 : 1e6)) : {};
    if (path === "/api/pro/state") return send(res, 200, proState(pro));
    if ((m = path.match(/^\/api\/pro\/onboarding\/(ack|practice|sign|confirm-slot|docs)$/))) {
      let r;
      if (m[1] === "ack") r = OB.ackInduction(pro, b.id);
      else if (m[1] === "practice") r = OB.practisePin(pro, b.pin);
      else if (m[1] === "sign") r = await OB.signAgreement(pro, b.name, b.agree);
      else if (m[1] === "confirm-slot") r = OB.confirmSlot(pro);
      else { const files = await savePhotos(pro.id, b); r = Object.keys(files).length ? OB.resubmitDocs(pro, files) : { error: "Add a photo first." }; }
      return send(res, r.error ? 409 : 200, r.error ? r : { ...r, state: proState(getPro(pro.id)) });
    }
    if (pro.status !== "verified") return send(res, 403, { error: "Finish your onboarding steps first." });
    if (path === "/api/pro/online") { pro.online = b.on ? 1 : 0; savePro(pro); logEvent(null, "app", `${pro.name} is ${b.on ? "online" : "offline"}.`); return send(res, 200, proState(pro)); }
    if ((m = path.match(/^\/api\/pro\/offer\/(BSB-\d+)\/(accept|decline)$/))) {
      const r = m[2] === "accept" ? await J.proAccept(pro, m[1]) : await J.proDecline(pro, m[1]);
      return send(res, r.error ? 409 : 200, r.error ? r : proState(getPro(pro.id)));
    }
    if ((m = path.match(/^\/api\/pro\/job\/(BSB-\d+)\/([a-z]+)$/))) {
      const [, id, act] = m; let r;
      if (act === "trip") r = await J.proTrip(pro, id);
      else if (act === "arrive") r = await J.proArrive(pro, id);
      else if (act === "verify") r = await J.proVerify(pro, id, b.code);
      else if (act === "noshow") r = await J.proNoShow(pro, id);
      else if (act === "quote") r = await J.proQuote(pro, id, b);
      else if (act === "complete") r = await J.proComplete(pro, id, Array.isArray(b.checks) ? b.checks.map(String).slice(0, 6) : []);
      else if (act === "checkin") r = await J.proCheckin(pro, id, b.pin, "checkin");
      else if (act === "checkout") r = await J.proCheckin(pro, id, b.pin, "checkout");
      else if (act === "sos" || act === "uneasy") r = J.proSafetyAlert(pro, id, act);
      else if (act === "location") r = J.proLocation(pro, id, b.lat, b.lng);
      else if (act === "message") { const job = getJob(id); if (!job || job.pro_id !== pro.id || !String(b.text || "").trim()) r = { error: "Can't send." }; else { const sc = await J.relay(job, "pro", String(b.text).slice(0, 1000)); r = { ok: true, scrubbed: sc.scrubbed }; } }
      else if (act === "read") { const job = getJob(id); if (job && job.pro_id === pro.id) { job.data.proUnread = 0; saveJob(job); } r = { ok: true }; }
      else return send(res, 404, { error: "Unknown action" });
      return send(res, r.error ? 409 : 200, r.error ? r : { ...r, state: proState(getPro(pro.id)) });
    }
    return send(res, 404, { error: "Not found" });
  }

  // ----- ops desk -----
  if (path === "/api/ops/login" && method === "POST") {
    const b = json(await readBody(req)), pw = config.adminUsers[b.user];
    if (!pw || pw !== b.password) return send(res, 401, { error: "Wrong name or password." });
    return send(res, 200, { token: newSession("ops", b.user, 0.5), user: b.user });
  }
  if (path.startsWith("/api/ops/")) {
    const s = session(req, "ops"); if (!s) return send(res, 401, { error: "Please log in." });
    const by = s.ref, b = method === "POST" ? json(await readBody(req)) : {};
    if (path === "/api/ops/overview") return send(res, 200, opsOverview());
    if ((m = path.match(/^\/api\/ops\/job\/(BSB-\d+)$/))) { const j = getJob(m[1]); if (!j) return send(res, 404, { error: "No such job" });
      return send(res, 200, { job: { ...j, label: J.STAGE_LABEL[j.stage], money: J.jobMoney(j) }, payments: all("SELECT * FROM payments WHERE job_id = ?", j.id), payouts: all("SELECT * FROM payouts WHERE job_id = ?", j.id), events: all("SELECT * FROM events WHERE job_id = ? ORDER BY id", j.id) }); }
    if ((m = path.match(/^\/api\/ops\/payment\/(\d+)\/confirm$/))) { const ok = markPaid(Number(m[1]), String(b.ref || "").slice(0, 40) || null, by); return send(res, ok ? 200 : 409, ok ? { ok } : { error: "Already confirmed or not found." }); }
    if ((m = path.match(/^\/api\/ops\/payout\/(\d+)\/paid$/))) {
      const p = one("SELECT * FROM payouts WHERE id = ?", Number(m[1])); if (!p || p.paid_at) return send(res, 409, { error: "Already paid or not found." });
      if (!String(b.ref || "").trim()) return send(res, 400, { error: "Enter the EcoCash reference." });
      run("UPDATE payouts SET paid_at = ?, ref = ?, by = ? WHERE id = ?", Date.now(), String(b.ref).slice(0, 40), by, p.id);
      const pro = getPro(p.pro_id); logEvent(p.job_id, "pay", `Payout ${usd(p.amount)} sent to ${pro.name}, ref ${b.ref}, by ${by}.`);
      await wa.text(pro.phone, `💸 Basa seBasa payout for ${p.job_id}: ${usd(p.amount)} sent to your EcoCash, ref ${b.ref}.`);
      return send(res, 200, { ok: true });
    }
    if ((m = path.match(/^\/api\/ops\/alert\/(\d+)\/(step|close)$/))) { const r = m[2] === "step" ? stepAlert(Number(m[1]), by) : closeAlert(Number(m[1]), by, b.note); return send(res, r ? 200 : 409, r ? { ok: true } : { error: "Alert not open." }); }
    if ((m = path.match(/^\/api\/ops\/pro\/(\d+)\/(step|approve|reject)$/))) {
      const p = getPro(Number(m[1])); if (!p) return send(res, 404, { error: "No such pro" });
      const r = m[2] === "step" ? await OB.teamStep(p, b, by) : m[2] === "approve" ? await OB.approve(p, by) : await OB.reject(p, String(b.note || "not approved"), by);
      return send(res, r.error ? 409 : 200, r);
    }
    if ((m = path.match(/^\/api\/ops\/job\/(BSB-\d+)\/probation-call$/))) {
      const j = getJob(m[1]); if (!j || !j.data.probation) return send(res, 404, { error: "No probation call for this job." });
      j.data.probationCall = { at: Date.now(), by, note: String(b.note || "").slice(0, 300) }; saveJob(j);
      logEvent(j.id, "onboarding", `Probation quality call logged by ${by}${b.note ? `: ${b.note}` : ""}.`);
      return send(res, 200, { ok: true });
    }
    if ((m = path.match(/^\/api\/ops\/pro\/(\d+)\/(suspend|reinstate)$/))) {
      const p = getPro(Number(m[1])); if (!p) return send(res, 404, { error: "No such pro" });
      p.status = m[2] === "suspend" ? "suspended" : "verified";
      if (p.status !== "verified") p.online = 0;
      savePro(p); logEvent(null, "onboarding", `${p.name}: ${m[2]} by ${by}${b.note ? ` (${b.note})` : ""}.`);
      return send(res, 200, { ok: true });
    }
    if ((m = path.match(/^\/api\/ops\/job\/(BSB-\d+)\/(cancel|reoffer)$/))) {
      const j = getJob(m[1]); if (!j) return send(res, 404, { error: "No such job" });
      if (m[2] === "cancel") { j.stage = "cancelled"; j.data.offer = null; j.data.cancelledBy = by; saveJob(j); logEvent(j.id, "server", `Cancelled by ${by}${b.note ? `: ${b.note}` : ""}.`); await wa.text(j.customer, `Your booking ${j.id} has been cancelled by Basa seBasa. ${b.note || "Our Harare admin will be in touch."}`); }
      else { if (j.pro_id) j.data.declined.push(j.pro_id); j.pro_id = null; j.data.offer = null; j.stage = "searching"; j.data.searchingSince = null; saveJob(j); logEvent(j.id, "server", `Re-offered to another pro by ${by}.`); await J.offerNext(getJob(j.id)); }
      return send(res, 200, { ok: true });
    }
    if ((m = path.match(/^\/api\/ops\/file\/(\d+)\/(idFront|idBack|selfie|certificate)$/))) {
      const p = getPro(Number(m[1])); const f = p?.data?.files?.[m[2]] && join(config.uploadDir, p.data.files[m[2]]);
      if (!f || !existsSync(f)) return send(res, 404, "Not found");
      res.writeHead(200, { "Content-Type": "image/" + (extname(f) === ".png" ? "png" : "jpeg"), "Cache-Control": "no-store" }); return res.end(await readFile(f));
    }
    return send(res, 404, { error: "Not found" });
  }

  // ----- WhatsApp simulator (only while WhatsApp isn't connected) -----
  if (path.startsWith("/sim/api/")) {
    if (!simulated.whatsapp) return send(res, 404, "Not found");
    if (path === "/sim/api/inbound" && method === "POST") {
      const b = json(await readBody(req)), from = normPhone(b.from);
      await handleInbound({ id: "sim-" + randomBytes(6).toString("hex"), from, name: b.name || null, text: b.text, reply: b.reply, location: b.location, media: b.media, type: b.type || "text" });
      return send(res, 200, { ok: true });
    }
    if (path === "/sim/api/outbox") {
      const to = normPhone(url.searchParams.get("to")), after = Number(url.searchParams.get("after") || 0);
      return send(res, 200, all("SELECT id, to_phone, payload, at FROM outbox WHERE to_phone = ? AND id > ? ORDER BY id", to, after).map((r) => ({ ...r, payload: JSON.parse(r.payload) })));
    }
  }

  if (method === "GET") {
    if (path === "/sim" || path.startsWith("/sim/")) { if (!simulated.whatsapp) return send(res, 404, "Not found"); }
    if (path === "/pro" || path === "/ops" || path === "/join" || path === "/sim") return send(res, 301, "", { Location: path + "/" });
    return serveStatic(res, path);
  }
  return send(res, 404, { error: "Not found" });
}

export function startServer({ port = config.port, dbPath = config.dbPath } = {}) {
  if (!isDev && (Object.values(config.adminUsers).some((p) => p === "change-me" || p.length < 10) || config.sessionSecret === "dev-only-secret"))
    throw new Error("Set strong ADMIN_USERS passwords (10+ characters) and SESSION_SECRET before running in production.");
  if (!isDev && !simulated.whatsapp && !config.whatsapp.appSecret) throw new Error("Set WHATSAPP_APP_SECRET so webhook messages can be verified.");
  if (!isDev && config.payments.mode === "sim" && process.env.ALLOW_TEST_MODE !== "1") throw new Error("PAYMENT_MODE=sim isn't allowed in production. Use manual or paynow (or set ALLOW_TEST_MODE=1 on a test server).");
  openDb(dbPath);
  const server = createServer((req, res) => route(req, res).catch((e) => { logEvent(null, "error", `${req.method} ${req.url}: ${e.message}`); if (!res.headersSent) send(res, 500, { error: "Something went wrong. Please try again." }); }));
  const timer = setInterval(() => { J.sweep().catch((e) => logEvent(null, "error", `Sweep: ${e.message}`)); pollPending().catch(() => {}); }, 15e3);
  server.on("close", () => clearInterval(timer));
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const server = await startServer();
  const a = server.address();
  console.log(`Basa seBasa platform on http://localhost:${a.port}  ·  WhatsApp: ${simulated.whatsapp ? "SIMULATED (/sim)" : "live"}  ·  Payments: ${config.payments.mode}${isDev ? "  ·  development" : ""}`);

}
