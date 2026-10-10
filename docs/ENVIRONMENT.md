# SAFARX (SAWANGI-RIDE) — ENVIRONMENT & CONFIGURATION GUIDE

This document details the configuration strategy, environment separation, validation rules, and operational safeguards for SafarX.

---

## 1. Environment Separation Matrix

| Configuration Variable | Development | Staging | Production | Description |
|---|---|---|---|---|
| `NODE_ENV` | `development` | `staging` | `production` | Node.js execution environment |
| `PORT` | `5000` | `5000` | `5000` or assigned | HTTP server listener port |
| `MONGODB_URI` | Local or Dev Atlas | Staging Atlas Cluster | Production Atlas Cluster (M10+) | MongoDB connection URI with replica set |
| `USE_IN_MEMORY_DB` | `true` (opt-in) | `false` (Forbidden) | `false` (Strictly Forbidden) | Run in-process MongoMemoryServer |
| `JWT_SECRET` | Dev secret (32+ char) | Secure 64-char hex | Secret Manager 64-char hex | Symmetric HMAC secret for JWTs |
| `JWT_EXPIRES_IN` | `7d` | `7d` | `7d` | Token expiration duration |
| `RAZORPAY_KEY_ID` | `rzp_test_...` | `rzp_test_...` | `rzp_live_...` | Razorpay Merchant Key ID |
| `RAZORPAY_KEY_SECRET` | Razorpay Test Secret | Razorpay Test Secret | Razorpay Live Secret | Razorpay Secret Key (NEVER expose to client) |
| `RAZORPAY_WEBHOOK_SECRET` | Test Webhook Secret | Staging Webhook Secret | Live Webhook Secret | Secret used for HMAC webhook verification |
| `RAZORPAY_MODE` | `test` | `test` | `live` | Payment gateway operating mode |
| `FRONTEND_URL` | `http://localhost:5000` | `https://staging.safarx.in` | `https://safarx.in` | Base frontend URL |
| `ALLOWED_ORIGINS` | Comma-delimited dev URLs | Staging domains | Production verified domains | CORS origin allowlist |
| `FIREBASE_PROJECT_ID` | `safarx-513ce` | `safarx-513ce` | `safarx-513ce` | Firebase project identifier |
| `FIREBASE_SERVICE_ACCOUNT` | JSON path or string | Secret Manager string | Secret Manager string | Service account credentials |

---

## 2. Startup Validation & Fail-Safe Strategy

The SafarX server executes `validateEnv()` in `backend/src/config/env.ts` as the very first operation during application bootstrap.

### Production Constraints Enforced at Boot:
1. **Persistent Database Mandatory:** If `MONGODB_URI` is missing or empty when `NODE_ENV=production`, the application halts immediately with an exit code of `1`. The server **never** falls back to `mongodb-memory-server` in production.
2. **Cryptographic Secret Strength:** `JWT_SECRET` must be set and must be at least 32 characters long. Hardcoded development placeholders are rejected.
3. **Razorpay Production Credentials:** In production, placeholder key IDs (e.g. `rzp_test_your_...`) are rejected.
4. **Webhook Security:** `RAZORPAY_WEBHOOK_SECRET` must be configured in production to ensure raw HMAC verification of payment events.
5. **No Automatic Database Seeding in Production:** The startup check ensures test seeders creating hardcoded passwords (`admin123`, `driver123`) do NOT execute in production.

---

## 3. Database Connection & Pooling

MongoDB connection is established via `backend/src/config/db.ts` with production connection parameters:
- `maxPoolSize`: `50` (handles high concurrent burst requests)
- `serverSelectionTimeoutMS`: `5000` (fast failure if database cluster is unreachable)
- `connectTimeoutMS`: `10000` (connection setup timeout)
- `strictQuery`: `true`

---

## 4. Security Headers & Request Limits

- **Helmet:** Configured with Content Security Policy compatible with Firebase CDN and mapping assets.
- **Rate Limiting:**
  - `authLimiter`: Max 30 authentication attempts per 15 minutes per IP.
  - `apiLimiter`: Max 120 API requests per minute per IP.
- **Body Parsing:**
  - `express.json` with `limit: '10mb'` and `verify` hook preserving `req.rawBody` for cryptographic Razorpay webhook verification.

---

## 5. Health & Readiness Probes

- `GET /api/health` — Basic liveness check returning uptime and status.
- `GET /api/health/live` — Orchestrator probe (Kubernetes / Render / Railway).
- `GET /api/health/ready` — Verifies active MongoDB connectivity via admin ping without exposing cluster hostnames or internal database identifiers.
