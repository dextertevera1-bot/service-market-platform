# Audit register

| Date | Priority | Component | Finding | Status |
|---|---|---|---|---|
| 23 Nov 2026 | P2 | Onboarding step 3 / Workflow doc | Doc claimed automatic selfie-to-ID and EcoCash-name checks that the system does not do | Fixed: wording corrected in app and doc |
| 23 Nov 2026 | P2 | Pro Trust Score | New pro shows 95 with zero jobs; customers may read it as track record | Proposal (Trust Card / new-pro label) |
| 23 Nov 2026 | P1 | Business rules | Mandate §3.3 differs from built rules (commission base, $1 transport, categories) | Founder decision needed |
| 23 Nov 2026 | P2 | Deployment | Render deploys every push to main; fine for testing, not for live customers | Proposal: staging branch before launch |
| 23 Nov 2026 | P2 | Ops desk | Failed quiz not explained; past/night meetings bookable; misleading Trust preview | Fixed (commit eb7aad9) |
| 23 Nov 2026 | **P1** | Payments | Customer cancels after the pro accepts but before paying: the pending EcoCash request could still be confirmed later, charging a cancelled booking with no refund flag | Fixed: cancelled requests are never auto-confirmed; money that arrives anyway is recorded and listed as a refund with an alert. Test C5 |
| 23 Nov 2026 | **P1** | Payments | Failed EcoCash payment (e.g. not enough balance) left the booking stuck with no message to the customer | Fixed: customer told, "Try again" and "Talk to us" buttons. Test C8 |
| 23 Nov 2026 | P2 | WhatsApp booking | Customer who picked the wrong category had no way back except cancelling | Fixed: "back", "menu" or "start again" restarts the booking. Test C3 |
| 23 Nov 2026 | P2 | WhatsApp | "Talk to us" button in an active job wasn't recognised | Fixed |
| 23 Nov 2026 | P2 | Pro app | A pro who can't make it after accepting has no button; only the admin can re-offer | Proposal (T7) |
| 23 Nov 2026 | P3 | Tests | Simulated payment timers kept the test process alive | Fixed (timers unref'd) |
