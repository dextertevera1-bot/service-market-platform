# Basa seBasa web apps

Five web apps built for the Basa seBasa launch in Harare. Each is a single HTML file with no build step.

| Folder | What it is | Who uses it |
| --- | --- | --- |
| `pro-app/` | **Basa seBasa Pro, the integrated technician app** (installable): apply and get approved, then jobs, Basa Code, appliance passport, quotes, trade checklists, service reports, SOS, offline mode, earnings, Trust Score and Pro levels. Uses real GPS and camera; saves progress on the phone | Technicians |
| `customer-app/` | Customer booking app: services, 4-step booking, top 3 verified pros, price breakdown, EcoCash payment, live tracking map, quote approval, ratings, "For pros" sign-up, help | Customers |
| `technician-app/` | Technician app (preview): go online, 60-second job requests with earnings shown, live trip map, diagnose and quote on site, job timer, before/after photos, earnings with 24-hour payout tracking, Trust Score profile | Technicians |
| `onboarding-demo/` | Provider onboarding demo: sign-up with WhatsApp code, details, documents, automatic checks, team document review, reference calls, in-person check, induction and approval with starting Trust Score | Basa seBasa team (demo) |
| `whatsapp-link-demo/` | Demo of one job travelling between the customer's WhatsApp chat, the server and the technician's Pro app, with a live server event log | Team, IT, investors |
| `ops-desk/` | Operations desk: jobs pipeline with enforced stages, technician verification and Trust Score, money ledger, pricing settings, WhatsApp message templates, 24-hour payout deadlines | Basa seBasa team |

## Business rules built in

- Commission: 15% of labour only. Parts go 100% to the technician.
- Repairs: USD 9 call-out (inspection + travel within 10 km); platform keeps USD 1, technician USD 8.
- Extra travel: USD 0.50 per km beyond 10 km.
- Full quote approved by the customer before any repair work.
- Deferred repairs: diagnosis valid 30 days; original technician gets 24-hour first refusal.
- Maids: USD 5 / 6 / 8 per hour (standard / verified pro / home manager).
- EcoCash only, USD only, no cash. EcoCash charges added to the customer's total (2% placeholder rate; set from the current Econet tariff). Fallback setting: platform absorbs 20%.
- Technician payouts sent manually on EcoCash within 24 hours of the customer paying.

## Running the customer app

Open `customer-app/index.html` in a browser. It runs in **preview mode**: sample professionals and simulated live updates, nothing is charged.

To go live, set `DEMO = false` and replace the functions in the `API` object (search for `DATA LAYER`) with calls to the Basa seBasa server:

- `matches(service, suburb)` → verified technicians, ranked
- `createBooking(booking)` → creates the job
- `pay(job, "callout" | "final", ecocashNumber)` → starts a Paynow EcoCash mobile payment
- `approveQuote(job)`, `deferQuote(job)`, `review(job, rating, text)`
- live updates: push job changes from the server (websocket or realtime database) and call `emit(job)`

Keep `PRICING` in sync with the server; the server must recalculate every amount itself.

## The ops desk

`ops-desk/index.html` currently runs as a private Claude page, using Claude's built-in storage (`window.claude.use("db")`). Opened directly in a browser it shows a sign-in message. When the server and database exist, replace the `boot()` and `write()` functions with your database's realtime client (for example Supabase or Firebase). Collections used: `jobs`, `technicians`, `settings/pricing`.

## Planned architecture

WhatsApp Cloud API (Meta) → Basa seBasa server (bot logic, pricing, Paynow EcoCash) → live database → ops desk and customer app.

## The technician app

`technician-app/index.html` runs in preview mode with sample job requests. In the real app, location must come from the phone's GPS while a job is active, job requests arrive from the server, and every button (accept, on my way, arrived, quote, start, complete) sends an update to the server, which forwards it to the customer on WhatsApp. This is the screen set to rebuild as the Android app.

## Basa seBasa Pro (integrated technician app)

`pro-app/` is an installable web app (PWA): `manifest.webmanifest` makes it installable, `sw.js` keeps it working offline, and it uses the phone's real GPS and camera. It still runs on sample jobs (`PREVIEW = true`) until the server exists.

To connect it: replace the sample job feed (`SAMPLES`, `scheduleRequest`) and the preview "team" steps (`team-next`) with calls to the Basa seBasa server, and set `PREVIEW = false`. To publish on Google Play later, wrap this same app as a Trusted Web Activity (for example with Bubblewrap) or with Capacitor.
