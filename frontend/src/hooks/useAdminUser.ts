import { useState, useEffect } from 'react';
import api from '../utils/api';

interface AdminUser {
  sub: string;
  email: string;
  role: string;
}

let cachedUser: AdminUser | null = null;
let fetchPromise: Promise<AdminUser | null> | null = null;

export function useAdminUser(): AdminUser | null {
  const [user, setUser] = useState<AdminUser | null>(cachedUser);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!token) return;
    if (cachedUser) { setUser(cachedUser); return; }

    if (!fetchPromise) {
      fetchPromise = api.get('/api/admin/me')
        .then(r => { cachedUser = r.data.user; return cachedUser; })
        .catch(() => null)
        .finally(() => { fetchPromise = null; });
    }

    fetchPromise.then(u => { if (u) setUser(u); });
  }, []);

  return user;
}
