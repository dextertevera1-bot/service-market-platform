# Business rules (as implemented, 23 Nov 2026)

Source of truth for prices in code: `src/rules.js`. Change only with founder approval (mandate §5, Level Red).

| Rule | Implemented value | Where |
|---|---|---|
| Inspection and travel (call-out) | Customer pays $7.18 including EcoCash charges within 10 km (pro $6, Basa $1, charges $0.18); Basa's $1 is never shown to customers. Customer confirms the booking and this cost before the pro sets off. | `RULES.callout`, `RULES.calloutPlatform`, `RULES.calloutCharges` |
| Travel | Free within 10 km, then $0.50/km, all to the pro, frozen when the pro accepts | `RULES.freeKm`, `RULES.perKm` |
| Commission | 15% of **labour only** (not parts, not call-out) | `RULES.commission`, `money()` |
| EcoCash charges | Added to the customer's total; placeholder 2% (`ECOCASH_RATE`), real rate to confirm | `RULES.ecocashRate` |
| Payment method | EcoCash only, USD; no cash | `src/payments.js` |
| Payouts | Manual, due within 24 h of the customer paying | `RULES.payoutHours` |
| Quote | Customer approves before any work | `src/jobs.js` |
| Saved diagnosis | Valid 30 days; reminders day 7 and 25; original pro 24 h first refusal | `RULES.diagnosisValidDays`, `RULES.firstRefusalHours` |
| Parts (Phase 1) | Customer chooses 1 of up to 3 verified-supplier prices, nearest first. Pro buys and fits; customer pays the part at cost in the balance after testing. No commission and no parts fee on parts (fee setting OFF). Supplier prices hold 48 h; suppliers have 30 min to reply. | `RULES.parts`, `src/parts.js` |
| Call-out timing | Paid at the end with the repair, in one EcoCash payment (founder decision 23 Nov 2026). If no repair (Not now / not home / cancelled after the pro set off) the call-out is requested then; the pro's share is paid out once collected; a new booking waits until it's paid. | `src/jobs.js` `finalAmount`, `owedCallout` |
| Hours | Day jobs only, 07:00–18:00 Harare | `RULES.dayStart/dayEnd` |
| Safety | Check-in 15 min into each visit and at check-out (PIN); duress PIN; Harare admin calls police | `src/safety.js` |
| Maids | $5 / $6 / $8 per hour | `RULES.maidRates` (not yet in a booking flow) |
| Onboarding pass | Trade quiz ≥ 7/10 with every safety question right, documents checked, photo, past work not "concern"; one retake | `src/onboarding.js`, `src/quiz.js` |
| Starting Trust Score | 35 base + 10 documents + 10 references + up to 25 quiz + up to 15 questionnaire + 5 certificate, cap 95 | `TRUST_WEIGHTS` |

See FOUNDER_DECISIONS.md for where the mandate (§3.3) differs from these.
