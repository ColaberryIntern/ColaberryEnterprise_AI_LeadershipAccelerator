import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

/**
 * PublicHeaderV2 — the V2 public site header.
 *
 * Information architecture:
 *   Services · Platform · Proof · Start Free · Log in
 *   plus "Talk to an Architect" and "Explore the Platform".
 * The prototype also listed "Solutions"; there is no such page, so it is gone
 * rather than pointing at nothing.
 *
 * Two behaviours are deliberate, both from defects found during prototype review:
 *   1. On narrow viewports the CTAs move INTO the menu panel rather than merely
 *      being hidden — hiding only the primary button still overflowed at 390px.
 *   2. Escape closes the menu and returns focus to the toggle, so keyboard users
 *      are never stranded inside an open overlay.
 */

export interface NavItem {
  readonly label: string;
  readonly to: string;
}

/**
 * Primary navigation.
 *
 * FIXED IN 1.11: every one of these was a root path (/solutions, /services,
 * /platform, /proof) while V2 is mounted under /v2, so the main nav 404'd on
 * every page of the site. The line above this list used to read "Routes here
 * must exist by the time this header ships" -- a comment is not a test, and the
 * shell tests only asserted the labels rendered. `V2_NAV` is now checked against
 * the real route table in linkIntegrity.test.tsx.
 *
 * "Solutions" was dropped rather than repointed: no such page exists, and
 * inventing a destination for a nav label is how the dead links happened.
 */
export const V2_NAV: readonly NavItem[] = [
  { label: 'Services', to: '/v2/services' },
  { label: 'Platform', to: '/v2/platform' },
  { label: 'Proof', to: '/v2/proof' },
  { label: 'Start Free', to: '/v2/start' },
];

export interface PublicHeaderV2Props {
  /** Overridable so tests and future IA changes do not require editing markup. */
  navItems?: readonly NavItem[];
}

function PublicHeaderV2({ navItems = V2_NAV }: PublicHeaderV2Props): React.ReactElement {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const location = useLocation();

  /* close on route change, so navigating from the panel does not leave it open */
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  /* Escape closes and restores focus to the control that opened it */
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const isCurrent = useCallback(
    (to: string): boolean =>
      location.pathname === to || (to !== '/' && location.pathname.startsWith(`${to}/`)),
    [location.pathname],
  );

  return (
    <header className="cbv2-header">
      <div className="cbv2-wrap cbv2-nav">
        <Link className="cbv2-brand" to="/v2" aria-label="Colaberry Enterprise AI, home">
          <img src="/colaberry-logo-transparent.png" alt="" width={291} height={82} />
          <span className="cbv2-brand__text">Enterprise AI</span>
        </Link>

        <nav aria-label="Primary">
          <ul className="cbv2-navlinks" id="cbv2-navlinks" data-open={open ? 'true' : 'false'}>
            {navItems.map((item) => (
              <li key={item.to}>
                <Link
                  className="cbv2-navlink"
                  to={item.to}
                  aria-current={isCurrent(item.to) ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link className="cbv2-navlink" to="/portal/login">
                Log in
              </Link>
            </li>
            <li className="cbv2-navcta-mobile">
              <Link className="cbv2-btn cbv2-btn--secondary cbv2-btn--sm" to="/contact">
                Talk to an Architect
              </Link>
              <Link className="cbv2-btn cbv2-btn--primary cbv2-btn--sm" to="/v2/platform">
                Explore the Platform
              </Link>
            </li>
          </ul>
        </nav>

        <div className="cbv2-navactions">
          <button
            ref={toggleRef}
            className="cbv2-navtoggle"
            type="button"
            aria-expanded={open}
            aria-controls="cbv2-navlinks"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            <span aria-hidden="true">{open ? '✕' : '☰'}</span>
          </button>
          <Link className="cbv2-btn cbv2-btn--secondary cbv2-btn--sm" to="/contact">
            Talk to an Architect
          </Link>
          <Link className="cbv2-btn cbv2-btn--primary cbv2-btn--sm" to="/v2/platform">
            Explore the Platform
          </Link>
        </div>
      </div>
    </header>
  );
}

export default PublicHeaderV2;
