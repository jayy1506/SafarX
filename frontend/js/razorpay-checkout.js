/**
 * SafarX - Razorpay Standard Web Checkout Module
 * 
 * Implements:
 * 1. POST /api/create-order to create order via Razorpay API
 * 2. Razorpay Standard Checkout modal with order_id
 * 3. POST /api/verify-payment with razorpay_order_id, razorpay_payment_id, razorpay_signature
 * 4. User cancellation handling (modal.ondismiss)
 * 5. Payment failure handling (payment.failed)
 */

export async function initiateRazorpayCheckout(options = {}) {
  const {
    amount = 100, // default 100 paise (₹1.00 minimum)
    currency = 'INR',
    receipt = '',
    name = 'SafarX Mobility',
    description = 'Standard Shared Ride Payment',
    prefill = {},
    themeColor = '#FF6B00',
    onSuccess,
    onFailure,
    onDismiss,
  } = options;

  // Validate Razorpay SDK script availability
  if (typeof window.Razorpay === 'undefined') {
    const err = new Error('Razorpay Checkout SDK is still loading or failed to load. Please check your internet connection.');
    if (typeof onFailure === 'function') onFailure(err);
    else if (window.SawangiApp?.showToast) window.SawangiApp.showToast(err.message, 'error');
    else alert(err.message);
    return;
  }

  // Validate amount >= 100 paise
  const amountInPaise = Math.round(Number(amount));
  if (!amountInPaise || amountInPaise < 100) {
    const err = new Error('Amount must be at least 100 paise (₹1.00).');
    if (typeof onFailure === 'function') onFailure(err);
    else if (window.SawangiApp?.showToast) window.SawangiApp.showToast(err.message, 'error');
    else alert(err.message);
    return;
  }

  try {
    if (window.SawangiApp?.showToast) {
      window.SawangiApp.showToast('Initiating order with Razorpay...', 'info');
    }

    // Step 1: Call backend to create order
    const orderRes = await fetch('/api/create-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency,
        receipt: receipt || `rcpt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      }),
    });

    const orderData = await orderRes.json();
    if (!orderRes.ok || !orderData.order_id) {
      throw new Error(orderData.message || 'Failed to create Razorpay order');
    }

    const orderId = orderData.order_id;
    let keyId = orderData.key_id || orderData.keyId;

    if (!keyId) {
      try {
        const keyRes = await fetch('/api/razorpay-key');
        if (keyRes.ok) {
          const keyData = await keyRes.json();
          keyId = keyData.key_id || keyData.keyId;
        }
      } catch (e) {
        console.warn('[Razorpay Checkout] Fallback key fetch failed:', e);
      }
    }

    if (!keyId) {
      throw new Error('Razorpay Key ID is not configured on the server. Please add RAZORPAY_KEY_ID in Render Environment variables.');
    }

    let user = {};
    try {
      user = JSON.parse(localStorage.getItem('sawangi_user') || '{}');
    } catch {}

    const isRealRazorpayOrder = orderId && orderId.startsWith('order_') && !orderId.startsWith('order_test_');

    // Step 2: Open Razorpay Checkout modal
    const checkoutOptions = {
      key: keyId,
      amount: orderData.amount,
      currency: orderData.currency || 'INR',
      name,
      description,
      ...(isRealRazorpayOrder ? { order_id: orderId } : {}),
      handler: async function (response) {
        try {
          if (window.SawangiApp?.showToast) {
            window.SawangiApp.showToast('Verifying payment signature cryptographically...', 'info');
          }

          // Step 3: Call backend to verify HMAC-SHA256 signature
          const verifyRes = await fetch('/api/verify-payment', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id || orderId,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature || 'simulated_test_sig',
            }),
          });

          const verifyData = await verifyRes.json();
          if (!verifyRes.ok || !verifyData.success) {
            throw new Error(verifyData.message || 'Cryptographic signature verification failed.');
          }

          if (window.SawangiApp?.showToast) {
            window.SawangiApp.showToast('Payment verified successfully! 🎉', 'success');
          }

          if (typeof onSuccess === 'function') {
            onSuccess({
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
              verifyData,
            });
          }
        } catch (verifyError) {
          console.error('[Razorpay Verify Error]:', verifyError);
          if (window.SawangiApp?.showToast) {
            window.SawangiApp.showToast('Payment verification failed: ' + verifyError.message, 'error');
          }
          if (typeof onFailure === 'function') {
            onFailure(verifyError);
          }
        }
      },
      prefill: {
        name: prefill.name || user.fullName || '',
        email: prefill.email || user.email || '',
        contact: prefill.contact || user.phone || '',
      },
      theme: {
        color: themeColor,
      },
      modal: {
        ondismiss: function () {
          console.log('[Razorpay Checkout] Modal dismissed by user');
          if (window.SawangiApp?.showToast) {
            window.SawangiApp.showToast('Payment cancelled by user.', 'warning');
          }
          if (typeof onDismiss === 'function') {
            onDismiss();
          }
        },
      },
    };

    const rzp = new window.Razorpay(checkoutOptions);

    rzp.on('payment.failed', function (failureResponse) {
      const errMsg = failureResponse.error?.description || 'Payment failed or declined by bank';
      console.error('[Razorpay Payment Failed]:', failureResponse.error);
      if (window.SawangiApp?.showToast) {
        window.SawangiApp.showToast('Payment failed: ' + errMsg, 'error');
      }
      if (typeof onFailure === 'function') {
        onFailure(new Error(errMsg));
      }
    });

    rzp.open();
  } catch (error) {
    console.error('[Razorpay Checkout Error]:', error);
    if (window.SawangiApp?.showToast) {
      window.SawangiApp.showToast(error.message || 'Checkout failed', 'error');
    }
    if (typeof onFailure === 'function') {
      onFailure(error);
    }
  }
}

// Attach globally for browser / inline script access
if (typeof window !== 'undefined') {
  window.RazorpayCheckout = { initiateRazorpayCheckout };
  window.payWithRazorpay = initiateRazorpayCheckout;
}
