import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { NAV_LINKS, NavItem, PRIMARY_CTA, SECONDARY_CTA } from '../../constants';
import { Button } from '../../colaberry/components/core/Button';

/**
 * Router-aware CTA styled with the Colaberry design-system button.
 * The DS Button renders a plain <a> for href (full-page nav) and drops the
 * router `to` prop, so for in-app SPA navigation we render react-router's
 * <Link> and apply the DS `.cb-btn` classes directly. Rendering a real DS
 * <Button> elsewhere in this tree guarantees the `.cb-btn` stylesheet is
 * injected before these links paint.
 */
function CtaLink({
  to,
  variant,
  children,
  onClick,
  className = '',
  ...rest
}: {
  to: string;
  variant: 'primary' | 'outline' | 'ghost';
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
} & Record<string, unknown>) {
  const classes = ['cb-btn', 'cb-btn--sm', `cb-btn--${variant}`];
  if (className) classes.push(className);
  return (
    <Link to={to} className={classes.join(' ')} onClick={onClick} {...rest}>
      <span>{children}</span>
    </Link>
  );
}

function PublicNavbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  const isChildActive = (item: NavItem) =>
    item.children?.some((c) => location.pathname === c.path) ?? false;

  const closeAll = useCallback(() => {
    setMenuOpen(false);
    setOpenDropdown(null);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenDropdown(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <nav ref={navRef} className="navbar navbar-expand-lg navbar-dark bg-dark sticky-top" role="navigation" aria-label="Main navigation">
      <div className="container">
        <Link className="navbar-brand fw-bold d-flex align-items-center" to="/">
          <img
            src="/colaberry-icon.png"
            alt=""
            width="30"
            height="30"
            className="me-2 logo-light"
          />
          Colaberry Enterprise AI
        </Link>
        <button
          className="navbar-toggler"
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-controls="mainNav"
          aria-expanded={menuOpen}
          aria-label="Toggle navigation"
        >
          <span className="navbar-toggler-icon"></span>
        </button>
        <div className={`collapse navbar-collapse ${menuOpen ? 'show' : ''}`} id="mainNav">
          <ul className="navbar-nav ms-auto">
            {NAV_LINKS.map((item) =>
              item.children ? (
                <li className={`nav-item dropdown ${openDropdown === item.label ? 'show' : ''}`} key={item.label}>
                  <button
                    type="button"
                    className={`nav-link dropdown-toggle bg-transparent border-0 ${isChildActive(item) ? 'active' : ''}`}
                    onClick={() => setOpenDropdown(openDropdown === item.label ? null : item.label)}
                    aria-expanded={openDropdown === item.label}
                    aria-haspopup="true"
                    aria-controls={`nav-dropdown-${item.label.replace(/\s+/g, '-').toLowerCase()}`}
                  >
                    {item.label}
                  </button>
                  <ul
                    id={`nav-dropdown-${item.label.replace(/\s+/g, '-').toLowerCase()}`}
                    className={`dropdown-menu dropdown-menu-dark ${openDropdown === item.label ? 'show' : ''}`}
                  >
                    {item.children.map((child) => (
                      <li key={child.path}>
                        <Link
                          className={`dropdown-item ${location.pathname === child.path ? 'active' : ''}`}
                          to={child.path}
                          onClick={closeAll}
                          aria-current={location.pathname === child.path ? 'page' : undefined}
                        >
                          {child.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ) : (
                <li className="nav-item" key={item.path}>
                  <Link
                    className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
                    to={item.path!}
                    onClick={closeAll}
                    aria-current={location.pathname === item.path ? 'page' : undefined}
                  >
                    {item.label}
                  </Link>
                </li>
              )
            )}
          </ul>
          <div className="d-flex flex-column flex-lg-row align-items-stretch align-items-lg-center gap-2 ms-lg-3 mt-2 mt-lg-0">
            {/* Real DS Button: guarantees the .cb-btn stylesheet injects for the
                router-aware CtaLink siblings, and is the quiet login boundary. */}
            <Button
              as="a"
              href="/portal/login"
              variant="ghost"
              size="sm"
              data-track="nav_participant_login"
            >
              Log in
            </Button>
            {/* Door B — employers sponsor annual seats (talent discovery). */}
            <CtaLink
              to={SECONDARY_CTA.path}
              variant="outline"
              onClick={closeAll}
              data-track="nav_sponsor_team"
            >
              {SECONDARY_CTA.label}
            </CtaLink>
            {/* Door A — individuals self-serve the $149/mo membership. */}
            <CtaLink
              to={PRIMARY_CTA.path}
              variant="primary"
              onClick={closeAll}
              data-track="nav_join_challenge"
            >
              {PRIMARY_CTA.label}
            </CtaLink>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default PublicNavbar;
