// Business rules agreed with the founder. Change numbers here, nowhere else.
export const RULES = {
  callout: 9,            // $9 call-out
  calloutPlatform: 1,    // Basa keeps $1, the pro gets $8
  commission: 15,        // % of labour only
  freeKm: 10,            // travel free within 10 km
  perKm: 0.5,            // then $0.50 per km
  ecocashRate: Number(process.env.ECOCASH_RATE || 2), // % EcoCash charges added to the customer's total (placeholder until confirmed)
  payoutHours: 24,       // manual payout within 24 h of the customer paying
  offerSeconds: 60,      // a pro has 60 s to accept
  checkinMinutes: 15,    // safety check-in 15 minutes into every visit
  checkinGraceMinutes: 10, // missed check-in alert after this much extra time
  noShowWaitMinutes: 15, // pro waits 15 min at the gate before closing a visit
  dayStart: 7, dayEnd: 18, // day jobs only, 07:00-18:00 Harare time
  diagnosisValidDays: 30, firstRefusalHours: 24,
  maidRates: { standard: 5, verified: 6, premium: 8 },
};

export const SERVICES = [
  { id: "hvac", name: "Fridge & aircon", guide: [45, 85], checks: ["Power isolated before work", "Leak test done", "Unit cooling at handover"] },
  { id: "elec", name: "Electrical", guide: [35, 70], checks: ["Supply isolated and tested dead", "Earth continuity tested", "Covers refitted"] },
  { id: "plumb", name: "Plumbing", guide: [40, 90], checks: ["Water and power isolated", "Joints pressure-tested", "Hot water restored"] },
  { id: "appl", name: "Appliances", guide: [35, 65], checks: ["Unplugged before opening", "Full test cycle run", "Panels refitted"] },
  { id: "solar", name: "Solar & inverters", guide: [30, 120], checks: ["DC and AC isolated", "Voltages checked", "Tested under load"] },
  { id: "auto", name: "Mechanic", guide: [45, 95], checks: ["Vehicle secured", "Fault confirmed by test", "Run test done"] },
];
export const serviceById = (id) => SERVICES.find((s) => s.id === id);

export const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const usd = (n) => "$" + r2(n).toFixed(2);

export const travelCost = (km) => r2(Math.max(0, km - RULES.freeKm) * RULES.perKm);

// Every amount for a job, from its travel distance and the approved quote.
// Same formulas as the demo, so the numbers match what was reviewed.
export function money({ km = 0, travel = null, labour = 0, parts = 0 } = {}) {
  const t = travel ?? travelCost(km);
  const rate = RULES.ecocashRate / 100;
  const fee = r2(labour * RULES.commission / 100);
  const calloutShare = r2(RULES.callout - RULES.calloutPlatform + t);
  const payout = r2(calloutShare + labour - fee + parts);
  const pay1 = r2((RULES.callout + t) * (1 + rate));               // call-out, before the pro travels
  const base2 = r2(labour + parts);
  const charges2 = r2(base2 * rate + payout * rate);                 // EcoCash charges on collection and payout
  const pay2 = r2(base2 + charges2);                                 // after the work is tested
  const platform = r2(RULES.calloutPlatform + fee);
  return { travel: t, labour, parts, fee, calloutShare, payout, pay1, pay2, charges2, platform, total: r2(pay1 + pay2) };
}

// Harare time (UTC+2, no daylight saving).
export function harareHour(d = new Date()) { return (d.getUTCHours() + 2) % 24; }
export function isDayTime(d = new Date()) { const h = harareHour(d); return h >= RULES.dayStart && h < RULES.dayEnd; }
