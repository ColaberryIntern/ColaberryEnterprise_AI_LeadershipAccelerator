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

/** The Colaberry wordmark — Quicksand logotype with a cherry-red "C". */
function Wordmark() {
  return (
    <span className="pubnav__wordmark" aria-hidden="true">
      <span className="pubnav__wordmark-c">C</span>olaberry
    </span>
  );
}

const slug = (label: string) => label.replace(/\s+/g, '-').toLowerCase();

function PublicNavbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const location = useLocation();

  const isChildActive = (item: NavItem) =>
    item.children?.some((c) => location.pathname === c.path) ?? false;

  const closeAll = useCallback(() => {
    setMenuOpen(false);
    setOpenDropdown(null);
  }, []);

  // Subtle bottom border + shadow once the page scrolls.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close any open dropdown when clicking outside the header.
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Escape closes the mobile sheet and any open dropdown.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenDropdown(null);
        setMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close the mobile sheet whenever the route changes.
  useEffect(() => {
    closeAll();
  }, [location.pathname, closeAll]);

  // Lock body scroll while the mobile sheet is open.
  useEffect(() => {
    const { body } = document;
    if (menuOpen) {
      const prev = body.style.overflow;
      body.style.overflow = 'hidden';
      return () => {
        body.style.overflow = prev;
      };
    }
    return undefined;
  }, [menuOpen]);

  return (
    <header
      ref={navRef}
      className={`pubnav${scrolled ? ' pubnav--scrolled' : ''}${menuOpen ? ' pubnav--open' : ''}`}
      role="banner"
    >
      <nav className="pubnav__bar" aria-label="Primary">
        <div className="pubnav__inner">
          {/* Brand */}
          <Link to="/" className="pubnav__brand" onClick={closeAll} aria-label="Colaberry home">
            <img
              src="/colaberry-icon.png"
              alt=""
              width={32}
              height={32}
              className="pubnav__brand-mark"
            />
            <Wordmark />
          </Link>

          {/* Desktop nav */}
          <ul className="pubnav__links" role="list">
            {NAV_LINKS.map((item) =>
              item.children ? (
                <li
                  className={`pubnav__item pubnav__item--has-menu${
                    openDropdown === item.label ? ' is-open' : ''
                  }`}
                  key={item.label}
                >
                  <button
                    type="button"
                    className={`pubnav__link pubnav__link--toggle${
                      isChildActive(item) ? ' is-active' : ''
                    }`}
                    onClick={() =>
                      setOpenDropdown(openDropdown === item.label ? null : item.label)
                    }
                    aria-expanded={openDropdown === item.label}
                    aria-haspopup="true"
                    aria-controls={`pubnav-menu-${slug(item.label)}`}
                  >
                    {item.label}
                    <i className="ri-arrow-down-s-line pubnav__caret" aria-hidden="true" />
                  </button>
                  <ul
                    id={`pubnav-menu-${slug(item.label)}`}
                    className="pubnav__dropdown"
                    role="list"
                  >
                    {item.children.map((child) => (
                      <li key={child.path}>
                        <Link
                          className={`pubnav__dropdown-link${
                            location.pathname === child.path ? ' is-active' : ''
                          }`}
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
                <li className="pubnav__item" key={item.path}>
                  <Link
                    className={`pubnav__link${
                      location.pathname === item.path ? ' is-active' : ''
                    }`}
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

          {/* Desktop CTAs */}
          <div className="pubnav__ctas">
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

          {/* Mobile hamburger */}
          <button
            type="button"
            className="pubnav__burger"
            onClick={() => setMenuOpen((v) => !v)}
            aria-controls="pubnav-mobile"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            <span className="pubnav__burger-box" aria-hidden="true">
              <span className="pubnav__burger-line" />
              <span className="pubnav__burger-line" />
              <span className="pubnav__burger-line" />
            </span>
          </button>
        </div>
      </nav>

      {/* Mobile sheet */}
      <div
        id="pubnav-mobile"
        className="pubnav__mobile"
        hidden={!menuOpen}
      >
        <ul className="pubnav__mobile-list" role="list">
          {NAV_LINKS.map((item) =>
            item.children ? (
              <li className="pubnav__mobile-group" key={item.label}>
                <span className="pubnav__mobile-heading">{item.label}</span>
                <ul className="pubnav__mobile-sublist" role="list">
                  {item.children.map((child) => (
                    <li key={child.path}>
                      <Link
                        className={`pubnav__mobile-link${
                          location.pathname === child.path ? ' is-active' : ''
                        }`}
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
              <li key={item.path}>
                <Link
                  className={`pubnav__mobile-link pubnav__mobile-link--top${
                    location.pathname === item.path ? ' is-active' : ''
                  }`}
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

        <div className="pubnav__mobile-ctas">
          <CtaLink
            to={SECONDARY_CTA.path}
            variant="outline"
            onClick={closeAll}
            className="cb-btn--full"
            data-track="nav_sponsor_team_mobile"
          >
            {SECONDARY_CTA.label}
          </CtaLink>
          <CtaLink
            to={PRIMARY_CTA.path}
            variant="primary"
            onClick={closeAll}
            className="cb-btn--full"
            data-track="nav_join_challenge_mobile"
          >
            {PRIMARY_CTA.label}
          </CtaLink>
          <a
            href="/portal/login"
            className="pubnav__mobile-login"
            data-track="nav_participant_login_mobile"
          >
            Log in
          </a>
        </div>
      </div>

      <style>{`
        .pubnav {
          position: sticky;
          top: 0;
          z-index: var(--z-sticky, 100);
          background: var(--surface-page);
          border-bottom: 1px solid transparent;
          transition: border-color var(--dur-base) var(--ease-out),
                      box-shadow var(--dur-base) var(--ease-out);
        }
        .pubnav--scrolled {
          border-bottom-color: var(--border-subtle);
          box-shadow: var(--shadow-sm);
        }
        .pubnav__bar { width: 100%; }
        .pubnav__inner {
          max-width: var(--container-xl, 1280px);
          margin: 0 auto;
          padding: 0 var(--space-6);
          height: 72px;
          display: flex;
          align-items: center;
          gap: var(--space-8);
        }

        /* ---- Brand ---- */
        .pubnav__brand {
          display: inline-flex;
          align-items: center;
          gap: var(--space-3);
          flex: none;
          text-decoration: none;
          border-radius: var(--radius-sm);
        }
        .pubnav__brand:hover { text-decoration: none; }
        .pubnav__brand-mark { display: block; }
        .pubnav__wordmark {
          font-family: var(--font-logo);
          font-weight: 700;
          font-size: 26px;
          line-height: 1;
          letter-spacing: -0.01em;
          color: var(--text-strong);
        }
        .pubnav__wordmark-c { color: var(--brand-accent); }

        /* ---- Desktop links ---- */
        .pubnav__links {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          list-style: none;
          margin: 0;
          padding: 0;
          margin-right: auto; /* push CTAs to the right, keep gap from brand */
        }
        .pubnav__item { position: relative; }
        .pubnav__link {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: var(--space-1);
          font-family: var(--font-body);
          font-size: var(--fs-body-sm);
          font-weight: var(--fw-medium);
          line-height: 1;
          color: var(--text-body);
          background: transparent;
          border: 0;
          padding: var(--space-3) var(--space-3);
          border-radius: var(--radius-sm);
          cursor: pointer;
          text-decoration: none;
          transition: color var(--dur-fast) var(--ease-out);
        }
        .pubnav__link::after {
          content: '';
          position: absolute;
          left: var(--space-3);
          right: var(--space-3);
          bottom: 6px;
          height: 2px;
          border-radius: var(--radius-pill);
          background: var(--brand-accent);
          transform: scaleX(0);
          transform-origin: left center;
          transition: transform var(--dur-base) var(--ease-out);
        }
        .pubnav__link:hover { color: var(--text-strong); text-decoration: none; }
        .pubnav__link:hover::after,
        .pubnav__link.is-active::after { transform: scaleX(1); }
        .pubnav__link.is-active { color: var(--text-strong); }
        .pubnav__caret {
          font-size: 18px;
          transition: transform var(--dur-fast) var(--ease-out);
        }
        .pubnav__item--has-menu.is-open .pubnav__caret { transform: rotate(180deg); }

        /* ---- Dropdown ---- */
        .pubnav__dropdown {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          min-width: 232px;
          list-style: none;
          margin: 0;
          padding: var(--space-2);
          background: var(--surface-card);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-lg);
          opacity: 0;
          visibility: hidden;
          transform: translateY(-6px);
          transition: opacity var(--dur-fast) var(--ease-out),
                      transform var(--dur-fast) var(--ease-out),
                      visibility var(--dur-fast);
          z-index: 1;
        }
        .pubnav__item--has-menu.is-open .pubnav__dropdown {
          opacity: 1;
          visibility: visible;
          transform: translateY(0);
        }
        .pubnav__dropdown-link {
          display: block;
          padding: var(--space-3) var(--space-3);
          border-radius: var(--radius-sm);
          font-family: var(--font-body);
          font-size: var(--fs-body-sm);
          font-weight: var(--fw-medium);
          color: var(--text-body);
          text-decoration: none;
          transition: background var(--dur-fast) var(--ease-out),
                      color var(--dur-fast) var(--ease-out);
        }
        .pubnav__dropdown-link:hover {
          background: var(--surface-subtle);
          color: var(--text-strong);
          text-decoration: none;
        }
        .pubnav__dropdown-link.is-active {
          color: var(--brand-accent);
          background: var(--surface-brand-subtle);
        }

        /* ---- CTAs ---- */
        .pubnav__ctas {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          flex: none;
        }

        /* ---- Hamburger ---- */
        .pubnav__burger {
          display: none;
          width: var(--target-min, 44px);
          height: var(--target-min, 44px);
          align-items: center;
          justify-content: center;
          background: transparent;
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          color: var(--text-strong);
          cursor: pointer;
          flex: none;
          margin-left: auto;
        }
        .pubnav__burger:hover { background: var(--surface-subtle); }
        .pubnav__burger-box {
          position: relative;
          display: block;
          width: 20px;
          height: 14px;
        }
        .pubnav__burger-line {
          position: absolute;
          left: 0;
          width: 100%;
          height: 2px;
          border-radius: var(--radius-pill);
          background: currentColor;
          transition: transform var(--dur-base) var(--ease-out),
                      opacity var(--dur-fast) var(--ease-out),
                      top var(--dur-base) var(--ease-out);
        }
        .pubnav__burger-line:nth-child(1) { top: 0; }
        .pubnav__burger-line:nth-child(2) { top: 6px; }
        .pubnav__burger-line:nth-child(3) { top: 12px; }
        .pubnav--open .pubnav__burger-line:nth-child(1) { top: 6px; transform: rotate(45deg); }
        .pubnav--open .pubnav__burger-line:nth-child(2) { opacity: 0; }
        .pubnav--open .pubnav__burger-line:nth-child(3) { top: 6px; transform: rotate(-45deg); }

        /* ---- Mobile sheet ---- */
        .pubnav__mobile { display: none; }

        /* ============ Responsive ============ */
        @media (max-width: 1024px) {
          .pubnav__links,
          .pubnav__ctas { display: none; }
          .pubnav__burger { display: inline-flex; }
          .pubnav__inner { gap: var(--space-4); height: 64px; }

          .pubnav__mobile {
            display: block;
            position: fixed;
            left: 0;
            right: 0;
            top: 64px;
            bottom: 0;
            background: var(--surface-page);
            border-top: 1px solid var(--border-subtle);
            padding: var(--space-6);
            overflow-y: auto;
            animation: pubnavSheetIn var(--dur-base) var(--ease-out);
          }
          .pubnav__mobile[hidden] { display: none; }
          .pubnav__mobile-list {
            list-style: none;
            margin: 0 0 var(--space-6);
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: var(--space-2);
          }
          .pubnav__mobile-group { margin-top: var(--space-4); }
          .pubnav__mobile-heading {
            display: block;
            font-family: var(--font-body);
            font-size: var(--fs-overline);
            font-weight: var(--fw-bold);
            letter-spacing: var(--ls-overline);
            text-transform: uppercase;
            color: var(--text-muted);
            padding: var(--space-2) var(--space-2) var(--space-1);
          }
          .pubnav__mobile-sublist {
            list-style: none;
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
          }
          .pubnav__mobile-link {
            display: block;
            padding: var(--space-3) var(--space-2);
            min-height: var(--target-min, 44px);
            font-family: var(--font-body);
            font-size: var(--fs-body);
            font-weight: var(--fw-medium);
            color: var(--text-body);
            border-radius: var(--radius-sm);
            text-decoration: none;
          }
          .pubnav__mobile-link--top { font-weight: var(--fw-bold); color: var(--text-strong); }
          .pubnav__mobile-link:hover { background: var(--surface-subtle); text-decoration: none; }
          .pubnav__mobile-link.is-active {
            color: var(--brand-accent);
            background: var(--surface-brand-subtle);
          }
          .pubnav__mobile-ctas {
            display: flex;
            flex-direction: column;
            gap: var(--space-3);
            border-top: 1px solid var(--border-subtle);
            padding-top: var(--space-6);
          }
          .pubnav__mobile-ctas .cb-btn { width: 100%; }
          .pubnav__mobile-login {
            text-align: center;
            font-family: var(--font-body);
            font-size: var(--fs-body-sm);
            font-weight: var(--fw-medium);
            color: var(--text-muted);
            padding: var(--space-2);
            text-decoration: none;
          }
          .pubnav__mobile-login:hover { color: var(--text-strong); text-decoration: underline; }
        }

        @media (max-width: 480px) {
          .pubnav__inner { padding: 0 var(--space-4); }
          .pubnav__mobile { padding: var(--space-4); }
        }

        @keyframes pubnavSheetIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .pubnav, .pubnav__link, .pubnav__link::after, .pubnav__caret,
          .pubnav__dropdown, .pubnav__burger-line, .pubnav__mobile {
            transition: none !important;
            animation: none !important;
          }
        }
      `}</style>
    </header>
  );
}

export default PublicNavbar;
