// The mandate's simulated journeys (§15): customer, technician and admin scenarios, run against a real server
// with simulated WhatsApp and EcoCash. Each test name carries its scenario number.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env, { PAYMENT_MODE: "sim", SIM_PAY_DELAY_MS: "40", ADMIN_USERS: "dex:test-pass-123" });
const { startServer } = await import("../src/server.js");
const { run, one, all, getJob, saveJob, getProByPhone } = await import("../src/db.js");
const { sweep } = await import("../src/jobs.js");
const { markPaid, markFailed } = await import("../src/payments.js");
const { hashPin } = await import("../src/safety.js");

let server, base, ops; const tok = {};
const api = async (path, body, token) => { const r = await fetch(base + path, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const sayAs = (from) => (p) => api("/sim/api/inbound", { from, ...p });
const outbox = async (to) => (await api(`/sim/api/outbox?to=${to}`)).body.map((m) => m.payload.text?.body || m.payload.interactive?.body?.text || "");
const lastFrom = async (to) => (await outbox(to)).at(-1);
// Two verified, online fridge pros, made directly (onboarding is covered in flow.test.js).
function addPro(id, phone, name, suburb, lat, lng) {
  const now = Date.now();
  run("INSERT INTO pros (id, phone, name, trade, suburb, lat, lng, status, online, trust, pin_hash, duress_hash, em_name, em_phone, ecocash, data, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    id, phone, name, "hvac", suburb, lat, lng, "verified", 1, 86, hashPin("1357"), hashPin("9753"), "Rudo", "263782223333", phone, "{}", now, now);
  const t = "tok-" + id; run("INSERT INTO sessions (token, role, ref, expires) VALUES (?, 'pro', ?, ?)", t, String(id), now + 864e5); return t;
}
async function book(phone, extra = []) {
  const say = sayAs(phone);
  for (const m of [{ text: "hi" }, { reply: "svc:hvac" }, { text: "Fridge not cooling" }, { reply: "skip" }, { text: "Avondale" }, { reply: "skip" }, ...extra, { reply: "when:am" }]) await say(m);
  return one("SELECT id FROM jobs WHERE customer = ? ORDER BY created_at DESC", phone).id;
}
const offerOf = async (t) => (await api("/api/pro/state", null, t)).body.offer;

before(async () => {
  server = await startServer({ port: 0, dbPath: ":memory:" }); base = `http://localhost:${server.address().port}`;
  ops = (await api("/api/ops/login", { user: "dex", password: "test-pass-123" })).body.token;
  tok.a = addPro(101, "263772100101", "Tendai M.", "Avondale", -17.795, 31.04);
  tok.b = addPro(102, "263772100102", "Kudzai C.", "Mabelreign", -17.79, 31.0);
});
after(() => server.close());
const freePros = () => { run("UPDATE jobs SET stage = 'cancelled' WHERE stage NOT IN ('paid','cancelled','deferred','noshow')"); run("UPDATE jobs SET data = json_set(data,'$.safety.tracking',0)"); };

test("C3 customer picks the wrong category and starts again", async () => {
  const say = sayAs("263771000003");
  await say({ text: "hi" }); await say({ reply: "svc:elec" }); await say({ text: "back" });
  assert.match(await lastFrom("263771000003"), /What do you need help with/);
  await say({ reply: "svc:hvac" });
  assert.match(await lastFrom("263771000003"), /Fridge & aircon/);
});

test("C5 customer cancels after the pro accepted, before the pro sets off: nothing to pay", async () => {
  freePros(); const id = await book("263771000005");
  const t = (await offerOf(tok.a)) ? tok.a : tok.b;
  await api(`/api/pro/offer/${id}/accept`, {}, t);
  await sayAs("263771000005")({ text: "cancel" }); await sayAs("263771000005")({ reply: "cancel:yes" });
  assert.equal(getJob(id).stage, "cancelled");
  await wait(120);
  assert.equal(one("SELECT COUNT(*) n FROM payments WHERE job_id = ?", id).n, 0, "no EcoCash request at all: the call-out is only paid at the end");
  assert.match(await lastFrom("263771000005"), /nothing to pay/);
});

test("C6 unstable connection: the same WhatsApp message delivered twice is handled once", async () => {
  const body = { entry: [{ changes: [{ value: { messages: [{ id: "wamid.DUP1", from: "263771000006", type: "text", text: { body: "hi" }, timestamp: "1" }] } }] }] };
  for (let i = 0; i < 2; i++) await fetch(base + "/webhook/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  await wait(100);
  assert.equal((await outbox("263771000006")).filter((t) => /Welcome to/.test(t)).length, 1);
});

// Take a job straight to "customer checking the work" (the visit itself is covered in flow.test.js).
async function toConfirm(phone) {
  freePros(); const id = await book(phone);
  const t = (await offerOf(tok.a)) ? tok.a : tok.b;
  await api(`/api/pro/offer/${id}/accept`, {}, t);
  const j = getJob(id); j.stage = "confirm"; j.data.quote = { labour: 30, parts: 0 }; saveJob(j);
  return id;
}

test("C7 + A4 duplicate payment request and duplicate confirmation change nothing twice", async () => {
  const id = await toConfirm("263771000007");
  await sayAs("263771000007")({ reply: "work:yes" }); await sayAs("263771000007")({ reply: "pay:retry" }); await wait(150);
  const pays = all("SELECT * FROM payments WHERE job_id = ?", id);
  assert.equal(pays.length, 1, "one payment request only, even after a repeated tap");
  assert.equal(pays[0].kind, "final");
  const { finalAmount, jobMoney } = await import("../src/jobs.js"); const m = jobMoney(getJob(id));
  assert.equal(pays[0].amount, Math.round((m.pay1 + m.pay2) * 100) / 100, "call-out and repair in one payment at the end");
  assert.equal(markPaid(pays[0].id, "AGAIN", "test"), false, "second confirmation ignored");
  assert.equal(one("SELECT COUNT(*) n FROM payouts WHERE job_id = ?", id).n, 1, "one payout");
});

test("C8 payment fails (not enough balance): customer is told and can try again", async () => {
  const { config } = await import("../src/config.js"); const old = config.payments.simDelayMs; config.payments.simDelayMs = 999999;
  const id = await toConfirm("263771000008");
  await sayAs("263771000008")({ reply: "work:yes" });
  const p = one("SELECT * FROM payments WHERE job_id = ? AND status = 'pending'", id);
  markFailed(p.id, "insufficient balance"); await wait(50);
  assert.match(await lastFrom("263771000008"), /didn't go through/);
  config.payments.simDelayMs = 30;
  await sayAs("263771000008")({ reply: "pay:retry" }); await wait(150);
  assert.equal(getJob(id).stage, "paid", "paid on the retry");
  config.payments.simDelayMs = old;
});

test("C11 customer not home: the call-out is asked for, the pro is paid once it's collected, and a new booking waits until it's paid", async () => {
  const { config } = await import("../src/config.js"); const old = config.payments.simDelayMs; config.payments.simDelayMs = 999999;
  freePros(); const phone = "263771000011", id = await book(phone);
  const t = (await offerOf(tok.a)) ? tok.a : tok.b;
  await api(`/api/pro/offer/${id}/accept`, {}, t); await sayAs(phone)({ reply: "book:yes" });
  await api(`/api/pro/job/${id}/trip`, {}, t); await api(`/api/pro/job/${id}/arrive`, {}, t);
  const j = getJob(id); j.data.testFastNoShow = true; saveJob(j);
  assert.equal((await api(`/api/pro/job/${id}/noshow`, {}, t)).status, 200);
  assert.match(await lastFrom(phone), /inspection and travel is payable for the trip: \*\$7\.18\*/);
  assert.equal(one("SELECT COUNT(*) n FROM payouts WHERE job_id = ?", id).n, 0, "nothing paid out before the customer pays");
  // The customer comes back before paying: asked to settle first.
  await sayAs(phone)({ text: "hi" });
  assert.match(await lastFrom(phone), /still to pay for/);
  const ov = (await api("/api/ops/overview", null, ops)).body;
  assert.ok(ov.owedCallouts.some((o) => o.job_id === id), "listed under Call-outs owed on the ops desk");
  config.payments.simDelayMs = 30;
  await sayAs(phone)({ reply: "pay:due" }); await wait(200);
  assert.equal(one("SELECT COUNT(*) n FROM payments WHERE job_id = ? AND status = 'paid'", id).n, 1);
  assert.equal(one("SELECT amount FROM payouts WHERE job_id = ?", id).amount, 6, "the pro's $6 call-out share is now owed");
  await sayAs(phone)({ text: "hi" });
  assert.match(await lastFrom(phone), /What do you need help with/, "can book again");
  config.payments.simDelayMs = old;
});

test("C10 + A5 customer disputes completion: the job goes back to work and the admin is alerted", async () => {
  freePros(); const id = await book("263771000010");
  const t = (await offerOf(tok.a)) ? tok.a : tok.b; const ph = t === tok.a ? "263772100101" : "263772100102";
  await api(`/api/pro/offer/${id}/accept`, {}, t); await wait(120);
  const j = getJob(id); j.stage = "working"; j.data.quote = { labour: 30, parts: 0 }; saveJob(j);
  await api(`/api/pro/job/${id}/complete`, { checks: ["a", "b"] }, t);
  await sayAs("263771000010")({ reply: "work:no" });
  assert.equal(getJob(id).stage, "working");
  assert.ok(one("SELECT id FROM alerts WHERE job_id = ? AND kind = 'issue' AND closed = 0", id));
  assert.ok(getProByPhone(ph));
});

test("T4 + T5 pro rejects, then the next pro doesn't answer: offer moves on, then waits for a pro", async () => {
  freePros(); const id = await book("263771000014");
  const first = (await offerOf(tok.a)) ? tok.a : tok.b, second = first === tok.a ? tok.b : tok.a;
  await api(`/api/pro/offer/${id}/decline`, {}, first);
  assert.ok(await offerOf(second), "offered to the other pro");
  const j = getJob(id); j.data.offer.expires = Date.now() - 1; saveJob(j);
  await sweep();
  assert.equal(getJob(id).stage, "searching", "no pros left: searching");
});

test("A1 no pro available: the admin is alerted after 3 minutes", async () => {
  const j = getJob(one("SELECT id FROM jobs WHERE customer = '263771000014'").id); j.data.searchingSince = Date.now() - 4 * 60e3; saveJob(j);
  await sweep();
  assert.ok(one("SELECT id FROM alerts WHERE job_id = ? AND kind = 'unmatched'", j.id));
});

test("A2 two pros try to accept one job: only the offered pro can", async () => {
  freePros(); const id = await book("263771000021");
  const offered = (await offerOf(tok.a)) ? tok.a : tok.b, other = offered === tok.a ? tok.b : tok.a;
  const [r1, r2] = await Promise.all([api(`/api/pro/offer/${id}/accept`, {}, other), api(`/api/pro/offer/${id}/accept`, {}, offered)]);
  assert.equal(r1.status, 409); assert.equal(r2.status, 200);
  assert.equal(getJob(id).pro_id, offered === tok.a ? 101 : 102);
});

test("A6 a saved diagnosis expires after 30 days", async () => {
  freePros(); const id = await book("263771000026");
  const j = getJob(id); j.stage = "deferred"; j.pro_id = 101; j.data.quote = { labour: 20, parts: 0 }; j.data.deferredAt = Date.now() - 31 * 864e5; j.data.reminders = [7, 25]; saveJob(j);
  await sweep();
  assert.ok(getJob(id).data.expired);
  await sayAs("263771000026")({ text: "hi" });
  assert.ok(!(await outbox("263771000026")).some((t) => /You have a saved repair/.test(t)), "not offered after expiry");
});

test("A7 first-refusal window expires: the saved repair goes to another pro", async () => {
  freePros(); const id = await book("263771000027");
  const j = getJob(id); j.stage = "deferred"; j.pro_id = 101; j.data.km = 1; j.data.travel = 0; j.data.quote = { labour: 20, parts: 0 }; j.data.deferredAt = Date.now() - 864e5; saveJob(j);
  await sayAs("263771000027")({ reply: `resume:${id}` }); await sayAs("263771000027")({ reply: "rwhen:am" });
  assert.equal(getJob(id).data.offer.pro, 101, "original pro first");
  const k = getJob(id); k.data.offer.expires = Date.now() - 1; saveJob(k);
  await sweep();
  assert.equal(getJob(id).data.offer?.pro, 102, "then the other pro");
});

test("A8 unauthorised admin actions are refused", async () => {
  assert.equal((await api("/api/ops/overview")).status, 401);
  assert.equal((await api("/api/ops/overview", null, tok.a)).status, 401, "a pro's log-in can't open the ops desk");
  assert.equal((await api("/api/ops/pro/101/approve", {}, tok.a)).status, 401);
  assert.equal((await api("/api/pro/state", null, ops)).status, 401, "an ops log-in isn't a pro log-in");
});

test("A9 the admin re-offers a job to another pro", async () => {
  freePros(); const id = await book("263771000029");
  const t = (await offerOf(tok.a)) ? tok.a : tok.b;
  await api(`/api/pro/offer/${id}/accept`, {}, t); await wait(120);
  assert.equal((await api(`/api/ops/job/${id}/reoffer`, {}, ops)).status, 200);
  const j = getJob(id); assert.equal(j.stage, "offered"); assert.notEqual(j.data.offer.pro, t === tok.a ? 101 : 102);
});

test("T6 pro loses connection on site: missed check-in raises an alert", async () => {
  freePros(); const id = await book("263771000016");
  const j = getJob(id); j.stage = "diagnosing"; j.pro_id = 101; j.data.safety = { tracking: 1, checkDue: Date.now() - 11 * 60e3, firstDone: false }; saveJob(j);
  await sweep();
  assert.ok(one("SELECT id FROM alerts WHERE job_id = ? AND kind = 'missed'", id));
});

test("C12 the customer must confirm the booking; no answer in time releases the pro, nothing to pay", async () => {
  freePros(); const phone = "263771000012", id = await book(phone);
  const t = (await offerOf(tok.a)) ? tok.a : tok.b;
  await api(`/api/pro/offer/${id}/accept`, {}, t);
  assert.equal(getJob(id).stage, "await_confirm");
  assert.match(await lastFrom(phone), /Do you confirm this booking\?/);
  const j = getJob(id); j.data.confirmBy = Date.now() - 1; saveJob(j);
  await sweep();
  assert.equal(getJob(id).stage, "cancelled");
  assert.match(await lastFrom(phone), /released\. Nothing to pay/);
  assert.equal(one("SELECT COUNT(*) n FROM payments WHERE job_id = ?", id).n, 0);
  // A customer who taps Cancel at the confirmation also pays nothing.
  freePros(); const id2 = await book("263771000013"); const t2 = (await offerOf(tok.a)) ? tok.a : tok.b;
  await api(`/api/pro/offer/${id2}/accept`, {}, t2); await sayAs("263771000013")({ reply: "book:no" });
  assert.equal(getJob(id2).stage, "cancelled"); assert.match(await lastFrom("263771000013"), /nothing to pay/);
});

test("T8 before sending the quote, the pro sees the total the customer will pay", async () => {
  freePros(); const phone = "263771000014", id = await book(phone);
  const t = (await offerOf(tok.a)) ? tok.a : tok.b;
  await api(`/api/pro/offer/${id}/accept`, {}, t); await sayAs(phone)({ reply: "book:yes" });
  const j = getJob(id); j.stage = "diagnosing"; saveJob(j);
  const st = (await api("/api/pro/state", null, t)).body.job;
  assert.equal(st.calc.pay1, 7.18); assert.equal(st.calc.calloutPaid, false);
  await api(`/api/pro/job/${id}/quote`, { labour: 40, parts: 18, note: "relay" }, t);
  const st2 = (await api("/api/pro/state", null, t)).body.job;
  assert.equal(st2.customerTotal, 67.5, "the pro is told the full total to say to the customer");
  assert.match(await lastFrom(phone), /\$67\.50/);
  const q = (await api(`/sim/api/outbox?to=${phone}`)).body.at(-1).payload;
  assert.deepEqual(q.interactive.action.buttons.map((b) => b.reply.title), ["Approve quote", "Decline for now"]);
});

test("T9 Trust Score: 85 at the start, up only at milestones, down for poor ratings and upheld complaints", async () => {
  const { trustOf, applyTrust, addTrustEvent } = await import("../src/trust.js");
  const now = Date.now(), base = { jobs_done: 0, rating_sum: 0, rating_n: 0, data: { approvedAt: now } };
  assert.equal(trustOf(base).score, 85); assert.equal(trustOf(base).level, "Bronze");
  const silver = { ...base, jobs_done: 5, rating_sum: 24, rating_n: 5, data: { approvedAt: now, probation: { result: "passed" } } };
  assert.equal(trustOf(silver).score, 88); assert.equal(trustOf(silver).level, "Silver");
  const busy = { ...silver, jobs_done: 30, rating_sum: 30 * 4.7, rating_n: 30 };
  assert.equal(trustOf(busy).level, "Silver", "25 jobs isn't enough for Gold without 3 months on the platform");
  const gold = { ...busy, data: { ...busy.data, approvedAt: now - 100 * 864e5 } };
  assert.equal(trustOf(gold).score, 91); assert.equal(trustOf(gold).level, "Gold");
  const slipped = { ...gold, rating_sum: 30 * 4.5 };
  assert.equal(trustOf(slipped).level, "Silver", "a falling rating loses the level again");
  const p = JSON.parse(JSON.stringify(gold)); addTrustEvent(p, "complaint", "upheld: left the job unfinished");
  assert.equal(trustOf(p).score, 83, "an upheld complaint costs 5 points and blocks Gold for 90 days (88 - 5)");
  const q = JSON.parse(JSON.stringify(silver)); addTrustEvent(q, "lowRating", "2 stars"); applyTrust(q);
  assert.equal(q.trust, 85); assert.equal(q.data.level, "Silver");
  const old = JSON.parse(JSON.stringify(silver)); old.data.trustEvents = [{ at: now - 400 * 864e5, kind: "lowRating", pts: 3 }];
  assert.equal(trustOf(old).score, 88, "penalties drop off after 12 months");
});

test("T10 the on-the-job timer runs from the Basa Code to Finished and tested", async () => {
  freePros(); const phone = "263771000015", id = await book(phone);
  const t = (await offerOf(tok.a)) ? tok.a : tok.b;
  await api(`/api/pro/offer/${id}/accept`, {}, t); await sayAs(phone)({ reply: "book:yes" });
  await api(`/api/pro/job/${id}/trip`, {}, t); await api(`/api/pro/job/${id}/arrive`, {}, t);
  assert.equal((await api("/api/pro/state", null, t)).body.job.timer, null, "no timer before the code");
  await api(`/api/pro/job/${id}/verify`, { code: getJob(id).data.code }, t);
  const tm = (await api("/api/pro/state", null, t)).body.job.timer;
  assert.ok(tm.start && tm.end == null, "running from the code");
  await api(`/api/pro/job/${id}/quote`, { labour: 30, parts: 0 }, t);
  assert.match(await lastFrom(phone), /Parts: none needed/, "no parts is fine: parts are optional");
  await sayAs(phone)({ reply: "quote:approve" });
  const j = getJob(id); j.data.codeOk -= 42 * 60e3; saveJob(j);
  await api(`/api/pro/job/${id}/complete`, { checks: ["a", "b", "c"] }, t);
  const st = (await api("/api/pro/state", null, t)).body.job;
  assert.ok(st.timer.end, "stopped at Finished and tested"); assert.equal(getJob(id).data.onJobMinutes, 42);
  await sayAs(phone)({ reply: "work:yes" }); await wait(200);
  const msgs = (await api(`/sim/api/outbox?to=${phone}`)).body.map((m) => m.payload.text?.body || m.payload.interactive?.body?.text || "");
  const r = msgs.findIndex((x) => /Basa seBasa receipt/.test(x));
  assert.ok(r >= 0, "receipt sent on WhatsApp"); assert.match(msgs[r], /Time on the job: \*42 min\*/); assert.match(msgs[r], /Total paid: \$/);
  assert.ok(msgs.findIndex((x) => /How did .* do\?/.test(x)) > r, "receipt first, then the rating request");
});
