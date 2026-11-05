# Basa seBasa sign-up bot

The WhatsApp bot that has to be live for **1 December**, when pro recruitment starts.

**Professionals** sign up end to end:
- privacy consent, name, trade, years of experience and area;
- selfie, ID, certificate and police clearance;
- EcoCash details, checked against the ID name;
- a reference and two safety questions;
- booking their own video-call time.

**Customers** who arrive early join the waitlist for 15 December.

**You (the founder) run it from your phone in Dubai.** You get a WhatsApp alert for every new application, every HELP request and every upcoming video call, and you decide with one-line commands:

| Command | What it does |
|---|---|
| `LIST` | Applications waiting for you, in call order |
| `VIEW P1001` | One application, with a link to its documents |
| `APPROVE P1001` | Approves the pro and sends them the welcome message |
| `REJECT P1001 reason` | Tells the pro politely, with your reason |
| `FIX P1001 what's needed` | Asks for a better photo or a missing document |
| `MOVE P1001 2026-12-02 10:00` | Changes the call time (Harare time) |
| `REPLY 2637… message` | Answers someone who typed HELP |
| `DONE 2637…` | Hands them back to the bot |
| `STATS` | Counts by status and trade, plus sign-ups per creator code |
| `WAITLIST` | Customer waitlist by service and suburb |

**Creator tracking.** Give each influencer their own link, for example `https://wa.me/2637XXXXXXXX?text=JOIN%20code%20TINO`. `STATS` shows how many pros and customers each code brought in.

**Other words people can type at any time:** `HELP`, `STATUS`, `RESTART`, `DELETE MY DATA`.

## Try it without setting anything up
Open the simulator page (`public/simulator.html`). It runs this exact conversation code in your browser, with the pro's phone and your phone side by side.

## Going live, step by step

### 1. Meta (WhatsApp Business Platform)
1. **Create a Meta Business portfolio** at business.facebook.com in the company's name, then start **business verification**. Verification can take days, so start now.
2. **Create an app** at developers.facebook.com → My Apps → Create app → *Business*. Add the **WhatsApp** product. Meta gives you a free test number straight away, which is enough for testing.
3. **Add your real number.** In WhatsApp Manager, add the Zimbabwe number the bot will use. It must not already be registered on the WhatsApp app; if it is, delete that account first.
4. **Create a permanent token.** Go to Business Settings → Users → **System users**, create one, give it the app with the `whatsapp_business_messaging` and `whatsapp_business_management` permissions, and generate a token. This is `WHATSAPP_TOKEN`.
5. **Copy two values:**
   - from WhatsApp → API Setup, the **Phone number ID** (this is `PHONE_NUMBER_ID`);
   - from App settings → Basic, the **App secret** (this is `APP_SECRET`).
6. **Create two message templates** in WhatsApp Manager → Message templates, category **Utility**, language English. WhatsApp only lets a business message someone who hasn't written in the last 24 hours through an approved template, so the bot falls back to these automatically.
   - `admin_alert`: `Basa seBasa alert: {{1}}. Open this chat to see the details.`
   - `application_update`: `Hi {{1}}, your Basa seBasa application is {{2}}.`

### 2. Hosting
You need any host that runs **Node 18 or newer** and keeps a **persistent disk** (for the applications file and documents), for example Render, Railway or Fly.io with a volume, or a small VPS. There's nothing to install: the bot has no dependencies.

1. Put this folder on the host and set the variables from `.env.example`. Set `DATA_DIR` to the persistent disk.
2. Start command: `npm start`.
3. Check it's running: `https://YOUR-HOST/health` should show `{"ok":true,...}`.

### 3. Connect the webhook
In the Meta app → WhatsApp → Configuration:
- **Callback URL:** `https://YOUR-HOST/webhook`
- **Verify token:** the same word you put in `VERIFY_TOKEN`

Click *Verify and save*, then **subscribe to the `messages` field**.

### 4. Test before 1 December
1. Message the bot `JOIN code TEST` from a second phone and complete a full sign-up.
2. From your phone, send `LIST`, then `VIEW P1001`. Open the documents link, then send `APPROVE P1001`.
3. Repeat as a customer with `Hi`, then type `HELP`, and reply with `REPLY …`.

### Documents page
Open `https://YOUR-HOST/admin?key=YOUR_ADMIN_KEY` for every application with its photos, plus a CSV export. Keep the key private: anyone with it can see IDs.

## For the developer
- `src/engine.js` holds the whole conversation as pure functions: `handle(config, store, from, input, now)` and `tick(config, store, now)`. The same file runs in the simulator.
- `src/server.js` is the Cloud API webhook. It:
  - checks the signature (`X-Hub-Signature-256` with `APP_SECRET`);
  - ignores duplicate deliveries;
  - processes messages one at a time, saving to a JSON file;
  - downloads media to `DATA_DIR/uploads/<id>/`;
  - retries with a template on error 131047 (outside the 24-hour window);
  - runs reminders every minute (1 hour before each video call).
- `npm test` runs the conversation tests and a server test against a fake WhatsApp API.
- Respect WhatsApp's limits: reply buttons are max 3 with titles of 20 characters or fewer; lists are max 10 rows with titles of 24 characters or fewer. The tests check every message against them.
- The JSON file is fine for the pilot (a few thousand sign-ups). Move to Postgres when the booking system is built.
