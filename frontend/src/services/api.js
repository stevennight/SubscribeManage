/**
 * API service for communicating with the backend.
 */
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || '';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Auth
export const login = (username, password) =>
  api.post('/api/auth/login', { username, password });
export const getMe = () => api.get('/api/auth/me');
export const changePassword = (old_password, new_password) =>
  api.put('/api/auth/password', { old_password, new_password });
export const changeUsername = (new_username, password) =>
  api.put('/api/auth/username', { new_username, password });

// Settings
export const getSettings = () => api.get('/api/settings');
export const updateSettings = (data) => api.put('/api/settings', data);
export const testTelegram = () => api.post('/api/settings/test-telegram');
export const testProxy = () => api.post('/api/settings/test-proxy');
export const getExchangeRates = () => api.get('/api/settings/exchange-rates');
export const updateExchangeRate = (data) => api.put('/api/settings/exchange-rates', data);

// Categories
export const getCategories = () => api.get('/api/categories');
export const createCategory = (data) => api.post('/api/categories', data);
export const updateCategory = (id, data) => api.put(`/api/categories/${id}`, data);
export const deleteCategory = (id) => api.delete(`/api/categories/${id}`);

// Subscriptions
export const getDashboardStats = () => api.get('/api/subscriptions/stats');
export const getSubscriptions = (params) => {
  const searchParams = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === '' || v === null || v === undefined) continue;
    if (Array.isArray(v)) {
      v.forEach(item => searchParams.append(k, item));
    } else {
      searchParams.append(k, v);
    }
  }
  return api.get('/api/subscriptions', { params: searchParams });
};
export const getSubscription = (id) => api.get(`/api/subscriptions/${id}`);
export const getPaymentHistory = (id) => api.get(`/api/subscriptions/${id}/payments`);
export const createSubscription = (data) => api.post('/api/subscriptions', data);
export const updateSubscription = (id, data) => api.put(`/api/subscriptions/${id}`, data);
export const disableSubscription = (id) => api.patch(`/api/subscriptions/${id}/disable`);
export const cancelRenewal = (id) => api.patch(`/api/subscriptions/${id}/cancel_renewal`);
export const enableSubscription = (id) => api.patch(`/api/subscriptions/${id}/enable`);
export const deleteSubscription = (id) => api.delete(`/api/subscriptions/${id}`);
export const addPaymentRecord = (id, data) => api.post(`/api/subscriptions/${id}/payments`, data);
export const updatePaymentRecord = (subId, paymentId, data) => api.patch(`/api/subscriptions/${subId}/payments/${paymentId}`, data);
export const deletePaymentRecord = (subId, paymentId) => api.delete(`/api/subscriptions/${subId}/payments/${paymentId}`);
export const fetchFavicon = (url) => api.post('/api/subscriptions/fetch-favicon', { url });
export const uploadLogo = (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post('/api/subscriptions/upload-logo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

// Reports
export const getCurrentMonthReport = () => api.get('/api/reports/current-month');
export const getMonthReport = (year, month) => api.get(`/api/reports/${year}/${month}`);
export const getMonthlyTrend = (months = 12) =>
  api.get('/api/reports/monthly-trend', { params: { months } });

export default api;
