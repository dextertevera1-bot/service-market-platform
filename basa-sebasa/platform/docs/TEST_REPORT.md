# Test report (23 Nov 2026, Systems Director audit)

Automatic (`npm test`): **41 passed, 0 failed** (T9 Trust milestones, T10 job timer and optional parts) (C12 booking confirmation, T8 total before work added) (call-out at the end: C5, C7, C8 rewritten, C11 added) (27 earlier + 8 parts tests P1–P8 + 1 profile-photo test, 23 Nov 2026). Browser run of the parts path (3 shops price, customer picks option 2, pro collects, paid): passed, no page errors. Browser runs (onboarding with meeting day → job → payout; saved repair): passed, no page errors.

## Mandate §15 scenarios

| # | Scenario | Result | Evidence |
|---|---|---|---|
| C1 | First booking | Pass | flow.test "a whole job" |
| C2 | Returning customer | Pass | flow.test ("hi" after a job starts a new booking) |
| C3 | Wrong category | Pass (after fix) | scenarios C3 |
| C4 | Cancel before acceptance | Pass | flow.test cancel |
| C5 | Cancel after acceptance | Pass (after fix) | scenarios C5 |
| C6 | Unstable connection (duplicate delivery) | Pass | scenarios C6 |
| C7 | Duplicate payment | Pass | scenarios C7 |
| C8 | Insufficient funds | Pass (after fix) | scenarios C8 |
| C9 | Repair after paid diagnosis | Pass | flow.test saved repair |
| C10 | Dispute | Pass | scenarios C10 |
| T1 | New technician registers | Pass | flow.test makePro |
| T2 | Verification fails / pending | Pass | flow.test failed quiz; pending pro can't go online |
| T3 | Accepts | Pass | flow.test |
| T4 | Rejects | Pass | scenarios T4 |
| T5 | Doesn't respond | Pass | scenarios T5 |
| T6 | Loses connectivity | Pass (missed check-in alert) | scenarios T6 |
| T7 | Unavailable after accepting | **Gap**: no pro button; admin re-offer works (A9) | proposal |
| T8 | Submits diagnosis | Pass | flow.test quote |
| T9 | Repeat repair request | Pass | flow.test saved repair (first refusal) |
| T10 | Completes and sees earnings | Pass | flow.test home screen |
| A1 | No technician | Pass | scenarios A1 |
| A2 | Two accept one job | Pass | scenarios A2 |
| A3 | Payment confirmation delayed | **Not executed** (manual-mode alert; tests run in sim mode) | — |
| A4 | Callback twice | Pass (idempotent confirmation) | scenarios A4; Paynow signature path not run live |
| A5 | Completion dispute | Pass | scenarios A5 |
| A6 | Diagnosis expires | Pass | scenarios A6 |
| A7 | First refusal expires | Pass | scenarios A7 |
| A8 | Unauthorised admin action | Pass | scenarios A8 |
| A9 | Reassignment | Pass | scenarios A9 |
| A10 | Integration unavailable | Pass for WhatsApp (retries); Paynow outage fallback **not executed** | reliability.test |

Not executed: live WhatsApp Cloud API, live Paynow/EcoCash (no credentials), production.
