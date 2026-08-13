import axios from 'axios';
import { PARTICIPANT_TOKEN_KEY, VIEW_AS_TOKEN_KEY, getParticipantToken } from './participantToken';

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
        window.location.href = '/portal/login';
      }
    }
    return Promise.reject(error);
  }
);

export default portalApi;
