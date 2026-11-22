// Ops tools and double taps, in simulation.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env, { PAYMENT_MODE: "sim", SIM_PAY_DELAY_MS: "30", ADMIN_USERS: "dex:test-pass-123" });
import { rmSync } from "node:fs"; rmSync("/tmp/basa-ops-test", { recursive: true, force: true });
const { startServer } = await import("../src/server.js");
const { run } = await import("../src/db.js");
let server, base, ops;
before(async () => { server = await startServer({ port: 0, dbPath: "/tmp/basa-ops-test/b.db" }); base = `http://localhost:${server.address().port}`;
  ops = (await (await fetch(base + "/api/ops/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user: "dex", password: "test-pass-123" }) })).json()).token; });
after(() => server.close());
const api = async (path, body, token) => { const r = await fetch(base + path, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };

test("backup downloads a real database file; payouts list is a spreadsheet", async () => {
  const r = await fetch(base + "/api/ops/backup", { headers: { Authorization: "Bearer " + ops } });
  const buf = Buffer.from(await r.arrayBuffer());
  assert.equal(buf.subarray(0, 15).toString(), "SQLite format 3");
  run("INSERT INTO pros (id, phone, name, trade, status, ecocash, data) VALUES (9, '263770000009', 'Tendai, M', 'hvac', 'verified', '263770000009', '{}')");
  run("INSERT INTO payouts (job_id, pro_id, amount, due_at) VALUES ('BSB-1', 9, 60, ?)", Date.now());
  const csv = await (await fetch(base + "/api/ops/payouts.csv", { headers: { Authorization: "Bearer " + ops } })).text();
  assert.match(csv, /"Tendai, M",\+263770000009,60\.00,BSB-1/);
  assert.equal((await fetch(base + "/api/ops/backup")).status, 401, "needs log-in");
});

test("fast double taps change a job once", async () => {
  const now = Date.now();
  run("INSERT INTO pros (id, phone, name, trade, suburb, lat, lng, status, online, trust, pin_hash, data, created_at, updated_at) VALUES (5,'263772000005','Farai D.','elec','Avondale',-17.795,31.04,'verified',1,90,'x','{}',?,?)", now, now);
  run("INSERT INTO jobs (id, customer, pro_id, service, stage, data, created_at, updated_at) VALUES ('BSB-7777','263771234000',5,'elec','quote_sent',?,?,?)",
    JSON.stringify({ suburb: "Avondale", lat: -17.795, lng: 31.04, declined: [], thread: [], safety: {}, quote: { labour: 30, parts: 0 }, km: 1, travel: 0, pro: { name: "Farai D." } }), now, now);
  const tap = () => api("/sim/api/inbound", { from: "263771234000", reply: "quote:approve" });
  await Promise.all([tap(), tap(), tap()]);
  const out = (await api("/sim/api/outbox?to=263771234000")).body.map((m) => m.payload.text?.body || "");
  assert.equal(out.filter((t) => t.startsWith("Approved ✓")).length, 1, "approved once, one message");
  const t = "pro-test-token"; run("INSERT INTO sessions (token, role, ref, expires) VALUES (?, 'pro', '5', ?)", t, now + 864e5);
  const res = await Promise.all([1, 2, 3].map(() => api("/api/pro/job/BSB-7777/complete", { checks: ["a", "b"] }, t)));
  assert.equal(res.filter((r) => r.status === 200).length, 1, "finished once");
  assert.equal(res.filter((r) => r.status === 409).length, 2);
});
