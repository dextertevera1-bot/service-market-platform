// SQLite database built into Node (no extra installs). One file, easy to back up.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config.js";

let db, openPath = null;
export const dbPath = () => openPath;
export function openDb(path = config.dbPath) {
  openPath = path;
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
    CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
    -- Parts network (Phase 1: job-linked sourcing, for transparency; no money passes through Basa for parts).
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY, phone TEXT UNIQUE, name TEXT, shop TEXT, suburb TEXT, lat REAL, lng REAL,
      trades TEXT, status TEXT DEFAULT 'pending', checks TEXT DEFAULT '{}', note TEXT, created_at INTEGER, updated_at INTEGER);
    CREATE TABLE IF NOT EXISTS part_requests (
      id INTEGER PRIMARY KEY, job_id TEXT, pro_id INTEGER, trade TEXT, description TEXT, status TEXT DEFAULT 'open',
      created_at INTEGER, closes_at INTEGER);
    CREATE TABLE IF NOT EXISTS part_quotes (
      id INTEGER PRIMARY KEY, request_id INTEGER, supplier_id INTEGER, token TEXT UNIQUE, km REAL, price REAL,
      condition TEXT, warranty_days INTEGER, note TEXT, valid_until INTEGER, status TEXT DEFAULT 'invited',
      quoted_at INTEGER, created_at INTEGER);
  `);
  // Columns added after launch (safe to run every start).
  const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  if (!cols("outbox").includes("attempts")) db.exec("ALTER TABLE outbox ADD COLUMN attempts INTEGER DEFAULT 0; ALTER TABLE outbox ADD COLUMN next_at INTEGER DEFAULT 0;");
  // Indexes for the hot paths (Pro app polls every 3 s, ops desk every 5 s, sweep every 15 s).
  db.exec(`
    CREATE INDEX IF NOT EXISTS jobs_pro_stage ON jobs(pro_id, stage, updated_at);
    CREATE INDEX IF NOT EXISTS jobs_updated ON jobs(updated_at);
    CREATE INDEX IF NOT EXISTS jobs_offer_pro ON jobs(json_extract(data,'$.offer.pro')) WHERE stage = 'offered';
    CREATE INDEX IF NOT EXISTS payments_job ON payments(job_id, kind, status);
    CREATE INDEX IF NOT EXISTS payments_status ON payments(status, created_at);
    CREATE INDEX IF NOT EXISTS payouts_job ON payouts(job_id);
    CREATE INDEX IF NOT EXISTS payouts_pro_due ON payouts(pro_id, due_at);
    CREATE INDEX IF NOT EXISTS payouts_open ON payouts(paid_at, due_at);
    CREATE INDEX IF NOT EXISTS alerts_open ON alerts(closed, kind);
    CREATE INDEX IF NOT EXISTS events_job ON events(job_id, id);
    CREATE INDEX IF NOT EXISTS messages_job ON messages(job_id);
    CREATE INDEX IF NOT EXISTS outbox_queue ON outbox(status, next_at);
    CREATE INDEX IF NOT EXISTS outbox_to ON outbox(to_phone, id);
    CREATE INDEX IF NOT EXISTS pros_match ON pros(status, online, trade);
    CREATE INDEX IF NOT EXISTS part_requests_job ON part_requests(job_id, status);
    CREATE INDEX IF NOT EXISTS part_quotes_request ON part_quotes(request_id, status);
    CREATE INDEX IF NOT EXISTS suppliers_status ON suppliers(status);
  `);
  db.exec("PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;");
  return db;
}
export const getDb = () => db;
export function closeDb() { try { db.exec("PRAGMA wal_checkpoint(TRUNCATE)"); db.close(); } catch {} }

// All-or-nothing: either every write in fn happens, or none (e.g. job paid + payout created + pro updated).
let depth = 0;
export function tx(fn) {
  if (depth > 0) return fn();
  depth++; db.exec("BEGIN IMMEDIATE");
  try { const r = fn(); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; } finally { depth--; }
}

// A consistent copy of the whole database, safe to take while running.
export function backupTo(path) { run("VACUUM INTO ?", path); return path; }
export const metaGet = (k) => one("SELECT v FROM meta WHERE k = ?", k)?.v ?? null;
export const metaSet = (k, v) => run("INSERT INTO meta (k, v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", k, String(v));

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
