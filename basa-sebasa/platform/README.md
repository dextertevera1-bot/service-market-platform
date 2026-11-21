# Basa seBasa platform (v1)

The real system behind the demo: the customer WhatsApp bot, the Pro app, the ops desk and the pro sign-up form, on one small server.

- **Customers** book on WhatsApp (Cloud API). Nothing to install.
- **Pros** apply at `/join`, are approved on the ops desk, then use the Pro app at `/pro` (installs from the browser, no app store).
- **Harare admin and Dex** run everything from the ops desk at `/ops`: safety alerts, EcoCash confirmations, payouts, applications, jobs.
- Payments are EcoCash in USD, in three modes: `manual` (merchant code, admin confirms), `paynow` (prompt on the customer's phone), `sim` (testing only).

Built on Node 22's standard library only (built-in SQLite, HTTP and crypto): nothing to install, nothing to break.

## Run it locally (test mode)

```
node --version          # 22.13 or newer
npm start               # http://localhost:8080
npm test                # runs a whole job end to end
```

With no WhatsApp token it runs in **simulation**: open `/sim` to be the customer, `/join` to apply as a pro, `/ops` to approve (default log-ins `harare:change-me`, `dex:change-me`, development only), then `/pro` to log in (the test code is shown on screen).

## What it does (agreed rules)

| Rule | Where |
|---|---|
| $9 call-out (Basa $1, pro $8), travel free to 10 km then $0.50/km, 15% of labour only, EcoCash charges added to the customer's total | `src/rules.js` |
| Quote approved before any work; pay the balance only after the customer confirms it works | `src/jobs.js` |
| No contact sharing: numbers, emails and social links removed from every customer–pro message | `src/scrub.js` |
| Basa Code at the gate (3 wrong tries alerts the admin) | `src/jobs.js` |
| Safety: location only while on a job; check-ins 15 min into each visit and at check-out with a PIN; duress PIN raises a silent alert; SOS and "I feel uneasy"; Harare admin calls the police for any security concern | `src/safety.js` |
| Payouts logged as due within 24 h of the customer paying; admin marks them paid with the EcoCash reference | ops desk |
| Day jobs only (07:00–18:00 Harare time) | `src/rules.js`, `src/bot.js` |
| Deferred repair: diagnosis valid 30 days | `src/jobs.js` |

Handled by the Harare admin on the ops desk in v1 (not automated yet): multi-day jobs, pauses (ZESA, water), extra work after approval, warranty claims, refunds after cancellation.

## Going live

1. **Hosting.** Any host that runs Docker with a persistent disk. `render.yaml` (at the top of the repo) sets up Render: New → Blueprint → this repo. Set `BASE_URL`, `ADMIN_USERS` (long passwords) and the keys below. The server refuses to start in production with default passwords or simulated payments.
2. **WhatsApp.** In Meta Business: create the app with the WhatsApp use case, add the Zimbabwe number, create a permanent system-user token. Webhook URL: `BASE_URL/webhook/whatsapp`, verify token = `WHATSAPP_VERIFY_TOKEN`, subscribe to `messages`. Set the profile picture to the logo. Submit an **authentication template** for pro log-in codes and set `WHATSAPP_OTP_TEMPLATE`.
3. **Payments.** Start with `PAYMENT_MODE=manual` and the EcoCash merchant code. When Paynow approves the integration, set the Paynow keys and `PAYMENT_MODE=paynow` (result URL is `BASE_URL/payments/paynow/result`). Test the Paynow flow in its test mode before real customers.
4. **Backups.** The whole database is one file (`/data/basa.db`) plus `/data/uploads`. Turn on daily disk snapshots on the host.
5. **Before the first real job:** confirm the EcoCash charge rate (`ECOCASH_RATE`), the police liaison and emergency numbers, and run a trial with 5–10 friends-and-family jobs.

## Files

```
src/server.js     HTTP server, routes, webhook
src/bot.js        customer WhatsApp conversation
src/jobs.js       job lifecycle, matching, payouts, safety check-ins
src/payments.js   EcoCash: sim / manual / Paynow
src/safety.js     PINs, alerts, escalation steps
src/whatsapp.js   WhatsApp Cloud API send + webhook parsing
src/rules.js      prices and business rules
public/pro        Pro app (installable web app)
public/ops        ops desk
public/join       pro application form
public/sim        WhatsApp stand-in for testing (off once WhatsApp is live)
test/             end-to-end test
```
