# Service Market Zimbabwe

Service Market is a lightweight full-stack MVP for launching a technician marketplace in Zimbabwe. It is designed for practical service markets where customers often prefer calling, WhatsApp, Cash, EcoCash, bank transfer, and admin-assisted support instead of complex card payments or automated payouts.

## MVP Principles

- Simple customer booking and quote requests
- Admin verified technicians with ID checked badges
- Phone and WhatsApp-first communication
- Manual payment tracking for Cash, EcoCash, Bank Transfer, and Other
- Admin oversight for approvals, booking assignment, payments, and disputes
- Low-data, mobile-first frontend
- Trust score, reviews, booking pipeline, and simple revenue tracking

## Role Portals

### Customer Portal

Customers can search common Zimbabwe service categories, browse verified technicians, request a quote, call or WhatsApp a technician, track booking status, view an estimated price range, confirm job completion, leave a structured review, add completion photo references, and report a problem.

### Technician Portal

Technicians can submit a profile, add credentials, phone and WhatsApp numbers, service area, trade specialty, view assigned jobs only, accept or reject work, update job status, add job notes, mark jobs completed, and view a simple completed earnings estimate.
Technicians can also publish a public response to customer reviews.

### Admin Portal

Admins can view customers, technicians, bookings, payments, and disputes. Admin can approve, reject, or suspend technicians, manually assign bookings, manually update payment status, resolve disputes, monitor key platform metrics, and export a bookings CSV report.

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

Supported currencies:

- USD
- ZWL
- Negotiable

Payment methods:

- Cash
- EcoCash
- Bank Transfer
- Other

Payment statuses:

- Not Paid
- Paid to Technician
- Paid via Platform
- Disputed

## What Was Simplified

The MVP intentionally removes or avoids automated card checkout, Stripe, Apple Pay, Google Pay, automated payouts, complex escrow, advanced GPS tracking, subscription billing, and heavyweight analytics. These can be added later after the operating model is proven.

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
- `POST /api/bookings/:id/review`
- `POST /api/bookings/:id/review-response`
- `GET /api/admin/summary`
- `GET /api/reports/bookings.csv`

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
```

Booking request example:

```bash
curl -X POST http://localhost:4173/api/bookings \
  -H "Content-Type: application/json" \
  -d "{\"customerName\":\"Test Customer\",\"customerPhone\":\"+263771111111\",\"category\":\"Plumbing\",\"area\":\"Harare\",\"issue\":\"Leaking pipe under sink\",\"paymentMethod\":\"EcoCash\"}"
```

Manual admin payment update example:

```bash
curl -X PATCH http://localhost:4173/api/bookings/1001/status \
  -H "Content-Type: application/json" \
  -d "{\"paymentStatus\":\"Paid to Technician\"}"
```

Browser checks:

- Open the Customer, Technician, and Admin portals.
- Confirm technician cards show Admin Verified and ID Checked badges.
- Confirm Call links use `tel:` and WhatsApp links use `wa.me`.
- Submit a quote request and verify it appears in recent bookings and admin bookings.
- Change a booking status and payment status from Admin.
- Mark a job completed, leave a structured review, and confirm the technician review summary updates.
- From the Technician portal, publish a public response to a customer review.
- Confirm the browser console has no errors.
