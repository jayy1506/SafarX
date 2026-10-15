import { API } from './api.js';

export const CustomerApp = {
  routes: [],
  selectedRideForBooking: null,
  pendingPaymentData: null,

  async init() {
    this.bindEvents();
    await this.loadRoutesAndStops();
    await this.loadMyBookings();
  },

  bindEvents() {
    const searchForm = document.getElementById('customer-search-form');
    if (searchForm) {
      searchForm.addEventListener('submit', (e) => this.handleSearchRides(e));
    }

    const pickupSelect = document.getElementById('search-pickup-stop');
    const dropSelect = document.getElementById('search-drop-stop');

    if (pickupSelect && dropSelect) {
      pickupSelect.addEventListener('change', () => this.validateStopSelection());
      dropSelect.addEventListener('change', () => this.validateStopSelection());
    }

    const checkoutForm = document.getElementById('customer-checkout-form');
    if (checkoutForm) {
      checkoutForm.addEventListener('submit', (e) => this.handleInitiatePayment(e));
    }

    const reviewForm = document.getElementById('customer-review-form');
    if (reviewForm) {
      reviewForm.addEventListener('submit', (e) => this.handleSubmitReview(e));
    }

    const dashboardPayBtn = document.getElementById('dashboard-rzp-pay-btn');
    if (dashboardPayBtn) {
      dashboardPayBtn.addEventListener('click', async () => {
        const amtInput = document.getElementById('dashboard-rzp-amount');
        const amount = parseInt(amtInput ? amtInput.value : '100', 10) || 100;
        if (amount < 100) {
          window.SawangiApp?.showToast('Minimum amount is 100 paise (₹1.00)', 'error');
          return;
        }
        if (window.payWithRazorpay) {
          await window.payWithRazorpay({ amount });
        }
      });
    }

    document.querySelectorAll('.rzp-demo-amt').forEach((btn) => {
      btn.addEventListener('click', () => {
        const amtInput = document.getElementById('dashboard-rzp-amount');
        if (amtInput) amtInput.value = btn.getAttribute('data-paise');
      });
    });
  },

  async loadRoutesAndStops() {
    try {
      const res = await API.get('/customer/routes');
      this.routes = res.routes || [];

      const pickupSelect = document.getElementById('search-pickup-stop');
      const dropSelect = document.getElementById('search-drop-stop');
      const dateInput = document.getElementById('search-ride-date');

      if (!pickupSelect || !dropSelect) return;

      const todayStr = new Date().toISOString().split('T')[0];
      if (dateInput) dateInput.value = todayStr;

      // Collect all unique active stops
      const allStops = new Set();
      this.routes.forEach((r) => {
        r.stops.forEach((s) => {
          if (s.isActive) allStops.add(s.name);
        });
      });

      const stopOptions = Array.from(allStops).map((s) => `<option value="${s}">${s}</option>`).join('');

      pickupSelect.innerHTML = `<option value="">Select Pickup Stop</option>${stopOptions}`;
      dropSelect.innerHTML = `<option value="">Select Drop Stop</option>${stopOptions}`;

      // Default to Sawangi -> Wardha
      pickupSelect.value = 'Sawangi';
      dropSelect.value = 'Wardha';
    } catch (err) {
      console.error('Error loading routes & stops:', err);
    }
  },

  validateStopSelection() {
    const pickup = document.getElementById('search-pickup-stop').value;
    const drop = document.getElementById('search-drop-stop').value;
    const warning = document.getElementById('search-validation-warning');

    if (pickup && drop && pickup === drop) {
      if (warning) {
        warning.textContent = 'Pickup and Drop stops cannot be the same.';
        warning.style.display = 'block';
      }
      return false;
    }

    if (warning) warning.style.display = 'none';
    return true;
  },

  async handleSearchRides(e) {
    if (e) e.preventDefault();
    if (!this.validateStopSelection()) return;

    const pickup = document.getElementById('search-pickup-stop').value;
    const drop = document.getElementById('search-drop-stop').value;
    const date = document.getElementById('search-ride-date').value;

    if (!pickup || !drop || !date) {
      window.SawangiApp.showToast('Please select pickup, drop, and date', 'warning');
      return;
    }

    const container = document.getElementById('customer-search-results');
    if (!container) return;

    container.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
        🔍 Calculating segment availability and searching verified rides...
      </div>
    `;

    try {
      const res = await API.get(`/customer/rides/search?pickup=${encodeURIComponent(pickup)}&drop=${encodeURIComponent(drop)}&date=${date}&seats=1`);

      if (!res.rides || res.rides.length === 0) {
        container.innerHTML = `
          <div class="card" style="text-align: center; padding: 2.5rem 1.5rem;">
            <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🚗💨</div>
            <h3 style="font-weight: 800; font-size: 1.1rem; margin-bottom: 0.3rem;">No Rides Found for this Segment</h3>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">
              No drivers have published available seats from <strong>${pickup}</strong> to <strong>${drop}</strong> on <strong>${date}</strong>.
            </p>
            <button class="btn btn-sm btn-secondary" onclick="window.SawangiCustomer.searchAllToday()">Check Other Times</button>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div style="margin-bottom: 0.75rem; font-size: 0.85rem; font-weight: 700; color: var(--text-muted);">
          Found ${res.rides.length} available shared ride(s) on ${pickup} ➔ ${drop}:
        </div>
        ${res.rides.map((r) => `
          <div class="ride-card">
            <div class="ride-card-header">
              <div>
                <div class="ride-time">${r.departureTime}</div>
                <div style="font-size: 0.78rem; color: var(--text-muted);">${r.rideDate} • Route: ${r.route}</div>
              </div>
              <div style="text-align: right;">
                <div class="ride-fare-tag">₹${r.farePerSeat}</div>
                <div style="font-size: 0.72rem; color: var(--text-muted);">per seat</div>
              </div>
            </div>

            <div class="route-path-visual">
              <span class="route-dot"></span>
              <span style="color: var(--primary);">${r.pickupStop}</span>
              <span class="route-line"></span>
              <span style="color: var(--accent);">${r.dropStop}</span>
              <span class="route-dot" style="background: var(--accent);"></span>
            </div>

            <div class="driver-info-row">
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <div style="width: 32px; height: 32px; border-radius: 50%; background: #1e293b; color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.8rem;">
                  ${r.driver.fullName.charAt(0)}
                </div>
                <div>
                  <div style="font-weight: 800; color: var(--secondary);">${r.driver.fullName}</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">⭐ ${r.driver.rating} • ${r.vehicle.brand} ${r.vehicle.model} (${r.vehicle.vehicleNumber})</div>
                </div>
              </div>

              <div style="display: flex; align-items: center; gap: 0.6rem;">
                <span class="seats-badge">💺 ${r.availableSeats} Left</span>
                <button class="btn btn-sm btn-primary" onclick="window.SawangiCustomer.openBookingModal('${r.rideId}', '${r.pickupStop}', '${r.dropStop}', ${r.farePerSeat}, ${r.availableSeats})">
                  Book Seat
                </button>
              </div>
            </div>
          </div>
        `).join('')}
      `;
    } catch (err) {
      container.innerHTML = `<div class="card" style="color:var(--danger); padding:1rem;">${err.message}</div>`;
    }
  },

  searchAllToday() {
    document.getElementById('search-pickup-stop').value = 'Sawangi';
    document.getElementById('search-drop-stop').value = 'Wardha';
    this.handleSearchRides();
  },

  openBookingModal(rideId, pickupStop, dropStop, farePerSeat, availableSeats) {
    this.selectedRideForBooking = { rideId, pickupStop, dropStop, farePerSeat, availableSeats };

    document.getElementById('checkout-ride-pickup').textContent = pickupStop;
    document.getElementById('checkout-ride-drop').textContent = dropStop;
    document.getElementById('checkout-fare-per-seat').textContent = `₹${farePerSeat}`;

    const seatsSelect = document.getElementById('checkout-seats-count');
    seatsSelect.innerHTML = '';
    const maxSelectable = Math.min(availableSeats, 4);
    for (let i = 1; i <= maxSelectable; i++) {
      seatsSelect.innerHTML += `<option value="${i}">${i} Seat${i > 1 ? 's' : ''}</option>`;
    }

    seatsSelect.onchange = () => {
      const count = parseInt(seatsSelect.value, 10);
      const total = count * farePerSeat;
      document.getElementById('checkout-total-amount').textContent = `₹${total}`;
    };

    document.getElementById('checkout-total-amount').textContent = `₹${farePerSeat}`;
    document.getElementById('modal-customer-checkout').classList.add('active');
  },

  async handleInitiatePayment(e) {
    e.preventDefault();
    if (!this.selectedRideForBooking) return;

    const seatsCount = parseInt(document.getElementById('checkout-seats-count').value, 10);

    try {
      const res = await API.post('/customer/bookings/initiate', {
        rideId: this.selectedRideForBooking.rideId,
        pickupStop: this.selectedRideForBooking.pickupStop,
        dropStop: this.selectedRideForBooking.dropStop,
        seatsCount,
      });

      this.pendingPaymentData = {
        bookingId: res.booking.id,
        orderId: res.paymentOrder.orderId,
        amount: res.booking.totalAmount,
      };

      document.getElementById('modal-customer-checkout').classList.remove('active');
      this.openRazorpayCheckout(res.booking, res.paymentOrder);
    } catch (err) {
      window.SawangiApp.showToast(err.message, 'error');
    }
  },

  openRazorpayCheckout(booking, paymentOrder) {
    if (typeof Razorpay === 'undefined') {
      window.SawangiApp?.showToast('Razorpay Checkout SDK is still loading. Please check internet connection.', 'error');
      return;
    }

    const self = this;
    let user = {};
    try {
      user = JSON.parse(localStorage.getItem('sawangi_user') || '{}');
    } catch {}

    let keyId = paymentOrder.keyId || paymentOrder.key_id;
    if (!keyId) {
      try {
        const keyRes = await fetch('/api/razorpay-key');
        if (keyRes.ok) {
          const keyData = await keyRes.json();
          keyId = keyData.key_id || keyData.keyId;
        }
      } catch (e) {
        console.warn('[Customer Checkout] Fallback key fetch failed:', e);
      }
    }

    if (!keyId) {
      window.SawangiApp?.showToast('Razorpay Key ID is not configured on server. Please set RAZORPAY_KEY_ID in Render settings.', 'error');
      return;
    }

    const rawOrderId = paymentOrder.orderId || paymentOrder.order_id || '';
    const isRealRazorpayOrder = rawOrderId && rawOrderId.startsWith('order_') && !rawOrderId.startsWith('order_test_');

    const options = {
      key: keyId,
      amount: paymentOrder.amount, // in integer paise
      currency: paymentOrder.currency || 'INR',
      name: 'SafarX Mobility',
      description: `${booking.pickupStop} ➔ ${booking.dropStop} (${booking.seatsBooked} Seat)`,
      ...(isRealRazorpayOrder ? { order_id: rawOrderId } : {}),
      handler: async function (response) {
        try {
          window.SawangiApp?.showToast('Verifying payment cryptographically with server...', 'info');
          const verifyRes = await API.post('/customer/payments/verify', {
            bookingId: booking.id,
            razorpayOrderId: response.razorpay_order_id || rawOrderId,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature || 'simulated_test_sig',
          });

          self.openConfirmationModal(verifyRes.booking);
          await self.loadMyBookings();
        } catch (err) {
          window.SawangiApp?.showToast('Payment verification failed: ' + err.message, 'error');
          await self.loadMyBookings();
        }
      },
      prefill: {
        name: user.fullName || '',
        email: user.email || '',
        contact: user.phone || '',
      },
      theme: {
        color: '#FF6B00',
      },
      modal: {
        ondismiss: async function () {
          window.SawangiApp?.showToast('Payment window closed. Booking will cancel upon hold expiry.', 'warning');
          await self.loadMyBookings();
        },
      },
    };

    const rzp = new Razorpay(options);
    rzp.on('payment.failed', function (resp) {
      window.SawangiApp?.showToast('Payment failed: ' + (resp.error?.description || 'Transaction declined'), 'error');
    });
    rzp.open();
  },

  openConfirmationModal(booking) {
    document.getElementById('confirm-booking-num').textContent = booking.bookingNumber;
    document.getElementById('confirm-booking-otp').textContent = booking.boardingOtp;
    document.getElementById('confirm-booking-route').textContent = `${booking.pickupStop} ➔ ${booking.dropStop}`;
    document.getElementById('confirm-booking-amount').textContent = `₹${booking.totalAmount} (${booking.seatsBooked} seat)`;
    document.getElementById('modal-booking-confirmed').classList.add('active');
  },

  // --- MY BOOKINGS & CANCELLATIONS ---
  async loadMyBookings() {
    try {
      const res = await API.get('/customer/bookings/my');
      const container = document.getElementById('customer-bookings-list');
      if (!container) return;

      if (!res.bookings || res.bookings.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
            No bookings yet. Search rides above to book your first shared seat!
          </div>
        `;
        return;
      }

      container.innerHTML = res.bookings.map((b) => {
        const isConfirmed = b.bookingStatus === 'CONFIRMED';
        const isCompleted = b.bookingStatus === 'COMPLETED';
        const isCancelled = b.bookingStatus.startsWith('CANCELLED');

        return `
          <div class="card" style="margin-bottom: 1rem; border-left: 4px solid ${isConfirmed ? 'var(--accent)' : isCompleted ? 'var(--info)' : isCancelled ? 'var(--danger)' : 'var(--primary)'};">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
              <div>
                <span style="font-weight: 800; font-size: 0.95rem; color: var(--secondary);">${b.bookingNumber}</span>
                <div style="font-size: 0.78rem; color: var(--text-muted);">${new Date(b.createdAt).toLocaleDateString()} • ${b.ride?.departureTime || ''}</div>
              </div>
              <div style="text-align: right;">
                <div style="font-weight: 800; font-size: 1.1rem; color: var(--primary);">₹${b.totalAmount}</div>
                <span class="badge ${b.paymentStatus === 'SUCCESS' ? 'badge-success' : b.paymentStatus === 'REFUNDED' ? 'badge-info' : 'badge-warning'}">${b.paymentStatus}</span>
              </div>
            </div>

            <div style="font-size: 0.9rem; font-weight: 700; color: var(--secondary); margin: 0.4rem 0;">
              📍 ${b.pickupStop} ➔ ${b.dropStop} (${b.seatsBooked} seat)
            </div>

            <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.5rem;">
              Driver: <strong>${b.ride?.driver?.fullName || 'Assigned Driver'}</strong> (📞 ${b.ride?.driver?.phone || 'N/A'})
              • Vehicle: <strong>${b.ride?.vehicle?.brand || ''} ${b.ride?.vehicle?.model || ''} (${b.ride?.vehicle?.vehicleNumber || ''})</strong>
            </div>

            ${isConfirmed ? `
              <div style="background: var(--surface-subtle); padding: 0.6rem 0.8rem; border-radius: var(--radius-sm); display: flex; justify-content: space-between; align-items: center; margin: 0.5rem 0;">
                <div style="font-size: 0.8rem; font-weight: 700;">Boarding OTP:</div>
                <div style="font-size: 1.25rem; font-weight: 900; letter-spacing: 3px; color: var(--primary);">${b.boardingOtp}</div>
              </div>
            ` : ''}

            ${isCancelled ? `
              <div style="background: var(--danger-light); color: var(--danger); padding: 0.5rem 0.8rem; border-radius: var(--radius-sm); font-size: 0.78rem; margin: 0.4rem 0;">
                Cancelled (${b.cancellation?.reason || 'Cancelled'}). Refund: ₹${b.cancellation?.refundAmount || 0}
              </div>
            ` : ''}

            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--border);">
              <span class="badge ${isConfirmed ? 'badge-success' : isCompleted ? 'badge-info' : isCancelled ? 'badge-danger' : 'badge-neutral'}">${b.bookingStatus}</span>

              <div style="display: flex; gap: 0.4rem;">
                ${isConfirmed ? `
                  <button class="btn btn-sm btn-danger" onclick="window.SawangiCustomer.cancelBooking('${b._id}')">Cancel Booking</button>
                ` : ''}
                ${isCompleted ? `
                  <button class="btn btn-sm btn-secondary" onclick="window.SawangiCustomer.openReviewModal('${b._id}')">⭐ Rate Driver</button>
                ` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      console.error('Error loading my bookings:', err);
    }
  },

  async cancelBooking(bookingId) {
    const reason = prompt('Reason for cancellation (Refund will be calculated according to cancellation policy):');
    if (reason === null) return;

    try {
      const res = await API.post(`/customer/bookings/${bookingId}/cancel`, { reason });
      window.SawangiApp.showToast(`Booking cancelled! Refund Amount: ₹${res.refundDetails?.refundAmount}`, 'info');
      await this.loadMyBookings();
      await this.handleSearchRides();
    } catch (err) {
      window.SawangiApp.showToast(err.message, 'error');
    }
  },

  openReviewModal(bookingId) {
    document.getElementById('review-booking-id').value = bookingId;
    document.getElementById('modal-customer-review').classList.add('active');
  },

  async handleSubmitReview(e) {
    e.preventDefault();
    const bookingId = document.getElementById('review-booking-id').value;
    const rating = document.getElementById('review-rating-select').value;
    const comment = document.getElementById('review-comment-input').value;

    try {
      await API.post('/customer/reviews', { bookingId, rating, comment });
      document.getElementById('modal-customer-review').classList.remove('active');
      window.SawangiApp.showToast('Thank you for rating your ride!', 'success');
      await this.loadMyBookings();
    } catch (err) {
      window.SawangiApp.showToast(err.message, 'error');
    }
  },
};

window.SawangiCustomer = CustomerApp;
