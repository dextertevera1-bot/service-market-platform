// Run: node test/engine.test.js
const assert = require("assert");
const E = require("../src/engine.js");

const C = { founderPhones: ["971500000001"], botNumber: "263770000999", publicUrl: "https://bot.example.com", adminKey: "k" };
const NOW = Date.UTC(2026, 11, 1, 6, 0); // Tue 1 Dec 2026, 08:00 Harare
let store, t = NOW;
const PRO = "263771111111", CUST = "263772222222", F = "971500000001";
const say = (from, input) => { t += 60e3; return E.handle(C, store, from, typeof input === "string" ? { type: "text", text: input } : input, t); };
const tap = (from, id) => say(from, { type: "button", id, title: id });
const img = (from, n) => say(from, { type: "image", mediaId: "m" + n, mime: "image/jpeg" });
const last = (r, to) => r.messages.filter((m) => !to || m.to === to).pop();
const bodyOf = (r, to) => (last(r, to) || {}).body || "";
let passed = 0; const test = (name, fn) => { store = E.newStore(); t = NOW; fn(); passed++; console.log("✓", name); };

// WhatsApp limits: 3 buttons ≤20 chars, list rows ≤10 and titles ≤24, interactive body ≤1024
function checkLimits(r) {
  r.messages.forEach((m) => {
    if (m.kind === "buttons") { assert(m.buttons.length <= 3); m.buttons.forEach((b) => assert(b.title.length <= 20, b.title)); assert(m.body.length <= 1024, "body " + m.body.length); }
    if (m.kind === "list") { assert(m.rows.length <= 10); m.rows.forEach((x) => { assert(x.title.length <= 24, x.title); assert(!x.description || x.description.length <= 72); }); assert(m.body.length <= 1024); assert(m.button.length <= 20); }
    if (m.kind === "text") assert(m.body.length <= 4096);
  });
  return r;
}

function fullPro(opts = {}) {
  let r = checkLimits(say(PRO, opts.first || "Hi Basa, code TINO"));
  assert.match(bodyOf(r), /professional looking for work/);
  r = checkLimits(tap(PRO, "role:pro")); assert.match(bodyOf(r), /How Basa seBasa works/);
  r = checkLimits(tap(PRO, "p:start")); assert.match(bodyOf(r), /Do you agree/);
  r = checkLimits(tap(PRO, "consent:yes")); assert.match(bodyOf(r), /full name/);
  r = checkLimits(say(PRO, "tendai")); assert.match(bodyOf(r), /first name and surname/);
  r = checkLimits(say(PRO, "tendai chikore")); assert.equal(last(r).kind, "list");
  r = checkLimits(tap(PRO, "trade:" + (opts.trade || "elec"))); assert.equal(last(r).kind, "list");
  r = checkLimits(tap(PRO, "years:y5")); assert.match(bodyOf(r), /suburb/);
  r = checkLimits(say(PRO, "avondale"));
  r = checkLimits(say(PRO, "here is my selfie")); assert.match(bodyOf(r), /need a \*photo\*/);
  r = checkLimits(img(PRO, 1)); assert.match(bodyOf(r), /national ID/); assert.equal(r.effects[0].type, "media");
  r = checkLimits(img(PRO, 2));
  r = opts.noQual ? checkLimits(tap(PRO, "qual:none")) : checkLimits(img(PRO, 3));
  r = checkLimits(tap(PRO, "police:later"));
  r = checkLimits(say(PRO, "0712345678")); assert.match(bodyOf(r), /doesn't look like an EcoCash/);
  r = checkLimits(say(PRO, "+263 77 123 4567")); assert.match(bodyOf(r), /name on that EcoCash/);
  r = checkLimits(say(PRO, opts.ecoName || "Tendai Chikore"));
  if (opts.ecoName) { assert.match(bodyOf(r), /doesn't match/); r = checkLimits(tap(PRO, "eco:mine")); }
  assert.match(bodyOf(r), /one reference/);
  r = checkLimits(say(PRO, "my boss")); assert.match(bodyOf(r), /name \*and\* phone/);
  r = checkLimits(say(PRO, "Farai Moyo 0772 123 456")); assert.match(bodyOf(r), /Safety question 1/);
  r = checkLimits(tap(PRO, "safe:1")); assert.match(bodyOf(r), /Safety question 2/);
  r = checkLimits(tap(PRO, opts.wrongSafety ? "safe:0" : "safe:2"));
  return r;
}

test("pro signs up, books a call, founder is told and approves", () => {
  let r = fullPro();
  const list = last(r); assert.equal(list.kind, "list"); assert(list.rows.length >= 2 && list.rows.length <= 10);
  r = checkLimits(tap(PRO, list.rows[0].id)); assert.match(bodyOf(r), /Please check your details/); assert.match(bodyOf(r), /Video call:/);
  r = checkLimits(tap(PRO, "submit"));
  const toPro = r.messages.filter((m) => m.to === PRO), toF = r.messages.filter((m) => m.to === F);
  assert.match(toPro[0].body, /Application \*P1001\* received/);
  assert.match(toF[0].body, /New pro application P1001/); assert.match(toF[0].body, /Came from creator code: TINO/); assert.match(toF[0].body, /Dubai/); assert.match(toF[0].body, /admin\/P1001\?key=k/);
  assert(toF[0].fallbackTemplate, "founder alerts carry a template fallback");
  r = say(PRO, "STATUS"); assert.match(bodyOf(r), /video call is/);
  r = say(F, "LIST"); assert.match(bodyOf(r, F), /P1001 · Tendai Chikore · Electrical · Avondale/);
  r = say(F, "APPROVE P1001"); assert.match(bodyOf(r, PRO), /you're approved/); assert(last(r, PRO).fallbackTemplate); assert.equal(store.apps.P1001.status, "approved");
  r = say(F, "STATS"); assert.match(bodyOf(r, F), /TINO: 1 \/ 0/);
});

test("reminder goes out an hour before the call, once", () => {
  let r = fullPro(); const slotId = last(r).rows[0].id; tap(PRO, slotId); tap(PRO, "submit");
  const slot = store.apps.P1001.slot;
  assert.equal(E.tick(C, store, slot - 2 * 36e5).messages.length, 0);
  r = E.tick(C, store, slot - 50 * 6e4); assert.equal(r.messages.length, 2); assert.match(r.messages[1].body, /Original ID matches/);
  assert.equal(E.tick(C, store, slot - 40 * 6e4).messages.length, 0);
});

test("two pros can't book the same call time", () => {
  let r = fullPro(); const slotId = last(r).rows[0].id;
  // second pro reaches the slot list and picks the same time, but the first submits first
  const PRO2 = "263773333333"; const save = PRO;
  tap(PRO, slotId);
  const run = (from, x) => { t += 60e3; return E.handle(C, store, from, x, t); };
  run(PRO2, { type: "text", text: "JOIN" }); run(PRO2, { type: "button", id: "p:start" }); run(PRO2, { type: "button", id: "consent:yes" }); run(PRO2, { type: "text", text: "Rudo Banda" }); run(PRO2, { type: "button", id: "trade:plumb" }); run(PRO2, { type: "button", id: "years:y1" }); run(PRO2, { type: "text", text: "Mabelreign" });
  run(PRO2, { type: "image", mediaId: "a" }); run(PRO2, { type: "image", mediaId: "b" }); run(PRO2, { type: "button", id: "qual:none" }); run(PRO2, { type: "button", id: "police:later" }); run(PRO2, { type: "text", text: "0781234567" }); run(PRO2, { type: "text", text: "Rudo Banda" }); run(PRO2, { type: "button", id: "ref:skip" }); run(PRO2, { type: "button", id: "safe:0" });
  r = run(PRO2, { type: "button", id: "safe:1" });
  run(PRO2, { type: "button", id: slotId });
  tap(save, "submit");
  r = run(PRO2, { type: "button", id: "submit" }); assert.match(bodyOf(r, PRO2), /just taken/);
  assert.equal(last(r, PRO2).kind, "list");
});

test("flags: no certificate, EcoCash name mismatch, wrong safety answers", () => {
  let r = fullPro({ noQual: true, ecoName: "Mary Chikore", wrongSafety: true });
  assert(r.messages.some((m) => /go through safety with you/.test(m.body)));
  tap(PRO, last(r).rows[0].id); r = tap(PRO, "submit");
  const f = bodyOf(r, F); assert.match(f, /No trade certificate/); assert.match(f, /EcoCash name/); assert.match(f, /1 safety answer wrong/); assert.match(f, /Safety pre-check: 1\/2/);
});

test("trade not open yet: no call is booked, saved for later", () => {
  let r = fullPro({ trade: "appl" });
  assert.match(bodyOf(r), /Please check your details/); r = tap(PRO, "submit");
  assert.match(bodyOf(r, PRO), /opens soon|send them this link/i); assert.equal(store.apps.P1001.status, "waitlist"); assert.match(bodyOf(r, F), /trade not open yet/);
});

test("founder asks for a fix, pro sends the document", () => {
  let r = fullPro(); tap(PRO, last(r).rows[0].id); tap(PRO, "submit");
  r = say(F, "FIX P1001 the ID photo is blurry"); assert.match(bodyOf(r, PRO), /ID photo is blurry/);
  r = img(PRO, 9); assert.match(bodyOf(r, PRO), /check it/); assert.match(bodyOf(r, F), /sent the document/); assert.equal(store.apps.P1001.status, "submitted");
  r = say(F, "REJECT P1001"); assert.match(bodyOf(r, F), /Add a reason/);
  r = say(F, "REJECT P1001 the ID didn't match on the call"); assert.match(bodyOf(r, PRO), /can't approve/);
});

test("customer joins the waitlist; HELP hands over to the founder and back", () => {
  let r = say(CUST, "Hi code RUDO"); r = tap(CUST, "role:customer"); assert.equal(last(r).kind, "list");
  r = tap(CUST, "svc:hvac"); r = say(CUST, "Borrowdale"); assert.match(r.messages[0].body, /on the list for \*Fridge & aircon\* in \*Borrowdale\*/);
  r = say(CUST, "help, when do you open?"); assert.match(bodyOf(r, CUST), /passed you to a person/); assert.match(bodyOf(r, F), /HELP from \+263772222222/);
  r = say(CUST, "are you there?"); assert.equal(r.messages.filter((m) => m.to === CUST).length, 0); assert.match(bodyOf(r, F), /are you there/);
  r = say(F, "REPLY 263772222222 We open on 15 December!"); assert.equal(bodyOf(r, CUST), "We open on 15 December!");
  r = say(F, "DONE 263772222222"); assert(!store.help[CUST]);
  r = say(F, "WAITLIST"); assert.match(bodyOf(r, F), /1 × Fridge & aircon · Borrowdale/);
  r = say(F, "STATS"); assert.match(bodyOf(r, F), /RUDO: 0 \/ 1/);
});

test("DELETE MY DATA removes everything", () => {
  let r = fullPro(); tap(PRO, last(r).rows[0].id); tap(PRO, "submit");
  r = say(PRO, "delete my data"); assert.equal(last(r).kind, "buttons");
  r = tap(PRO, "del:yes"); assert(!store.users[PRO]); assert(!store.apps.P1001); assert.equal(r.effects[0].type, "delete_files");
});

test("unknown founder command shows help; helpers", () => {
  const r = say(F, "hello"); assert.match(bodyOf(r, F), /Admin commands/);
  assert.equal(E._.ecocashNumber("263 78 123 4567"), "0781234567"); assert.equal(E._.ecocashNumber("0712345678"), null);
  assert(E._.namesMatch("Tendai Peter Chikore", "Tendai Chikore")); assert(!E._.namesMatch("Tendai Chikore", "Mary Chikore"));
  assert.equal(E._.refCode("Hi Basa, code tino"), "TINO");
  const slots = E.freeSlots(E.makeConfig(C), E.newStore(), NOW); assert(slots.length >= 9); assert(slots.every((s) => s >= NOW + 3 * 36e5));
  console.log("   first slots:", slots.slice(0, 4).map((s) => E._.slotFounder(s, E.makeConfig(C))).join(" | "));
});

console.log(`\n${passed} tests passed`);
