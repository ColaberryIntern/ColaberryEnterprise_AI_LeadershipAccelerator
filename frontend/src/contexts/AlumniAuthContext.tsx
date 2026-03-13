import React, { createContext, useContext, useState, useCallback } from 'react';

interface AlumniProfile {
  id: string;
  alumni_email: string;
  alumni_name: string;
  alumni_phone?: string;
  alumni_cohort?: string;
  total_referrals: number;
  total_earnings: number;
}

interface AlumniAuthContextType {
  token: string | null;
  isAuthenticated: boolean;
  profile: AlumniProfile | null;
  login: (token: string, profile: AlumniProfile) => void;
  logout: () => void;
}

const AlumniAuthContext = createContext<AlumniAuthContextType>({
  token: null,
  isAuthenticated: false,
  profile: null,
  login: () => {},
  logout: () => {},
});

export function AlumniAuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem('alumni_token')
  );
  const [profile, setProfile] = useState<AlumniProfile | null>(() => {
    const stored = localStorage.getItem('alumni_profile');
    return stored ? JSON.parse(stored) : null;
  });

  const login = useCallback((newToken: string, newProfile: AlumniProfile) => {
    localStorage.setItem('alumni_token', newToken);
    localStorage.setItem('alumni_profile', JSON.stringify(newProfile));
    setToken(newToken);
    setProfile(newProfile);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('alumni_token');
    localStorage.removeItem('alumni_profile');
    setToken(null);
    setProfile(null);
  }, []);

  return (
    <AlumniAuthContext.Provider
      value={{
        token,
        isAuthenticated: !!token,
        profile,
        login,
        logout,
      }}
    >
      {children}
    </AlumniAuthContext.Provider>
  );
}

export function useAlumniAuth() {
  return useContext(AlumniAuthContext);
}
