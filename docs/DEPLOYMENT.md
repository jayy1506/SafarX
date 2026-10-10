# SafarX (sawangi-ride) — Production Deployment Guide

This guide details the deployment architecture, infrastructure configuration, environment variable management, SSL/HTTPS termination, backup/recovery, and rollback protocols for **SafarX**.

---

## 1. Architecture Overview

```
                        [ Cloudflare / DNS / WAF ]
                                    │
                                    ▼ (HTTPS / TLS 1.3)
                    ┌───────────────────────────────┐
                    │ Managed Application Host      │
                    │ (Render / Railway / AWS ECS)  │
                    │                               │
                    │   ┌───────────────────────┐   │
                    │   │ Node.js Express (TS)  │   │
                    │   │ API & Static Portals  │   │
                    │   └───────────────────────┘   │
                    └───────────────┬───────────────┘
                                    │
            ┌───────────────────────┼───────────────────────┐
            │ (TLS Encrypted Mongoose)                      │ (Webhook / REST API)
            ▼                                               ▼
┌───────────────────────────────┐               ┌───────────────────────────────┐
│ MongoDB Atlas                 │               │ Razorpay Gateway              │
│ (Replica Set / M10+ Cluster)  │               │ (Live API & Webhooks)         │
└───────────────────────────────┘               └───────────────────────────────┘
```

- **Frontend:** Pure HTML/CSS/ES6 SPA served statically from `/frontend` via Express (`express.static`) or decoupled onto a CDN (Cloudflare Pages / Vercel / Netlify).
- **Backend:** Node.js Express service built with TypeScript (`dist/` target via `npm run build`), running in native ES Module mode (`node dist/server.js`).
- **Database:** MongoDB Atlas (v6.0+) running a replica set to support multi-document transactions and atomic conditional updates.
- **Payment Processing:** Razorpay Standard Checkout SDK on client, server-side cryptographic order creation, verification, and HMAC-verified webhooks.

---

## 2. Recommended Hosting Platforms

| Platform | Recommended Tier | Best For | Build Command | Start Command |
|---|---|---|---|---|
| **Render** | Web Service (Starter or Standard) | Fastest production setup, automated SSL, zero-downtime deploys | `npm install && npm run build` | `npm start` |
| **Railway** | Pro Plan | Microservices, seamless environment variable injection | `npm install && npm run build` | `npm start` |
| **AWS App Runner / ECS** | 1 vCPU / 2GB RAM Container | Enterprise compliance, autoscaling | Docker multi-stage build | `node dist/server.js` |
| **DigitalOcean App Platform** | Basic ($12/mo) or Pro | Predictable pricing, simple custom domain management | `npm install && npm run build` | `npm start` |

---

## 3. MongoDB Atlas Configuration

1. **Cluster Specification:**
   - Minimum: **M10 Dedicated Tier** (M0 Free Tier is NOT supported for production because it lacks multi-document ACID transaction guarantees under load and restricts connection concurrency).
   - Replica Set: 3-node replica set across AWS regions (e.g., `ap-south-1` Mumbai for minimal latency to Wardha).
   - Storage Engine: WiredTiger with encryption at rest enabled.

2. **Network Security & IP Allowlist:**
   - In MongoDB Atlas **Network Access**, avoid `0.0.0.0/0` in production if using static egress IPs from your host.
   - If deploying on Render/Railway dynamic IP pools, configure **AWS VPC Peering** or **Private Service Connect**, or restrict access via Atlas Database User SCRAM-SHA-256 with a 32-character random password.

3. **Database User & Permissions:**
   - Create a dedicated database user with `readWrite` role scoped *strictly* to the `safarx_prod` database:
     ```
     db.createUser({
       user: "safarx_api_user",
       pwd: "<GENERATE_SECURE_PASSWORD>",
       roles: [ { role: "readWrite", db: "safarx_prod" } ]
     })
     ```

4. **Connection String:**
   - Ensure the connection URI includes `retryWrites=true&w=majority`:
     ```env
     MONGODB_URI=mongodb+srv://safarx_api_user:<PASSWORD>@safarx-cluster.xxxx.mongodb.net/safarx_prod?retryWrites=true&w=majority
     ```

---

## 4. Environment Variables Injection

Every production host must inject the environment variables documented in [`docs/ENVIRONMENT.md`](file:///c:/Users/jthak/OneDrive/Attachments/Desktop/rapidoo/docs/ENVIRONMENT.md).

### Example: Render Environment Configuration
In **Render Dashboard** -> **Environment**:
```env
NODE_ENV=production
PORT=10000
MONGODB_URI=mongodb+srv://safarx_api_user:<SECRET>@safarx.mongodb.net/safarx_prod?retryWrites=true&w=majority
USE_IN_MEMORY_DB=false
JWT_SECRET=<64_CHAR_HEX_SECRET>
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://safarx.in
FRONTEND_URL=https://safarx.in
RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=<SECRET_RAZORPAY_LIVE_KEY>
RAZORPAY_WEBHOOK_SECRET=<SECRET_RAZORPAY_WEBHOOK_HEX>
FIREBASE_PROJECT_ID=safarx-prod
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@safarx-prod.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
LOG_LEVEL=info
```

> **Security Rule:** Never inject test keys (`rzp_test_...`) or set `USE_IN_MEMORY_DB=true` in production. The startup validator in [`backend/src/config/env.ts`](file:///c:/Users/jthak/OneDrive/Attachments/Desktop/rapidoo/backend/src/config/env.ts) will immediately throw and abort server bootstrap if any required secret is missing.

---

## 5. Domain, SSL/HTTPS & CORS Security

1. **Custom Domain Setup:**
   - Map apex domain `safarx.in` and `www.safarx.in` via CNAME/ALIAS records to your host.
   - Enforce **Strict HTTPS** (HTTP Strict Transport Security - HSTS) with TLS 1.3.

2. **CORS Allowlist:**
   - The application server strictly validates origins against `CORS_ORIGIN` and `FRONTEND_URL`.
   - Never set `CORS_ORIGIN=*` in production. Only authorized customer, driver, and admin portals are permitted.

3. **Proxy Header Trust:**
   - Express is configured to trust reverse proxies (`app.set('trust proxy', 1)`) so that client IP detection for rate limiting (`express-rate-limit`) accurately identifies user IPs rather than load balancer IPs.

---

## 6. Pre-Deployment Verification Checklist

Before triggering a production build:
- [ ] Run automated test suite: `npm test` (all 10 tests must pass).
- [ ] Run production build compilation: `npm run build` (must exit with code 0).
- [ ] Verify no scratch files, dump scripts, or test keys exist in the repository.
- [ ] Verify `validateEnv()` passes with production environment variables set.
- [ ] Verify Razorpay Webhook URL endpoint `https://safarx.in/api/v1/payments/webhook` is configured in Razorpay Merchant Dashboard with event `payment.captured` and matching `RAZORPAY_WEBHOOK_SECRET`.
- [ ] Verify MongoDB Atlas indexes are synchronized (indexes on `WebhookEvent.eventId`, `AuditLog.entityId`, `Booking.bookingId`, `User.email`, `User.phone`).

---

## 7. Zero-Downtime Deployment & Health Checks

- **Health Check Endpoint:**
  Configure your hosting platform's health check probe to:
  ```
  GET /api/v1/health
  ```
  - **Healthy Response (200 OK):**
    ```json
    {
      "status": "ok",
      "timestamp": "2026-10-10T11:35:00.000Z",
      "services": {
        "database": "connected"
      }
    }
    ```
  - **Unhealthy Response (503 Service Unavailable):**
    ```json
    {
      "status": "degraded",
      "timestamp": "2026-10-10T11:35:00.000Z",
      "services": {
        "database": "disconnected"
      }
    }
    ```
- **Rolling Restarts:** Deploy new container/process instances and verify `/api/v1/health` returns HTTP 200 before draining traffic from the previous instance.

---

## 8. Backup & Disaster Recovery Protocol

1. **MongoDB Atlas Continuous Backups:**
   - Enable **Point-in-Time Recovery (PITR)** in Atlas (snapshots retained for 35 days, continuous oplog for down-to-the-second restoration).
   - Frequency: Daily automated snapshots with 7-day retention; hourly incremental snapshots during peak operating hours (07:00 - 22:00 IST).

2. **Emergency Database Restoration Procedure:**
   - In Atlas Console: Go to **Backup** -> **Restore** -> **Point in Time**.
   - Select timestamp immediately preceding corruption/incident.
   - Restore to a temporary staging cluster to verify data integrity before updating `MONGODB_URI` on the application service.

3. **Audit Log & Webhook Reconciliation:**
   - All booking state modifications write immutable records to the `AuditLog` collection.
   - All Razorpay webhooks persist unique records in `WebhookEvent`.
   - In the event of a discrepancy, replay uncaptured payments using Razorpay Dashboard event redelivery.

---

## 9. Rollback Protocol

If a production incident occurs post-deployment:
1. **Immediate Traffic Rollback:**
   - In your hosting dashboard (Render / Railway / ECS), select the prior successful release and click **Rollback to this version**.
   - Rollback executes within 60 seconds without dropping active user connections.
2. **Git Rollback:**
   - If rolling back via Git:
     ```bash
     git revert HEAD --no-edit
     git push origin main
     ```
3. **Database Schema Compatibility:**
   - Schema modifications in SafarX (such as adding `amountInPaise` and `AuditLog`) are backward-compatible. Rolling back application code does not require rolling back database data.
