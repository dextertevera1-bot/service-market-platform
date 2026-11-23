# System architecture (23 Nov 2026)

One Node 22 server, standard library only, one SQLite file (`/data/basa.db`) plus uploaded photos (`/data/uploads`).

| Concern | Module |
|---|---|
| Customer conversation (WhatsApp) | `src/bot.js` (one state per phone; one message at a time per customer) |
| WhatsApp send / webhook | `src/whatsapp.js` (outbox + dispatcher with retries; signature check) |
| Booking, matching, job lifecycle, saved repairs, timers | `src/jobs.js` (per-job locks; sweep every 15 s) |
| Payments (sim / manual merchant code / Paynow) | `src/payments.js` (one open request per job and kind; paid once; failures and late payments handled) |
| Prices and rules | `src/rules.js` |
| Onboarding, meeting day, Trust Score | `src/onboarding.js`, `src/quiz.js` |
| Safety (PINs, alerts, escalation) | `src/safety.js` |
| HTTP routes, auth, rate limits, health, backups | `src/server.js` |
| Pro app, ops desk, join form, WhatsApp test stand-in | `public/pro`, `public/ops`, `public/join`, `public/sim` |

Job stages: searching → offered → await_callout → ready → travelling → arrived → diagnosing → quote_sent → working → confirm → await_final → paid; side exits: cancelled, deferred (saved repair), noshow. Saved repairs return to offered (original pro first, 24 h) → ready → … → working.

Deploy: Render, Docker, from GitHub `main` (auto-deploy). Health check `/health`. Daily database copy in `/data/backups`.
