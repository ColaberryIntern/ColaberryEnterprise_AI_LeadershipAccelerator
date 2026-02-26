import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Global error handler callback — set by ToastProvider on mount
let globalErrorHandler: ((message: string) => void) | null = null;

export function setGlobalErrorHandler(handler: ((message: string) => void) | null) {
  globalErrorHandler = handler;
}

// Attach admin JWT token to requests when available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle errors — auto-clear stale tokens on 401, surface errors via toast
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && localStorage.getItem('admin_token')) {
      localStorage.removeItem('admin_token');
      if (window.location.pathname.startsWith('/admin')) {
        window.location.href = '/admin/login';
      }
    } else if (globalErrorHandler) {
      const status = error.response?.status;
      if (status === 429) {
        globalErrorHandler('Too many requests. Please wait a moment.');
      } else if (status && status >= 400 && status < 500) {
        const msg = error.response?.data?.error || error.response?.data?.message || 'Request failed.';
        globalErrorHandler(msg);
      } else if (status && status >= 500) {
        globalErrorHandler('Something went wrong. Please try again.');
      } else if (!error.response) {
        globalErrorHandler('Network error. Please check your connection.');
      }
    }
    return Promise.reject(error);
  }
);

export default api;
