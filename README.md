# Service Market Zimbabwe

Service Market is a WhatsApp bot-led trust and dispatch model for launching a technician marketplace in Zimbabwe. It is designed for practical service markets where customers already use WhatsApp, phone calls and EcoCash instead of downloading new apps or relying on complex online checkout.

The public product now opens with one message: message the Service Market WhatsApp bot and let it manage the job from request to matching, dispatch, completion, EcoCash reference capture, review and dispute handling. The web prototype remains valuable as an internal operating console for verification, dispatch, booking records, bot exceptions, disputes and manual payment tracking.

See [WHATSAPP_FIRST_MODEL.md](WHATSAPP_FIRST_MODEL.md) for the WhatsApp bot product model and operating flow.

## Distance-Based Transport Fee

Service Market now calculates a transparent transport fee before a customer confirms a service request. The fee is based on technician location, customer service location, estimated route distance, ETA, free radius, minimum fee, price per kilometre, maximum fee, and urgency or after-hours surcharges.

- Customers see the technician, service category, diagnostic fee, transport fee, estimated total before repairs, ETA, distance and a clear explanation before submitting.
- Customers must accept the transport fee before a booking can be created.
- The backend recalculates the fee server-side and saves the original calculation plus customer approval timestamp in booking audit history.
- Technicians can view customer location, distance, ETA and approved transport fee, but cannot edit the fee.
- Admin can update platform transport tariff settings, view fee calculation history, and manually override a booking transport fee with an audit note.
- If technician assignment changes, the booking transport fee is recalculated for the new technician.
- Receipts, payment history, booking export CSV and payment export CSV include transport and diagnostic fee details.

The current route distance is a placeholder estimate using stored Zimbabwe area coordinates and a route-distance multiplier. The API shape is ready for future Google Maps or Mapbox route ETA providers.

## Engineering Quality Rule

Every major sprint must end with a Professional Engineering Review before the next sprint begins. Quality is a product feature: refactoring, simplification, optimization, documentation, testing, security review, accessibility review, and production-readiness checks are part of normal development.

See [ENGINEERING_AUDIT.md](ENGINEERING_AUDIT.md) for the current launch-readiness audit, completed fixes, known risks, and recommended architecture path.

## Design System Rule

Every future UI must follow the Service Market design system standard. The product should feel premium, calm, trustworthy, mobile-first, desktop-polished, and suitable for Zimbabwe-first service work.

See [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) for the permanent design principles, component rules, accessibility expectations, and sprint closeout checklist.

## Navigation Integrity Rule

Every link, button, CTA, tab, footer item, menu item and route must point to the correct intended destination. Navigation coherence must be reviewed after every alteration and fixed before a sprint is considered complete.

Run `npm run check:navigation` while the local server is running. See [NAVIGATION_SOP.md](NAVIGATION_SOP.md) for the full SOP and manual QA checklist.

## Product Improvement 001 - Simplified Homepage

The homepage is intentionally limited to:

- Hero section with one primary CTA: `Start WhatsApp Bot`
- Dominant WhatsApp bot service request bar
- Popular services for Zimbabwe customers
- Simple `How Trust Works` section
- One customer testimonial
- WhatsApp bot operating model teaser
- Footer links for About, How it works, Become a Technician, Help, Contact, Terms and Privacy

Customer, technician and admin portals are now treated as prototype/back-office surfaces. The customer-facing acquisition and booking path should start with the WhatsApp bot.

## Product Improvement 002 - Simplified Technician Cards

The customer marketplace now uses compact technician listing cards for faster comparison. Cards show only:

- Profile photo
- Technician name and trade/category
- Overall Trust Score
- Average rating
- Identity Verified and Admin Approved badges
- Jobs completed
- Average response time
- Service area
- `View Profile`, `Call`, and `WhatsApp` actions

Detailed trust evidence, score breakdowns, qualifications, warranty, complaint history, reviews, gallery, pricing, availability, service area map placeholder and booking actions live on the dedicated technician profile route (`#profile-<technicianId>`).

## Footer Navigation System

Homepage footer links now use first-class hash routes instead of pointing to unrelated portals. Supported informational routes:

- `#about`
- `#how-it-works`
- `#help`
- `#contact`
- `#terms`
- `#privacy`

`Become a Technician` routes directly to `#technician`, which opens the onboarding portal. Informational routes support refresh, browser back/forward, active navigation state, keyboard-accessible links, and clean fallback to `#home` for unknown routes.

## MVP Principles

- WhatsApp bot-led customer booking and quote requests
- Admin verified technicians with ID checked badges
- Phone-first communication with WhatsApp as the main customer channel
- No checkout or automated payment flow in the current booking sprint
- Customer pays technician directly after completion using EcoCash, cash or bank transfer, then sends the reference to the bot
- Admin oversight for approvals, booking assignment, cancellation and status tracking
- Low-data, mobile-first frontend
- Trust score, technician verification, booking pipeline and simple operations reporting

## Phase 2 Trust Engine

The Trust Engine makes technician credibility visible and explainable. It helps customers compare professionals based on evidence instead of only star ratings.

Trust pillars shown in the customer portal:

- Identity verification
- Professional verification
- Reputation
- Transparency
- Service documentation
- Accountability
- Pricing clarity
- Platform guarantee

Sprint 6 Trust Score uses the requested factor values and caps the final score at 100:

- Identity verified: 15 points
- Qualification verified: 20 points
- Profile completed: 10 points
- References added: 10 points
- Warranty offered: 10 points
- Fast response: 10 points
- Completed jobs: 10 points
- Average rating: 10 points
- No complaints: 5 points
- Admin recommendation: 10 points

Because these factors total 110, Service Market preserves the requested values and caps the public Trust Score at 100.

Trust levels:

- 95-100: Elite Trusted
- 90-94: Highly Trusted
- 80-89: Verified Professional
- 70-79: Verified
- Below 70: Needs Improvement

Technician profiles display score rings, trust badges, score breakdowns, explanations, improvement suggestions, service areas, pricing method, emergency availability, warranty status, complaint count, repeat customer rate, profile views, customer trust explanation and trust history.

Verification badges include Identity Verified, Trade Verified, Admin Approved, Warranty Offered, Fast Response, Emergency Available, Top Rated, Background Checked and Premium Professional.

Customers can sort technicians by highest Trust Score, highest rating, most experience, fastest response, most completed jobs and lowest complaint rate.

Technicians see a reputation dashboard with Trust Score, Trust Level, completed jobs, average rating, repeat customers, response time, acceptance rate, complaint count, profile views, verification status and improvement recommendations.

Admins can adjust verification and trust fields, including identity verification, qualification verification, trust score adjustment, complaint count, completed jobs, rating, profile views, warranty offered, admin recommendation, background check placeholder, premium professional placeholder, approval status, rejection and suspension.

Sprint 6 does not implement payments, WhatsApp API, GPS tracking, AI features or financial reporting.

Technicians can create a simple service report after a job is completed with job number, problem reported, diagnosis, work performed, parts used, hours worked, before/after photo placeholders, warranty period, customer confirmation and technician notes.

## Sprint 2 Technician Profile Trust Screen

Customers can open a premium technician profile from the marketplace using the `View Profile` button. The profile route uses `#profile-<technicianId>` and is rendered by the static frontend.

The profile screen includes:

- Professional photo placeholder, full name, business name, trade, location and experience
- Trust Score ring, Trust Level badge, rating and completed jobs
- Trust badges for identity, qualifications, admin approval, warranty, response speed, emergency availability and complaint history
- Performance summary with rating, completed jobs, repeat customers, response time, acceptance rate, complaint rate and joined date
- About section focused on professionalism and service quality
- Verified qualification cards with issuing authority, verification status and date
- Service chips for installation, repairs, maintenance, diagnostics and emergency callouts
- Zimbabwe-ready pricing: inspection fee, hourly rate, emergency fee, typical job range and pricing method
- Warranty coverage and exclusions
- Before/after portfolio placeholders
- Verified customer reviews
- Availability, working hours, emergency availability, service area chips and a map placeholder
- Sticky booking/contact card with Book Technician, Request Quote, WhatsApp, Call, Save Technician and Share Profile
- Similar technician cards

No map, payment, or external profile integrations are included in this sprint.

## Sprint 3 Technician Verification System

The Technician Portal now uses a multi-step verification wizard instead of a single registration form.

Wizard steps:

- Personal Information
- Professional Information
- Credentials & Documents
- References & Warranty
- Review & Submit

Technicians can add document metadata for:

- National ID
- Profile photo
- Trade certificate
- Additional certificates
- Optional police clearance

Profile statuses:

- Draft
- Pending Verification
- Approved
- Rejected
- Suspended

The onboarding Trust Score is a simple 100-point prototype:

- Identity verified: 20 points
- Trade qualification verified: 20 points
- Profile completed: 20 points
- References provided: 20 points
- Warranty offered: 20 points

The Admin Verification Dashboard lets admin review uploaded document metadata, approve, reject, request more information, suspend technicians and add internal notes.

## Role Portals

### Customer Portal

Customers can search technicians by trade, service area, Trust Score and availability, open detailed technician profiles, submit booking requests, receive a unique Booking ID, view booking history, track status timelines, see the assigned technician and Trust Score, call the technician, and confirm completion.

### Technician Portal

Technicians can submit a profile, add credentials, phone and WhatsApp numbers, service area, trade specialty, view assigned jobs only, see customer details, accept or decline jobs, update job status, add job notes, mark jobs completed, and view a simple completed earnings estimate.

### Admin Portal

Admins can view customers, technicians and all bookings, filter bookings by status, approve/reject/suspend technicians, assign or reassign technicians, cancel bookings with a reason, monitor key platform metrics, view booking timelines, and export a bookings CSV report.

## Customer Booking Workflow Sprint

Booking form fields:

- Customer name
- Phone number
- WhatsApp number
- Service category
- Location
- Address or suburb
- Problem description
- Preferred appointment
- Urgency
- Optional image metadata

Every submitted booking receives a public Booking ID such as `SMZ-2026-123456`.

Booking statuses:

- Submitted
- Waiting for Technician
- Accepted
- Travelling
- Arrived
- Working
- Paused
- Completed
- Customer Confirmed
- Closed
- Cancelled

This sprint intentionally does not implement payments, EcoCash, ZIPIT, bank transfer, GPS tracking, live maps, WhatsApp sending or reviews.

## Sprint 5 Job Lifecycle & Field Operations

Sprint 5 extends accepted bookings into a practical field-operations workflow for technicians, customers and admin.

Technicians can start travel, mark arrived, start work, pause work, resume work, complete the job, save estimated arrival, add job notes, add diagnosis, add work performed, add parts used, add before/after photo placeholders, and generate or update a service report after completion.

Customers can track job status, view the visual progress timeline, see the technician timeline, see estimated arrival, view technician notes and before/after placeholders after completion, confirm completion, and report an issue.

Admins can view jobs, filter by status, inspect job timelines, view generated service reports, reassign technicians, pause jobs, and cancel jobs when needed.

Job timer behaviour:

- `Working` records the job start time if one does not exist.
- `Paused` records pause time.
- Resuming `Working` excludes paused time from labour duration.
- `Completed` records finish time and calculates labour hours.
- Total duration appears for technician, customer and admin.

Service reports are saved inside booking history and contain job ID, customer name, technician name, date, category, problem reported, diagnosis, work performed, parts used, labour hours, before/after placeholders, technician notes and customer confirmation status.

Notifications are simple in-app messages. Customers are notified when the technician is travelling, arrived, working, completed and when the service report is available. Technicians are notified when a customer confirms completion or reports an issue.

Sprint 5 still does not implement payments, EcoCash, ZIPIT, bank transfers, GPS maps, live tracking, WhatsApp API, invoice generation, warranty claims or AI features.

## Sprint 8 Zimbabwe Payments

Sprint 8 adds a manual, Zimbabwe-ready payment workflow. It does not connect to live payment gateways yet, but it creates the architecture needed for future EcoCash, ZIPIT or banking integrations.

Supported customer payment methods:

- EcoCash
- ZIPIT Bank Transfer
- Direct Bank Transfer
- Cash
- Pay Later (Business Accounts placeholder)

Payment statuses:

- Payment Pending
- Awaiting Verification
- Paid
- Rejected
- Refund Pending
- Refunded

Customer payment workflow:

- Completed jobs show amount due, booking number, technician, service summary, payment method and payment status.
- EcoCash captures EcoCash number, transaction reference and amount with mobile-phone payment instructions.
- ZIPIT displays bank name, account number, booking reference and amount, then captures the transaction reference.
- Direct bank transfer displays bank details, proof-of-payment placeholder and transfer reference.
- Cash allows customer confirmation while technician/admin handle verification.
- Receipts show receipt number, booking ID, customer, technician, amount, method, date, status and a PDF download placeholder.

Technician payment workflow:

- Technician portal shows pending payments, paid jobs, cash payments and outstanding completed jobs.
- Technicians can mark cash received.
- Technicians can view payment history and payment status.

Admin payment workflow:

- Admin Payment Management Dashboard shows all transactions, pending verification, verified payments, rejected payments, cash, EcoCash, ZIPIT and bank transfers.
- Admin can approve payment, reject payment, request more information and add notes.
- Admin can filter by payment method and export payment records as CSV.

Revenue placeholders:

- Customer payment
- Platform commission placeholder
- Technician earnings placeholder

Sprint 8 does not implement live EcoCash API, live ZIPIT API, card payments, international payments, refund automation, subscriptions, invoices or accounting integrations.

## Zimbabwe Configuration

Service areas:

- Harare
- Bulawayo
- Mutare
- Gweru
- Masvingo
- Chitungwiza
- Kwekwe
- Victoria Falls

Service categories:

- HVAC/Refrigeration
- Plumbing
- Electrical
- Appliance Repair
- Auto Mechanic
- Generator Repair
- Solar/Inverter
- Borehole Pumps
- Welding
- Carpentry
- Painting
- Tiling

Supported currencies for estimates:

- USD
- ZWL
- Negotiable

## What Was Simplified

The MVP intentionally removes or avoids automated card checkout, Stripe, Apple Pay, Google Pay, EcoCash automation, ZIPIT, bank integrations, automated payouts, complex escrow, advanced GPS tracking, live maps, subscription billing, and heavyweight analytics. These can be added later after the operating model is proven.

## Run Locally

```bash
npm start
```

Then open:

```text
http://localhost:4173
```

The app uses only the built-in Node HTTP server and static frontend assets.

## API Routes

- `GET /api/config`
- `GET /api/technicians`
- `GET /api/technicians?verified=true`
- `POST /api/technicians`
- `PATCH /api/technicians/:id/admin`
- `GET /api/customers`
- `GET /api/bookings`
- `POST /api/bookings`
- `PATCH /api/bookings/:id/status`
- `POST /api/transport/estimate`
- `GET /api/settings/transport`
- `PATCH /api/settings/transport`
- `PATCH /api/bookings/:id/transport`
- `GET /api/payments`
- `POST /api/bookings/:id/payment`
- `PATCH /api/payments/:id`
- `POST /api/bookings/:id/review`
- `POST /api/bookings/:id/review-response`
- `POST /api/bookings/:id/service-report`
- `GET /api/admin/summary`
- `GET /api/reports/bookings.csv`
- `GET /api/reports/payments.csv`

## Test Instructions

Syntax checks:

```bash
node --check server.js
node --check public/app.js
```

Basic API checks:

```bash
curl http://localhost:4173/api/config
curl http://localhost:4173/api/technicians
curl http://localhost:4173/api/bookings
curl http://localhost:4173/api/admin/summary
curl http://localhost:4173/api/reports/bookings.csv
curl -X POST http://localhost:4173/api/transport/estimate \
  -H "Content-Type: application/json" \
  -d '{"technicianId":1,"area":"Harare","category":"HVAC/Refrigeration","urgency":"Normal","customerLatitude":-17.7975,"customerLongitude":31.0332}'
```

Booking request example:

```bash
curl -X POST http://localhost:4173/api/bookings \
  -H "Content-Type: application/json" \
  -d "{\"customerName\":\"Test Customer\",\"customerPhone\":\"+263771111111\",\"customerWhatsapp\":\"+263771111111\",\"category\":\"Plumbing\",\"area\":\"Harare\",\"address\":\"Avondale\",\"issue\":\"Leaking pipe under sink\",\"preferredTime\":\"Tomorrow morning\",\"urgency\":\"Normal\"}"
```

Technician status update example:

```bash
curl -X PATCH http://localhost:4173/api/bookings/1001/status \
  -H "Content-Type: application/json" \
  -d "{\"status\":\"Accepted\",\"jobNotes\":\"Customer confirmed access to the property.\"}"
```

Field operations update example:

```bash
curl -X PATCH http://localhost:4173/api/bookings/1001/status \
  -H "Content-Type: application/json" \
  -d "{\"status\":\"Working\",\"estimatedArrival\":\"15 minutes\",\"diagnosis\":\"Blocked filter\",\"workPerformed\":\"Cleaned and tested unit\",\"partsUsed\":\"Filter cleaning chemical\",\"beforePhoto\":\"before-placeholder.jpg\",\"afterPhoto\":\"after-placeholder.jpg\",\"jobNotes\":\"Customer approved work.\"}"
```

Payment submission example:

```bash
curl -X POST http://localhost:4173/api/bookings/1001/payment \
  -H "Content-Type: application/json" \
  -d "{\"method\":\"EcoCash\",\"phoneNumber\":\"+263778111222\",\"reference\":\"EC123456789\",\"amount\":85}"
```

Admin payment approval example:

```bash
curl -X PATCH http://localhost:4173/api/payments/9001 \
  -H "Content-Type: application/json" \
  -d "{\"action\":\"approve\",\"notes\":\"Reference confirmed manually.\"}"
```

Sprint 10 live operations examples:

```bash
curl -X PATCH http://localhost:4173/api/bookings/1001/status \
  -H "Content-Type: application/json" \
  -d "{\"status\":\"Travelling\",\"estimatedArrival\":\"25 minutes\",\"distanceKm\":7.5,\"travelTimeMinutes\":25,\"locationNote\":\"Leaving Avondale\"}"

curl -X PATCH http://localhost:4173/api/bookings/1001/status \
  -H "Content-Type: application/json" \
  -d "{\"status\":\"Nearby\",\"distanceKm\":1.2,\"travelTimeMinutes\":6,\"locationNote\":\"Nearby customer location\"}"

curl -X PATCH http://localhost:4173/api/bookings/1001/status \
  -H "Content-Type: application/json" \
  -d "{\"simulateLocation\":true,\"note\":\"Technician shared a simulated location update.\"}"
```

## Sprint 10 - Live Operations & Location Intelligence

- Adds the `Nearby` journey state between `Travelling` and `Arrived`.
- Adds reusable placeholder map data for Google Maps, Mapbox and OpenStreetMap.
- Booking responses now include `liveLocation`, `journeyHistory`, `locationHistory`, `emergencyContact`, technician phone links and WhatsApp links.
- Customers can follow accepted jobs with ETA, distance, status updates, journey timeline, technician contact buttons and a map placeholder.
- Technicians can start navigation, update simulated location, mark Nearby, Arrived, Working and Completed, share ETA updates, pause/resume and cancel the journey.
- Admin can monitor active jobs with operations metrics, city/trade/status/technician/trust filters, live map placeholders, delayed job flags, location-disabled flags and ETA variance.
- Location updates are simulated JSON records only; no real GPS, Maps API, traffic API, background tracking or geofencing is integrated yet.
- ETA uses a placeholder calculation today and returns `estimatedArrivalAt`, `actualArrivalAt`, `varianceMinutes`, `isDelayed` and a source label so Google Maps or Mapbox route ETA can be added later.

### Mandatory active-job location permission

- Technician onboarding includes a required acknowledgment: `Service Market only tracks technician location during active jobs to improve safety, transparency and accountability.`
- Draft technician profiles can be saved without the acknowledgment, but submitted profiles must accept the active-job location policy.
- Location sharing is only required for active job states: `Accepted`, `Travelling`, `Nearby`, `Arrived`, and `Working`.
- Tracking is active during `Travelling`, `Nearby`, `Arrived`, and `Working`, and stops at `Completed`, `Customer Confirmed`, `Closed`, or `Cancelled`.
- If a technician refuses location access during an active job, the status update is blocked, an admin alert is recorded, and the booking can be reassigned from Admin.
- `Arrived` and `Working` record placeholder location timestamps for future GPS/map integrations.
- Customer and admin live cards show the technician timeline, calculated ETA, distance placeholder, arrival timestamp and ETA variance.

Browser checks:

- Open the Home landing page and confirm the hero, dominant WhatsApp bot request bar, popular services, How Trust Works, one testimonial, bot operating model teaser and footer render.
- Confirm the homepage has one obvious primary action: `Start WhatsApp Bot`.
- Confirm customer, technician and admin portal access is limited to navigation/footer links, not large homepage portal cards.
- Open the Customer, Technician, and Admin portals.
- Confirm technician cards show Admin Approved and verification badges.
- Confirm technician listing cards are compact and only show core comparison details plus View Profile, Call and WhatsApp.
- Confirm detailed trust breakdowns, warranty details, complaints and reviews are shown on the technician profile, not on listing cards.
- Confirm customer filters work for trade, location, Trust Score and availability.
- Submit a quote request and verify it receives an `SMZ-...` Booking ID.
- Confirm the new booking appears in Customer booking history, Technician jobs if assigned, and Admin bookings.
- Confirm Customer booking history groups Active, Completed and Cancelled bookings.
- Confirm booking status timelines render.
- Move a job through Accepted, Travelling, Arrived, Working, Paused, Working, Completed and Customer Confirmed.
- Confirm job timer start, finish and labour hours render on technician, customer and admin cards.
- Confirm service report is generated and saved after completion.
- Confirm customer and technician in-app notifications render for important lifecycle events.
- Assign/reassign a technician, filter bookings by status, pause a job, and cancel a booking with a reason from Admin.
- Submit a payment record from a completed customer booking.
- Confirm EcoCash, ZIPIT, bank transfer, cash and pay-later fields render.
- Confirm technician payment summary and cash received action render.
- Confirm admin can approve, reject, request more information, filter payment methods and export payment CSV.
- Confirm Customer active bookings show live operations, ETA, distance, journey timeline, WhatsApp, call and emergency contact buttons.
- Confirm Technician jobs show Start Navigation, Update Location, Mark Nearby, Share ETA, Pause Journey and Complete controls.
- Confirm Admin bookings filter by city, trade, status, technician and Trust Score.
- Confirm Admin active bookings show map placeholders and journey timelines.
- Confirm receipt placeholder and revenue placeholders render.
- From the Admin portal, update admin quality score, verification flags and complaint count, then confirm Trust Score changes.
- Confirm each technician card shows a Trust Score ring, trust level, badges and score breakdown.
- Open `#profile-1` or click `View Profile` on a technician card and confirm the profile trust screen loads.
- Confirm profile WhatsApp links use `wa.me` and phone links use `tel:`.
- Confirm profile booking actions select the technician in the customer booking panel.
- Open the Technician portal and confirm the onboarding wizard steps, progress tracker, file fields and Draft/Pending Verification submit flow.
- Open the Admin portal and confirm document review, internal notes, approve, reject, request more information and suspend controls render.
- Confirm the onboarding Trust Score explains identity, trade qualification, profile completion, references and warranty.
- Confirm the browser console has no errors.
