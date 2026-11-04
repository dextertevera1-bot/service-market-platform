# Service Market Engineering Audit

Date: 2026-07-08

This audit reviews Service Market as a production-launch candidate for a Zimbabwe-first technician marketplace. The current product is a strong visual and functional MVP, but it is not ready for production traffic or sensitive real-world operations until the critical items below are addressed.

## Executive Summary

Service Market clearly communicates the right product direction: verified technicians, simple booking, manual payments, admin oversight, trust scoring, job visibility, and Zimbabwe-ready workflows. The largest risk is that the app has grown sprint by sprint inside a small static frontend and one Node server. That kept velocity high, but it now concentrates business logic, presentation logic, seed data, API handlers, validation, and operational workflows in very large files.

The safest immediate improvements completed in this audit were defensive UI hardening, stale homepage logic removal, baseline HTTP security headers, method restrictions, and cleaner oversized request handling. The next serious milestone should be an architecture stabilization sprint before adding more features.

## Fixes Completed During This Audit

- Added baseline security headers to JSON, static, and CSV responses.
- Added API method restrictions for unsupported HTTP verbs.
- Added clean `413 Request body too large` handling for oversized JSON bodies.
- Removed stale homepage statistics rendering that referenced a deleted `landing-stats` element.
- Added defensive DOM guards around optional customer, technician, admin, and onboarding elements.
- Neutralized a hidden legacy testimonial block so malformed legacy copy is no longer rendered.
- Verified JavaScript syntax for `server.js` and `public/app.js`.
- Smoke-tested core API routes and a completed booking-to-payment path.

## Critical Findings

1. No authentication or authorization exists.
   Any user can call admin, technician, booking, payment, verification, and trust-control API routes. This is the top production blocker.

2. Data is stored in memory.
   Bookings, customers, technicians, payments, reviews, service reports, complaints, and admin notes are lost on restart. There is no database, backup, migration, audit trail, or recovery process.

3. Role isolation is not enforceable.
   Customer, technician, and admin experiences exist visually, but the backend does not enforce ownership or role permissions.

4. File uploads are placeholders.
   ID documents, certificates, police clearance, before/after photos, proofs of payment, and profile photos are represented as strings/placeholders. Production needs secure upload storage, malware scanning, file type validation, private access rules, and retention policy.

5. Payment verification is not secure enough for real money.
   EcoCash, ZIPIT, bank transfer, and cash workflows are useful prototypes, but payment status can be changed without authenticated admin controls or immutable audit logs.

## High Findings

1. Single-file backend and frontend are now too large.
   `server.js` and `public/app.js` contain many unrelated responsibilities. This increases regression risk and makes future sprints slower.

2. Validation is scattered and incomplete.
   Some routes validate required fields, but there is no shared schema layer for booking, technician onboarding, trust updates, payment submission, or service reports.

3. Trust Score can be manipulated without evidence controls.
   The Trust Engine is a good product concept, but production trust needs verified evidence, expiry dates, audit history, dispute impact, fraud detection, and admin accountability.

4. No rate limiting or abuse protection exists.
   Public routes can be spammed. Booking creation, payment submission, technician onboarding, and admin update endpoints need throttling and abuse monitoring.

5. Sensitive data is overexposed.
   Phone numbers, WhatsApp numbers, technician identity state, customer details, notes, and payment references need role-based filtering.

6. CSV exports are unauthenticated.
   Booking and payment exports should be admin-only and logged.

## Medium Findings

1. The app is not optimized enough for low-bandwidth Zimbabwe usage.
   The landing hero image is large and should be compressed, resized, and served responsively.

2. Frontend state management is monolithic.
   A single global `state` object and many rendering functions are manageable for an MVP, but fragile as workflows expand.

3. Many features are still prototype placeholders.
   Map placeholders, upload placeholders, PDF placeholders, background checks, police clearance, emergency flows, and live tracking should be labeled clearly in product copy where customer expectations matter.

4. Accessibility needs a formal pass.
   Buttons, cards, forms, status timelines, modals, focus states, contrast, keyboard navigation, and screen-reader labels need systematic testing.

5. Error and empty states need consistency.
   Some screens fail gracefully, but production should have standard empty states, retry states, loading indicators, and validation summaries.

## Low Findings

1. Some legacy CSS and unused render helpers remain.
   They are not breaking the product, but should be removed during a modularization pass.

2. README is becoming a changelog.
   Documentation should be split into product overview, local development, API reference, architecture notes, sprint notes, and QA checklist.

3. Naming is inconsistent in a few places.
   Examples include `Admin Verified` vs `Admin Approved`, and payment status labels that vary between user-facing and admin-facing contexts.

## Enhancements

1. Split the architecture into stable modules.
   Recommended structure:
   - `src/server/routes`
   - `src/server/services`
   - `src/server/repositories`
   - `src/domain`
   - `src/validation`
   - `public/js/components`
   - `public/js/views`
   - `public/js/api`

2. Add a real database.
   Start with SQLite for the MVP or PostgreSQL for multi-city launch. Add migrations, seed scripts, indexes, and backups.

3. Add role-based auth.
   Use customer, technician, and admin sessions. Protect all state-changing routes. Add CSRF protection for browser sessions.

4. Create an evidence-based Trust Engine.
   Store verification evidence, document expiry dates, admin reviewer identity, complaint outcomes, review provenance, and Trust Score history.

5. Improve Zimbabwe readiness.
   Add low-data mode, image compression, offline form drafts, retry queues, simpler onboarding, and first-class WhatsApp/tel links where in scope.

6. Add automated tests and CI.
   Include API contract tests, workflow tests, accessibility checks, smoke tests, and linting before each sprint is considered done.

7. Add observability.
   Log request IDs, admin actions, payment verification changes, technician status changes, and Trust Score adjustments.

## Workflow Review

Customer workflows are directionally correct: search, compare compact cards, inspect a detailed profile, book, track, pay manually, confirm, and review. The biggest risk is that customers can see prototype placeholders that appear more final than they are.

Technician workflows cover onboarding, verification, job acceptance, job lifecycle, location permission, service reporting, and payment visibility. The main gap is authenticated ownership: a technician should never see or mutate another technician's jobs.

Admin workflows are broad and useful, but too powerful without authentication, audit logs, two-person controls for sensitive actions, and clear escalation paths.

## Trust Engine Review

The Trust Engine is the strongest product differentiator. To become defensible, it should evolve from a score display into an evidence system:

- Every badge should have source, reviewer, date, expiry, and evidence.
- Reviews should be tied to verified completed bookings only.
- Complaints should reduce trust until resolved, with transparent status.
- Admin overrides should be logged and visible internally.
- Customers should see a plain-language score explanation, not internal math overload.
- Technicians should see actionable improvement steps.

## Security Review

The app now has baseline headers and method restrictions, but production security is still blocked by missing auth, missing authorization, no persistent audit logs, placeholder uploads, weak data minimization, no rate limiting, and no secure session model.

## Performance Review

The MVP is fast because it is static and in-memory. That will not hold as data grows. The first scaling pressure points will be large frontend bundles, full-array filtering, unindexed searches, image weight, and admin dashboards rendering too much data.

## Scalability Review

For 100 technicians, the current prototype can still demonstrate workflows. For 10,000 technicians, the app needs database-backed search, pagination, indexes, query APIs, background jobs, proper image handling, observability, and modular frontend code. For 100,000 technicians and regional expansion, it needs multi-tenant operational architecture, robust admin tooling, localization, fraud controls, and a formal verification operations model.

## Permanent Engineering Rule

Every major sprint must end with a Professional Engineering Review before the next sprint begins.

Quality is a feature. Refactoring, simplification, optimization, documentation, testing, security review, accessibility review, and production-readiness checks are normal development work, not optional cleanup.

Minimum sprint closeout checklist:

- Code compiles without syntax errors.
- Core API smoke tests pass.
- Main customer, technician, and admin screens load.
- No known console errors remain.
- New workflows include validation and empty/error states.
- Security and role-impact review is completed.
- README or relevant docs are updated.
- Technical debt introduced by the sprint is either removed or explicitly tracked.
