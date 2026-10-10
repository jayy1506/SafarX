import { API } from './api.js';

export const DriverApp = {
  currentRide: null,
  driverProfile: null,

  async init() {
    this.bindEvents();
    await this.loadDriverDashboard();
  },

  bindEvents() {
    const publishForm = document.getElementById('driver-publish-ride-form');
    if (publishForm) {
      publishForm.addEventListener('submit', (e) => this.handlePublishRide(e));
    }

    const updateFareForm = document.getElementById('driver-update-fare-form');
    if (updateFareForm) {
      updateFareForm.addEventListener('submit', (e) => this.handleUpdateFare(e));
    }
  },

  async loadDriverDashboard() {
    try {
      // 1. Fetch Profile & Verification
      const profileRes = await API.get('/driver/profile');
      this.driverProfile = profileRes.driver;
      const vehicle = profileRes.vehicle;

      const nameEl = document.getElementById('driver-greeting-name');
      if (nameEl) nameEl.textContent = profileRes.driver.user?.fullName || 'Driver';

      const statusBadge = document.getElementById('driver-status-badge');
      if (statusBadge) {
        statusBadge.textContent = profileRes.driver.verificationStatus;
        statusBadge.className = `badge ${profileRes.driver.verificationStatus === 'APPROVED' ? 'badge-success' : 'badge-warning'}`;
      }

      // Populate route options in publish modal
      const routesRes = await API.get('/customer/routes');
      const routeSelect = document.getElementById('driver-publish-route');
      if (routeSelect && routesRes.routes) {
        routeSelect.innerHTML = routesRes.routes.map((r) => `
          <option value="${r._id}">${r.name} (${r.origin} ↔ ${r.destination})</option>
        `).join('');
      }

      // 2. Fetch Today's Ride & Passengers
      const todayRes = await API.get('/driver/rides/today');
      this.currentRide = todayRes.ride;

      this.renderTodayRide(todayRes.ride, todayRes.passengers);

      // 3. Fetch Earnings
      const earningsRes = await API.get('/driver/earnings');
      const e = earningsRes.earnings;
      document.getElementById('driver-today-earnings').textContent = `₹${e.todayEarnings || 0}`;
      document.getElementById('driver-total-earnings').textContent = `₹${e.totalEarnings || 0}`;
      document.getElementById('driver-completed-rides').textContent = e.completedRides || 0;
      document.getElementById('driver-rating-val').textContent = `⭐ ${e.ratingAverage} (${e.ratingCount})`;
    } catch (err) {
      console.error('Error loading driver dashboard:', err);
    }
  },

  renderTodayRide(ride, passengers = []) {
    const card = document.getElementById('driver-today-ride-card');
    const noRideNotice = document.getElementById('driver-no-ride-notice');
    const passengerSection = document.getElementById('driver-passengers-section');

    if (!ride) {
      if (card) card.style.display = 'none';
      if (passengerSection) passengerSection.style.display = 'none';
      if (noRideNotice) noRideNotice.style.display = 'block';
      return;
    }

    if (noRideNotice) noRideNotice.style.display = 'none';
    if (card) card.style.display = 'block';
    if (passengerSection) passengerSection.style.display = 'block';

    document.getElementById('driver-ride-route-text').textContent = `${ride.originStop} → ${ride.destinationStop}`;
    document.getElementById('driver-ride-time-text').textContent = `Departure: ${ride.departureTime} | ${ride.rideDate}`;
    document.getElementById('driver-ride-seats-text').textContent = `Available: ${ride.availableSeats} / ${ride.totalSeats} seats`;
    document.getElementById('driver-ride-fare-text').textContent = `₹${ride.dailyFare}`;
    document.getElementById('driver-ride-status-badge').textContent = ride.status;

    // Action buttons based on ride status
    const actionsContainer = document.getElementById('driver-ride-actions');
    if (actionsContainer) {
      if (ride.status === 'SCHEDULED') {
        actionsContainer.innerHTML = `
          <button class="btn btn-success" onclick="window.SawangiDriver.startRide('${ride._id}')">🚀 Start Ride</button>
          <button class="btn btn-secondary" onclick="window.SawangiDriver.openUpdateFareModal('${ride._id}', ${ride.dailyFare})">✏️ Edit Fare</button>
          <button class="btn btn-danger" onclick="window.SawangiDriver.cancelRide('${ride._id}')">Cancel Ride</button>
        `;
      } else if (ride.status === 'ACTIVE') {
        actionsContainer.innerHTML = `
          <button class="btn btn-success" style="background:#059669;" onclick="window.SawangiDriver.endRide('${ride._id}')">🏁 Complete & End Ride</button>
        `;
      } else {
        actionsContainer.innerHTML = `<span class="badge badge-neutral">${ride.status}</span>`;
      }
    }

    // Render passengers
    const listEl = document.getElementById('driver-passengers-list');
    if (!listEl) return;

    if (!passengers || passengers.length === 0) {
      listEl.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
          No passengers booked for this ride yet.
        </div>
      `;
      return;
    }

    listEl.innerHTML = passengers.map((p) => {
      const isBoarded = p.bookingStatus === 'BOARDED';
      const isNoShow = p.bookingStatus === 'NO_SHOW';

      return `
        <div class="card" style="margin-bottom: 0.75rem; border-left: 4px solid ${isBoarded ? 'var(--accent)' : 'var(--primary)'};">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <div style="font-weight: 800; font-size: 1rem; color: var(--secondary);">
                ${p.customer?.fullName || 'Passenger'}
              </div>
              <div style="font-size: 0.8rem; color: var(--text-muted);">
                📞 ${p.customer?.phone || 'N/A'}
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 1.1rem; font-weight: 800; color: var(--primary);">₹${p.totalAmount}</div>
              <span class="badge ${p.paymentStatus === 'SUCCESS' ? 'badge-success' : 'badge-warning'}">${p.paymentStatus === 'SUCCESS' ? 'PAID' : p.paymentStatus}</span>
            </div>
          </div>

          <div style="margin: 0.6rem 0; font-size: 0.85rem; font-weight: 700; color: var(--secondary);">
            📍 Pickup: <span style="color: var(--primary);">${p.pickupStop}</span> ➔ Drop: <span style="color: var(--accent);">${p.dropStop}</span> (${p.seatsBooked} seat)
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--border);">
            <div>
              <span class="badge ${isBoarded ? 'badge-success' : isNoShow ? 'badge-danger' : 'badge-info'}">${p.bookingStatus}</span>
            </div>
            <div>
              ${!isBoarded && !isNoShow ? `
                <button class="btn btn-sm btn-success" onclick="window.SawangiDriver.promptBoardingOtp('${p._id}', '${p.customer?.fullName}')">Verify OTP & Board</button>
                <button class="btn btn-sm btn-secondary" onclick="window.SawangiDriver.markNoShow('${p._id}')">No-Show</button>
              ` : isBoarded ? `
                <span style="font-size: 0.8rem; color: var(--accent); font-weight: 700;">✓ Passenger Boarded</span>
              ` : `
                <span style="font-size: 0.8rem; color: var(--danger);">No-Show</span>
              `}
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  // --- ACTIONS ---
  openPublishModal() {
    if (this.driverProfile?.verificationStatus !== 'APPROVED') {
      window.SawangiApp.showToast(`Cannot publish ride. Your account status is: ${this.driverProfile?.verificationStatus || 'PENDING'}`, 'error');
      return;
    }
    const todayStr = new Date().toISOString().split('T')[0];
    document.getElementById('driver-publish-date').value = todayStr;
    document.getElementById('modal-driver-publish-ride').classList.add('active');
  },

  async handlePublishRide(e) {
    e.preventDefault();
    const routeId = document.getElementById('driver-publish-route').value;
    const direction = document.getElementById('driver-publish-direction').value;
    const rideDate = document.getElementById('driver-publish-date').value;
    const departureTime = document.getElementById('driver-publish-time').value;
    const totalSeats = parseInt(document.getElementById('driver-publish-seats').value, 10) || 4;
    const dailyFare = parseFloat(document.getElementById('driver-publish-fare').value) || 40;

    try {
      await API.post('/driver/rides/publish', {
        routeId,
        direction,
        rideDate,
        departureTime,
        totalSeats,
        dailyFare,
      });

      document.getElementById('modal-driver-publish-ride').classList.remove('active');
      window.SawangiApp.showToast('Ride published successfully and available for booking!', 'success');
      await this.loadDriverDashboard();
    } catch (err) {
      window.SawangiApp.showToast(err.message, 'error');
    }
  },

  openUpdateFareModal(rideId, currentFare) {
    document.getElementById('driver-update-fare-input').value = currentFare;
    document.getElementById('modal-driver-update-fare').classList.add('active');
  },

  async handleUpdateFare(e) {
    e.preventDefault();
    if (!this.currentRide) return;
    const dailyFare = parseFloat(document.getElementById('driver-update-fare-input').value);

    try {
      await API.patch(`/driver/rides/${this.currentRide._id}/fare`, { dailyFare });
      document.getElementById('modal-driver-update-fare').classList.remove('active');
      window.SawangiApp.showToast('Daily fare updated successfully!', 'success');
      await this.loadDriverDashboard();
    } catch (err) {
      window.SawangiApp.showToast(err.message, 'error');
    }
  },

  async promptBoardingOtp(bookingId, customerName) {
    const otp = prompt(`Enter 4-digit Boarding OTP from passenger ${customerName}:`);
    if (!otp) return;

    try {
      await API.post(`/driver/bookings/${bookingId}/boarded`, { otp: otp.trim() });
      window.SawangiApp.showToast(`Passenger ${customerName} boarded successfully!`, 'success');
      await this.loadDriverDashboard();
    } catch (err) {
      window.SawangiApp.showToast(err.message, 'error');
    }
  },

  async markNoShow(bookingId) {
    if (!confirm('Mark this passenger as No-Show?')) return;
    try {
      await API.post(`/driver/bookings/${bookingId}/noshow`, {});
      window.SawangiApp.showToast('Passenger marked as No-Show', 'info');
      await this.loadDriverDashboard();
    } catch (err) {
      window.SawangiApp.showToast(err.message, 'error');
    }
  },

  async startRide(rideId) {
    try {
      await API.post(`/driver/rides/${rideId}/start`, {});
      window.SawangiApp.showToast('Ride started! Passengers notified.', 'success');
      await this.loadDriverDashboard();
    } catch (err) {
      window.SawangiApp.showToast(err.message, 'error');
    }
  },

  async endRide(rideId) {
    if (!confirm('Are you sure you want to end this ride? All passenger trips will be completed and your earnings credited.')) return;
    try {
      const res = await API.post(`/driver/rides/${rideId}/end`, {});
      window.SawangiApp.showToast(`Ride completed! Earnings: ₹${res.tripEarnings}`, 'success');
      await this.loadDriverDashboard();
    } catch (err) {
      window.SawangiApp.showToast(err.message, 'error');
    }
  },

  async cancelRide(rideId) {
    const reason = prompt('Enter reason for ride cancellation (100% full refund will be initiated to passengers):');
    if (reason === null) return;

    try {
      await API.post(`/driver/rides/${rideId}/cancel`, { reason: reason || 'Driver cancelled trip' });
      window.SawangiApp.showToast('Ride cancelled and passengers refunded.', 'info');
      await this.loadDriverDashboard();
    } catch (err) {
      window.SawangiApp.showToast(err.message, 'error');
    }
  },
};

window.SawangiDriver = DriverApp;
