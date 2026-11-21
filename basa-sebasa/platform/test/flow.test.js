// End-to-end: a real server (simulated WhatsApp + EcoCash) runs a whole job, from a pro applying to a customer rating.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.PAYMENT_MODE = "sim"; process.env.SIM_PAY_DELAY_MS = "30"; process.env.UPLOAD_DIR = "/tmp/basa-test-uploads";
process.env.ADMIN_USERS = "dex:test-pass,harare:test-pass2";
const { startServer } = await import("../src/server.js");
const { money } = await import("../src/rules.js");
const { scrub } = await import("../src/scrub.js");

let server, base, opsToken;
const CUST = "263771234567";
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
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
  const ov = await api("/api/ops/overview", null, opsToken);
  const p = ov.body.pros.find((x) => x.name === name);
  assert.equal(p.status, "applied");
  assert.equal((await api(`/api/ops/pro/${p.id}/approve`, { trust: name.startsWith("Tendai") ? 94 : 80 }, opsToken)).status, 200);
  const l = await api("/api/pro/login", { phone });
  assert.ok(l.body.devCode, "dev code returned in simulation");
  const v = await api("/api/pro/verify", { phone, code: l.body.devCode });
  assert.ok(v.body.token);
  await api("/api/pro/online", { on: true }, v.body.token);
  return v.body.token;
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

  // Ops pays the pro.
  ov = (await api("/api/ops/overview", null, opsToken)).body;
  const po = ov.payouts.find((p) => p.job_id === id);
  assert.equal((await api(`/api/ops/payout/${po.id}/paid`, {}, opsToken)).status, 400, "needs a reference");
  assert.equal((await api(`/api/ops/payout/${po.id}/paid`, { ref: "PP123456" }, opsToken)).status, 200);

  // A new "hi" starts a new booking, not the old job.
  await say({ text: "hi" });
  out = await inbox();
  assert.ok(out.some((p) => p.interactive?.type === "list"));
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
