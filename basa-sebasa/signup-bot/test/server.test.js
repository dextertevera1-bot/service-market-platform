// Run: node test/server.test.js  (fakes the WhatsApp API, nothing leaves this machine)
const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "basa-"));
Object.assign(process.env, { WHATSAPP_TOKEN: "t", PHONE_NUMBER_ID: "123", VERIFY_TOKEN: "v", APP_SECRET: "s", FOUNDER_PHONES: "971500000001", BOT_NUMBER: "263770000999", PUBLIC_URL: "http://localhost:3999", ADMIN_KEY: "k", DATA_DIR: dataDir, PORT: "3999" });

const sent = []; let failNextWith = null;
const realFetch = global.fetch;
global.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.startsWith("http://localhost")) return realFetch(url, opts);
  if (url.endsWith("/123/messages")) {
    const body = JSON.parse(opts.body);
    if (failNextWith && body.type !== "template" && body.to === "971500000001") { const code = failNextWith; failNextWith = null; return new Response(JSON.stringify({ error: { code, message: "Re-engagement message" } }), { status: 400 }); }
    sent.push(body); return new Response(JSON.stringify({ messages: [{ id: "wamid.x" }] }));
  }
  if (url.endsWith("/media1")) return new Response(JSON.stringify({ url: "https://lookaside.example/media1", mime_type: "image/jpeg" }));
  if (url.startsWith("https://lookaside.example/")) return new Response(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  throw new Error("unexpected fetch " + url);
};

const { server } = require("../src/server.js");
const base = "http://localhost:3999";
const sign = (raw) => "sha256=" + crypto.createHmac("sha256", "s").update(raw).digest("hex");
let n = 0;
async function inbound(from, message) {
  const raw = JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { messages: [{ from, id: "wamid.in" + ++n, timestamp: String(Math.floor(Date.now() / 1000)), ...message }] } }] }] });
  const r = await realFetch(base + "/webhook", { method: "POST", headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sign(raw) }, body: raw });
  assert.equal(r.status, 200); await new Promise((ok) => setTimeout(ok, 60));
}

server.listen(3999, async () => {
  try {
    let r = await realFetch(base + "/webhook?hub.mode=subscribe&hub.verify_token=v&hub.challenge=42"); assert.equal(await r.text(), "42"); console.log("✓ webhook verification");
    r = await realFetch(base + "/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=42"); assert.equal(r.status, 403);
    r = await realFetch(base + "/webhook", { method: "POST", headers: { "X-Hub-Signature-256": "sha256=00" }, body: "{}" }); assert.equal(r.status, 401); console.log("✓ rejects unsigned webhooks");

    const P = "263771111111";
    await inbound(P, { type: "text", text: { body: "JOIN code TINO" } });
    assert.equal(sent.at(-1).type, "interactive"); assert.equal(sent.at(-1).interactive.type, "button"); console.log("✓ text in → interactive buttons out");
    // the same message delivered twice is ignored
    const before = sent.length; const raw = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: P, id: "wamid.in" + n, type: "text", text: { body: "JOIN" } }] } }] }] });
    await realFetch(base + "/webhook", { method: "POST", headers: { "X-Hub-Signature-256": sign(raw) }, body: raw }); await new Promise((ok) => setTimeout(ok, 60));
    assert.equal(sent.length, before); console.log("✓ duplicate deliveries ignored");

    const tap = (id) => inbound(P, { type: "interactive", interactive: { type: "button_reply", button_reply: { id, title: id } } });
    const pick = (id) => inbound(P, { type: "interactive", interactive: { type: "list_reply", list_reply: { id, title: id } } });
    const say = (t) => inbound(P, { type: "text", text: { body: t } });
    await tap("p:start"); await tap("consent:yes"); await say("Tendai Chikore"); await pick("trade:elec");
    assert.equal(sent.at(-1).interactive.type, "list"); assert(sent.at(-1).interactive.action.sections[0].rows.length > 0); console.log("✓ list messages");
    await pick("years:y3"); await inbound(P, { type: "location", location: { latitude: -17.79, longitude: 31.03, name: "Avondale" } });
    await inbound(P, { type: "image", image: { id: "media1", mime_type: "image/jpeg" } });
    await new Promise((ok) => setTimeout(ok, 100));
    const files = fs.readdirSync(path.join(dataDir, "uploads", "P1001")); assert.deepEqual(files, ["selfie.jpg"]); console.log("✓ selfie downloaded and stored");
    assert(JSON.parse(fs.readFileSync(path.join(dataDir, "store.json"), "utf8")).apps.P1001.docs.selfie.file); console.log("✓ store saved to disk");

    r = await realFetch(base + "/admin?key=k"); assert.equal(r.status, 200);
    r = await realFetch(base + "/admin/P1001?key=k"); const html = await r.text(); assert.match(html, /Tendai Chikore/); assert.match(html, /file\/selfie/);
    r = await realFetch(base + "/admin/P1001/file/selfie?key=k"); assert.equal(r.headers.get("content-type"), "image/jpeg");
    r = await realFetch(base + "/admin?key=nope"); assert.equal(r.status, 403);
    r = await realFetch(base + "/admin/export.csv?key=k"); assert.match(await r.text(), /P1001/); console.log("✓ admin pages, documents and CSV export (key protected)");

    // founder writes after 24h of silence: the API refuses free text, so the template goes instead
    failNextWith = 131047; await say("help");
    const tpl = sent.filter((m) => m.type === "template"); assert(tpl.length >= 1, "template fallback used"); assert.equal(tpl.at(-1).template.name, "admin_alert"); console.log("✓ falls back to an approved template outside the 24-hour window");
    console.log("\nserver tests passed");
  } catch (e) { console.error(e); process.exitCode = 1; }
  server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); setTimeout(() => process.exit(), 50);
});
