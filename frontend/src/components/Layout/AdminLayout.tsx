import React, { useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import ErrorBoundary from '../ui/ErrorBoundary';
import SafeModeBanner from '../admin/SafeModeBanner';
import { PINNED_LINKS, NAV_GROUPS, ALL_LINKS, NavLink as NavLinkT } from './adminNav';

const COLLAPSE_KEY = 'admin.nav.collapsed.v1';

function NavItem({ link, active, onNavigate }: { link: NavLinkT; active: boolean; onNavigate: () => void }) {
  return (
    <Link
      to={link.path}
      className={`admin-nav-link${active ? ' active' : ''}`}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
    >
      <i className={`ri-${link.icon} admin-nav-ricon`} aria-hidden="true" />
      <span>{link.label}</span>
    </Link>
  );
}

function AdminLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState('');

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  // Which group contains the active route (so we can auto-expand it).
  // Depend on the pathname string (not the isActive closure) so the memo
  // recomputes on navigation without needing the react-hooks deps lint.
  const activeGroup = useMemo(
    () => NAV_GROUPS.find((g) => g.links.some((l) => isActive(l.path)))?.label ?? null,
    [location.pathname],
  );

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    // Default: collapse every group except the one holding the current route.
    const init: Record<string, boolean> = {};
    NAV_GROUPS.forEach((g) => { if (g.label) init[g.label] = true; });
    return init;
  });

  // Keep the active group open as the route changes.
  useEffect(() => {
    if (activeGroup) setCollapsed((c) => (c[activeGroup] ? { ...c, [activeGroup]: false } : c));
  }, [activeGroup]);

  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed)); } catch { /* ignore */ }
  }, [collapsed]);

  const toggleGroup = (label: string) =>
    setCollapsed((c) => ({ ...c, [label]: !c[label] }));

  const handleLogout = () => { logout(); navigate('/admin/login'); };
  const closeMobile = () => setSidebarOpen(false);

  const q = query.trim().toLowerCase();
  const searchResults = q
    ? ALL_LINKS.filter((l) => l.label.toLowerCase().includes(q))
    : null;

  // Intelligence OS page gets full-screen treatment (no sidebar, no padding)
  const isImmersive = location.pathname === '/admin/intelligence';

  return (
    <div className="d-flex min-vh-100">
      {sidebarOpen && !isImmersive && (
        <div className="admin-sidebar-backdrop" onClick={closeMobile} />
      )}

      {!isImmersive && (
        <aside
          className={`admin-sidebar${sidebarOpen ? ' open' : ''}`}
          role="navigation"
          aria-label="Admin navigation"
        >
          <div className="admin-sidebar-brand">
            <img src="/colaberry-icon.png" alt="" width="30" height="30" className="logo-light" />
            <span className="admin-sidebar-brand__name">Colaberry Admin</span>
          </div>

          <div className="admin-nav-search">
            <i className="ri-search-line" aria-hidden="true" />
            <input
              type="search"
              className="admin-nav-search__input"
              placeholder="Jump to…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search navigation"
            />
          </div>

          <nav className="admin-nav-section">
            {searchResults ? (
              <div className="admin-nav-group">
                {searchResults.length === 0 && (
                  <div className="admin-nav-empty">No matches</div>
                )}
                {searchResults.map((link) => (
                  <NavItem key={link.path} link={link} active={isActive(link.path)} onNavigate={closeMobile} />
                ))}
              </div>
            ) : (
              <>
                <div className="admin-nav-group admin-nav-group--pinned">
                  {PINNED_LINKS.map((link) => (
                    <NavItem key={link.path} link={link} active={isActive(link.path)} onNavigate={closeMobile} />
                  ))}
                </div>

                {NAV_GROUPS.map((group) => {
                  const label = group.label as string;
                  const isCollapsed = !!collapsed[label];
                  const groupActive = group.links.some((l) => isActive(l.path));
                  return (
                    <div className="admin-nav-group" key={label}>
                      <button
                        type="button"
                        className={`admin-nav-group__header${groupActive ? ' has-active' : ''}`}
                        onClick={() => toggleGroup(label)}
                        aria-expanded={!isCollapsed}
                      >
                        <span>{label}</span>
                        <i className={`ri-arrow-${isCollapsed ? 'right' : 'down'}-s-line`} aria-hidden="true" />
                      </button>
                      {!isCollapsed && group.links.map((link) => (
                        <NavItem key={link.path} link={link} active={isActive(link.path)} onNavigate={closeMobile} />
                      ))}
                    </div>
                  );
                })}
              </>
            )}
          </nav>

          <div className="admin-sidebar-footer">
            <button type="button" className="admin-sidebar-logout" onClick={handleLogout}>
              <i className="ri-logout-box-r-line" aria-hidden="true" /> Logout
            </button>
          </div>
        </aside>
      )}

      <div
        className={`${isImmersive ? '' : 'admin-content'} flex-grow-1`}
        style={isImmersive ? { minHeight: '100vh', background: 'var(--surface-subtle)' } : undefined}
      >
        {!isImmersive && (
          <div className="admin-mobile-header">
            <button
              className="btn btn-sm btn-outline-secondary admin-sidebar-toggle"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Toggle sidebar"
            >
              <i className="ri-menu-line" aria-hidden="true" />
            </button>
            <span className="fw-bold" style={{ color: 'var(--red-500)' }}>Colaberry Admin</span>
          </div>
        )}

        {!isImmersive && <SafeModeBanner />}

        <div className={isImmersive ? '' : 'container-fluid px-4 py-4'}>
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}

export default AdminLayout;
