import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import EnterpriseLockup from './EnterpriseLockup';
import NavMenuPanel from './NavMenuPanel';
import { NavMenu, useNavMenus } from './navMenus';

/**
 * PublicHeaderV2 — the V2 public site header.
 *
 * REDESIGNED 2026-11-16 (approved by Ali from review/nav.html). The bar had
 * nine links and wrapped onto two lines on a normal laptop ("How it / works",
 * "The / book", "Start / Free", "Log / in"). Ali: "With Proof and Gov the
 * navigation is getting too extensive ... I would like for the Proof and Gov
 * to be broken out into categories where our capabilities keep building out
 * ... Everything else needs to fit neatly at the top."
 *
 * Now: seven items on one line. Proof and Government open menus built from
 * live data (navMenus.ts), so they grow as case studies and catalog services
 * are published, with nobody editing a list. "Start Free" left the bar (Ali
 * approved the page deltas, S1); the free workspace stays reachable from the
 * Platform page and the closing band on every page.
 *
 * Deliberate behaviours, kept from before and still tested:
 *   1. Under 1080px the CTA moves INTO the menu sheet rather than merely being
 *      hidden — hiding it still overflowed at 390px.
 *   2. Escape closes whatever is open and returns focus to the control that
 *      opened it, so keyboard users are never stranded inside an overlay.
 * And new:
 *   3. A click outside the header closes an open menu.
 *   4. Menu panels are in the markup even when closed, so their links exist
 *      for crawlers and for a visitor whose JavaScript fails.
 */

export interface NavItem {
  readonly label: string;
  readonly to: string;
  /**
   * Served as a real file rather than by the router, so it must be a plain
   * anchor and a full page load.
   *
   * A <Link> here would be WORSE THAN A WRONG STYLE: react-router would handle
   * the click itself, find no matching <Route>, and render the 404 for a page
   * that exists on disk. The only symptom would be that the nav item is broken
   * while typing the same URL works.
   */
  readonly external?: boolean;
  /** Opens a menu instead of navigating. `to` is the menu's "browse all" page. */
  readonly menu?: 'proof' | 'government';
}

/**
 * Primary navigation. `V2_NAV` is checked against the real route table in
 * linkIntegrity.test.tsx, and the government page's own copy of this bar is
 * held to the same items by governmentHeaderParity.test.ts.
 */
export const V2_NAV: readonly NavItem[] = [
  { label: 'Services', to: '/services' },
  { label: 'How it works', to: '/how-it-works' },
  { label: 'Platform', to: '/platform' },
  { label: 'Proof', to: '/proof', menu: 'proof' },
  /* Served from frontend/public/government/, not by the router. */
  { label: 'Government', to: '/government/', external: true, menu: 'government' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'The book', to: '/book' },
];

export interface PublicHeaderV2Props {
  /** Overridable so tests and future IA changes do not require editing markup. */
  navItems?: readonly NavItem[];
}

function Chevron(): React.ReactElement {
  return (
    <svg className="cbv2-navlink__chev" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
      <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.6" fill="none" />
    </svg>
  );
}

function PublicHeaderV2({ navItems = V2_NAV }: PublicHeaderV2Props): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<NavItem['menu'] | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const menuButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const location = useLocation();
  const menus = useNavMenus();
  const menuOf: Record<NonNullable<NavItem['menu']>, NavMenu> = {
    proof: menus.proof,
    government: menus.government,
  };

  /* close everything on route change, so navigating from a panel never leaves it open */
  useEffect(() => {
    setOpen(false);
    setMenu(null);
  }, [location.pathname, location.search]);

  /* Escape closes the innermost open thing and restores focus to its opener */
  useEffect(() => {
    if (!open && !menu) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      if (menu) {
        const btn = menuButtons.current[menu];
        setMenu(null);
        btn?.focus();
        return;
      }
      setOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, menu]);

  /* a click outside the header closes an open menu */
  useEffect(() => {
    if (!menu) return undefined;
    const onDown = (e: MouseEvent): void => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) setMenu(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menu]);

  const isCurrent = useCallback(
    (to: string): boolean => {
      const path = to.replace(/\/$/, '') || '/';
      return location.pathname === path || (path !== '/' && location.pathname.startsWith(`${path}/`));
    },
    [location.pathname],
  );

  return (
    <header className="cbv2-header" ref={headerRef}>
      <div className="cbv2-wrap cbv2-nav">
        <Link className="cbv2-brand" to="/" aria-label="Colaberry Enterprise, home">
          <EnterpriseLockup />
        </Link>

        <nav aria-label="Primary" className="cbv2-navwrap">
          <ul className="cbv2-navlinks" id="cbv2-navlinks" data-open={open ? 'true' : 'false'}>
            {navItems.map((item) => {
              if (item.menu) {
                const panelId = `cbv2-menu-${item.menu}`;
                const expanded = menu === item.menu;
                return (
                  <li key={item.to} className="cbv2-navitem--menu">
                    <button
                      type="button"
                      ref={(el) => { menuButtons.current[item.menu as string] = el; }}
                      className={`cbv2-navlink cbv2-navlink--menu${isCurrent(item.to) ? ' is-current' : ''}`}
                      aria-expanded={expanded}
                      aria-controls={panelId}
                      onClick={() => setMenu(expanded ? null : item.menu)}
                    >
                      {item.label}
                      <Chevron />
                    </button>
                    <NavMenuPanel id={panelId} kind={item.menu} menu={menuOf[item.menu]} open={expanded} />
                  </li>
                );
              }
              return (
                <li key={item.to}>
                  {item.external ? (
                    <a className="cbv2-navlink" href={item.to}>
                      {item.label}
                    </a>
                  ) : (
                    <Link
                      className="cbv2-navlink"
                      to={item.to}
                      aria-current={isCurrent(item.to) ? 'page' : undefined}
                    >
                      {item.label}
                    </Link>
                  )}
                </li>
              );
            })}
            <li className="cbv2-navitem--login">
              <Link className="cbv2-navlink" to="/portal/login">
                Log in
              </Link>
            </li>
            <li className="cbv2-navcta-mobile">
              <Link className="cbv2-btn cbv2-btn--primary cbv2-btn--sm" to="/demo-pilot">
                Book a demo pilot
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
          {/*
              ONE primary action. The v5 model points every primary button at
              the demo pilot; a second header button pushed the links into
              wrapping.
          */}
          <Link className="cbv2-btn cbv2-btn--primary cbv2-btn--sm" to="/demo-pilot">
            Book a demo pilot
          </Link>
        </div>
      </div>
    </header>
  );
}

export default PublicHeaderV2;
