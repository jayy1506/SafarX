import { API } from './api.js';
import { State } from './state.js';
import { FirebaseAuth } from './firebase-auth.js';
import { AdminApp } from './admin.js';
import { DriverApp } from './driver.js';
import { CustomerApp } from './customer.js';

export const App = {
  async init() {
    this.bindGlobalEvents();
    this.bindAuthEvents();

    const token = API.getToken();
    const urlParams = new URLSearchParams(window.location.search);
    const isDemoMode = urlParams.get('demo') === '1';

    if (!token) {
      if (isDemoMode) {
        await this.switchDemoAccount('CUSTOMER');
      } else {
        window.location.href = '/login.html';
        return;
      }
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
  },

  bindAuthEvents() {
    // Auth Modal Tabs
    document.querySelectorAll('.auth-tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.getAttribute('data-auth-tab');
        this.switchAuthTab(tab);
      });
    });

    // 1. Firebase Phone Form Step 1
    const phoneForm = document.getElementById('firebase-phone-form');
    if (phoneForm) {
      phoneForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const phone = document.getElementById('fb-phone-input').value.trim();
        const formattedPhone = phone.startsWith('+91') ? phone : `+91${phone}`;

        try {
          await FirebaseAuth.sendPhoneOtp(formattedPhone);
          document.getElementById('fb-target-phone').textContent = formattedPhone;
          phoneForm.style.display = 'none';
          document.getElementById('firebase-otp-form').style.display = 'block';
        } catch (err) {
          this.showToast(err.message, 'error');
        }
      });
    }

    // 2. Firebase OTP Form Step 2
    const otpForm = document.getElementById('firebase-otp-form');
    if (otpForm) {
      otpForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const otp = document.getElementById('fb-otp-input').value.trim();
        const role = document.getElementById('fb-role-select').value;
        const phone = window._pendingFirebasePhone;

        try {
          const res = await FirebaseAuth.verifyPhoneOtp(otp, role, '', phone);
          this.closeModal('modal-auth');
          this.showToast(`Welcome to SafarX, ${res.user.fullName}!`, 'success');
          this.updateUserUI(res.user);
          this.renderActivePlatform();
        } catch (err) {
          this.showToast(err.message, 'error');
        }
      });
    }

    // 3. Email Login Form
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

    // 4. Sign Up Form
    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
      signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fullName = document.getElementById('signup-name').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const phone = document.getElementById('signup-phone').value.trim();
        const password = document.getElementById('signup-password').value;
        const role = document.getElementById('signup-role').value;

        try {
          const res = await FirebaseAuth.registerUser({ fullName, email, phone, password, role });
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

  openAuthModal(tab = 'phone') {
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

    const phoneEl = document.getElementById('auth-tab-content-phone');
    const emailEl = document.getElementById('auth-tab-content-email');
    const signupEl = document.getElementById('auth-tab-content-signup');
    const demoEl = document.getElementById('auth-tab-content-demo');

    if (phoneEl) phoneEl.style.display = tab === 'phone' ? 'block' : 'none';
    if (emailEl) emailEl.style.display = tab === 'email' ? 'block' : 'none';
    if (signupEl) signupEl.style.display = tab === 'signup' ? 'block' : 'none';
    if (demoEl) demoEl.style.display = tab === 'demo' ? 'block' : 'none';

    // Reset phone form if entering phone tab
    if (tab === 'phone') {
      const pForm = document.getElementById('firebase-phone-form');
      const oForm = document.getElementById('firebase-otp-form');
      if (pForm) pForm.style.display = 'block';
      if (oForm) oForm.style.display = 'none';
    }
  },

  async switchDemoAccount(role) {
    this.closeModal('modal-auth');
    if (role === 'ADMIN') {
      window.location.href = '/admin-login.html';
    } else if (role === 'DRIVER') {
      window.location.href = '/driver-login.html';
    } else {
      window.location.href = '/login.html';
    }
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
