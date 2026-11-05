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

/**
 * Mirrors `SECTION_DENIED_CODE` in `backend/src/middlewares/mgmtSectionGate.ts`.
 *
 * Duplicated rather than imported because the two stacks do not share a module, and a shared
 * types package does not exist here yet. The backend exports it as a named constant so a search
 * for the string finds both ends, and a test on each side pins the literal.
 */
const SECTION_NOT_PERMITTED = 'section_not_permitted';

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
      } else if (status === 403 && error.response?.data?.code === SECTION_NOT_PERMITTED) {
        // NOT AN ERROR FOR THIS PERSON, and the one 4xx that must never raise a toast.
        //
        // Mihret Netsereab, 2 Nov 2026, sent a screenshot of /admin/dashboard under a scoped
        // role: TEN red banners, all of them 'You do not have access to this section', stacked
        // over every tile. Nothing was broken. That page fires thirteen requests in one
        // `Promise.allSettled` and correctly renders nothing for the ones a scoped role cannot
        // see -- but this interceptor turned each refusal into a toast, so the system working as
        // designed was reported ten times as a failure.
        //
        // Matched on the server's `code`, never on its sentence: an English string is not an
        // interface, and suppressing by prose would also swallow any future 403 that happens to
        // be worded alike. Every OTHER 403 still raises a toast.
        //
        // Kept visible in the console rather than dropped, so a page that renders blank for a
        // scoped user is still diagnosable without a backend log.
        // eslint-disable-next-line no-console
        console.debug(`[sections] not permitted: ${error.config?.method?.toUpperCase?.() || 'GET'} ${error.config?.url || '(unknown url)'}`);
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
