import React, { createContext, useContext, useState, useCallback } from 'react';

interface ParticipantAuthContextType {
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const ParticipantAuthContext = createContext<ParticipantAuthContextType>({
  token: null,
  isAuthenticated: false,
  login: () => {},
  logout: () => {},
});

export function ParticipantAuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem('participant_token')
  );

  const login = useCallback((newToken: string) => {
    localStorage.setItem('participant_token', newToken);
    // Drop per-user caches so a new session re-fetches (avoids showing a prior
    // account's cached profile photo on a shared device).
    localStorage.removeItem('te_avatar');
    setToken(newToken);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('participant_token');
    localStorage.removeItem('te_avatar');
    setToken(null);
  }, []);

  return (
    <ParticipantAuthContext.Provider
      value={{
        token,
        isAuthenticated: !!token,
        login,
        logout,
      }}
    >
      {children}
    </ParticipantAuthContext.Provider>
  );
}

export function useParticipantAuth() {
  return useContext(ParticipantAuthContext);
}
