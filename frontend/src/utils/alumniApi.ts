import axios from 'axios';

const alumniApi = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '',
  headers: {
    'Content-Type': 'application/json',
  },
});

alumniApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('alumni_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

alumniApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && localStorage.getItem('alumni_token')) {
      localStorage.removeItem('alumni_token');
      localStorage.removeItem('alumni_profile');
      if (window.location.pathname.startsWith('/referrals')) {
        window.location.href = '/referrals/login';
      }
    }
    return Promise.reject(error);
  }
);

export default alumniApi;
