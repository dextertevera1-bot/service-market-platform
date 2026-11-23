// The mandate's simulated journeys (§15): customer, technician and admin scenarios, run against a real server
// with simulated WhatsApp and EcoCash. Each test name carries its scenario number.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env, { PAYMENT_MODE: "sim", SIM_PAY_DELAY_MS: "40", ADMIN_USERS: "dex:test-pass-123" });
const { startServer } = await import("../src/server.js");
const { run, one, getJob, saveJob, getProByPhone } = await import("../src/db.js");
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

test("C5 customer cancels after the pro accepted, before paying: nothing charged", async () => {
  freePros(); const id = await book("263771000005");
  const t = (await offerOf(tok.a)) ? tok.a : tok.b;
  await api(`/api/pro/offer/${id}/accept`, {}, t);
  await sayAs("263771000005")({ text: "cancel" }); await sayAs("263771000005")({ reply: "cancel:yes" });
  assert.equal(getJob(id).stage, "cancelled");
  await wait(120);
  assert.equal(one("SELECT COUNT(*) n FROM payments WHERE job_id = ? AND status = 'paid'", id).n, 0, "the cancelled call-out request is never confirmed");
  // If the customer still approves the EcoCash prompt after cancelling, the money is recorded and flagged as a refund.
  const p = one("SELECT * FROM payments WHERE job_id = ?", id);
  assert.equal(markPaid(p.id, "LATE1", "paynow"), true);
  assert.equal(getJob(id).stage, "cancelled", "the job stays cancelled");
  const ov = (await api("/api/ops/overview", null, ops)).body;
  assert.ok(ov.refunds.some((r) => r.id === id), "shown under Refunds to review");
});

test("C6 unstable connection: the same WhatsApp message delivered twice is handled once", async () => {
  const body = { entry: [{ changes: [{ value: { messages: [{ id: "wamid.DUP1", from: "263771000006", type: "text", text: { body: "hi" }, timestamp: "1" }] } }] }] };
  for (let i = 0; i < 2; i++) await fetch(base + "/webhook/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  await wait(100);
  assert.equal((await outbox("263771000006")).filter((t) => /Welcome to/.test(t)).length, 1);
});

test("C7 + A4 duplicate payment request and duplicate confirmation change nothing twice", async () => {
  freePros(); const id = await book("263771000007");
  const t = (await offerOf(tok.a)) ? tok.a : tok.b;
  await api(`/api/pro/offer/${id}/accept`, {}, t); await wait(120);
  const p = one("SELECT * FROM payments WHERE job_id = ? AND kind = 'callout'", id);
  assert.equal(markPaid(p.id, "AGAIN", "test"), false, "second confirmation ignored");
  assert.equal(one("SELECT COUNT(*) n FROM payments WHERE job_id = ?", id).n, 1, "one call-out request only");
});

test("C8 payment fails (not enough balance): customer is told and can try again", async () => {
  freePros(); process.env.SIM_PAY_DELAY_MS = "999999";
  const { config } = await import("../src/config.js"); const old = config.payments.simDelayMs; config.payments.simDelayMs = 999999;
  const id = await book("263771000008");
  const t = (await offerOf(tok.a)) ? tok.a : tok.b;
  await api(`/api/pro/offer/${id}/accept`, {}, t);
  const p = one("SELECT * FROM payments WHERE job_id = ? AND status = 'pending'", id);
  markFailed(p.id, "insufficient balance"); await wait(50);
  assert.match(await lastFrom("263771000008"), /didn't go through/);
  config.payments.simDelayMs = 30;
  await sayAs("263771000008")({ reply: "pay:retry" }); await wait(150);
  assert.equal(getJob(id).stage, "ready", "paid on the retry");
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
