import { API } from './api.js';
import { State } from './state.js';
import { FirebaseAuth } from './firebase-auth.js';
import { AdminApp } from './admin.js';
import { DriverApp } from './driver.js';
import { CustomerApp } from './customer.js';
import { initiateRazorpayCheckout } from './razorpay-checkout.js';

export const App = {
  async init() {
    this.bindGlobalEvents();
    this.bindAuthEvents();

    const token = API.getToken();

    if (!token) {
      window.location.href = '/login.html';
      return;
    } else {
      try {
        const me = await API.get('/auth/me');
        State.setUser(me.user);
        State.setRole(me.user.role);
        this.updateUserUI(me.user);
      } catch (err) {
        console.warn('Session expired. Redirecting to login...');
        API.setToken('');
        window.location.href = '/login.html';
        return;
      }
    }

    this.renderActivePlatform();
  },

  bindGlobalEvents() {
    // User profile trigger & dropdown toggle
    const trigger = document.getElementById('user-profile-trigger');
    const dropdown = document.getElementById('profile-dropdown');

    if (trigger && dropdown) {
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('active');
      });

      document.addEventListener('click', () => {
        dropdown.classList.remove('active');
      });
    }

    // Modal close buttons
    document.querySelectorAll('.modal-close-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const modal = e.currentTarget.closest('.modal-backdrop');
        if (modal) modal.classList.remove('active');
      });
    });

    // Close modal on backdrop click
    document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          backdrop.classList.remove('active');
        }
      });
    });

    // Standalone Razorpay Checkout button handler
    const rzpBtn = document.getElementById('rzp-checkout-btn');
    if (rzpBtn) {
      rzpBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const amountInput = document.getElementById('rzp-demo-amount');
        const descInput = document.getElementById('rzp-demo-description');
        const amountInRupees = parseFloat(amountInput?.value || '10');
        const description = descInput?.value || 'SafarX Ride Payment';
        const amountInPaise = Math.round(amountInRupees * 100);

        const resultBox = document.getElementById('rzp-demo-result');
        const statusEl = document.getElementById('rzp-demo-status');
        const detailsEl = document.getElementById('rzp-demo-details');

        if (resultBox) resultBox.style.display = 'none';

        initiateRazorpayCheckout({
          amount: amountInPaise,
          currency: 'INR',
          description,
          onSuccess: (data) => {
            if (resultBox && statusEl && detailsEl) {
              resultBox.style.display = 'block';
              resultBox.style.background = '#ECFDF5';
              resultBox.style.borderColor = '#10B981';
              statusEl.style.color = '#059669';
              statusEl.textContent = '✅ Payment Verified & Order Confirmed!';
              detailsEl.innerHTML = `<strong>Order ID:</strong> ${data.orderId}<br/><strong>Payment ID:</strong> ${data.paymentId}<br/><strong>Signature:</strong> ${data.signature.substring(0, 24)}... (HMAC-SHA256 Match)`;
            }
          },
          onFailure: (err) => {
            if (resultBox && statusEl && detailsEl) {
              resultBox.style.display = 'block';
              resultBox.style.background = '#FEF2F2';
              resultBox.style.borderColor = '#EF4444';
              statusEl.style.color = '#DC2626';
              statusEl.textContent = '❌ Payment Failed / Verification Error';
              detailsEl.textContent = err.message || 'Payment verification failed.';
            }
          },
          onDismiss: () => {
            if (resultBox && statusEl && detailsEl) {
              resultBox.style.display = 'block';
              resultBox.style.background = '#FFFBEB';
              resultBox.style.borderColor = '#F59E0B';
              statusEl.style.color = '#D97706';
              statusEl.textContent = '⚠️ Payment Window Dismissed';
              detailsEl.textContent = 'Transaction cancelled by customer.';
            }
          },
        });
      });
    }
  },

  bindAuthEvents() {
    // Auth Modal Tabs
    document.querySelectorAll('.auth-tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.getAttribute('data-auth-tab');
        this.switchAuthTab(tab);
      });
    });

    // 1. Email Login Form
    const emailForm = document.getElementById('email-login-form');
    if (emailForm) {
      emailForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const pass = document.getElementById('login-password').value;

        try {
          const res = await FirebaseAuth.loginWithEmail(email, pass);
          this.closeModal('modal-auth');
          this.showToast(`Logged in as ${res.user.fullName}`, 'success');
          this.updateUserUI(res.user);
          this.renderActivePlatform();
        } catch (err) {
          this.showToast(err.message, 'error');
        }
      });
    }

    // 2. Sign Up Form
    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
      signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fullName = document.getElementById('signup-name').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const password = document.getElementById('signup-password').value;
        const role = document.getElementById('signup-role').value;

        try {
          const res = await FirebaseAuth.registerUser({ fullName, email, password, role });
          this.closeModal('modal-auth');
          this.showToast(`Welcome to SafarX, ${res.user.fullName}!`, 'success');
          this.updateUserUI(res.user);
          this.renderActivePlatform();
        } catch (err) {
          this.showToast(err.message, 'error');
        }
      });
    }
  },

  openAuthModal(tab = 'email') {
    const modal = document.getElementById('modal-auth');
    if (modal) {
      modal.classList.add('active');
      this.switchAuthTab(tab);
    }
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
  },

  switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-auth-tab') === tab);
    });

    const emailEl = document.getElementById('auth-tab-content-email');
    const signupEl = document.getElementById('auth-tab-content-signup');

    if (emailEl) emailEl.style.display = tab === 'email' ? 'block' : 'none';
    if (signupEl) signupEl.style.display = tab === 'signup' ? 'block' : 'none';
  },

  updateUserUI(user) {
    if (!user) return;

    // Header Widget
    const nameEl = document.getElementById('header-user-name');
    const roleEl = document.getElementById('header-user-role');
    const avatarEl = document.getElementById('header-user-avatar');

    if (nameEl) nameEl.textContent = user.fullName;
    if (roleEl) roleEl.textContent = user.role;
    if (avatarEl) avatarEl.textContent = user.fullName ? user.fullName.charAt(0).toUpperCase() : 'S';

    // Dropdown Widget
    const dropName = document.getElementById('dropdown-user-name');
    const dropContact = document.getElementById('dropdown-user-contact');
    const dropBadge = document.getElementById('dropdown-user-role-badge');

    if (dropName) dropName.textContent = user.fullName;
    if (dropContact) dropContact.textContent = user.email || user.phone;
    if (dropBadge) {
      dropBadge.textContent = user.role;
      dropBadge.className = `badge ${user.role === 'ADMIN' ? 'badge-danger' : user.role === 'DRIVER' ? 'badge-warning' : 'badge-success'}`;
    }
  },

  async renderActivePlatform() {
    const role = State.currentUser?.role || State.activeRole || 'CUSTOMER';

    document.querySelectorAll('.platform-view').forEach((view) => {
      view.classList.remove('active');
    });

    if (role === 'ADMIN') {
      const adminView = document.getElementById('platform-admin');
      if (adminView) adminView.classList.add('active');
      await AdminApp.init();
    } else if (role === 'DRIVER') {
      const driverView = document.getElementById('platform-driver');
      if (driverView) driverView.classList.add('active');
      await DriverApp.init();
    } else {
      const custView = document.getElementById('platform-customer');
      if (custView) custView.classList.add('active');
      await CustomerApp.init();
    }
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️';
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3800);
  },
};

window.SafarXApp = App;
window.SawangiApp = App; // alias for backwards compatibility
document.addEventListener('DOMContentLoaded', () => App.init());
