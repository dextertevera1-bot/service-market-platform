// The customer's WhatsApp conversation. One state per phone number.
import { one, run, all, getJob, logEvent } from "./db.js";
import { wa } from "./whatsapp.js";
import { SERVICES, serviceById, RULES, money, usd, isDayTime } from "./rules.js";
import { findSuburb, nearestSuburb, SUBURBS, CBD, haversine, LAUNCH_RADIUS_KM } from "./places.js";
import { activeJobForCustomer, createJob, customerQuote, customerConfirm, customerRate, customerCancel, relay, STAGE_LABEL, savedRepairFor, customerResume, savedUntil, hDate, jobMoney } from "./jobs.js";
import { raiseAlert } from "./safety.js";
import { withLock } from "./lock.js";

function getConvo(phone) {
  const c = one("SELECT * FROM convos WHERE phone = ?", phone);
  return c ? { ...c, draft: JSON.parse(c.draft || "{}") } : { phone, state: "idle", draft: {} };
}
function setConvo(phone, state, draft = {}) {
  run("INSERT INTO convos (phone, state, draft, last_in) VALUES (?,?,?,?) ON CONFLICT(phone) DO UPDATE SET state = excluded.state, draft = excluded.draft, last_in = excluded.last_in", phone, state, JSON.stringify(draft), Date.now());
}

const GREETING = `Mhoro! 👋 Welcome to *Basa seBasa*: verified home-service pros in Harare.\nEvery pro is ID-checked and tested in person. You pay with EcoCash, and nothing starts until you approve the quote.`;
const lower = (s) => String(s || "").trim().toLowerCase();

// Each customer's messages are handled one at a time, in order (fast double taps can't race each other).
export function handleInbound(msg) { return withLock("phone:" + msg.from, () => handleOne(msg)); }
async function handleOne(msg) {
  // WhatsApp can deliver the same message twice; handle each one once.
  if (msg.id) { if (one("SELECT wamid FROM seen WHERE wamid = ?", msg.id)) return; run("INSERT INTO seen (wamid, at) VALUES (?,?)", msg.id, Date.now()); }
  const phone = msg.from;
  if (!one("SELECT phone FROM customers WHERE phone = ?", phone)) run("INSERT INTO customers (phone, name, created_at) VALUES (?,?,?)", phone, msg.name || null, Date.now());
  const text = lower(msg.text), reply = msg.reply || "";
  const c = getConvo(phone), d = c.draft;

  // Rating after a finished job.
  if (reply.startsWith("rate:")) {
    const j = one("SELECT id FROM jobs WHERE customer = ? AND stage = 'paid' AND json_extract(data,'$.rating') IS NULL ORDER BY updated_at DESC", phone);
    if (j) await withLock("job:" + j.id, () => customerRate(getJob(j.id), Number(reply.slice(5))));
    return;
  }

  const job = activeJobForCustomer(phone);
  if (job) return withLock("job:" + job.id, () => { const fresh = getJob(job.id); return onActiveJob(fresh, msg, text, reply, c); });

  // A saved repair (diagnosed, customer chose "Not now"), valid for 30 days.
  const saved = savedRepairFor(phone);
  if (reply.startsWith("resume:")) {
    if (!saved || reply.slice(7) !== saved.id) { setConvo(phone, "idle"); return wa.text(phone, "Sorry, that saved repair has expired. Type *hi* to book a new visit."); }
    setConvo(phone, "resume_when", { job: saved.id });
    const opts = isDayTime() ? [{ id: "rwhen:now", title: "As soon as possible" }, { id: "rwhen:am", title: "Tomorrow, 08:00" }] : [{ id: "rwhen:am", title: "Tomorrow, 08:00" }, { id: "rwhen:pm", title: "Tomorrow, 14:00" }];
    return wa.buttons(phone, `When should we come back to fix it? Day jobs only (07:00–18:00).`, opts);
  }
  if (reply.startsWith("rwhen:") && c.state === "resume_when" && saved && saved.id === d.job) {
    const when = { now: "As soon as possible", am: "Tomorrow 08:00", pm: "Tomorrow 14:00" }[reply.slice(6)] || "As soon as possible";
    setConvo(phone, "booked", {});
    const r = await withLock("job:" + saved.id, () => customerResume(getJob(saved.id), when));
    if (r.error) return wa.text(phone, "Sorry, that saved repair has expired. Type *hi* to book a new visit.");
    return;
  }
  if (reply === "saved:later") { setConvo(phone, "idle"); return wa.text(phone, `No problem. It stays saved until *${hDate(savedUntil(saved || { data: { deferredAt: Date.now() } }))}*.`); }
  if (saved && reply !== "new" && c.state !== "saved_offer" && !["ask_service", "ask_desc", "ask_photo", "ask_location", "ask_landmark", "ask_when"].includes(c.state)) {
    setConvo(phone, "saved_offer", {});
    return wa.buttons(phone, `Welcome back! 👋 You have a saved repair: *${serviceById(saved.service).name}* (${saved.id}), diagnosed by ${String(saved.data.pro?.name || "your pro").split(" ")[0]}.
${saved.data.quote.note ? `"${saved.data.quote.note}"
` : ""}
To pay after it's fixed and tested: *${usd(jobMoney(saved).pay2)}*. No new call-out. Saved until ${hDate(savedUntil(saved))}.`, [{ id: `resume:${saved.id}`, title: "Go ahead with repair" }, { id: "new", title: "Book something else" }]);
  }

  if (["help", "agent", "person", "human"].includes(text)) {
    raiseAlert(null, null, "help", `customer ${phone} asked for a person`);
    return wa.text(phone, "Our Harare admin will message you shortly. You can also type *hi* to book a pro.");
  }

  switch (c.state) {
    case "ask_service": {
      const s = serviceById(reply.replace("svc:", "")) || SERVICES.find((x) => text && x.name.toLowerCase().includes(text));
      if (!s) return askService(phone);
      setConvo(phone, "ask_desc", { service: s.id });
      return wa.text(phone, `*${s.name}*. In a sentence, what's the problem? You can also send a voice note.`);
    }
    case "ask_desc": {
      if (!msg.text && !msg.media) return wa.text(phone, "Please tell us what's wrong in a sentence, or send a voice note.");
      d.desc = msg.text || (msg.media?.kind === "audio" ? "(voice note)" : "(photo)"); d.media = msg.media || null;
      setConvo(phone, "ask_photo", d);
      return wa.buttons(phone, "Thanks. Can you send a photo of the problem? It helps the pro bring the right parts.", [{ id: "skip", title: "Skip" }]);
    }
    case "ask_photo": {
      if (msg.media?.kind === "image") d.photo = msg.media.id;
      else if (reply !== "skip" && text !== "skip") return wa.buttons(phone, "Send a photo, or tap Skip.", [{ id: "skip", title: "Skip" }]);
      setConvo(phone, "ask_location", d);
      return wa.locationRequest(phone, "Where is the job? Tap *Send location* so we can find the nearest pro, or type your suburb (e.g. Avondale).");
    }
    case "ask_location": {
      let sub = null, lat, lng;
      if (msg.location) { lat = msg.location.lat; lng = msg.location.lng; sub = nearestSuburb(lat, lng); }
      else { sub = findSuburb(msg.text); if (sub) [lat, lng] = SUBURBS[sub]; }
      if (!sub) return wa.text(phone, "Sorry, we didn't recognise that suburb. Please share your location, or type a Harare suburb such as Avondale, Mbare or Borrowdale.");
      if (haversine(lat, lng, ...CBD) > LAUNCH_RADIUS_KM) { setConvo(phone, "idle"); return wa.text(phone, "Sorry, that's outside our launch area. We're only in Harare for now, but we're growing. Type *hi* any time."); }
      Object.assign(d, { suburb: sub, lat, lng, exact: !!msg.location });
      setConvo(phone, "ask_landmark", d);
      logEvent(null, "wa", `Location from ${phone}: ${sub}${msg.location ? " (pin)" : " (typed)"}.`);
      return wa.buttons(phone, `Got it: *${sub}*.\nAny landmark or gate details to help the pro find you? e.g. blue gate opposite the shops`, [{ id: "skip", title: "Skip" }]);
    }
    case "ask_landmark": {
      d.landmark = reply === "skip" || text === "skip" ? "" : String(msg.text || "").slice(0, 200);
      setConvo(phone, "ask_when", d);
      return askWhen(phone, d);
    }
    case "ask_when": {
      if (reply === "cancel" || text === "cancel") { setConvo(phone, "idle"); return wa.text(phone, "No problem. Message us any time."); }
      const when = reply === "when:now" ? "As soon as possible" : reply === "when:am" ? "Tomorrow 08:00" : reply === "when:pm" ? "Tomorrow 14:00" : null;
      if (!when) return askWhen(phone, d);
      d.when = when; setConvo(phone, "booked", {});
      await wa.text(phone, `Looking for the best verified ${serviceById(d.service).name.toLowerCase()} pro near ${d.suburb}…`);
      return createJob(phone, d);
    }
    default: {
      if (c.state === "saved_offer" && reply !== "new") { /* fall through to a fresh booking */ }
      setConvo(phone, "ask_service", {});
      await wa.text(phone, GREETING);
      return askService(phone);
    }
  }
}

function askService(phone) {
  return wa.list(phone, "What do you need help with? We book day jobs only (07:00–18:00).", "Choose a service", SERVICES.map((s) => ({ id: `svc:${s.id}`, title: s.name, description: `Most repairs ${usd(s.guide[0])}–${usd(s.guide[1])} in total` })));
}

function askWhen(phone, d) {
  const s = serviceById(d.service), m = money({ km: 0 });
  const body = `*${s.name} in ${d.suburb}*\n"${d.desc}"\n\nCall-out: *$${RULES.callout}* covers the inspection and travel up to ${RULES.freeKm} km (*${usd(m.pay1)}* with EcoCash charges). Extra travel beyond ${RULES.freeKm} km is shown before you pay.\n\nSimilar repairs usually come to ${usd(s.guide[0])}–${usd(s.guide[1])} in total. Your exact quote comes first, and nothing starts until you approve it.\n\nWe book day jobs only (07:00–18:00). When do you need someone?`;
  const opts = isDayTime() ? [{ id: "when:now", title: "As soon as possible" }, { id: "when:am", title: "Tomorrow, 08:00" }, { id: "cancel", title: "Cancel" }]
    : [{ id: "when:am", title: "Tomorrow, 08:00" }, { id: "when:pm", title: "Tomorrow, 14:00" }, { id: "cancel", title: "Cancel" }];
  return wa.buttons(phone, body, opts);
}

async function onActiveJob(job, msg, text, reply, c) {
  const phone = job.customer;
  if (reply === "quote:approve") return customerQuote(job, true);
  if (reply === "quote:later") return customerQuote(job, false);
  if (reply === "work:yes") return customerConfirm(job, true);
  if (reply === "work:no") return customerConfirm(job, false);
  if (reply === "cancel:yes") { const r = await customerCancel(job); if (r.error) await wa.text(phone, "The pro is already with you, so this job can't be cancelled here. Reply *help* and our Harare admin will call you."); return; }
  if (reply === "cancel:no") return wa.text(phone, "Okay, your booking stays as it is.");
  if (text === "cancel") return wa.buttons(phone, `Cancel booking ${job.id}?`, [{ id: "cancel:yes", title: "Yes, cancel" }, { id: "cancel:no", title: "No, keep it" }]);
  if (["help", "agent", "person", "human"].includes(text)) { raiseAlert(job.id, job.pro_id, "help", "customer asked for a person"); return wa.text(phone, "Our Harare admin will call you shortly."); }
  if (["status", "where", "hi", "hello"].includes(text)) return wa.text(phone, `Your booking ${job.id}: ${STAGE_LABEL[job.stage]}.\nReply *cancel* to cancel, or *help* to talk to our Harare admin. Anything else you type goes to your pro.`);
  if (job.pro_id && !["searching", "offered"].includes(job.stage)) {
    const content = msg.text || (msg.media ? `(${msg.media.kind} sent)` : msg.location ? "(location shared)" : "");
    if (!content) return;
    const s = await relay(job, "customer", content);
    if (s.scrubbed) await wa.text(phone, "For everyone's safety, phone numbers and contact details are removed. Please keep all messages and payments on Basa seBasa.");
    return;
  }
  return wa.text(phone, "We're still finding your pro. We'll message you here as soon as one accepts. Reply *cancel* to cancel.");
}
