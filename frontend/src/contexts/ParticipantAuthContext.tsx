import React, { createContext, useContext, useState, useCallback } from 'react';
import { resetScheduleCache } from '../pages/portal/scheduleCache';
import { PARTICIPANT_TOKEN_KEY, VIEW_AS_TOKEN_KEY, getParticipantToken } from '../utils/participantToken';

interface ParticipantAuthContextType {
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string) => void;
  loginAsViewer: (token: string) => void;
  logout: () => void;
}

const ParticipantAuthContext = createContext<ParticipantAuthContextType>({
  token: null,
  isAuthenticated: false,
  login: () => {},
  loginAsViewer: () => {},
  logout: () => {},
});

export function ParticipantAuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getParticipantToken());

  const login = useCallback((newToken: string) => {
    localStorage.setItem(PARTICIPANT_TOKEN_KEY, newToken);
    // Drop per-user caches so a new session re-fetches (avoids showing a prior
    // account's cached profile photo on a shared device, or — since login() is
    // a pure client-side token swap with no page reload, as used by admin
    // "View as member" — leaking the PREVIOUS identity's cached
    // is_staff/has_full_access/is_explorer entitlement into the new session).
    localStorage.removeItem('te_avatar');
    resetScheduleCache();
    setToken(newToken);
  }, []);

  // Admin "View as member" (read-only): scoped to THIS tab via sessionStorage,
  // never localStorage — see VIEW_AS_TOKEN_KEY in utils/participantToken.ts.
  // Must never touch the real participant_token, so any other tab logged in
  // as the admin's own account is left untouched.
  const loginAsViewer = useCallback((newToken: string) => {
    sessionStorage.setItem(VIEW_AS_TOKEN_KEY, newToken);
    resetScheduleCache();
    setToken(newToken);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(VIEW_AS_TOKEN_KEY);
    localStorage.removeItem(PARTICIPANT_TOKEN_KEY);
    localStorage.removeItem('te_avatar');
    resetScheduleCache();
    setToken(null);
  }, []);

  return (
    <ParticipantAuthContext.Provider
      value={{
        token,
        isAuthenticated: !!token,
        login,
        loginAsViewer,
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
