// End-to-end: a real server (simulated WhatsApp + EcoCash) runs a whole job, from a pro applying to a customer rating.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.PAYMENT_MODE = "sim"; process.env.SIM_PAY_DELAY_MS = "30"; process.env.UPLOAD_DIR = "/tmp/basa-test-uploads";
process.env.ADMIN_USERS = "dex:test-pass,harare:test-pass2";
const { startServer } = await import("../src/server.js");
const { money } = await import("../src/rules.js");
const { scrub } = await import("../src/scrub.js");
const { QUIZZES, ATTITUDE } = await import("../src/quiz.js");
const { getProByPhone } = await import("../src/db.js");
// Answers as the applicant would tick them: `wrong` quiz questions and `flagged` statements answered badly.
function answersFor(phone, { wrong = [], flagged = [] } = {}) {
  const p = getProByPhone(phone.replace(/^0/, "263")), perms = p.data.onboarding.assessment.perms, Q = QUIZZES[p.trade];
  const answers = Q.map((x, i) => { const right = perms[i].indexOf(x.a); return wrong.includes(i) ? (right + 1) % x.o.length : right; });
  const attitude = ATTITUDE.map((x, i) => ((x.good !== flagged.includes(i)) ? "agree" : "disagree"));
  return { answers, attitude };
}

let server, base, opsToken; const tokens = {};
const CUST = "263771234567";
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const SELFIE = "data:image/jpeg;base64," + Buffer.alloc(30000, 7).toString("base64"); // stands in for a real 800 px selfie
const api = async (path, body, token) => {
  const r = await fetch(base + path, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const say = (payload) => api("/sim/api/inbound", { from: CUST, ...payload });
let seen = 0;
const inbox = async () => { const r = await api(`/sim/api/outbox?to=${CUST}&after=${seen}`); if (r.body.length) seen = r.body.at(-1).id; return r.body.map((m) => m.payload); };
const textOf = (p) => p.text?.body || p.interactive?.body?.text || "";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function makePro(name, phone, suburb, pin, duress) {
  const r = await api("/api/join", { name, phone, trade: "hvac", suburb, ecocash: phone, emName: "Rudo", emPhone: "0782223333", pin, duress, idFront: PNG, selfie: PNG, consent: true, experience: "8 years" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  // The pro can log in straight away to follow their onboarding.
  const l = await api("/api/pro/login", { phone });
  assert.ok(l.body.devCode, "dev code returned in simulation");
  const token = (await api("/api/pro/verify", { phone, code: l.body.devCode })).body.token;
  assert.ok(token);
  let st = (await api("/api/pro/state", null, token)).body;
  assert.deepEqual(st.onboarding.steps.slice(0, 4).map((x) => x.state), ["done", "done", "done", "now"]);
  assert.equal((await api("/api/pro/online", { on: true }, token)).status, 403, "can't go online during onboarding");
  const ov = await api("/api/ops/overview", null, opsToken);
  const id = ov.body.pros.find((x) => x.name === name).id;
  const step = (b) => api(`/api/ops/pro/${id}/step`, b, opsToken);
  assert.equal((await api(`/api/ops/pro/${id}/approve`, {}, opsToken)).status, 409, "can't approve before the steps");
  assert.equal((await step({ step: "refs", ref: "r1", result: "positive" })).status, 409, "documents first");
  // Documents: ask for more, the pro sends it in the app, then accept.
  await step({ step: "docs", result: "more", note: "a clearer photo of the back of your ID" });
  st = (await api("/api/pro/state", null, token)).body;
  assert.match(st.onboarding.docsNote, /clearer photo/);
  await api("/api/pro/onboarding/docs", { idBack: PNG }, token);
  await step({ step: "docs", result: "accepted" });
  await step({ step: "refs", ref: "r1", result: "positive" });
  await step({ step: "refs", ref: "r2", result: "positive" });
  await step({ step: "slot", when: "Thu 3 Dec, 10:00", where: "Basa office, Avondale" });
  await api("/api/pro/onboarding/confirm-slot", {}, token);
  assert.equal((await api("/api/pro/onboarding/ack", { id: "code" }, token)).status, 409, "induction opens after the meeting");
  assert.equal((await api("/api/pro/onboarding/assessment", { answers: [], attitude: [] }, token)).status, 409, "quiz closed until the admin opens it");
  assert.equal((await step({ step: "inperson", docsChecked: true, photo: true, pastWork: "strong" })).status, 409, "needs the quiz first");
  await step({ step: "open" });
  st = (await api("/api/pro/state", null, token)).body;
  assert.equal(st.onboarding.assessment.quiz.length, 10); assert.equal(st.onboarding.assessment.attitude.length, 12);
  assert.ok(!JSON.stringify(st.onboarding.assessment).includes('"a":'), "no answers sent to the phone");
  const ans = answersFor(phone, { flagged: [0] });
  assert.equal((await api("/api/pro/onboarding/assessment", { answers: ans.answers.slice(0, 5), attitude: ans.attitude }, token)).status, 409, "every question needed");
  assert.equal((await api("/api/pro/onboarding/assessment", ans, token)).status, 200);
  assert.equal((await api("/api/pro/onboarding/assessment", ans, token)).status, 409, "only once");
  const ovA = (await api("/api/ops/overview", null, opsToken)).body.pros.find((x) => x.id === id).onboarding;
  assert.equal(ovA.ob.assessment.result.correct, 10); assert.equal(ovA.ob.assessment.result.flags.length, 1);
  assert.equal(ovA.ob.assessment.perms, undefined, "answer order not sent to the ops desk either");
  let r0 = await step({ step: "inperson", docsChecked: true, photo: true, pastWork: "strong" });
  assert.equal(r0.status, 409); assert.match(r0.body.error, /profile photo/, "the profile photo is compulsory");
  assert.equal((await api("/api/pro/profile-photo", { image: PNG }, token)).status, 400, "a tiny or blurry photo is refused");
  r0 = await api("/api/pro/profile-photo", { image: SELFIE }, token);
  assert.equal(r0.status, 200); assert.equal(r0.body.state.profile.pending.status, "pending");
  assert.equal((await step({ step: "inperson", docsChecked: false, photo: true, pastWork: "strong" })).status, 409, "documents must be checked");
  await step({ step: "inperson", docsChecked: true, photo: true, pastWork: "strong", note: "Showed 3 fridge jobs" });
  // Induction in the app: every rule, both PINs practised, agreement signed.
  st = (await api("/api/pro/state", null, token)).body;
  for (const i of st.onboarding.induction) await api("/api/pro/onboarding/ack", { id: i.id }, token);
  assert.equal((await api("/api/pro/onboarding/practice", { pin: "0001" }, token)).status, 409);
  await api("/api/pro/onboarding/practice", { pin }, token);
  await api("/api/pro/onboarding/practice", { pin: duress }, token);
  assert.equal((await api("/api/pro/onboarding/sign", { name: "Someone Else", agree: true }, token)).status, 409);
  await api("/api/pro/onboarding/sign", { name, agree: true }, token);
  const ov2 = (await api("/api/ops/overview", null, opsToken)).body;
  assert.equal(ov2.pros.find((x) => x.id === id).onboarding.ready, true);
  assert.equal(ov2.alerts.filter((a) => a.kind === "duress").length, 0, "practising the duress PIN raises no alert");
  assert.equal((await api(`/api/ops/pro/${id}/approve`, {}, opsToken)).status, 200);
  st = (await api("/api/pro/state", null, token)).body;
  assert.equal(st.onboarding, null); assert.equal(st.level, "Bronze"); assert.equal(st.probation.left, 5);
  assert.equal(st.pro.trust, 94); // 35 + documents 10 + references 10 + quiz 25 + questionnaire 14 (11 of 12)
  assert.ok(st.profile.approved, "the profile photo was approved face to face at the meeting"); assert.equal(st.profile.pending, null);
  await api("/api/pro/online", { on: true }, token);
  return token;
}

before(async () => { server = await startServer({ port: 0, dbPath: ":memory:" }); base = `http://localhost:${server.address().port}`; });
after(() => server.close());

test("money rules match the agreed demo numbers", () => {
  const m = money({ km: 4, labour: 40, parts: 18 });
  assert.equal(m.pay1, 9.18); assert.equal(m.pay2, 60.36); assert.equal(m.total, 69.54); assert.equal(m.payout, 60); assert.equal(m.platform, 7);
  assert.equal(money({ km: 14 }).travel, 2); // 4 km beyond the free 10 km
});

test("contact details are removed", () => {
  assert.match(scrub("call me on 077 123 4567").text, /\[contact removed\]/);
  assert.match(scrub("email tendai@gmail.com").text, /\[contact removed\]/);
  assert.equal(scrub("I'll be there at 10:30 with 2 parts").scrubbed, false);
});

test("a whole job, end to end", async () => {
  opsToken = (await api("/api/ops/login", { user: "dex", password: "test-pass" })).body.token;
  assert.ok(opsToken);
  assert.equal((await api("/api/ops/login", { user: "dex", password: "nope" })).status, 401);

  // Weak PINs are refused at sign-up.
  const weak = await api("/api/join", { name: "Test Pro", phone: "0771110000", trade: "hvac", suburb: "Avondale", ecocash: "0771110000", emName: "X", emPhone: "0782220000", pin: "1234", duress: "5555", idFront: PNG, selfie: PNG, consent: true });
  assert.equal(weak.status, 400);

  const kudzai = await makePro("Kudzai C.", "0772000001", "Avondale", "2468", "8642");
  const tendai = await makePro("Tendai M.", "0772000002", "Mabelreign", "1357", "9753");
  tokens.kudzai = kudzai; tokens.tendai = tendai;

  // Customer books on WhatsApp.
  await say({ text: "Hi" });
  let out = await inbox();
  assert.ok(out.some((p) => p.interactive?.type === "list"), "service list sent");
  await say({ reply: "svc:hvac" });
  await say({ text: "Fridge not cooling since yesterday" });
  await say({ reply: "skip" });
  out = await inbox();
  assert.ok(out.some((p) => p.interactive?.type === "location_request_message"), "asked for location");
  await say({ type: "location", location: { lat: -17.796, lng: 31.041 } });
  await say({ reply: "skip" });
  out = await inbox();
  const when = out.find((p) => p.interactive?.type === "button" && /When do you need someone/.test(textOf(p)));
  assert.ok(when, "summary with times");
  assert.match(textOf(when), /\$9\.18/);
  await say({ reply: "when:am" });

  // The nearest pro (Kudzai, Avondale) gets the offer first and declines; it moves to Tendai.
  let s = (await api("/api/pro/state", null, kudzai)).body;
  assert.ok(s.offer, "Kudzai has the offer");
  await api(`/api/pro/offer/${s.offer.id}/decline`, {}, kudzai);
  s = (await api("/api/pro/state", null, tendai)).body;
  assert.ok(s.offer, "offer moved to Tendai");
  const id = s.offer.id;
  s = (await api(`/api/pro/offer/${id}/accept`, {}, tendai)).body;
  assert.equal(s.job.stage, "await_callout");
  out = await inbox();
  assert.ok(out.some((p) => /Tendai M\.\* accepted/.test(textOf(p))));
  await wait(150); // simulated EcoCash confirms
  s = (await api("/api/pro/state", null, tendai)).body;
  assert.equal(s.job.stage, "ready");

  // Double taps don't create a second call-out request.
  const ov1 = (await api("/api/ops/overview", null, opsToken)).body;
  assert.equal(ov1.pending.length, 0);

  // Trip, gate, Basa Code.
  await api(`/api/pro/job/${id}/trip`, {}, tendai);
  out = await inbox();
  const code = textOf(out.find((p) => /Basa Code is/.test(textOf(p)))).match(/Basa Code is \*(\d{4})\*/)[1];
  await api(`/api/pro/job/${id}/arrive`, {}, tendai);
  assert.equal((await api(`/api/pro/job/${id}/verify`, { code: "0000" }, tendai)).status, 409);
  s = (await api(`/api/pro/job/${id}/verify`, { code }, tendai)).body.state;
  assert.equal(s.job.stage, "diagnosing");
  assert.ok(s.job.safety.checkDue > Date.now() + 14 * 60e3, "check-in due 15 min after arrival");

  // Safety: wrong PIN refused; duress PIN looks normal to the pro but raises a silent alert.
  assert.equal((await api(`/api/pro/job/${id}/checkin`, { pin: "1111" }, tendai)).status, 409);
  const duress = await api(`/api/pro/job/${id}/checkin`, { pin: "9753" }, tendai);
  assert.equal(duress.status, 200);
  assert.ok(!JSON.stringify(duress.body).includes("duress"), "nothing on the pro's screen mentions duress");
  let ov = (await api("/api/ops/overview", null, opsToken)).body;
  const alert = ov.alerts.find((a) => a.kind === "duress");
  assert.ok(alert, "duress alert on the ops desk");
  assert.equal(alert.pro.em_phone, "263782223333");
  for (let i = 0; i < 4; i++) await api(`/api/ops/alert/${alert.id}/step`, {}, opsToken);
  await api(`/api/ops/alert/${alert.id}/close`, { note: "police and pro confirmed safe" }, opsToken);

  // Chat through the platform, with contact details removed.
  await say({ text: "Please call me on 0771234567 when you're done" });
  s = (await api("/api/pro/state", null, tendai)).body;
  assert.match(s.job.thread.at(-1).text, /\[contact removed\]/);
  await api(`/api/pro/job/${id}/message`, { text: "Sure, nearly done. My number is 0772000002" }, tendai);
  out = await inbox();
  assert.ok(out.some((p) => /Tendai \(your Basa pro\)/.test(textOf(p)) && /\[contact removed\]/.test(textOf(p))));

  // Quote, approval, completion.
  await api(`/api/pro/job/${id}/quote`, { labour: 40, parts: 18, note: "Start relay burnt out. Compressor is fine." }, tendai);
  out = await inbox();
  assert.match(textOf(out.find((p) => /Quote for/.test(textOf(p)))), /\$60\.36/);
  await say({ reply: "quote:approve" });
  assert.equal((await api(`/api/pro/job/${id}/complete`, { checks: ["Power isolated before work"] }, tendai)).status, 409, "needs the checks");
  await api(`/api/pro/job/${id}/complete`, { checks: ["Power isolated before work", "Leak test done", "Unit cooling at handover"] }, tendai);
  await say({ reply: "work:yes" });
  await wait(150);
  s = (await api("/api/pro/state", null, tendai)).body;
  assert.equal(s.job.stage, "paid");
  assert.equal(s.job.safety.needsCheckout, true, "must check out before leaving");

  // Money adds up.
  const detail = (await api(`/api/ops/job/${id}`, null, opsToken)).body;
  const paid = detail.payments.filter((p) => p.status === "paid").reduce((a, p) => a + p.amount, 0);
  assert.equal(Math.round(paid * 100) / 100, 69.54);
  assert.equal(detail.payouts[0].amount, 60);

  await say({ reply: "rate:5" });
  // Checking out with the PIN stops tracking and sends the pro home.
  s = (await api(`/api/pro/job/${id}/checkout`, { pin: "1357" }, tendai)).body.state;
  assert.equal(s.job, null);
  assert.equal(s.home.jobsToday, 1);
  assert.equal(s.home.earnedToday, 60);
  assert.equal(s.home.last.rating, 5);
  assert.equal(s.probation.left, 4, "first probation job counted");
  ov = (await api("/api/ops/overview", null, opsToken)).body;
  assert.ok(ov.probationCalls.some((c) => c.id === id), "probation quality call listed");
  await api(`/api/ops/job/${id}/probation-call`, { note: "Customer happy" }, opsToken);

  // Ops pays the pro.
  ov = (await api("/api/ops/overview", null, opsToken)).body;
  assert.ok(!ov.probationCalls.some((c) => c.id === id));
  const po = ov.payouts.find((p) => p.job_id === id);
  assert.equal((await api(`/api/ops/payout/${po.id}/paid`, {}, opsToken)).status, 400, "needs a reference");
  assert.equal((await api(`/api/ops/payout/${po.id}/paid`, { ref: "PP123456" }, opsToken)).status, 200);

  // A new "hi" starts a new booking, not the old job.
  await say({ text: "hi" });
  out = await inbox();
  assert.ok(out.some((p) => p.interactive?.type === "list"));
});

test("a failed in-person check ends the application", async () => {
  await api("/api/join", { name: "Lloyd Moyo", phone: "0773555111", trade: "appl", suburb: "Highfield", ecocash: "0773555111", emName: "Ann", emPhone: "0783555111", pin: "3691", duress: "7412", idFront: PNG, selfie: PNG, consent: true });
  const id = (await api("/api/ops/overview", null, opsToken)).body.pros.find((x) => x.name === "Lloyd Moyo").id;
  const step = (b) => api(`/api/ops/pro/${id}/step`, b, opsToken);
  await step({ step: "docs", result: "accepted" }); await step({ step: "refs", ref: "r1", result: "positive" }); await step({ step: "refs", ref: "r2", result: "positive" });
  await step({ step: "slot", when: "Fri", where: "Office" });
  await step({ step: "open" });
  const T = (await api("/api/pro/verify", { phone: "0773555111", code: (await api("/api/pro/login", { phone: "0773555111" })).body.devCode })).body.token;
  // 9 out of 10, but the one wrong answer is a safety question: not passed.
  const safeIdx = QUIZZES.appl.findIndex((x) => x.s);
  await api("/api/pro/onboarding/assessment", answersFor("0773555111", { wrong: [safeIdx] }), T);
  await step({ step: "retake" }); // one retake allowed
  await api("/api/pro/onboarding/assessment", answersFor("0773555111", { wrong: [safeIdx] }), T);
  assert.equal((await step({ step: "retake" })).status, 409, "only one retake");
  await api("/api/pro/profile-photo", { image: SELFIE }, T);
  const r = await step({ step: "inperson", docsChecked: true, photo: true, pastWork: "acceptable" });
  assert.equal(r.body.rejected, true, "a wrong safety answer fails whatever the score");
  const l = await api("/api/pro/login", { phone: "0773555111" });
  assert.equal(l.status, 403); assert.match(l.body.error, /reapply after 3 months/);
});

test("saved repair: not now, reminder, go ahead later with no new call-out, same pro first", async () => {
  const { getJob, saveJob } = await import("../src/db.js");
  const { sweep } = await import("../src/jobs.js");
  const phone = "263775550001"; let after = 0;
  const sayS = (p) => api("/sim/api/inbound", { from: phone, ...p });
  const box = async () => { const r = (await api(`/sim/api/outbox?to=${phone}&after=${after}`)).body; if (r.length) after = r.at(-1).id; return r.map((m) => m.payload); };
  await sayS({ text: "hi" }); await sayS({ reply: "svc:hvac" }); await sayS({ text: "Aircon not cold" }); await sayS({ reply: "skip" });
  await sayS({ text: "Avondale" }); await sayS({ reply: "skip" }); await sayS({ reply: "when:am" });
  let who = null, st;
  for (const k of ["kudzai", "tendai"]) { st = (await api("/api/pro/state", null, tokens[k])).body; if (st.offer) { who = k; break; } }
  assert.ok(who, "a pro got the offer");
  const T = tokens[who], id = st.offer.id;
  await api(`/api/pro/offer/${id}/accept`, {}, T); await wait(150);
  await api(`/api/pro/job/${id}/trip`, {}, T);
  let code = textOf((await box()).find((p) => /Basa Code is/.test(textOf(p)))).match(/\*(\d{4})\*/)[1];
  await api(`/api/pro/job/${id}/arrive`, {}, T); await api(`/api/pro/job/${id}/verify`, { code }, T);
  await api(`/api/pro/job/${id}/quote`, { labour: 20, parts: 20, note: "Compressor relay needs replacing" }, T);
  await sayS({ reply: "quote:later" });
  let out = await box();
  assert.ok(out.some((p) => /saved until/.test(textOf(p)) && p.interactive?.action?.buttons?.[0]?.reply?.id === `resume:${id}`), "saved message with a Go ahead button");
  await api(`/api/pro/job/${id}/checkout`, { pin: who === "tendai" ? "1357" : "2468" }, T);

  // Day 8: the reminder goes out.
  const j = getJob(id); j.data.deferredAt -= 8 * 864e5; saveJob(j);
  await sweep();
  out = await box();
  assert.ok(out.some((p) => /still waiting/.test(textOf(p))), "day-7 reminder sent");
  let ov = (await api("/api/ops/overview", null, opsToken)).body;
  assert.ok(ov.savedRepairs.some((r) => r.id === id && r.reminders.includes(7)));

  // Customer comes back: "hi" offers the saved repair.
  await sayS({ text: "hi" });
  out = await box();
  assert.ok(out.some((p) => /You have a saved repair/.test(textOf(p))));
  await sayS({ reply: `resume:${id}` }); await sayS({ reply: "rwhen:am" });
  st = (await api("/api/pro/state", null, T)).body;
  assert.ok(st.offer?.saved?.yours, "the pro who diagnosed it gets first refusal");
  assert.ok(st.offer.expires - Date.now() > 23 * 3600e3, "24 hours to answer");
  assert.equal(st.offer.earnings, 37); // 20 labour - 3 fee + 20 parts; call-out share already paid
  await api(`/api/pro/offer/${id}/accept`, {}, T);
  st = (await api("/api/pro/state", null, T)).body;
  assert.equal(st.job.stage, "ready", "no new call-out to pay");
  await api(`/api/pro/job/${id}/trip`, {}, T);
  code = textOf((await box()).find((p) => /Basa Code is/.test(textOf(p)))).match(/\*(\d{4})\*/)[1];
  await api(`/api/pro/job/${id}/arrive`, {}, T);
  st = (await api(`/api/pro/job/${id}/verify`, { code }, T)).body.state;
  assert.equal(st.job.stage, "working", "straight to the approved repair");
  await api(`/api/pro/job/${id}/complete`, { checks: ["a", "b", "c"] }, T);
  await sayS({ reply: "work:yes" }); await wait(150);
  const detail = (await api(`/api/ops/job/${id}`, null, opsToken)).body;
  assert.deepEqual(detail.payments.filter((p) => p.status === "paid").map((p) => p.kind).sort(), ["callout", "final"], "one call-out only");
  assert.deepEqual(detail.payouts.map((p) => p.amount).sort((a, b) => a - b), [8, 37]);
});

test("customer can cancel before the pro sets off, and nothing is charged", async () => {
  const phone = "263779999999";
  const sayX = (p) => api("/sim/api/inbound", { from: phone, ...p });
  await sayX({ text: "hi" }); await sayX({ reply: "svc:hvac" }); await sayX({ text: "Aircon leaking" }); await sayX({ reply: "skip" });
  await sayX({ text: "Avondale" }); await sayX({ reply: "skip" }); await sayX({ reply: "when:am" });
  await sayX({ text: "cancel" }); await sayX({ reply: "cancel:yes" });
  const out = (await api(`/sim/api/outbox?to=${phone}`)).body.map((m) => m.payload);
  assert.ok(out.some((p) => /nothing to refund/.test(p.text?.body || "")));
});

test("webhook verification and signature check", async () => {
  const r = await fetch(`${base}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=basa-verify&hub.challenge=42`);
  assert.equal(await r.text(), "42");
  const bad = await fetch(`${base}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=42`);
  assert.equal(bad.status, 403);
});

test("profile photo is compulsory: no photo, no going online; the team checks every new photo", async () => {
  const { run: dbrun, getPro } = await import("../src/db.js");
  const now = Date.now();
  dbrun("INSERT INTO pros (id, phone, name, trade, suburb, lat, lng, status, online, trust, data, created_at, updated_at) VALUES (77,'263772777777','Farai Photo','elec','Avondale',-17.795,31.04,'verified',0,80,'{}',?,?)", now, now);
  dbrun("INSERT INTO sessions (token, role, ref, expires) VALUES ('tok-77','pro','77',?)", now + 864e5);
  const ops = (await api("/api/ops/login", { user: "dex", password: "test-pass" })).body.token;
  let r = await api("/api/pro/online", { on: true }, "tok-77");
  assert.equal(r.status, 409); assert.match(r.body.error, /profile photo/);
  await api("/api/pro/profile-photo", { image: SELFIE }, "tok-77");
  r = await api("/api/pro/online", { on: true }, "tok-77");
  assert.equal(r.status, 409); assert.match(r.body.error, /being checked/);
  assert.ok((await api("/api/ops/overview", null, ops)).body.pros.find((p) => p.id === 77).data.profileNew, "shown on the ops desk to check");
  assert.equal((await api("/api/ops/file/77/profilePending", null, ops)).status, 200, "the team can open the new photo");
  assert.equal((await api("/api/ops/pro/77/profile", { result: "redo" }, ops)).status, 409, "a reason is needed");
  await api("/api/ops/pro/77/profile", { result: "redo", note: "wearing sunglasses" }, ops);
  assert.equal((await api("/api/pro/state", null, "tok-77")).body.profile.pending.note, "wearing sunglasses");
  await api("/api/pro/profile-photo", { image: SELFIE }, "tok-77");
  assert.equal((await api("/api/ops/pro/77/profile", { result: "approved" }, ops)).status, 200);
  assert.equal((await api("/api/pro/online", { on: true }, "tok-77")).status, 200);
  assert.ok(getPro(77).data.photo, "customers now see this photo");
  assert.equal((await fetch(base + "/media/pro/77")).status, 200);
  // A later change keeps the approved photo live until the new one is checked, and the pro stays online.
  await api("/api/pro/profile-photo", { image: SELFIE }, "tok-77");
  const before = getPro(77).data.photo; const st = (await api("/api/pro/state", null, "tok-77")).body;
  assert.ok(st.profile.approved); assert.equal(st.profile.pending.status, "pending"); assert.equal(st.pro.online, true); assert.equal(getPro(77).data.photo, before);
});
