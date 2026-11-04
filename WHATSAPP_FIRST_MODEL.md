# Service Market WhatsApp Bot Model

Service Market Zimbabwe should not begin as a consumer app. The launch model should be a WhatsApp bot that links customers and technicians and stays actively involved through the whole transaction: request, matching, dispatch, job progress, completion, EcoCash confirmation, review and dispute handling.

## Strategic Shift

Old assumption:

- Build a web/mobile marketplace app.
- Customers browse, book, pay and track inside the app.

Zimbabwe-first assumption:

- WhatsApp bot is the customer interface.
- The bot is the transaction manager from start to finish.
- The web system is the internal operating console.
- Operators supervise exceptions, verification, job records, payment tracking and disputes.
- Technicians receive and update work through WhatsApp bot/phone-first workflows.

## Core Product

Service Market becomes a trusted WhatsApp bot:

1. Customer messages the Service Market bot on WhatsApp.
2. Bot asks for service type, suburb, urgency, issue description, photos, access notes and preferred time.
3. Bot creates a booking record in the internal console.
4. Bot ranks verified technicians using Trust Score, area, availability and category.
5. Bot sends customer 1-3 technician options with Trust Score, badges, area, response time and estimated price range.
6. Customer selects a technician.
7. Bot sends job request to technician.
8. Technician accepts or declines.
9. Bot confirms acceptance, ETA and contact details to customer.
10. Bot follows job status: accepted, travelling, arrived, working, completed.
11. Technician sends completion notes/photos.
12. Customer confirms completion.
13. Customer pays technician directly by EcoCash, cash or bank transfer.
14. Bot captures EcoCash reference, amount, method and confirmation.
15. Bot requests a structured review.
16. Bot logs disputes and escalates unresolved issues to admin.

## What the Web Prototype Becomes

The current Service Market web app should be treated as:

- Admin operations console.
- Technician verification console.
- WhatsApp bot conversation and dispatch console.
- Booking history console.
- Trust Engine evidence system.
- Payment reconciliation tracker.
- Dispute and complaint tracker.
- Reporting dashboard.

It is not the main customer acquisition or booking surface.

## Customer Experience

Customer does not need to download an app.

Primary actions:

- Message the Service Market bot on WhatsApp.
- Share photos and location/suburb.
- Receive verified technician options.
- Confirm preferred technician.
- Get bot-managed job status updates.
- Pay after completion by EcoCash or cash.
- Send EcoCash reference to the bot.
- Leave a review through the bot.
- Report a problem through the bot.

## Technician Experience

Technicians can still be onboarded and verified through an admin-assisted process.

Primary technician channels:

- WhatsApp bot for job requests.
- Phone for urgent work.
- Admin console for internal profile and verification management.
- Bot-managed status updates with admin intervention when needed.

## Payment Model

For MVP:

- No card checkout.
- No wallet.
- No escrow.
- No automated payouts.
- Customer pays technician directly after completion.
- EcoCash reference is sent to the WhatsApp bot and captured in the admin console.
- Admin tracks payment status manually.

Recommended statuses:

- Not Paid
- Paid to Technician
- Paid via Platform
- Reference Submitted
- Disputed
- Refunded Placeholder

## Trust Model

Trust remains the product advantage.

Trust evidence should be packaged into short WhatsApp-friendly summaries:

- Admin Verified
- ID Checked
- Trade Verified
- Warranty Offered
- Rating
- Completed Jobs
- Response Time
- Complaint Record

Example WhatsApp bot technician card:

```text
Option 1: Tendai Moyo
Trade: Solar/Inverter
Area: Harare
Trust Score: 96/100 - Elite Trusted
Badges: ID Checked, Trade Verified, Admin Approved
Jobs: 128 completed
Rating: 4.9/5
Estimate: USD 35-120 after inspection
Available: Today
```

## Future Automation Path

Phase 1:

- Semi-manual WhatsApp bot scripts.
- Admin supervises matching, booking records and payment references.
- Technicians contacted through bot-assisted WhatsApp templates.

Phase 2:

- WhatsApp Business templates for booking intake, technician options, ETA, status, completion, payment reference and review.
- Internal dashboard remains the source of truth.

Phase 3:

- WhatsApp Business API integration with webhooks.
- Bot-to-admin queue for disputes, delays and failed technician responses.
- Lightweight technician web/PWA portal only if operational volume requires it.
- Customer app only if there is strong evidence customers want it.

## Bot Conversation States

The bot should understand and guide these states:

- New request
- Service category captured
- Location captured
- Photos requested
- Urgency captured
- Technician options sent
- Customer selected technician
- Technician accepted
- Technician declined
- Travelling
- Arrived
- Working
- Completed
- Awaiting customer confirmation
- Awaiting EcoCash reference
- Payment reference submitted
- Review requested
- Dispute opened
- Dispute resolved

## Bot Escalation Rules

Escalate to admin when:

- Customer reports emergency.
- No verified technician accepts.
- Technician is delayed.
- Technician misses status updates.
- Customer disputes work.
- EcoCash reference is missing or unclear.
- Technician has unresolved complaints.
- Customer asks for a human.

## Product Rule

Do not force customers into an app before the market asks for one. Build the bot first.

Service Market should win by being:

- Easier than asking random WhatsApp groups.
- Safer than hiring an unknown technician.
- More accountable than informal referrals.
- Simple enough for ordinary Zimbabwean customers.
