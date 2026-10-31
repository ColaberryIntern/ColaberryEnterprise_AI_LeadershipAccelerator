import React, { useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import ErrorBoundary from '../ui/ErrorBoundary';
import SafeModeBanner from '../admin/SafeModeBanner';
import { PINNED_LINKS, NAV_GROUPS, ALL_LINKS, NavLink as NavLinkT } from './adminNav';
import { useAdminCampusPresence } from './useAdminCampusPresence';
import { useAdminGovContractsNav } from './useAdminGovContractsNav';
import { useAdminAgentsNav } from './useAdminAgentsNav';
import { subNavEntries, type NavSubCards } from './adminSubNav';

const COLLAPSE_KEY = 'admin.nav.collapsed.v1';

/** A nested nav sub-item (gov contract / agent): the title on one line, the OWNER on a muted second line,
 *  so both nested nodes make clear who owns the tasks. */
function NavSubLink(
  { to, label, owner, icon, active, onNavigate }:
  { to: string; label: string; owner?: string; icon: string; active: boolean; onNavigate: () => void },
) {
  return (
    <Link
      to={to}
      className={`admin-nav-link${active ? ' active' : ''}`}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
    >
      <i className={`${icon} admin-nav-ricon`} aria-hidden="true" />
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.2 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        {owner && (
          <span style={{ fontSize: '0.75em', opacity: 0.65, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {owner}
          </span>
        )}
      </span>
    </Link>
  );
}

function NavItem({ link, active, onNavigate }: { link: NavLinkT; active: boolean; onNavigate: () => void }) {
  const inner = (
    <>
      <i className={`ri-${link.icon} admin-nav-ricon`} aria-hidden="true" />
      <span>{link.label}</span>
    </>
  );
  // External destinations / bridge-landing pages open in a new tab so the
  // current admin session stays put (mirrors the portal sidebar's Management
  // Portal link).
  if (link.newTab) {
    return (
      <a href={link.path} className="admin-nav-link" target="_blank" rel="noopener noreferrer" onClick={onNavigate}>
        {inner}
      </a>
    );
  }
  return (
    <Link
      to={link.path}
      className={`admin-nav-link${active ? ' active' : ''}`}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
    >
      {inner}
    </Link>
  );
}

function AdminLayout() {
  const { logout, canSection, hasPortalAccount } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  useAdminCampusPresence(location.pathname, hasPortalAccount); // Campus HQ: online + on this page's floor
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

  // RBAC: only show pinned links / groups / search hits the logged-in admin's
  // role may access (canSection is permissive until /me resolves, so legacy
  // admins never flash an empty nav). The backend enforces the same per-section.
  const pinned = PINNED_LINKS.filter(
    (l) => canSection(l.section as string) && (!l.requiresMgmtBridge || hasPortalAccount),
  );
  // Filter per LINK (a link may carry its own section, e.g. Leads/Pipeline sit
  // in the Revenue group but belong to the narrower 'leads' section), then drop
  // any group left with nothing in it. Group-level filtering alone would hide
  // Leads from a sales rep who holds 'leads' but not 'revenue'.
  const groups = NAV_GROUPS
    .map((g) => ({ ...g, links: g.links.filter((l) => canSection(l.section ?? g.section)) }))
    .filter((g) => g.links.length > 0);

  // Per-contract sub-items for the nested "Interns → Gov Contracts" node. The fetch only fires for a
  // viewer who holds `gov_contracts` (owner/Kes), and the list is already row-scoped server-side, so
  // owner/Kes see every contract. Empty ⇒ the node is not rendered at all.
  const subCards: NavSubCards = {
    gov: useAdminGovContractsNav(canSection('gov_contracts')),
    agents: useAdminAgentsNav(canSection('agents')),
  };

  // Per-agent sub-items for the nested "Interns → Agents" node — ALL agent domains (the fetch only fires
  // for an `agents` holder). Empty ⇒ the node is not rendered.

  const q = query.trim().toLowerCase();
  const searchResults = q
    ? ALL_LINKS.filter(
        (l) => l.label.toLowerCase().includes(q)
          && canSection(l.section as string)
          && (!l.requiresMgmtBridge || hasPortalAccount),
      )
    : null;

  // Intelligence OS page gets full-screen treatment (no sidebar, no padding).
  // Agent Detail redesign, Track A0 (2026-09-21) — Reese's (and every other
  // agent's) own page gets the same treatment: it renders its own
  // contextual sidebar (AgentDetailLayout.tsx) instead of this one. Additive
  // (`||`) — /admin/intelligence keeps matching exactly as before.
  const isImmersive = location.pathname === '/admin/intelligence' || location.pathname.startsWith('/admin/agents/');

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
                  {pinned.map((link) => (
                    <NavItem key={link.path} link={link} active={isActive(link.path)} onNavigate={closeMobile} />
                  ))}
                </div>

                {groups.map((group) => {
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
                      {/* C92: a group's LIVE sub-lists, declared in adminNav.ts (`subLists`), one expandable node each (e.g. Interns ->
                          Gov Contracts, Agents). Shown only for a holder of the sub-list's section and only when its feed returned rows.
                          The Campus HQ building renders the same declaration through the same mapping (adminSubNav.ts), so the two stay in
                          sync: add a sub-list in adminNav.ts and both show it. Collapse keys are `<group>::<source>` (expanded by default). */}
                      {!isCollapsed && (group.subLists ?? []).map((sl) => {
                        const entries = canSection(sl.section) ? subNavEntries(sl.source, subCards) : [];
                        if (entries.length === 0) return null;
                        const subKey = `${label}::${sl.source}`;
                        const subOpen = !collapsed[subKey];
                        const subActive = entries.some((e) => isActive(e.to));
                        return (
                          <div className="admin-nav-group" style={{ marginLeft: 12, marginTop: 2 }} key={subKey}>
                            <button
                              type="button"
                              className={`admin-nav-group__header${subActive ? ' has-active' : ''}`}
                              onClick={() => toggleGroup(subKey)}
                              aria-expanded={subOpen}
                            >
                              <span>{sl.label}</span>
                              <i className={`ri-arrow-${subOpen ? 'down' : 'right'}-s-line`} aria-hidden="true" />
                            </button>
                            {subOpen && entries.map((e) => (
                              <NavSubLink key={e.key} to={e.to} label={e.label} owner={e.owner}
                                icon={`ri-${sl.icon}`} active={isActive(e.to)} onNavigate={closeMobile} />
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </>
            )}
          </nav>

          <div className="admin-sidebar-footer">
            <Link to="/admin/change-password" className="admin-sidebar-logout" onClick={closeMobile}>
              <i className="ri-key-2-line" aria-hidden="true" /> Change password
            </Link>
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
