// Pro onboarding, following the agreed workflow: 8 steps from sign-up to approval, then 5 probation jobs.
// The pro follows every step in the Pro app; the Harare admin moves the team steps on the ops desk.
import { getPro, savePro, logEvent } from "./db.js";
import { checkPin } from "./safety.js";
import { wa } from "./whatsapp.js";
import { config } from "./config.js";
import { assessmentForPro, grade, makePerms } from "./quiz.js";

export const STEPS = [
  { key: "signup", title: "Sign up", who: "You" },
  { key: "upload", title: "Upload documents", who: "You" },
  { key: "auto", title: "Automatic checks", who: "System" },
  { key: "docs", title: "Document review", who: "Basa team", target: "within 48 hours" },
  { key: "refs", title: "Reference calls", who: "Basa team", target: "within 2 days" },
  { key: "inperson", title: "Meeting day", who: "Basa team + you", target: "about 30 minutes" },
  { key: "induction", title: "Induction and agreement", who: "You + Basa team", target: "about 1 hour" },
  { key: "approved", title: "Approved", who: "Basa team", target: "same day" },
];

export const INDUCTION = [
  { id: "code", text: "Basa Code: never go in without the customer's 4-digit code" },
  { id: "quote", text: "Quote first: no work starts until the customer approves it on WhatsApp" },
  { id: "checks", text: "Tick the safety and test checks before you finish every job" },
  { id: "nocash", text: "No cash and no jobs off the app. All payments by EcoCash" },
  { id: "contacts", text: "Talk to customers only through the app chat. Phone numbers are removed" },
  { id: "money", text: "Basa keeps $1 of the $9 call-out and 15% of labour. Parts are paid back in full. Payouts within 24 hours of the customer paying" },
  { id: "checkins", text: "Safety check-ins with your PIN: 15 minutes into every job, and when you finish" },
  { id: "duress", text: "Duress PIN: if you're forced to check in, use it. The app looks normal, but our Harare admin is alerted and calls the police" },
  { id: "sos", text: "SOS and \"I feel uneasy\" buttons. You can decline or leave any job that feels unsafe" },
  { id: "dayjobs", text: "Day jobs only for now (07:00–18:00)" },
  { id: "incidents", text: "Report every safety incident to Basa seBasa" },
  { id: "independent", text: "You're independent: you choose which jobs to accept. Your first 5 jobs are probation, with a quality call to each customer" },
];

export const AGREEMENT = [
  "I am an independent professional. I choose which jobs to accept.",
  "I will follow the Basa Code, quote-first and safety check-in rules on every job.",
  "I will not take cash or jobs off the app, or share my contact details with customers.",
  "Basa seBasa keeps $1 of each call-out and 15% of labour. Payouts reach my EcoCash within 24 hours of the customer paying.",
  "My first 5 jobs are probation: I must average 4.5 stars or more with no upheld complaint.",
  "Asking for cash, fake documents or an upheld safety complaint can mean suspension or removal.",
];

export const PROBATION_JOBS = 5;

const ob = (p) => (p.data.onboarding ||= { docs: { status: "pending" }, refs: {}, slot: null, inperson: null, induction: { acks: [], practice: {}, signed: null }, loggedIn: false });

// Where each step stands, for both the Pro app and the ops desk.
export function steps(p) {
  const o = ob(p), files = p.data.files || {};
  const st = {};
  st.signup = o.loggedIn ? "done" : "now";
  st.upload = files.idFront && files.selfie ? "done" : "action"; // a request for one more photo is shown on step 4, not as a step backwards
  st.auto = st.upload === "done" ? "done" : "todo";
  st.docs = o.docs.status === "accepted" ? "done" : o.docs.status === "more" ? "action" : "now";
  const refsDone = o.refs.r1 === "positive" && o.refs.r2 === "positive", refsBad = o.refs.r1 === "negative" || o.refs.r2 === "negative";
  st.refs = refsBad ? "failed" : refsDone ? "done" : st.docs === "done" ? "now" : "todo";
  const as = o.assessment;
  st.inperson = o.inperson?.passed ? "done" : o.inperson && !o.inperson.passed ? "failed" : st.refs !== "done" ? "todo"
    : (o.slot && !o.slot.confirmed) || (as?.open && !as.result) ? "action" : "now";
  const ind = o.induction, indDone = ind.acks.length >= INDUCTION.length && ind.practice.safe && ind.practice.duress && ind.signed;
  st.induction = indDone ? "done" : st.inperson === "done" ? "action" : "todo";
  st.approved = p.status === "verified" ? "done" : indDone && st.inperson === "done" && st.refs === "done" && st.docs === "done" ? "now" : "todo";
  if (p.status === "rejected") for (const k of Object.keys(st)) if (st[k] !== "done") st[k] = "failed";
  const detail = {
    auto: "Every required item present, this number not already registered, PINs strong enough. Photos are checked by a person at step 4",
    docs: o.docs.status === "more" ? `We need: ${o.docs.note}` : o.docs.status === "accepted" ? "ID and certificates accepted" : "The team is checking your ID and certificates",
    refs: `Referee 1: ${o.refs.r1 || "not called yet"} · Referee 2: ${o.refs.r2 || "not called yet"}`,
    inperson: o.inperson ? `Documents checked ✓ · trade quiz ${as?.result?.correct}/${as?.result?.of} · questionnaire done ✓` : as?.result ? "Quiz and questionnaire done. The team is finishing your check" : as?.open ? "Take the trade quiz and questionnaire now" : o.slot ? `${o.slot.when} at ${o.slot.where}${o.slot.confirmed ? " · you confirmed ✓" : ""}` : "We'll book a time with you after your references",
    induction: `${ind.acks.length}/${INDUCTION.length} rules · PIN practice ${ind.practice.safe && ind.practice.duress ? "✓" : "to do"} · agreement ${ind.signed ? "signed ✓" : "to sign"}`,
  };
  return STEPS.map((s) => ({ ...s, state: st[s.key], detail: detail[s.key] || "" }));
}
export const readyToApprove = (p) => steps(p).find((s) => s.key === "approved").state === "now";

export function onboardingView(p) {
  const o = ob(p);
  return { steps: steps(p), induction: INDUCTION.map((i) => ({ ...i, done: o.induction.acks.includes(i.id) })), practice: o.induction.practice, signed: o.induction.signed,
    agreement: AGREEMENT, slot: o.slot,
    assessment: o.assessment?.open && !o.assessment.result ? assessmentForPro(p.trade, o.assessment.perms) : null,
    assessmentDone: o.assessment?.result ? { correct: o.assessment.result.correct, of: o.assessment.result.of } : null,
    docsNote: o.docs.status === "more" ? o.docs.note : null, status: p.status, rejectedReason: p.data.rejectedReason || null };
}

const tell = (p, text) => wa.text(p.phone, text);
const first = (p) => p.name.split(" ")[0];

// ----- the pro's own steps (Pro app) -----
export function markLoggedIn(p) { const o = ob(p); if (!o.loggedIn) { o.loggedIn = true; savePro(p); logEvent(null, "onboarding", `${p.name} logged in to the Pro app: phone verified.`); } }

export function ackInduction(p, id) {
  const o = ob(p); if (steps(p).find((s) => s.key === "induction").state !== "action") return { error: "Induction opens after your in-person check." };
  if (!INDUCTION.some((i) => i.id === id)) return { error: "Unknown item" };
  if (!o.induction.acks.includes(id)) o.induction.acks.push(id);
  savePro(p); return { ok: true };
}
// Practise both PINs. Nothing is raised: this is training.
export function practisePin(p, pin) {
  const o = ob(p); if (steps(p).find((s) => s.key === "induction").state !== "action") return { error: "Induction opens after your in-person check." };
  if (checkPin(pin, p.pin_hash)) { o.induction.practice.safe = true; savePro(p); return { ok: true, which: "safe" }; }
  if (checkPin(pin, p.duress_hash)) { o.induction.practice.duress = true; savePro(p); return { ok: true, which: "duress" }; }
  return { error: "That PIN isn't one of yours. Try again." };
}
export async function signAgreement(p, name, agree) {
  const o = ob(p); if (steps(p).find((s) => s.key === "induction").state !== "action") return { error: "Induction opens after your in-person check." };
  if (o.induction.acks.length < INDUCTION.length || !o.induction.practice.safe || !o.induction.practice.duress) return { error: "Go through every rule and practise both PINs first." };
  if (!agree || String(name || "").trim().toLowerCase() !== p.name.trim().toLowerCase()) return { error: `Type your full name exactly as registered: ${p.name}` };
  o.induction.signed = { name: p.name, at: Date.now() }; savePro(p);
  logEvent(null, "onboarding", `${p.name} completed induction and signed the Service Provider Agreement.`);
  return { ok: true };
}
// The pro takes the quiz and questionnaire in the app, once, on the meeting day.
export function submitAssessment(p, answers, attitude) {
  const o = ob(p), as = o.assessment;
  if (!as?.open) return { error: "The quiz opens at your meeting, when the team starts it." };
  if (as.result) return { error: "You've already sent your answers." };
  const r = grade(p.trade, as.perms, answers, attitude); if (r.error) return r;
  as.result = r; savePro(p);
  logEvent(null, "onboarding", `${p.name} finished the meeting-day assessment: trade quiz ${r.correct}/${r.of}${r.safetyMissed.length ? `, ${r.safetyMissed.length} safety question(s) wrong` : ""}; questionnaire ${r.attitudeGood}/${r.attitudeOf}${r.flags.length ? `, ${r.flags.length} flagged` : ""}.`);
  return { ok: true };
}
export function confirmSlot(p) { const o = ob(p); if (!o.slot || o.slot.confirmed) return { error: "Nothing to confirm." }; o.slot.confirmed = Date.now(); savePro(p); logEvent(null, "onboarding", `${p.name} confirmed the meeting: ${o.slot.when}.`); return { ok: true }; }
export function resubmitDocs(p, files) {
  const o = ob(p); if (o.docs.status !== "more") return { error: "Nothing was asked for." };
  p.data.files = { ...(p.data.files || {}), ...files }; o.docs = { status: "pending", resubmittedAt: Date.now() }; savePro(p);
  logEvent(null, "onboarding", `${p.name} sent the documents that were asked for.`); return { ok: true };
}

// ----- the team's steps (ops desk) -----
export async function teamStep(p, b, by) {
  const o = ob(p), s = Object.fromEntries(steps(p).map((x) => [x.key, x.state]));
  if (p.status !== "applied") return { error: "This pro isn't in onboarding." };
  switch (b.step) {
    case "docs":
      if (b.result === "accepted") { o.docs = { status: "accepted", at: Date.now(), by }; await tell(p, `Basa seBasa: your documents are accepted ✓. Next we call your two referees.`); }
      else { if (!b.note) return { error: "Say what's missing." }; o.docs = { status: "more", note: String(b.note).slice(0, 200), at: Date.now(), by }; await tell(p, `Basa seBasa: we need one more thing: ${o.docs.note}. Open your Pro app to send it: ${config.baseUrl}/pro`); }
      break;
    case "refs":
      if (s.docs !== "done") return { error: "Accept the documents first." };
      if (!["r1", "r2"].includes(b.ref) || !["positive", "negative"].includes(b.result)) return { error: "Bad reference result." };
      o.refs[b.ref] = b.result; o.refs[b.ref + "Note"] = String(b.note || "").slice(0, 200); o.refs.by = by;
      if (b.result === "negative") return reject(p, "A reference wasn't positive", by);
      break;
    case "slot":
      if (s.refs !== "done") return { error: "Both references must be positive first." };
      if (!b.when || !b.where) return { error: "Enter the day, time and place." };
      o.slot = { when: String(b.when).slice(0, 60), where: String(b.where).slice(0, 120), confirmed: false, by };
      await tell(p, `Basa seBasa: your meeting is booked for ${o.slot.when} at ${o.slot.where}. Bring ALL your original documents (ID, certificates, anything you uploaded) and your phone with the Pro app; you'll do a short quiz on it. Be ready to talk about your past work. Please confirm in your Pro app: ${config.baseUrl}/pro`);
      break;
    case "open": // on the day, the admin opens the quiz on the pro's phone
      if (!o.slot) return { error: "Book the meeting first." };
      if (o.assessment?.result) return { error: "The quiz has already been taken." };
      o.assessment = { open: Date.now(), by, perms: makePerms(p.trade), tries: (o.assessment?.tries || 0) + 1 };
      break;
    case "retake":
      if (!o.assessment?.result || o.assessment.result.quizPassed) return { error: "Only a failed quiz can be retaken." };
      if ((o.assessment.tries || 1) >= 2) return { error: "The one retake has been used." };
      o.assessment = { open: Date.now(), by, perms: makePerms(p.trade), tries: (o.assessment.tries || 1) + 1, previous: o.assessment.result };
      break;
    case "inperson": {
      const r = o.assessment?.result; if (!r) return { error: "The pro must finish the quiz and questionnaire first." };
      if (!b.docsChecked || !b.photo) return { error: "Tick that the original documents were checked and the profile photo was taken." };
      if (!["strong", "acceptable", "concern"].includes(b.pastWork)) return { error: "Say how the past-work discussion went." };
      const passed = r.quizPassed && b.pastWork !== "concern";
      o.inperson = { passed, docsChecked: true, photo: true, pastWork: b.pastWork, pastWorkNote: String(b.note || "").slice(0, 500), quiz: r.correct, at: Date.now(), by };
      if (!passed) return reject(p, !r.quizPassed ? `trade quiz not passed (${r.correct}/${r.of}${r.safetyMissed.length ? ", a safety question wrong" : ""})` : "concerns about past work", by);
      await tell(p, `Well done ${first(p)}! You passed your meeting-day check (trade quiz ${r.correct}/${r.of}). Last step: the induction and agreement in your Pro app: ${config.baseUrl}/pro`);
      break;
    }
    default: return { error: "Unknown step." };
  }
  const said = { docs: b.result === "accepted" ? "documents accepted" : `asked for more: ${o.docs.note}`, refs: `referee ${b.ref === "r1" ? 1 : 2} ${b.result}`,
    slot: `meeting booked for ${o.slot?.when} at ${o.slot?.where}`, open: "quiz and questionnaire opened on the pro's phone", retake: "one quiz retake allowed",
    inperson: `meeting-day check passed: documents checked, photo taken, quiz ${o.assessment?.result?.correct}/${o.assessment?.result?.of}, past work ${o.inperson?.pastWork}` }[b.step];
  savePro(p); logEvent(null, "onboarding", `${p.name}: ${said} (${by}).`);
  return { ok: true };
}

export async function reject(p, reason, by) {
  p.status = "rejected"; p.online = 0; p.data.rejectedReason = reason; p.data.rejectedAt = Date.now(); savePro(p);
  logEvent(null, "onboarding", `${p.name} not approved by ${by}: ${reason}.`);
  await tell(p, `Basa seBasa: thank you for applying, ${first(p)}. We can't approve your application this time (${reason}). You may reapply after 3 months.`);
  return { ok: true, rejected: true };
}

// Starting Trust Score from the checks passed, as in the onboarding workflow.
// Starting Trust Score out of 100 (capped at 95: nobody starts perfect). The meeting-day quiz and
// questionnaire carry 40 of the 100 points.
export const TRUST_WEIGHTS = { base: 35, documents: 10, references: 10, quiz: 25, attitude: 15, certificate: 5 };
export function trustBreakdown(p, { assumeDocs = false } = {}) {
  const o = ob(p), r = o.assessment?.result, W = TRUST_WEIGHTS;
  const parts = {
    base: W.base,
    documents: o.inperson?.docsChecked || assumeDocs ? W.documents : 0,
    references: o.refs.r1 === "positive" && o.refs.r2 === "positive" ? W.references : 0,
    quiz: r ? Math.round(W.quiz * r.correct / r.of) : 0,
    attitude: r ? Math.round(W.attitude * r.attitudeGood / r.attitudeOf) : 0,
    certificate: p.data.files?.certificate ? W.certificate : 0,
  };
  return { parts, total: Math.min(95, Object.values(parts).reduce((a, b) => a + b, 0)) };
}
export function startingTrust(p) { return trustBreakdown(p).total; }

export async function approve(p, by) {
  if (!readyToApprove(p)) return { error: "Not ready: every step must be done first." };
  p.status = "verified"; p.trust = startingTrust(p);
  p.data = { ...p.data, level: "Bronze", probation: { left: PROBATION_JOBS, ratings: [] }, approvedBy: by, approvedAt: Date.now() };
  savePro(p); logEvent(null, "onboarding", `${p.name} approved by ${by}: Verified, Bronze, Trust Score ${p.trust}, probation ${PROBATION_JOBS} jobs.`);
  await tell(p, `Welcome to Basa seBasa, ${first(p)}! 🎉 You're verified. Trust Score ${p.trust}, Bronze level. Your first ${PROBATION_JOBS} jobs are probation. Open your Pro app and go online: ${config.baseUrl}/pro`);
  return { ok: true };
}

// After each paid job by a pro on probation.
export function probationJobDone(proId, jobId, rating) {
  const p = getPro(proId); const pr = p?.data?.probation; if (!pr || pr.result) return null;
  if (rating != null) pr.ratings.push(rating); else if (pr.left > 0) pr.left -= 1; else return null;
  if (pr.left === 0 && !pr.result && pr.ratings.length >= PROBATION_JOBS) {
    const avg = pr.ratings.reduce((a, b) => a + b, 0) / pr.ratings.length;
    pr.result = avg >= 4.5 ? "passed" : "review"; pr.avg = Math.round(avg * 10) / 10;
    logEvent(jobId, "onboarding", `${p.name} finished probation: average ${pr.avg}★, ${pr.result === "passed" ? "now a full pro" : "needs a review by the team"}.`);
  }
  savePro(p); return pr;
}
