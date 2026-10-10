import { API } from './api.js';

export const AdminApp = {
  activeTab: 'metrics',
  selectedRouteId: null,

  async init() {
    this.bindEvents();
    await this.loadMetrics();
  },

  bindEvents() {
    document.querySelectorAll('.admin-nav-item').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.getAttribute('data-tab');
        this.switchTab(tab);
      });
    });

    const addStopForm = document.getElementById('admin-add-stop-form');
    if (addStopForm) {
      addStopForm.addEventListener('submit', (e) => this.handleAddStop(e));
    }

    const settingsForm = document.getElementById('admin-settings-form');
    if (settingsForm) {
      settingsForm.addEventListener('submit', (e) => this.handleSaveSettings(e));
    }

    const createRouteForm = document.getElementById('admin-create-route-form');
    if (createRouteForm) {
      createRouteForm.addEventListener('submit', (e) => this.handleCreateRoute(e));
    }
  },

  async switchTab(tab) {
    this.activeTab = tab;
    document.querySelectorAll('.admin-nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
    });

    document.querySelectorAll('.admin-tab-content').forEach((sec) => {
      sec.style.display = sec.id === `admin-tab-${tab}` ? 'block' : 'none';
    });

    if (tab === 'metrics') await this.loadMetrics();
    if (tab === 'drivers') await this.loadDrivers();
    if (tab === 'routes') await this.loadRoutes();
    if (tab === 'bookings') await this.loadBookings();
    if (tab === 'payments') await this.loadPayments();
    if (tab === 'settings') await this.loadSettings();
  },

  async loadMetrics() {
    try {
      const res = await API.get('/admin/metrics');
      const m = res.metrics;

      document.getElementById('stat-today-rides').textContent = m.todayRides;
      document.getElementById('stat-today-bookings').textContent = m.todayBookings;
      document.getElementById('stat-active-drivers').textContent = m.activeDrivers;
      document.getElementById('stat-registered-customers').textContent = m.registeredCustomers;
      document.getElementById('stat-total-revenue').textContent = `₹${m.totalRevenue}`;
      document.getElementById('stat-platform-commission').textContent = `₹${m.platformCommission}`;
      document.getElementById('stat-driver-earnings').textContent = `₹${m.driverEarnings}`;
      document.getElementById('stat-pending-drivers').textContent = m.pendingDriverApprovals;
      document.getElementById('stat-cancelled-bookings').textContent = m.cancelledBookings;
      document.getElementById('stat-refunds-count').textContent = m.totalRefundsCount;

      // Render recent bookings table
      const tbody = document.getElementById('admin-recent-bookings-tbody');
      if (tbody && res.recentBookings) {
        tbody.innerHTML = res.recentBookings.map((b) => `
          <tr>
            <td><strong>${b.bookingNumber}</strong></td>
            <td>${b.customer?.fullName || 'Customer'}</td>
            <td>${b.pickupStop} → ${b.dropStop}</td>
            <td><strong>₹${b.totalAmount}</strong></td>
            <td><span class="badge ${b.bookingStatus === 'CONFIRMED' ? 'badge-success' : 'badge-neutral'}">${b.bookingStatus}</span></td>
            <td><span class="badge ${b.paymentStatus === 'SUCCESS' ? 'badge-success' : 'badge-warning'}">${b.paymentStatus}</span></td>
          </tr>
        `).join('');
      }
    } catch (err) {
      console.error('Error loading admin metrics:', err);
    }
  },

  async loadDrivers(status = 'ALL') {
    try {
      const res = await API.get(`/admin/drivers?status=${status}`);
      const tbody = document.getElementById('admin-drivers-tbody');
      if (!tbody) return;

      if (!res.drivers || res.drivers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 2rem;">No drivers found.</td></tr>`;
        return;
      }

      tbody.innerHTML = res.drivers.map((d) => {
        const v = d.vehicle;
        const statusBadge =
          d.verificationStatus === 'APPROVED' ? 'badge-success' :
          d.verificationStatus === 'PENDING' ? 'badge-warning' :
          d.verificationStatus === 'SUSPENDED' ? 'badge-danger' : 'badge-neutral';

        return `
          <tr>
            <td>
              <div style="font-weight: 700;">${d.user?.fullName || 'Driver'}</div>
              <div style="font-size: 0.78rem; color: var(--text-muted);">${d.user?.phone || ''}</div>
            </td>
            <td>
              <div><strong>${d.drivingLicenseNumber}</strong></div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">Exp: ${new Date(d.licenseExpiry).toLocaleDateString()}</div>
            </td>
            <td>
              ${v ? `<div><strong>${v.vehicleNumber}</strong></div><div style="font-size:0.75rem;">${v.brand} ${v.model} (${v.totalSeats} seats)</div>` : '<span style="color:var(--text-muted);">No vehicle</span>'}
            </td>
            <td>⭐ ${d.ratingAverage} (${d.ratingCount})</td>
            <td><strong>₹${d.totalEarnings}</strong></td>
            <td><span class="badge ${statusBadge}">${d.verificationStatus}</span></td>
            <td>
              <div style="display: flex; gap: 0.3rem;">
                ${d.verificationStatus !== 'APPROVED' ? `<button class="btn btn-sm btn-success" onclick="window.SawangiAdmin.updateDriverStatus('${d._id}', 'APPROVED')">Approve</button>` : ''}
                ${d.verificationStatus === 'APPROVED' ? `<button class="btn btn-sm btn-danger" onclick="window.SawangiAdmin.updateDriverStatus('${d._id}', 'SUSPENDED')">Suspend</button>` : ''}
                ${d.verificationStatus === 'PENDING' ? `<button class="btn btn-sm btn-secondary" onclick="window.SawangiAdmin.updateDriverStatus('${d._id}', 'REJECTED')">Reject</button>` : ''}
              </div>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      console.error('Error loading drivers:', err);
    }
  },

  async updateDriverStatus(driverId, status) {
    try {
      await API.patch(`/admin/drivers/${driverId}/status`, { status });
      window.SawangiApp.showToast(`Driver status updated to ${status}`, 'success');
      await this.loadDrivers();
      await this.loadMetrics();
    } catch (err) {
      window.SawangiApp.showToast(err.message, 'error');
    }
  },

  // --- DYNAMIC ROUTES & STOPS ---
  async loadRoutes() {
    try {
      const res = await API.get('/admin/routes');
      const routeSelect = document.getElementById('admin-route-picker');
      if (!routeSelect) return;

      if (!res.routes || res.routes.length === 0) {
        document.getElementById('admin-stops-container').innerHTML = '<p>No routes configured yet.</p>';
        return;
      }

      routeSelect.innerHTML = res.routes.map((r) => `
        <option value="${r._id}">${r.name} (${r.origin} ↔ ${r.destination})</option>
      `).join('');

      this.selectedRouteId = this.selectedRouteId || res.routes[0]._id;
      routeSelect.value = this.selectedRouteId;

      routeSelect.onchange = (e) => {
        this.selectedRouteId = e.target.value;
        this.renderRouteStops(res.routes.find((r) => r._id === this.selectedRouteId));
      };

      const selected = res.routes.find((r) => r._id === this.selectedRouteId) || res.routes[0];
      this.renderRouteStops(selected);
    } catch (err) {
      console.error('Error loading routes:', err);
    }
  },

  renderRouteStops(route) {
    if (!route) return;
    const container = document.getElementById('admin-stops-container');
    if (!container) return;

    const stops = [...route.stops].sort((a, b) => a.sequenceOrder - b.sequenceOrder);

    container.innerHTML = `
      <div style="margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h3 style="font-size: 1.1rem; font-weight: 800;">${route.name}</h3>
          <p style="font-size: 0.82rem; color: var(--text-muted);">
            Distance: <strong>${route.totalDistanceKm} km</strong> | Base Fare: <strong>₹${route.baseFare}</strong> | Total Stops: <strong>${stops.length}</strong>
          </p>
        </div>
        <button class="btn btn-sm btn-primary" onclick="window.SawangiAdmin.openAddStopModal('${route._id}')">+ Add Stop</button>
      </div>

      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Stop Name</th>
              <th>Landmark</th>
              <th>Distance (km)</th>
              <th>Status</th>
              <th>Reorder</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${stops.map((s, idx) => `
              <tr>
                <td><strong>#${s.sequenceOrder}</strong></td>
                <td><strong>${s.name}</strong></td>
                <td style="color: var(--text-muted);">${s.landmark || '—'}</td>
                <td>${s.distanceFromStartKm} km</td>
                <td><span class="badge ${s.isActive ? 'badge-success' : 'badge-neutral'}">${s.isActive ? 'ACTIVE' : 'INACTIVE'}</span></td>
                <td>
                  <button class="btn btn-sm btn-secondary" style="padding: 0.2rem 0.5rem;" onclick="window.SawangiAdmin.moveStop('${route._id}', ${idx}, -1)" ${idx === 0 ? 'disabled' : ''}>▲</button>
                  <button class="btn btn-sm btn-secondary" style="padding: 0.2rem 0.5rem;" onclick="window.SawangiAdmin.moveStop('${route._id}', ${idx}, 1)" ${idx === stops.length - 1 ? 'disabled' : ''}>▼</button>
                </td>
                <td>
                  <button class="btn btn-sm btn-danger" onclick="window.SawangiAdmin.deleteStop('${route._id}', '${s._id}')">Delete</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div style="margin-top: 1.5rem; background: var(--surface-subtle); padding: 1rem; border-radius: var(--radius-sm);">
        <h4 style="font-size: 0.88rem; font-weight: 800; margin-bottom: 0.5rem;">Directional Route Simulation (Auto Reverse Supported):</h4>
        <div style="font-size: 0.82rem;">
          <div>➡️ <strong>Forward:</strong> ${stops.map(s => s.name).join(' ➔ ')}</div>
          <div style="margin-top: 0.25rem;">⬅️ <strong>Reverse:</strong> ${[...stops].reverse().map(s => s.name).join(' ➔ ')}</div>
        </div>
      </div>
    `;
  },

  async moveStop(routeId, index, direction) {
    try {
      const res = await API.get('/admin/routes');
      const route = res.routes.find((r) => r._id === routeId);
      if (!route) return;

      const stops = [...route.stops].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= stops.length) return;

      // Swap
      const temp = stops[index];
      stops[index] = stops[targetIndex];
      stops[targetIndex] = temp;

      const stopIds = stops.map((s) => s._id);
      await API.post(`/admin/routes/${routeId}/reorder-stops`, { stopIds });
      window.SawangiApp.showToast('Stop order updated', 'success');
      await this.loadRoutes();
    } catch (err) {
      window.SawangiApp.showToast(err.message, 'error');
    }
  },

  openAddStopModal(routeId) {
    this.selectedRouteId = routeId;
    document.getElementById('modal-add-stop').classList.add('active');
  },

  async handleAddStop(e) {
    e.preventDefault();
    const name = document.getElementById('add-stop-name').value;
    const landmark = document.getElementById('add-stop-landmark').value;
    const distance = parseFloat(document.getElementById('add-stop-distance').value) || 0;

    try {
      await API.post(`/admin/routes/${this.selectedRouteId}/stops`, {
        name,
        landmark,
        distanceFromStartKm: distance,
      });

      document.getElementById('modal-add-stop').classList.remove('active');
      document.getElementById('admin-add-stop-form').reset();
      window.SawangiApp.showToast(`Stop '${name}' added successfully!`, 'success');
      await this.loadRoutes();
    } catch (err) {
      window.SawangiApp.showToast(err.message, 'error');
    }
  },

  async deleteStop(routeId, stopId) {
    if (!confirm('Are you sure you want to remove this stop from the route?')) return;
    try {
      await API.delete(`/admin/routes/${routeId}/stops/${stopId}`);
      window.SawangiApp.showToast('Stop removed from route', 'success');
      await this.loadRoutes();
    } catch (err) {
      window.SawangiApp.showToast(err.message, 'error');
    }
  },

  async handleCreateRoute(e) {
    e.preventDefault();
    const name = document.getElementById('create-route-name').value;
    const origin = document.getElementById('create-route-origin').value;
    const destination = document.getElementById('create-route-destination').value;
    const totalDistanceKm = parseFloat(document.getElementById('create-route-distance').value) || 10;
    const baseFare = parseFloat(document.getElementById('create-route-basefare').value) || 20;

    try {
      await API.post('/admin/routes', {
        name,
        origin,
        destination,
        totalDistanceKm,
        baseFare,
      });

      document.getElementById('modal-create-route').classList.remove('active');
      document.getElementById('admin-create-route-form').reset();
      window.SawangiApp.showToast('New Route created successfully!', 'success');
      await this.loadRoutes();
    } catch (err) {
      window.SawangiApp.showToast(err.message, 'error');
    }
  },

  // --- BOOKINGS & PAYMENTS ---
  async loadBookings() {
    try {
      const res = await API.get('/admin/bookings');
      const tbody = document.getElementById('admin-all-bookings-tbody');
      if (!tbody) return;

      if (!res.bookings || res.bookings.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 2rem;">No bookings found.</td></tr>`;
        return;
      }

      tbody.innerHTML = res.bookings.map((b) => `
        <tr>
          <td><strong>${b.bookingNumber}</strong></td>
          <td>${b.customer?.fullName || 'Customer'}<br><small style="color:var(--text-muted);">${b.customer?.phone || ''}</small></td>
          <td>${b.ride?.driver?.fullName || 'Driver'}</td>
          <td>${b.pickupStop} → ${b.dropStop}</td>
          <td><strong>₹${b.totalAmount}</strong></td>
          <td><small>Platform: ₹${b.platformCommission}<br>Driver: ₹${b.driverEarnings}</small></td>
          <td><span class="badge ${b.bookingStatus === 'CONFIRMED' ? 'badge-success' : b.bookingStatus === 'COMPLETED' ? 'badge-info' : 'badge-neutral'}">${b.bookingStatus}</span></td>
          <td><span class="badge ${b.paymentStatus === 'SUCCESS' ? 'badge-success' : 'badge-warning'}">${b.paymentStatus}</span></td>
        </tr>
      `).join('');
    } catch (err) {
      console.error('Error loading bookings:', err);
    }
  },

  async loadPayments() {
    try {
      const res = await API.get('/admin/payments');
      const tbody = document.getElementById('admin-all-payments-tbody');
      if (!tbody) return;

      if (!res.payments || res.payments.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 2rem;">No payment transactions found.</td></tr>`;
        return;
      }

      tbody.innerHTML = res.payments.map((p) => `
        <tr>
          <td><code>${p.razorpayOrderId}</code></td>
          <td><code>${p.razorpayPaymentId || '—'}</code></td>
          <td>${p.customer?.fullName || 'Customer'}</td>
          <td><strong>₹${p.amount}</strong></td>
          <td>${p.method}</td>
          <td><span class="badge ${p.status === 'CAPTURED' ? 'badge-success' : 'badge-warning'}">${p.status}</span></td>
          <td>${new Date(p.createdAt).toLocaleString()}</td>
        </tr>
      `).join('');
    } catch (err) {
      console.error('Error loading payments:', err);
    }
  },

  // --- SETTINGS ---
  async loadSettings() {
    try {
      const res = await API.get('/admin/settings');
      const s = res.settings;

      document.getElementById('setting-min-fare').value = s.minFare;
      document.getElementById('setting-max-fare').value = s.maxFare;
      document.getElementById('setting-commission-val').value = s.commissionValue;
      document.getElementById('setting-allow-driver-adjustment').checked = s.allowDriverFareAdjustment;
    } catch (err) {
      console.error('Error loading settings:', err);
    }
  },

  async handleSaveSettings(e) {
    e.preventDefault();
    const minFare = parseFloat(document.getElementById('setting-min-fare').value);
    const maxFare = parseFloat(document.getElementById('setting-max-fare').value);
    const commissionValue = parseFloat(document.getElementById('setting-commission-val').value);
    const allowDriverFareAdjustment = document.getElementById('setting-allow-driver-adjustment').checked;

    try {
      await API.put('/admin/settings', {
        minFare,
        maxFare,
        commissionValue,
        allowDriverFareAdjustment,
      });
      window.SawangiApp.showToast('Global Admin settings updated successfully!', 'success');
    } catch (err) {
      window.SawangiApp.showToast(err.message, 'error');
    }
  },
};

window.SawangiAdmin = AdminApp;
