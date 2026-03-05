import axios from 'axios';

const portalApi = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '',
  headers: {
    'Content-Type': 'application/json',
  },
});

portalApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('participant_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

portalApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && localStorage.getItem('participant_token')) {
      localStorage.removeItem('participant_token');
      if (window.location.pathname.startsWith('/portal')) {
        window.location.href = '/portal/login';
      }
    }
    return Promise.reject(error);
  }
);

export default portalApi;
