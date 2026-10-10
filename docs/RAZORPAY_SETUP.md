# SAFARX (SAWANGI-RIDE) — RAZORPAY PAYMENT GATEWAY INTEGRATION GUIDE

This document provides complete instructions for setting up, configuring, testing, and activating the Razorpay Standard Checkout payment integration for SafarX.

---

## 1. Razorpay Dashboard Configuration

1. **Sign Up / Log In:** Log in to the [Razorpay Dashboard](https://dashboard.razorpay.com).
2. **Generate API Keys:**
   - Navigate to **Settings → API Keys**.
   - Select **Generate Test Key** for development/staging.
   - For live operations, complete KYC verification and generate **Live Keys**.
   - Save `Key ID` and `Key Secret` securely.
   - **CRITICAL:** Never expose `Key Secret` in client-side code, Git commits, or chat logs.

---

## 2. Environment Variables Configuration

Add the following keys to your deployment platform's Secret Manager or `.env` file:

```bash
# Razorpay Credentials (Use Test keys for development, Live keys for production)
RAZORPAY_KEY_ID=rzp_test_YourKeyIdHere
RAZORPAY_KEY_SECRET=YourRazorpayKeySecretHere
RAZORPAY_WEBHOOK_SECRET=YourWebhookSecretHere
RAZORPAY_MODE=test # or 'live'
```

---

## 3. Webhook Configuration

Razorpay webhooks provide authoritative server-to-server notifications of payment captures, failures, and refunds.

### Webhook URL Endpoint:
- **Production:** `https://your-domain.com/api/v1/payments/webhook`
- **Local Testing:** Use ngrok or localtunnel: `https://<tunnel-subdomain>.ngrok-free.app/api/v1/payments/webhook`

### Active Events to Subscribe:
- `payment.captured` — Triggered when a customer's payment is successfully authorized and captured.
- `order.paid` — Triggered when a payment order is completely fulfilled.
- `payment.failed` — Triggered when a payment transaction fails or is denied by the bank/UPI app.
- `refund.processed` — Triggered when a refund has been issued back to the customer's payment instrument.

### Webhook Secret:
- Enter a high-entropy random string (at least 32 characters) as the **Secret** in the Razorpay Webhook dashboard.
- Set the exact same value in `RAZORPAY_WEBHOOK_SECRET`.
- SafarX cryptographically validates each incoming request using `HMAC-SHA256(req.rawBody, RAZORPAY_WEBHOOK_SECRET)`.

---

## 4. Payment & Checkout Architecture

```
[Customer Browser]               [SafarX Backend]              [Razorpay Gateway]
        |                               |                              |
        |--- 1. Initiate Booking ------>|                              |
        |    (pickup, drop, seats)      |--- Hold Segment Seats ------>|
        |                               |--- 2. Create Order --------->|
        |                               |    (amount in paise)         |
        |<-- Return Order & Key ID -----|<-- Order ID (order_xxx) -----|
        |                               |                              |
        |--- 3. Open Checkout Modal ---------------------------------->|
        |    (Razorpay JS SDK)          |                              |
        |<-- 4. Customer Pays (UPI) -----------------------------------|
        |                               |                              |
        |--- 5. Signature Callback ---->|                              |
        |    (orderId, paymentId, sig)  |--- Verify Signature -------->|
        |                               |--- Confirm Held Seats ------>|
        |<-- Booking Confirmed + OTP ---|                              |
        |                               |                              |
        |                               |<== 6. Webhook (Async) =======|
        |                               |    (Idempotent Reconciliation)
```

### Amount Standard:
- All INR monetary values sent to Razorpay are in integer **paise** (1 INR = 100 paise).
- A fare of ₹40 is submitted as `4000` paise.

---

## 5. Local Webhook Testing Instructions

1. Start SafarX server: `npm run dev`
2. Start an HTTP tunnel pointing to port 5000:
   ```bash
   npx ngrok http 5000
   ```
3. Copy your forwarding URL (e.g. `https://abc-123.ngrok-free.app`).
4. In Razorpay Test Dashboard → Settings → Webhooks:
   - Webhook URL: `https://abc-123.ngrok-free.app/api/v1/payments/webhook`
   - Secret: value matching `RAZORPAY_WEBHOOK_SECRET` in your `.env`.
   - Events: `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`.
5. Test payments in Razorpay test mode using the test UPI ID `success@razorpay`.

---

## 6. Live Activation Checklist

- [ ] Complete business KYC and bank account verification on Razorpay.
- [ ] Activate UPI, Cards, and Netbanking payment methods in Razorpay Dashboard.
- [ ] Switch `RAZORPAY_MODE=live`.
- [ ] Generate Live Key ID (`rzp_live_...`) and Live Key Secret in production secret manager.
- [ ] Update Webhook endpoint to the production HTTPS domain.
- [ ] Verify production webhook secret is set and matches `RAZORPAY_WEBHOOK_SECRET`.
- [ ] Perform a small live transaction (e.g. ₹10) on the corridor and confirm automatic booking confirmation and seat matrix update.
