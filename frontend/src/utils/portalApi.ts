import axios, { type AxiosRequestConfig } from 'axios';
import { PARTICIPANT_TOKEN_KEY, VIEW_AS_TOKEN_KEY, getParticipantToken } from './participantToken';
import { loginHrefPreserving } from './portalLoginHref';

const portalApi = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '',
  headers: {
    'Content-Type': 'application/json',
  },
});

portalApi.interceptors.request.use((config) => {
  const token = getParticipantToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

portalApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear whichever session actually produced this request's token — a tab
      // running a "View as" preview (sessionStorage) must never have its 401
      // wipe out the admin's own real session (localStorage) elsewhere.
      const viewAsToken = sessionStorage.getItem(VIEW_AS_TOKEN_KEY);
      if (viewAsToken) {
        sessionStorage.removeItem(VIEW_AS_TOKEN_KEY);
      } else if (localStorage.getItem(PARTICIPANT_TOKEN_KEY)) {
        localStorage.removeItem(PARTICIPANT_TOKEN_KEY);
      }
      if (window.location.pathname.startsWith('/portal')) {
        // Carry the destination through sign-in — see loginHrefPreserving().
        window.location.href = loginHrefPreserving(window.location.pathname);
      }
    }
    return Promise.reject(error);
  }
);

/**
 * C119: request options for a call that must outlive the page (a watch beat sent as the learner closes the tab). A
 * keepalive fetch survives unload and, unlike navigator.sendBeacon, still carries the Authorization header the
 * interceptor adds. Undefined when not exiting, so ordinary calls keep axios's default adapter.
 */
export function keepaliveConfig(exiting: boolean | undefined): AxiosRequestConfig | undefined {
  return exiting ? { adapter: 'fetch', fetchOptions: { keepalive: true } } : undefined;
}

export default portalApi;
