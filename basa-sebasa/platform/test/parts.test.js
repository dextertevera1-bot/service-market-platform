// Parts network, Phase 1: verified suppliers quote through a private link, the customer chooses one of up to
// 3 options (nearest first), the pro buys and fits it, the customer pays it at cost in the balance after testing.
// Runs against a real server with simulated WhatsApp and EcoCash (never live payments).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env, { PAYMENT_MODE: "sim", SIM_PAY_DELAY_MS: "40", ADMIN_USERS: "dex:test-pass-123" });
const { startServer } = await import("../src/server.js");
const { run, one, all, getJob, saveJob } = await import("../src/db.js");
const { sweep, optionTotal } = await import("../src/jobs.js");
const { money, RULES } = await import("../src/rules.js");
const { hashPin } = await import("../src/safety.js");

let server, base, ops, tok;
const api = async (path, body, token) => { const r = await fetch(base + path, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (from) => (p) => api("/sim/api/inbound", { from, ...p });
const msgs = async (to) => (await api(`/sim/api/outbox?to=${to}`)).body.map((m) => m.payload);
const texts = async (to) => (await msgs(to)).map((p) => p.text?.body || p.interactive?.body?.text || "");
const tokenOf = async (phone) => (await texts(phone)).map((t) => t.match(/\/supplier\/\?t=([\w-]+)/)?.[1]).filter(Boolean).at(-1);
const PRO = "263772200201";

// Suppliers: four verified fridge-parts shops at different distances from Avondale, one electrical-only, one not yet verified.
const SUPS = [
  { shop: "Avondale Fridge Spares", phone: "263772300001", suburb: "Avondale", trades: ["hvac"] },
  { shop: "Belgravia Cooling", phone: "263772300002", suburb: "Belgravia", trades: ["hvac", "appl"] },
  { shop: "Msasa Refrigeration", phone: "263772300003", suburb: "Msasa", trades: ["hvac"] },
  { shop: "Waterfalls Parts", phone: "263772300004", suburb: "Waterfalls", trades: ["hvac"] },
  { shop: "Sparks Electrical", phone: "263772300005", suburb: "Avondale", trades: ["elec"] },
  { shop: "Unchecked Spares", phone: "263772300006", suburb: "Avondale", trades: ["hvac"] },
];

before(async () => {
  server = await startServer({ port: 0, dbPath: ":memory:" }); base = `http://localhost:${server.address().port}`;
  ops = (await api("/api/ops/login", { user: "dex", password: "test-pass-123" })).body.token;
  const now = Date.now();
  run("INSERT INTO pros (id, phone, name, trade, suburb, lat, lng, status, online, trust, pin_hash, duress_hash, em_name, em_phone, ecocash, data, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    201, PRO, "Tendai M.", "hvac", "Avondale", -17.795, 31.04, "verified", 1, 86, hashPin("1357"), hashPin("9753"), "Rudo", "263782223333", PRO, "{}", now, now);
  tok = "tok-201"; run("INSERT INTO sessions (token, role, ref, expires) VALUES (?, 'pro', '201', ?)", tok, now + 864e5);
});
after(() => server.close());

// Book a fridge repair in Avondale and bring it to "diagnosing" (pro at the gate, code confirmed).
async function toDiagnosing(phone) {
  run("UPDATE jobs SET stage = 'paid' WHERE stage NOT IN ('paid','cancelled','deferred','noshow')");
  run("UPDATE jobs SET data = json_set(data,'$.safety.tracking',0)");
  const s = say(phone);
  for (const m of [{ text: "hi" }, { reply: "svc:hvac" }, { text: "Fridge not cooling" }, { reply: "skip" }, { text: "Avondale" }, { reply: "skip" }, { reply: "when:am" }]) await s(m);
  const id = one("SELECT id FROM jobs WHERE customer = ? ORDER BY created_at DESC", phone).id;
  assert.equal((await api(`/api/pro/offer/${id}/accept`, {}, tok)).status, 200);
  await s({ reply: "book:yes" });
  for (const a of ["trip", "arrive"]) assert.equal((await api(`/api/pro/job/${id}/${a}`, {}, tok)).status, 200, a);
  assert.equal((await api(`/api/pro/job/${id}/verify`, { code: getJob(id).data.code }, tok)).status, 200);
  assert.equal(getJob(id).stage, "diagnosing");
  return id;
}
async function quoteAll(id, prices) {
  // Each invited supplier answers through their private link.
  const out = {};
  for (const s of SUPS) {
    const t = await tokenOf(s.phone); if (!t) continue;
    const v = (await api(`/api/supplier/quote?t=${t}`)).body;
    if (v.status !== "invited") continue;
    const p = prices[s.shop];
    out[s.shop] = p == null ? await api(`/api/supplier/quote?t=${t}`, { action: "decline" }) : await api(`/api/supplier/quote?t=${t}`, { action: "quote", price: p, condition: "new", warrantyDays: 90, note: "in stock" });
  }
  return out;
}

test("P1 a supplier can't go live until every check is done", async () => {
  for (const s of SUPS) assert.equal((await api("/api/ops/supplier", { name: "Owner " + s.shop.split(" ")[0], ...s }, ops)).status, 200, s.shop);
  assert.equal((await api("/api/ops/supplier", { name: "X", ...SUPS[0] }, ops)).status, 400, "same number twice is refused");
  const list = (await api("/api/ops/overview", null, ops)).body.parts.suppliers;
  const first = list.find((s) => s.shop === SUPS[0].shop);
  const r = await api(`/api/ops/supplier/${first.id}/verify`, {}, ops);
  assert.equal(r.status, 409); assert.match(r.body.error, /ID seen.*Shop photo.*EcoCash name matches.*Shop visited/);
  for (const s of list.filter((x) => x.shop !== "Unchecked Spares")) {
    for (const c of RULES.parts.supplierChecks) assert.equal((await api(`/api/ops/supplier/${s.id}/check`, { check: c, value: true }, ops)).status, 200);
    assert.equal((await api(`/api/ops/supplier/${s.id}/verify`, {}, ops)).status, 200);
  }
  assert.match((await texts(SUPS[0].phone)).at(-1), /now a verified parts supplier/);
  assert.equal((await api("/api/ops/overview", null, ops)).body.parts.suppliers.filter((s) => s.status === "verified").length, 5);
});

test("P2 the request goes only to verified suppliers of the trade, and the link shows no customer details", async () => {
  const id = await toDiagnosing("263771300002");
  const r = await api(`/api/pro/job/${id}/partrequest`, { part: "Start relay, Samsung RT38" }, tok);
  assert.equal(r.status, 200); assert.equal(r.body.asked, 4, "4 verified fridge suppliers; not the electrical-only or unverified shop");
  assert.equal(await tokenOf("263772300005"), undefined, "electrical-only shop not asked");
  assert.equal(await tokenOf("263772300006"), undefined, "unverified shop not asked");
  const v = (await api(`/api/supplier/quote?t=${await tokenOf(SUPS[0].phone)}`)).body;
  assert.equal(v.part, "Start relay, Samsung RT38"); assert.equal(v.suburb, "Avondale");
  const leaked = JSON.stringify(v);
  assert.ok(!leaked.includes("263771300002") && !leaked.includes("Tendai"), "no customer number or pro name on the supplier link");
  assert.equal((await api(`/api/supplier/quote?t=not-a-real-token-at-all`)).status, 404);
  assert.equal((await api(`/api/supplier/quote?t=${await tokenOf(SUPS[0].phone)}`, { action: "quote", price: -3, condition: "new" })).status, 409, "bad price refused");
});

test("P3 the pro sees prices nearest first and sends the customer 3 options with totals", async () => {
  const id = one("SELECT id FROM jobs WHERE customer = '263771300002'").id;
  await quoteAll(id, { "Avondale Fridge Spares": 18, "Belgravia Cooling": 15, "Msasa Refrigeration": 12, "Waterfalls Parts": null });
  const P = (await api("/api/pro/state", null, tok)).body.job.parts;
  assert.equal(P.options.length, 3); assert.equal(P.declined, 1);
  assert.deepEqual(P.options.map((o) => o.shop), ["Avondale Fridge Spares", "Belgravia Cooling", "Msasa Refrigeration"], "nearest first, not cheapest first");
  assert.ok(P.options[0].km <= P.options[1].km && P.options[1].km <= P.options[2].km);
  assert.equal((await api(`/api/pro/job/${id}/quote`, { labour: 40, note: "Relay burnt out", partOptions: P.options.map((o) => o.quoteId).concat(999) }, tok)).status, 409, "an unknown option is refused");
  assert.equal((await api(`/api/pro/job/${id}/quote`, { labour: 40, note: "Relay burnt out", partOptions: P.options.map((o) => o.quoteId) }, tok)).status, 200);
  const j = getJob(id); assert.equal(j.stage, "quote_sent"); assert.equal(j.data.quote.options.length, 3); assert.equal(j.data.quote.parts, 0);
  const list = (await msgs("263771300002")).at(-1);
  assert.equal(list.interactive.type, "list");
  const body = list.interactive.body.text, rows = list.interactive.action.sections[0].rows;
  assert.deepEqual(rows.map((r) => r.id), ["quote:opt:1", "quote:opt:2", "quote:opt:3", "quote:later"]);
  assert.match(body, /Part needed: \*Start relay, Samsung RT38\*/);
  assert.ok(body.indexOf("Avondale Fridge Spares") < body.indexOf("Belgravia Cooling") && body.indexOf("Belgravia Cooling") < body.indexOf("Msasa Refrigeration"));
  const t1m = money({ travel: j.data.travel, labour: 40, parts: 18 }), t1 = Math.round((t1m.pay1 + t1m.pay2) * 100) / 100; // call-out paid at the end too
  assert.ok(body.includes("$" + t1.toFixed(2)), "each option shows the total to pay after testing");
  assert.equal(one("SELECT COUNT(*) n FROM part_quotes WHERE status = 'offered'").n, 3, "the 3 options are marked as sent to the customer");
});

test("P4 the customer picks option 2; commission stays on labour only; the pro must collect before finishing", async () => {
  const phone = "263771300002", id = one("SELECT id FROM jobs WHERE customer = ?", phone).id;
  const optionTotalShown = optionTotal(getJob(id), { price: 15 });
  assert.ok((await msgs(phone)).at(-1).interactive.body.text.includes("$" + optionTotalShown.toFixed(2)), "the total shown includes the call-out");
  await say(phone)({ reply: "quote:opt:2" });
  let j = getJob(id);
  assert.equal(j.stage, "working"); assert.equal(j.data.quote.chosen, 2); assert.equal(j.data.quote.parts, 15); assert.equal(j.data.part.shop, "Belgravia Cooling");
  assert.match((await texts(phone)).at(-1), /Option 2.*Belgravia Cooling.*\$15\.00/s);
  assert.match((await texts("263772300002")).at(-1), /Your price was chosen.*order code \*P-\d+\*/s);
  assert.match((await texts("263772300001")).at(-1), /chose another option/);
  assert.equal((await texts("263772300004")).filter((t) => /another option/.test(t)).length, 0, "a shop that didn't quote isn't told");
  const st = (await api("/api/pro/state", null, tok)).body.job;
  assert.equal(st.part.status, "to_collect"); assert.equal(st.part.supplierPhone, "263772300002");
  const r = await api(`/api/pro/job/${id}/complete`, { checks: ["a", "b", "c"] }, tok);
  assert.equal(r.status, 409); assert.match(r.body.error, /collected the part/);
  assert.equal((await api(`/api/pro/job/${id}/partcollected`, {}, tok)).status, 200);
  assert.match((await texts(phone)).at(-1), /collected your part from Belgravia Cooling/);
  assert.equal(one("SELECT status FROM part_quotes WHERE id = ?", j.data.part.quoteId).status, "collected");
  assert.equal((await api(`/api/pro/job/${id}/complete`, { checks: ["a", "b", "c"] }, tok)).status, 200);
  await say(phone)({ reply: "work:yes" }); await wait(150);
  j = getJob(id); assert.equal(j.stage, "paid");
  const m = money({ travel: j.data.travel, labour: 40, parts: 15 });
  assert.equal(m.fee, 6, "15% of $40 labour; nothing on the $15 part");
  assert.equal(one("SELECT amount FROM payments WHERE job_id = ? AND kind = 'final'", id).amount, Math.round((m.pay1 + m.pay2) * 100) / 100, "one payment at the end: call-out + repair");
  assert.equal(Math.round((m.pay1 + m.pay2) * 100) / 100, optionTotalShown, "the customer pays exactly the total shown for option 2");
  assert.equal(one("SELECT amount FROM payouts WHERE job_id = ? ORDER BY id DESC", id).amount, m.payout, "the pro is paid back the part in full");
});

test("P5 a price that expired before the customer chose goes back to the pro for fresh prices", async () => {
  const phone = "263771300005", id = await toDiagnosing(phone);
  await api(`/api/pro/job/${id}/partrequest`, { part: "Thermostat" }, tok);
  await quoteAll(id, { "Avondale Fridge Spares": 20, "Belgravia Cooling": 22 });
  const P = (await api("/api/pro/state", null, tok)).body.job.parts;
  await api(`/api/pro/job/${id}/quote`, { labour: 30, partOptions: P.options.map((o) => o.quoteId) }, tok);
  const j = getJob(id); j.data.quote.options[0].validUntil = Date.now() - 1000; saveJob(j);
  await say(phone)({ text: "1" });
  assert.equal(getJob(id).stage, "diagnosing");
  assert.match((await texts(phone)).at(-1), /price has expired/);
});

test("P6 'Not now' saves the diagnosis; going ahead later gets fresh part prices at the same labour", async () => {
  const phone = "263771300006", id = await toDiagnosing(phone);
  await api(`/api/pro/job/${id}/partrequest`, { part: "Fan motor" }, tok);
  await quoteAll(id, { "Avondale Fridge Spares": 25, "Msasa Refrigeration": 21 });
  const P = (await api("/api/pro/state", null, tok)).body.job.parts;
  await api(`/api/pro/job/${id}/quote`, { labour: 45, partOptions: P.options.map((o) => o.quoteId) }, tok);
  await say(phone)({ reply: "quote:later" });
  assert.equal(getJob(id).stage, "deferred");
  assert.ok((await texts(phone)).some((t) => /Labour stays at \$45\.00.*choose the part again from fresh prices/s.test(t)));
  assert.match((await texts("263772300003")).at(-1), /postponed the repair/);
  await wait(200); // the call-out for this visit is requested and (simulated) paid
  assert.equal(one("SELECT COUNT(*) n FROM payments WHERE job_id = ? AND kind = 'callout' AND status = 'paid'", id).n, 1, "call-out paid for the diagnosis visit");
  const payouts = one("SELECT COUNT(*) n FROM payouts WHERE job_id = ?", id).n;
  assert.equal(payouts, 1, "the pro's call-out share is owed once it's paid");
  // Check out, then the customer goes ahead.
  await api(`/api/pro/job/${id}/checkout`, { pin: "1357" }, tok);
  await say(phone)({ text: "hi" });
  assert.match((await texts(phone)).at(-1), /plus the part at the supplier's price on the day/);
  await say(phone)({ reply: `resume:${id}` }); await say(phone)({ reply: "rwhen:am" });
  assert.equal((await api(`/api/pro/offer/${id}/accept`, {}, tok)).status, 200);
  for (const a of ["trip", "arrive"]) await api(`/api/pro/job/${id}/${a}`, {}, tok);
  await api(`/api/pro/job/${id}/verify`, { code: getJob(id).data.code }, tok);
  assert.equal(getJob(id).stage, "diagnosing", "back to diagnosing to get today's prices");
  assert.match((await texts(phone)).at(-1), /Labour stays at \$45\.00/);
  await api(`/api/pro/job/${id}/partrequest`, { part: "Fan motor" }, tok);
  await quoteAll(id, { "Belgravia Cooling": 19 });
  const P2 = (await api("/api/pro/state", null, tok)).body.job.parts;
  assert.equal((await api(`/api/pro/job/${id}/quote`, { labour: 99, partOptions: P2.options.map((o) => o.quoteId) }, tok)).status, 200);
  assert.equal(getJob(id).data.quote.labour, 45, "labour can't change on a saved repair");
  // Putting it on hold again keeps the original 30 days and doesn't pay the call-out share twice.
  const before = getJob(id).data.deferredAt;
  await say(phone)({ reply: "quote:later" });
  assert.equal(getJob(id).data.deferredAt, before);
  assert.equal(one("SELECT COUNT(*) n FROM payouts WHERE job_id = ?", id).n, payouts);
});

test("P7 no verified supplier for the trade: the pro is told to enter the price; unanswered requests close", async () => {
  const phone = "263771300007", id = await toDiagnosing(phone);
  run("UPDATE suppliers SET status = 'suspended' WHERE trades LIKE '%hvac%'");
  const r = await api(`/api/pro/job/${id}/partrequest`, { part: "Compressor" }, tok);
  assert.equal(r.status, 409); assert.match(r.body.error, /No verified suppliers/);
  run("UPDATE suppliers SET status = 'verified' WHERE shop != 'Unchecked Spares'");
  await api(`/api/pro/job/${id}/partrequest`, { part: "Compressor" }, tok);
  run("UPDATE part_requests SET closes_at = ? WHERE job_id = ?", Date.now() - 1, id);
  await sweep();
  const P = (await api("/api/pro/state", null, tok)).body.job.parts;
  assert.equal(P.status, "closed"); assert.equal(P.options.length, 0);
  const t = await tokenOf(SUPS[0].phone);
  assert.equal((await api(`/api/supplier/quote?t=${t}`, { action: "quote", price: 50, condition: "new" })).status, 409, "a closed request can't be priced");
  // The pro can still quote with a part price they entered themselves.
  assert.equal((await api(`/api/pro/job/${id}/quote`, { labour: 50, parts: 120 }, tok)).status, 200);
});

test("P8 no parts fee is charged: the setting is off", () => {
  assert.equal(RULES.parts.feeEnabled, false);
  const m = money({ labour: 100, parts: 200 });
  assert.equal(m.fee, 15); assert.equal(m.platform, RULES.calloutPlatform + 15);
});
