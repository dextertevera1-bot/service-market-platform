// Technician safety: PINs, check-ins, alerts and the escalation steps the ops desk works through.
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { run, one, all, logEvent } from "./db.js";

export function hashPin(pin) {
  const salt = randomBytes(12).toString("hex");
  return salt + ":" + scryptSync(String(pin), salt, 32).toString("hex");
}
export function checkPin(pin, stored) {
  if (!stored || !pin) return false;
  const [salt, h] = stored.split(":");
  const a = Buffer.from(h, "hex"), b = scryptSync(String(pin), salt, 32);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function weakPin(pin) { return !/^\d{4}$/.test(pin) || /^(\d)\1{3}$/.test(pin) || ["1234", "4321", "0000", "1111", "1212", "2580"].includes(pin); }

// Agreed: the Harare admin and the founder both watch alerts; for any security concern the Harare admin calls the police at once.
export const LADDERS = {
  sos: ["Harare admin calls the police (ZRP) now, with the job address and live location", "Harare admin calls the pro", "Call the pro's emergency contact", "Dex (Dubai) informed; incident report opened"],
  duress: ["Don't call the pro or the customer: it could warn an attacker", "Harare admin calls the police (ZRP) now, with the live location", "Call the pro's emergency contact", "Dex (Dubai) informed; incident report opened"],
  missed: ["Automatic WhatsApp reminder sent to the pro", "Harare admin calls the pro", "Harare admin calls the customer to check on the pro", "Still no answer: Harare admin calls the police (ZRP)", "Call the pro's emergency contact"],
  uneasy: ["Harare admin calls the pro within 2 minutes with a cover story (\"head office calling\")", "If they say the code phrase: Harare admin calls the police (ZRP)"],
  code: ["Three wrong Basa Codes at the gate: call the customer", "Call the pro", "If anything doesn't add up, stop the job and call the police (ZRP)"],
  issue: ["Customer says it isn't working yet: call the customer", "Call the pro and agree the fix", "Log the outcome on the job"],
  unmatched: ["No pro accepted: call verified pros in this trade directly", "Tell the customer the plan"],
  payment: ["Manual EcoCash payment waiting: check the merchant statement", "Confirm it on the job, or call the customer"],
  help: ["Customer asked for a person: message or call them back", "Log what was agreed on the job"],
};
export const ALERT_NAME = { sos: "SOS pressed", duress: "Duress PIN used (silent)", missed: "Missed safety check-in", uneasy: "Pro feels uneasy", code: "Wrong Basa Codes at the gate", issue: "Customer reports a problem", unmatched: "No pro found", payment: "Payment to confirm", help: "Customer asked for a person" };
export const URGENT = ["sos", "duress", "missed", "uneasy", "code"];

export function raiseAlert(jobId, proId, kind, note = "") {
  const open = jobId ? one("SELECT id FROM alerts WHERE job_id = ? AND kind = ? AND closed = 0", jobId, kind)
    : one("SELECT id FROM alerts WHERE job_id IS NULL AND kind = ? AND note = ? AND closed = 0", kind, note);
  if (open) return open.id;
  const r = run("INSERT INTO alerts (job_id, pro_id, kind, note, at) VALUES (?,?,?,?,?)", jobId, proId, kind, note, Date.now());
  logEvent(jobId, "safety", `${ALERT_NAME[kind] || kind}${note ? `: ${note}` : ""}.`);
  return Number(r.lastInsertRowid);
}
export function stepAlert(id, by) {
  const a = one("SELECT * FROM alerts WHERE id = ?", id); if (!a || a.closed) return null;
  const L = LADDERS[a.kind] || [];
  if (a.step < L.length) { run("UPDATE alerts SET step = step + 1 WHERE id = ?", id); logEvent(a.job_id, "safety", `${by}: ${L[a.step]}.`); }
  return one("SELECT * FROM alerts WHERE id = ?", id);
}
export function closeAlert(id, by, note = "") {
  const a = one("SELECT * FROM alerts WHERE id = ?", id); if (!a || a.closed) return null;
  run("UPDATE alerts SET closed = 1, closed_at = ?, closed_by = ? WHERE id = ?", Date.now(), by, id);
  logEvent(a.job_id, "safety", `Alert closed by ${by}: ${ALERT_NAME[a.kind] || a.kind}${note ? ` (${note})` : ""}.`);
  return true;
}
export function openAlerts() { return all("SELECT * FROM alerts WHERE closed = 0 ORDER BY at DESC"); }
