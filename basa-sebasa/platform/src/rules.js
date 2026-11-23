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
  // Parts network, Phase 1 (approved 23 Nov 2026): the pro asks verified suppliers for prices, the customer
  // picks one of up to 3 options (nearest first), the pro buys and fits it, the customer pays it in the
  // balance after testing, at cost. Commission never applies to parts.
  parts: {
    askSuppliers: 6,        // ask up to the 6 nearest verified suppliers for the trade
    maxOptions: 3,          // the customer sees up to 3 options
    replyMinutes: 30,       // suppliers have 30 minutes to reply
    priceValidHours: 48,    // a supplier's price holds for 48 hours
    feeEnabled: false,      // a parts fee is OFF; switching it on is a founder decision (RED)
    feePercent: 3,          // only used if feeEnabled is ever turned on (not wired into money() yet)
    // Supplier checks before going live. PROVISIONAL: recommended, awaiting the founder's confirmation.
    supplierChecks: ["id", "shop", "ecocash", "visit"],
  },
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
