# SAFARX (SAWANGI-RIDE) — PRODUCTION READINESS AUDIT

**Project Name:** SafarX  
**Internal Name:** `sawangi-ride`  
**Corridor:** Sawangi ↔ DMIHER ↔ Nalwadi ↔ MIDC ↔ Wardha (Maharashtra, India)  
**Date:** October 2026  
**Auditor:** Antigravity Engineering

---

## 1. Executive Summary & Architecture Overview

SafarX is a corridor-based shared-seat ride booking and micro-mobility platform connecting Sawangi (Meghe) and Wardha via key waypoints (DMIHER Campus, Nalwadi, MIDC).
The application is designed with three distinct user personas:
1. **Passenger (Customer):** Searches scheduled corridor rides, books segment-specific seats, pays via Razorpay, views boarding OTP, tracks status, submits reviews.
2. **Driver Partner:** Publishes daily scheduled runs, monitors vehicle occupancy per corridor stop, verifies passenger boarding via OTP, completes trips, tracks earnings.
3. **Platform Administrator:** Fleet onboarding & KYC approvals, dynamic route & stop sequencer, global fare & commission policy controls, financial reporting, and audit oversight.

### Folder Structure
```
rapidoo/
├── backend/
│   ├── dist/                     # Compiled JavaScript output
│   ├── src/
│   │   ├── config/               # db.ts, env.ts, firebase.ts, razorpay.ts
│   │   ├── controllers/          # admin, auth, customer, driver, payment, rideRequest
│   │   ├── middlewares/          # auth, authenticate (dead), authorize (dead), errorHandler, rateLimiter
│   │   ├── models/               # AdminSettings, Booking, Driver, Notification, Payment,
│   │   │                         # Review, Ride, RideRequest, RideSegment, Route, User, Vehicle
│   │   ├── routes/               # admin, auth, customer, driver, health, payment
│   │   ├── seeders/              # seedData.ts
│   │   ├── services/             # fareCalculator, notificationService, paymentService,
│   │   │                         # razorpay.service, refundService, segmentEngine
│   │   ├── utils/                # logger.ts
│   │   └── server.ts             # Express application & lifecycle bootstrap
│   └── tsconfig.json             # Backend TypeScript configuration
├── docs/                         # Project documentation and audit logs
├── frontend/
│   ├── css/                      # design-system.css
│   ├── js/                       # admin.js, api.js, app.js, customer.js, driver.js,
│   │                             # firebase-auth.js, firebase-config.js, firebase-realtime.js, state.js
│   ├── admin-login.html          # Admin dedicated authentication portal
│   ├── driver-login.html         # Driver partner login & onboarding portal
│   ├── index.html                # Main unified customer, driver, admin SPA portal
│   └── login.html                # Passenger phone OTP & Google login portal
├── package.json                  # Root NPM manifest & dependencies
└── tsconfig.json                 # Root TypeScript build configuration
```

---

## 2. Registered Routes & Endpoints Matrix

| HTTP Method | Route Endpoint | Middleware / Auth | Controller Handler | Purpose |
|---|---|---|---|---|
| **Health** | | | | |
| `GET` | `/api/health` | Public | inline | Liveness & uptime check |
| `GET` | `/api/health/live` | Public | inline | Orchestrator liveness probe |
| `GET` | `/api/health/ready` | Public | inline | MongoDB connection & readiness check |
| **Auth** | | | | |
| `POST` | `/api/v1/auth/register` | Rate Limited (Public) | `AuthController.register` | Direct email/password registration |
| `POST` | `/api/v1/auth/login` | Rate Limited (Public) | `AuthController.login` | Email/phone password login |
| `POST` | `/api/v1/auth/firebase-login` | Rate Limited (Public) | `AuthController.firebaseLogin` | Firebase token login & auto-provision |
| `GET` | `/api/v1/auth/me` | JWT Authenticated | `AuthController.getMe` | Current user profile & vehicle info |
| `POST` | `/api/v1/auth/switch-demo/:role` | Public (SECURITY FLAW) | `AuthController.switchDemoRole` | Instant token generation for any role |
| **Customer** | | | | |
| `GET` | `/api/v1/customer/routes` | Public | `CustomerController.getRoutesAndStops` | Active routes & ordered stop list |
| `GET` | `/api/v1/customer/rides/search` | Public | `CustomerController.searchRides` | Query rides by pickup, drop, date, seats |
| `POST` | `/api/v1/customer/bookings/initiate`| Authenticated (CUSTOMER) | `CustomerController.initiateBooking` | Hold segment seats & create Razorpay order |
| `POST` | `/api/v1/customer/payments/verify` | Authenticated (CUSTOMER) | `CustomerController.verifyPayment` | Client-side payment callback confirmation |
| `POST` | `/api/v1/customer/bookings/:id/cancel`| Authenticated (CUSTOMER) | `CustomerController.cancelBooking` | Cancel booking & calculate refund tier |
| `GET` | `/api/v1/customer/bookings/my` | Authenticated (CUSTOMER) | `CustomerController.getMyBookings` | Booking history for logged-in user |
| `POST` | `/api/v1/customer/reviews` | Authenticated (CUSTOMER) | `CustomerController.submitReview` | Submit rating & review for completed ride |
| `POST` | `/api/v1/customer/requests` | Authenticated (CUSTOMER) | `RideRequestController.createRequest`| Custom on-demand ride request |
| `GET` | `/api/v1/customer/requests/:id`| Authenticated (CUSTOMER) | `RideRequestController.getRequestStatus`| Track request acceptance status |
| **Driver** | | | | |
| `GET` | `/api/v1/driver/profile` | Authenticated (DRIVER) | `DriverController.getProfile` | Driver KYC & vehicle profile |
| `POST` | `/api/v1/driver/vehicle` | Authenticated (DRIVER) | `DriverController.updateVehicle` | Upsert vehicle details |
| `POST` | `/api/v1/driver/rides/publish` | Authenticated (DRIVER) | `DriverController.publishRide` | Create ride & generate segment matrix |
| `GET` | `/api/v1/driver/rides/today` | Authenticated (DRIVER) | `DriverController.getTodayRide` | Current scheduled/active ride & passenger list |
| `PATCH`| `/api/v1/driver/rides/:id/fare`| Authenticated (DRIVER) | `DriverController.updateRideFare` | Modify fare within admin bounded limits |
| `POST` | `/api/v1/driver/rides/:id/start` | Authenticated (DRIVER) | `DriverController.startRide` | Transition ride to ACTIVE & notify passengers |
| `POST` | `/api/v1/driver/rides/:id/end` | Authenticated (DRIVER) | `DriverController.endRide` | Complete ride, disburse driver earnings |
| `POST` | `/api/v1/driver/rides/:id/cancel` | Authenticated (DRIVER) | `DriverController.cancelRide` | Cancel ride, trigger 100% passenger refunds |
| `POST` | `/api/v1/driver/bookings/:id/boarded`| Authenticated (DRIVER) | `DriverController.markBoarded` | Verify OTP & mark passenger boarded |
| `POST` | `/api/v1/driver/bookings/:id/noshow` | Authenticated (DRIVER) | `DriverController.markNoShow` | Mark passenger no-show |
| `GET` | `/api/v1/driver/earnings` | Authenticated (DRIVER) | `DriverController.getEarnings` | Reconciled earnings summary |
| `GET` | `/api/v1/driver/requests/available` | Authenticated (DRIVER) | `RideRequestController.getAvailableRequests` | Pending customer ride requests |
| `POST` | `/api/v1/driver/requests/:id/accept` | Authenticated (DRIVER) | `RideRequestController.acceptRequest` | Driver accepts customer ride request |
| **Admin** | | | | |
| `GET` | `/api/v1/admin/metrics` | Authenticated (ADMIN) | `AdminController.getDashboardMetrics` | Financial, fleet, and booking analytics |
| `GET` | `/api/v1/admin/drivers` | Authenticated (ADMIN) | `AdminController.getDrivers` | Fleet list & KYC verification filter |
| `POST` | `/api/v1/admin/drivers` | Authenticated (ADMIN) | `AdminController.createDriver` | Admin-managed driver & vehicle onboarding |
| `PATCH`| `/api/v1/admin/drivers/:id/status`| Authenticated (ADMIN) | `AdminController.updateDriverStatus` | Approve, reject, suspend driver KYC |
| `GET` | `/api/v1/admin/routes` | Authenticated (ADMIN) | `AdminController.getRoutes` | List routes and stop sequences |
| `POST` | `/api/v1/admin/routes` | Authenticated (ADMIN) | `AdminController.createRoute` | Create new corridor route |
| `PUT` | `/api/v1/admin/routes/:id` | Authenticated (ADMIN) | `AdminController.updateRoute` | Update base fares, distance, active status |
| `POST` | `/api/v1/admin/routes/:id/stops` | Authenticated (ADMIN) | `AdminController.addStop` | Append waypoint stop to route |
| `PUT` | `/api/v1/admin/routes/:id/stops/:stopId`| Authenticated (ADMIN) | `AdminController.updateStop` | Edit stop name, landmark, distance |
| `DELETE`| `/api/v1/admin/routes/:id/stops/:stopId`| Authenticated (ADMIN) | `AdminController.deleteStop` | Remove stop & re-index sequence |
| `POST` | `/api/v1/admin/routes/:id/reorder-stops`| Authenticated (ADMIN) | `AdminController.reorderStops` | Re-index route stops order |
| `GET` | `/api/v1/admin/bookings` | Authenticated (ADMIN) | `AdminController.getAllBookings` | Global booking registry |
| `GET` | `/api/v1/admin/payments` | Authenticated (ADMIN) | `AdminController.getAllPayments` | Global payment transaction log |
| `GET` | `/api/v1/admin/settings` | Authenticated (ADMIN) | `AdminController.getSettings` | Platform commission & fare settings |
| `PUT` | `/api/v1/admin/settings` | Authenticated (ADMIN) | `AdminController.updateSettings` | Update global policy configurations |
| **Payments & Webhooks** | | | | |
| `POST` | `/api/v1/payments/webhook` | Raw Body HMAC Verified | `PaymentController.handleWebhook` | Razorpay server-to-server webhook |
| `POST` | `/api/v1/payments/verify` | Authenticated | `PaymentController.verifyClientPayment` | General payment verification |
| `GET` | `/api/v1/payments/:id` | Authenticated | `PaymentController.getPaymentDetails` | Payment receipt details |

---

## 3. Audited Defects, Vulnerabilities & Operational Blockers

### FINDING 1: Unauthenticated Admin Privilege Escalation (`/switch-demo/:role`)
- **Severity:** CRITICAL (P0)
- **Affected File:** `backend/src/routes/authRoutes.ts:11`, `backend/src/controllers/authController.ts:277-311`
- **User Impact:** Any anonymous visitor on the internet can send a `POST /api/v1/auth/switch-demo/ADMIN` request and receive a valid JWT for the first Admin in the database with full platform control.
- **Root Cause:** A convenience endpoint left in production code without environment guard or authentication.
- **Proposed Fix:** Remove `switch-demo` or strictly disable it when `NODE_ENV === 'production'`. Remove all demo switcher buttons from production frontends.
- **Verification Method:** Attempt request in production mode and verify `404 Not Found` or `403 Forbidden`.

### FINDING 2: Client-Supplied Role Escalation in Firebase Login
- **Severity:** CRITICAL (P0)
- **Affected File:** `backend/src/controllers/authController.ts:32, 62`
- **User Impact:** A user calling `/api/v1/auth/firebase-login` can pass `role: "ADMIN"` in the request body to automatically create an account with `ADMIN` role.
- **Root Cause:** The backend trusts the client-provided `role` body parameter when creating new users.
- **Proposed Fix:** Do not permit public registration as `ADMIN`. New users default strictly to `CUSTOMER` unless an explicit approved invitation workflow exists.
- **Verification Method:** Send registration payload with `role: "ADMIN"` and verify created user role is `CUSTOMER`.

### FINDING 3: Fallback Authentication Bypass & Hardcoded Secrets
- **Severity:** CRITICAL (P0)
- **Affected File:** `backend/src/config/env.ts:8-12`, `backend/src/config/firebase.ts:70-100`, `backend/src/config/razorpay.ts:28`
- **User Impact:** If `JWT_SECRET` is missing, a hardcoded default string is used. In `firebase.ts`, if token is invalid and `NODE_ENV === 'development'`, it returns a fake verified user. In `razorpay.ts`, any signature starting with `sim_sig_` is accepted. In `customerController.ts:238`, missing signature defaults to `sim_sig_valid`!
- **Root Cause:** Insecure developer fallbacks active in non-isolated code paths.
- **Proposed Fix:** Strict environment validation on startup; fail immediately if required secrets are absent in production; remove simulation signature bypasses.
- **Verification Method:** Test signature verification rejects `sim_sig_valid` and invalid tokens.

### FINDING 4: Data Loss Risk: Silent Fallback to `MongoMemoryServer`
- **Severity:** CRITICAL (P0)
- **Affected File:** `backend/src/config/db.ts:11-16`
- **User Impact:** If `MONGODB_URI` is unset or fails in production, the server silently starts an in-memory database. All customer data, bookings, and payments are permanently lost whenever the process restarts.
- **Root Cause:** In-memory server is used as an automatic fallback rather than an explicit test/development opt-in.
- **Proposed Fix:** In production (`NODE_ENV === 'production'`), require `MONGODB_URI` and fail startup with `process.exit(1)` if missing or invalid. Allow in-memory mode only when explicitly requested (e.g. `USE_IN_MEMORY_DB=true` in development/test).
- **Verification Method:** Start server in production mode without URI and verify process aborts with descriptive error.

### FINDING 5: Concurrent Seat Hold Race Condition & Seat Overselling
- **Severity:** HIGH (P1)
- **Affected File:** `backend/src/services/segmentEngine.ts:115-149`
- **User Impact:** When two passengers simultaneously attempt to book the last available seat on an overlapping segment, both requests read sufficient capacity, both call `updateMany`, and both succeed, resulting in vehicle overbooking.
- **Root Cause:** Read-then-write pattern without atomic conditional updates (`$expr` filter or atomic transaction).
- **Proposed Fix:** Implement atomic conditional reservation: update segments only if `totalSeats - (bookedSeats + pendingSeats) >= requestedSeats`. If any segment in the span fails to update atomically, rollback the increment.
- **Verification Method:** Concurrent booking automated test with 5 simultaneous requests for 1 remaining seat; exactly 1 must succeed.

### FINDING 6: Permanent Seat Locking via Expired Holds
- **Severity:** HIGH (P1)
- **Affected File:** `backend/src/controllers/customerController.ts:165`, `backend/src/models/Booking.ts:91`
- **User Impact:** When a customer initiates a booking but abandons checkout without paying, `pendingSeats` remain incremented permanently. After a few abandoned checkouts, the ride displays 0 available seats and is locked forever.
- **Root Cause:** `holdExpiresAt` is recorded but no scheduled worker or background cleanup releases expired holds.
- **Proposed Fix:** Implement a scheduled cleanup worker (running every 60 seconds) that finds bookings with `bookingStatus: 'PENDING_PAYMENT'` and `holdExpiresAt <= new Date()`, marks them `CANCELLED_BY_SYSTEM`, and calls `SegmentEngine.releaseHeldSeats()`.
- **Verification Method:** Create a held booking with expired timestamp, trigger hold reaper, and verify seats return to available.

### FINDING 7: Broken Payment Gateway Integration (Fake Simulation Modal)
- **Severity:** HIGH (P1)
- **Affected File:** `frontend/js/customer.js:238-268`, `frontend/index.html`
- **User Impact:** Frontend never loads the official Razorpay Checkout SDK (`https://checkout.razorpay.com/v1/checkout.js`). Instead, it displays a mock simulation popup and submits hardcoded signature `sim_sig_valid`.
- **Root Cause:** Placeholder implementation was never completed with Razorpay Standard Checkout.
- **Proposed Fix:** Load official Razorpay Checkout script, instantiate `new Razorpay(options)` with backend-provided `orderId`, `amount`, and `keyId`, handle payment success/dismissal/failure, and verify server-side.
- **Verification Method:** Test-mode checkout flow with Razorpay test credentials.

### FINDING 8: Insecure Direct Object Reference (IDOR) on Payments & Bookings
- **Severity:** HIGH (P1)
- **Affected File:** `backend/src/controllers/payment.controller.ts:59, 107`, `backend/src/controllers/driverController.ts:261`
- **User Impact:** 
  1. `GET /api/v1/payments/:id` returns payment and user details to any authenticated caller without checking if they own the payment or are ADMIN.
  2. `POST /api/v1/driver/bookings/:bookingId/boarded` allows any driver to verify OTP and mark boarded on another driver's passenger booking.
- **Root Cause:** Missing object-level authorization checks.
- **Proposed Fix:** Verify `payment.customer.equals(req.user._id) || req.user.role === 'ADMIN'` and verify booking belongs to `ride.driver.equals(req.user._id)`.
- **Verification Method:** Automated test attempting cross-user payment read and cross-driver boarding verification.

### FINDING 9: Missing Webhook Idempotency & Replay Protection
- **Severity:** MEDIUM (P2)
- **Affected File:** `backend/src/services/razorpay.service.ts:113-186`
- **User Impact:** Razorpay frequently retries webhooks on network timeouts. Repeated webhook deliveries will re-execute booking confirmation, double-incrementing seat state transitions.
- **Root Cause:** No persistent webhook event idempotency ledger.
- **Proposed Fix:** Create an `AuditLog` or `WebhookEvent` model with unique `eventId` index to record and skip processed events.
- **Verification Method:** Send duplicate webhook payload; verify second invocation returns HTTP 200 without duplicate processing.

### FINDING 10: Infrastructure Information Disclosure in Health Route
- **Severity:** LOW (P3)
- **Affected File:** `backend/src/routes/health.routes.ts:78-79`
- **User Impact:** `GET /api/health/ready` exposes MongoDB cluster hostnames and internal database names publicly.
- **Root Cause:** Detailed connection object passed directly into response.
- **Proposed Fix:** Omit internal hostnames and database names from public health response.
- **Verification Method:** Request `/api/health/ready` and ensure host and internal DB name are omitted.

### FINDING 11: Exposed Sensitive Scratch Scripts in Repository
- **Severity:** MEDIUM (P2)
- **Affected File:** Root directory: `dump-users.js`, `seed-admin.js`, `test-login.js`
- **User Impact:** `dump-users.js` logs user password hashes; `seed-admin.js` contains hardcoded admin email and plain text password.
- **Root Cause:** Developer debug scripts committed to root.
- **Proposed Fix:** Remove these one-off scratch scripts.
- **Verification Method:** Verify files are removed from working directory and untracked.

---

## 4. Remediation Plan

1. **Phase 2 (Environment & Config):** Robust env validator, disable in-memory in production, sanitize health endpoint, clean gitignore, remove scratch scripts.
2. **Phase 3 (Auth & Security):** Remove `switch-demo`, enforce strict role assignments, fix IDOR in payment and driver controllers, add automated auth tests.
3. **Phase 4 & 5 (Database & Concurrency):** Implement atomic seat reservation in `SegmentEngine`, add expired hold reaper worker, add compound indexes and paise/rupee consistency.
4. **Phase 6 (Razorpay Integration):** Full Razorpay SDK integration, rawBody webhook verification, webhook idempotency ledger, secure client callback verification.
5. **Phase 7 (Frontend Polish):** Real Razorpay Standard Checkout in `customer.js`, remove simulation modals, ensure responsive states.
6. **Phase 8 & 9 (Tests & Quality):** Automated integration tests for auth, segment concurrency, and webhook processing.
7. **Phase 10 (Deployment Readiness):** Production build verification and deployment documentation.
