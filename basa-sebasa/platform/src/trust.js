// Trust Score (founder, 23 Nov 2026): every pro who passes onboarding starts at 85, and the score grows only on
// significant milestones, the way top platforms recognise their best providers:
//  - Airbnb Superhost: volume (10+ stays), 4.8+ rating, <1% cancellations, 90% response; re-checked every 3 months.
//  - TaskRabbit Elite: 150 lifetime tasks, top performance score, no policy violations.
// Here each milestone needs completed jobs, an average rating, time on the platform and no recent upheld complaint.
// The score is worked out from the pro's record every time (so a falling rating loses the level again, like
// Airbnb's re-check), minus penalties for poor ratings and upheld complaints in the last 12 months.
export const START = 85;
export const STEP = 3;
export const FLOOR = 50;
export const MILESTONES = [
  { level: "Silver", jobs: 5, rating: 4.5, months: 0, what: "Probation passed: first 5 jobs at 4.5★ or more" },
  { level: "Gold", jobs: 25, rating: 4.6, months: 3, what: "25 jobs, 4.6★ or more, 3 months with Basa, no upheld complaint in 90 days" },
  { level: "Platinum", jobs: 75, rating: 4.7, months: 6, what: "75 jobs, 4.7★ or more, 6 months with Basa, no upheld complaint in 90 days" },
  { level: "Elite", jobs: 150, rating: 4.8, months: 12, what: "150 jobs, 4.8★ or more, 12 months with Basa, no upheld complaint in 90 days" },
];
export const PENALTY = { lowRating: 3, complaint: 5 };

const MONTH = 30.44 * 864e5;

export function trustOf(p, now = Date.now()) {
  const d = p.data || {}, events = (d.trustEvents || []).filter((e) => now - e.at < 365 * 864e5);
  const avg = p.rating_n ? p.rating_sum / p.rating_n : 0, months = d.approvedAt ? (now - d.approvedAt) / MONTH : 0;
  const clean90 = !events.some((e) => e.kind === "complaint" && now - e.at < 90 * 864e5);
  let reached = 0;
  for (const [i, m] of MILESTONES.entries()) {
    const ok = i === 0 ? d.probation?.result === "passed" : p.jobs_done >= m.jobs && avg >= m.rating && months >= m.months && clean90;
    if (!ok) break; reached = i + 1;
  }
  const penalties = events.reduce((a, e) => a + e.pts, 0);
  const score = Math.max(FLOOR, START + reached * STEP - penalties);
  const next = MILESTONES[reached];
  return {
    score, level: reached ? MILESTONES[reached - 1].level : "Bronze", reached, penalties,
    next: next && { level: next.level, score: START + (reached + 1) * STEP - penalties, what: next.what,
      progress: { jobs: [Math.min(p.jobs_done, next.jobs), next.jobs], rating: [Math.round(avg * 100) / 100, next.rating], months: [Math.floor(months), next.months] } },
  };
}

// Recalculate and store the score and level; returns the change (for messages).
export function applyTrust(p) {
  const before = { score: p.trust, level: p.data?.level }, t = trustOf(p);
  p.trust = t.score; p.data = { ...(p.data || {}), level: t.level, trustModel: 2 };
  return { before, after: { score: t.score, level: t.level }, up: t.score > (before.score ?? 0) && t.level !== before.level };
}

export function addTrustEvent(p, kind, why) {
  const pts = PENALTY[kind]; if (!pts) return;
  p.data = { ...(p.data || {}), trustEvents: [...(p.data?.trustEvents || []), { at: Date.now(), kind, pts, why: String(why || "").slice(0, 120) }].slice(-50) };
}
