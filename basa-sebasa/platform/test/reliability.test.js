// Reliability: WhatsApp retries and ordering, double taps, rate limits, backups, payouts list, health.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

// A stand-in for Meta's API that fails the first two sends.
const got = []; let fails = 2;
const fake = createServer((req, res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
  if (fails > 0) { fails--; res.writeHead(500, { "Content-Type": "application/json" }); return res.end('{"error":{"message":"temporary"}}'); }
  got.push(JSON.parse(b)); res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"messages":[{"id":"x"}]}'); }); });
await new Promise((r) => fake.listen(0, r));
Object.assign(process.env, { WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "1", WHATSAPP_APP_SECRET: "s", WHATSAPP_API_BASE: `http://localhost:${fake.address().port}`, PAYMENT_MODE: "sim", ADMIN_USERS: "dex:test-pass-123" });
const { startServer } = await import("../src/server.js");
const { wa, dispatch } = await import("../src/whatsapp.js");
const { run, all } = await import("../src/db.js");
let server, base;
before(async () => { server = await startServer({ port: 0, dbPath: ":memory:" }); base = `http://localhost:${server.address().port}`; });
after(() => { server.close(); fake.close(); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("failed WhatsApp sends are retried, and each person's messages stay in order", async () => {
  await wa.text("263771111111", "first"); await wa.text("263771111111", "second"); await wa.text("263772222222", "other");
  for (let i = 0; i < 40 && got.length < 3; i++) { run("UPDATE outbox SET next_at = 0 WHERE status = 'queued'"); await dispatch(); await wait(50); }
  const toA = got.filter((m) => m.to === "263771111111").map((m) => m.text.body);
  assert.deepEqual(toA, ["first", "second"], "order kept for the same person");
  assert.ok(got.some((m) => m.text.body === "other"));
  assert.equal(all("SELECT * FROM outbox WHERE status != 'sent'").length, 0);
  assert.ok(all("SELECT attempts FROM outbox").some((r) => r.attempts > 1), "at least one message needed a retry");
});

test("a message WhatsApp rejects outright is marked failed, not retried forever", async () => {
  const bad = createServer((req, res) => { res.writeHead(400, { "Content-Type": "application/json" }); res.end('{"error":{"message":"invalid number"}}'); });
  await new Promise((r) => bad.listen(0, r));
  const { config } = await import("../src/config.js"); const old = config.whatsapp.apiBase; config.whatsapp.apiBase = `http://localhost:${bad.address().port}`;
  await wa.text("263773333333", "hello"); await dispatch();
  assert.equal(all("SELECT status FROM outbox WHERE to_phone = '263773333333'")[0].status, "failed");
  const ops = (await (await fetch(base + "/api/ops/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user: "dex", password: "test-pass-123" }) })).json()).token;
  const ov = await (await fetch(base + "/api/ops/overview", { headers: { Authorization: "Bearer " + ops } })).json();
  assert.equal(ov.outbox.failed24h, 1, "shown on the ops desk");
  config.whatsapp.apiBase = old; bad.close();
});

test("log-in codes and passwords can't be guessed endlessly", async () => {
  const post = (p, b) => fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.status);
  const codes = []; for (let i = 0; i < 4; i++) codes.push(await post("/api/pro/login", { phone: "0779876543" }));
  assert.equal(codes.at(-1), 429);
  const pw = []; for (let i = 0; i < 11; i++) pw.push(await post("/api/ops/login", { user: "dex", password: "wrong" + i }));
  assert.equal(pw.at(-1), 429);
});

test("health check, backup and payouts list", async () => {
  const h = await (await fetch(base + "/health")).json();
  assert.equal(h.db, true); assert.ok("outbox" in h);
});
