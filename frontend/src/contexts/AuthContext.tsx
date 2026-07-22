import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

interface AuthContextType {
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string) => void;
  logout: () => void;
  // Management-portal RBAC: the admin sidebar SECTIONS this login may see, the
  // management role (null for legacy admins), and whether /me has resolved yet.
  // The backend is authoritative (it also enforces per-section); these gate the UI.
  sections: string[];
  mgmtRole: string | null;
  meLoaded: boolean;
  canSection: (section: string) => boolean;
}

const AuthContext = createContext<AuthContextType>({
  token: null,
  isAuthenticated: false,
  login: () => {},
  logout: () => {},
  sections: [],
  mgmtRole: null,
  meLoaded: false,
  canSection: () => true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem('admin_token')
  );
  const [sections, setSections] = useState<string[]>([]);
  const [mgmtRole, setMgmtRole] = useState<string | null>(null);
  const [meLoaded, setMeLoaded] = useState(false);

  // Resolve the caller's allowed sections from the backend whenever the token
  // changes. Legacy admins get every section; a scoped mgmt login gets only its
  // role's sections. Raw fetch (not the axios instance) to avoid an import cycle.
  useEffect(() => {
    let live = true;
    if (!token) { setSections([]); setMgmtRole(null); setMeLoaded(false); return; }
    setMeLoaded(false);
    fetch('/api/admin/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!live) return;
        setSections(Array.isArray(d?.sections) ? d.sections : []);
        setMgmtRole(d?.mgmt_role ?? null);
        setMeLoaded(true);
      })
      .catch(() => { if (live) setMeLoaded(true); });
    return () => { live = false; };
  }, [token]);

  const login = useCallback((newToken: string) => {
    localStorage.setItem('admin_token', newToken);
    setToken(newToken);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('admin_token');
    setToken(null);
  }, []);

  // Before /me resolves, allow everything (avoids a nav flash for legacy admins,
  // who are the common case). Once loaded, gate strictly by the resolved sections.
  const canSection = useCallback(
    (section: string) => !meLoaded || sections.includes(section),
    [meLoaded, sections],
  );

  return (
    <AuthContext.Provider
      value={{
        token,
        isAuthenticated: !!token,
        login,
        logout,
        sections,
        mgmtRole,
        meLoaded,
        canSection,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
