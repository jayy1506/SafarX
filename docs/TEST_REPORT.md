# SAFARX (SAWANGI-RIDE) — AUTOMATED TEST REPORT

**Execution Date:** October 2026  
**Environment:** Node.js v22.10.7, tsx v4.19.2, MongoMemoryServer v10.1.3  
**Test Runner:** Node.js native test runner (`node:test`, `node:assert/strict`) via tsx  
**Command:** `npm test` (`tsx --test backend/src/tests/**/*.test.ts`)

---

## 1. Test Summary

| Metric | Result | Status |
|---|---|---|
| Total Tests | 10 | Completed |
| Passed | 10 | PASS |
| Failed | 0 | PASS |
| Skipped / Cancelled | 0 | - |
| Duration | ~20.1s | Fast |

---

## 2. Test Execution Details

### Suite 1: Authentication & Authorization Security (`backend/src/tests/auth.test.ts`)
- **`ok 1 - User Model: hashes passwords and strips hashes on JSON serialization`**
  - **Verified:** Passwords are automatically hashed using bcrypt salt on save.
  - **Verified:** Plain-text passwords never reside in the database.
  - **Verified:** `toJSON()` and `toObject()` transforms strip `password` and `__v` attributes from all API responses.
- **`ok 2 - Auth Middleware: authorizeRole enforces role boundaries`**
  - **Verified:** Customer accounts attempting Admin routes are blocked with HTTP `403 Forbidden`.
  - **Verified:** Driver accounts attempting Admin routes are blocked with HTTP `403 Forbidden`.
  - **Verified:** Admin accounts accessing Admin routes are authorized (`next()` called).

### Suite 2: Dynamic Segment Fare Calculation (`backend/src/tests/fareCalculator.test.ts`)
- **`ok 3 - FareCalculator: calculates proportional corridor fares across segments`**
  - **Verified:** Full corridor (4 segments, Sawangi ↔ Wardha) calculates exactly ₹40.
  - **Verified:** 10% platform commission (₹4) and driver earnings (₹36) correctly computed.
  - **Verified:** Partial corridor (2 segments, Sawangi ↔ Nalwadi) calculates proportional fare of ₹20.
  - **Verified:** Multi-seat bookings multiply subtotal, commission, and driver earnings proportionally.
- **`ok 4 - FareCalculator: enforces minFare and maxFare boundary conditions`**
  - **Verified:** Rides with fares below `minFare` are automatically bounded to `minFare`.

### Suite 3: Cryptographic Payment & Webhook Verification (`backend/src/tests/razorpay.test.ts`)
- **`ok 5 - RazorpayService: verifies client payment signature cryptographically`**
  - **Verified:** Valid `HMAC-SHA256(order_id + "|" + payment_id, secret)` returns true.
  - **Verified:** Tampered `paymentId` or `orderId` returns false.
  - **Verified:** Mock simulation signatures (`sim_sig_valid`) are strictly rejected.
- **`ok 6 - RazorpayService: verifies webhook HMAC-SHA256 signature using raw body`**
  - **Verified:** Raw request payload verified with `crypto.timingSafeEqual`.
  - **Verified:** Invalid signatures return false without executing mutations.
- **`ok 7 - RazorpayService: processes webhook events with strict idempotency`**
  - **Verified:** `payment.captured` transitions Payment to `CAPTURED`.
  - **Verified:** Unique event ID stored in `WebhookEvent` model.
  - **Verified:** Duplicate webhook redeliveries with identical event ID are skipped idempotently without duplicate seat confirmation.

### Suite 4: Segment Capacity & Concurrency Control (`backend/src/tests/segmentEngine.test.ts`)
- **`ok 8 - SegmentEngine: allows sequential passengers to reuse seats on non-overlapping segments`**
  - **Verified:** Passenger 1 holding Segment 1 (Sawangi ➔ DMIHER) locks Segment 1.
  - **Verified:** Passenger 2 can immediately book Segments 2, 3, 4 (DMIHER ➔ Wardha) on the exact same seat because journeys do not overlap.
- **`ok 9 - SegmentEngine: prevents overbooking under concurrent requests for the last seat`**
  - **Verified:** 5 simultaneous requests for 1 remaining seat executed concurrently via `Promise.all`.
  - **Verified:** Atomic `$expr` conditional update ensures exactly 1 request succeeds.
  - **Verified:** The 4 losing requests fail safely; collisions are averted and intermediate reservations rolled back.
  - **Verified:** Final pending seat count is exactly 1, completely preventing vehicle overselling.
- **`ok 10 - SegmentEngine: releases expired seat holds safely`**
  - **Verified:** Abandoned bookings with expired `holdExpiresAt` are transitioned to `CANCELLED_BY_SYSTEM`.
  - **Verified:** Pending seat counts in `RideSegment` are safely decremented back to 0.
