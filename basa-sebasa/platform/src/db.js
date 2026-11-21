// SQLite database built into Node (no extra installs). One file, easy to back up.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config.js";

let db;
export function openDb(path = config.dbPath) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS pros (
      id INTEGER PRIMARY KEY, phone TEXT UNIQUE, name TEXT, trade TEXT, suburb TEXT, lat REAL, lng REAL,
      status TEXT DEFAULT 'applied', online INTEGER DEFAULT 0, trust INTEGER DEFAULT 60,
      rating_sum INTEGER DEFAULT 0, rating_n INTEGER DEFAULT 0, jobs_done INTEGER DEFAULT 0,
      ecocash TEXT, pin_hash TEXT, duress_hash TEXT, em_name TEXT, em_phone TEXT,
      data TEXT DEFAULT '{}', created_at INTEGER, updated_at INTEGER);
    CREATE TABLE IF NOT EXISTS customers (phone TEXT PRIMARY KEY, name TEXT, created_at INTEGER);
    CREATE TABLE IF NOT EXISTS convos (phone TEXT PRIMARY KEY, state TEXT, draft TEXT DEFAULT '{}', last_in INTEGER);
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, customer TEXT, pro_id INTEGER, service TEXT, stage TEXT,
      data TEXT DEFAULT '{}', created_at INTEGER, updated_at INTEGER);
    CREATE INDEX IF NOT EXISTS jobs_customer ON jobs(customer);
    CREATE INDEX IF NOT EXISTS jobs_stage ON jobs(stage);
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY, job_id TEXT, kind TEXT, amount REAL, status TEXT DEFAULT 'pending',
      provider TEXT, ref TEXT, poll_url TEXT, note TEXT, created_at INTEGER, updated_at INTEGER);
    CREATE TABLE IF NOT EXISTS payouts (
      id INTEGER PRIMARY KEY, job_id TEXT, pro_id INTEGER, amount REAL, due_at INTEGER, paid_at INTEGER, ref TEXT, by TEXT);
    CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, job_id TEXT, sender TEXT, body TEXT, scrubbed INTEGER, at INTEGER);
    CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, job_id TEXT, tag TEXT, text TEXT, at INTEGER);
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY, job_id TEXT, pro_id INTEGER, kind TEXT, step INTEGER DEFAULT 0, closed INTEGER DEFAULT 0,
      note TEXT, at INTEGER, closed_at INTEGER, closed_by TEXT);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, role TEXT, ref TEXT, expires INTEGER);
    CREATE TABLE IF NOT EXISTS otps (phone TEXT PRIMARY KEY, code TEXT, expires INTEGER, tries INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY, to_phone TEXT, payload TEXT, status TEXT, error TEXT, at INTEGER);
    CREATE TABLE IF NOT EXISTS seen (wamid TEXT PRIMARY KEY, at INTEGER);
  `);
  return db;
}
export const getDb = () => db;

export const one = (sql, ...a) => db.prepare(sql).get(...a);
export const all = (sql, ...a) => db.prepare(sql).all(...a);
export const run = (sql, ...a) => db.prepare(sql).run(...a);

const parse = (row) => (row ? { ...row, data: JSON.parse(row.data || "{}") } : null);

// Jobs keep their changing details (quote, codes, safety, timers) in a JSON column.
export function getJob(id) { return parse(one("SELECT * FROM jobs WHERE id = ?", id)); }
export function saveJob(job) {
  job.updated_at = Date.now();
  run("UPDATE jobs SET pro_id = ?, stage = ?, data = ?, updated_at = ? WHERE id = ?", job.pro_id ?? null, job.stage, JSON.stringify(job.data), job.updated_at, job.id);
  return job;
}
export function insertJob(job) {
  const now = Date.now();
  run("INSERT INTO jobs (id, customer, pro_id, service, stage, data, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
    job.id, job.customer, job.pro_id ?? null, job.service, job.stage, JSON.stringify(job.data || {}), now, now);
  return getJob(job.id);
}
export function getPro(id) { return parse(one("SELECT * FROM pros WHERE id = ?", id)); }
export function getProByPhone(phone) { return parse(one("SELECT * FROM pros WHERE phone = ?", phone)); }
export function savePro(p) {
  run(`UPDATE pros SET name=?, trade=?, suburb=?, lat=?, lng=?, status=?, online=?, trust=?, rating_sum=?, rating_n=?, jobs_done=?,
       ecocash=?, pin_hash=?, duress_hash=?, em_name=?, em_phone=?, data=?, updated_at=? WHERE id=?`,
    p.name, p.trade, p.suburb, p.lat, p.lng, p.status, p.online ? 1 : 0, p.trust, p.rating_sum, p.rating_n, p.jobs_done,
    p.ecocash, p.pin_hash, p.duress_hash, p.em_name, p.em_phone, JSON.stringify(p.data || {}), Date.now(), p.id);
  return p;
}

export function logEvent(jobId, tag, text) { run("INSERT INTO events (job_id, tag, text, at) VALUES (?,?,?,?)", jobId || null, tag, text, Date.now()); }
