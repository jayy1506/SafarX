export const State = {
  currentUser: null,
  activeRole: localStorage.getItem('sawangi_active_role') || 'CUSTOMER',
  routes: [],
  selectedRoute: null,
  settings: null,

  setRole(role) {
    this.activeRole = role;
    localStorage.setItem('sawangi_active_role', role);
  },

  setUser(user) {
    this.currentUser = user;
    if (user) {
      localStorage.setItem('sawangi_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('sawangi_user');
    }
  },

  clearUser() {
    this.currentUser = null;
    localStorage.removeItem('sawangi_token');
    localStorage.removeItem('sawangi_user');
    localStorage.removeItem('sawangi_active_role');
  },
};
