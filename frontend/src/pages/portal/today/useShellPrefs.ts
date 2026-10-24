import { useEffect, useState } from 'react';

/**
 * The shell's remembered layout choices (moved out of PortalShell in Campus C16, which had passed the repo's 500-line ceiling):
 * the light/dark theme, the collapsed left nav, which nav groups are expanded, and the collapsed right contacts rail. Each is a
 * per-browser convenience in localStorage; storage is best-effort, so a private window that throws simply gets the defaults.
 */
export function useShellPrefs() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return (localStorage.getItem('te-theme') as 'light' | 'dark') || 'light'; } catch { return 'light'; }
  });
  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('te-theme', theme);
    } catch { /* ignore */ }
  }, [theme]);
  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  const [navCollapsed, setNavCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('te_nav_collapsed') === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('te_nav_collapsed', navCollapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [navCollapsed]);
  // Per-group "More" expansion, keyed by group name and remembered across
  // navigations so a learner who opens Belong once does not have to reopen it on
  // every page. Storage is best-effort: a private window that throws on read
  // falls back to all groups collapsed, which is the correct default anyway.
  const [navExpanded, setNavExpanded] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('te_nav_expanded') || '{}') || {}; } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem('te_nav_expanded', JSON.stringify(navExpanded)); } catch { /* ignore */ }
  }, [navExpanded]);
  // Right contacts rail collapse — mirrors navCollapsed. On narrow viewports the
  // rail auto-collapses (CSS) regardless of this flag; this drives the manual
  // toggle + persistence at full width.
  const [contactsCollapsed, setContactsCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('te_contacts_collapsed') === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('te_contacts_collapsed', contactsCollapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [contactsCollapsed]);
  return { theme, toggleTheme, navCollapsed, setNavCollapsed, navExpanded, setNavExpanded, contactsCollapsed, setContactsCollapsed };
}
