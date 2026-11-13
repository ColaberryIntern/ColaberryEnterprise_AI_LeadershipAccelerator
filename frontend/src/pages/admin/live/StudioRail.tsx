import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PINNED_LINKS } from '../../../components/Layout/adminNav';

/**
 * A narrow icon rail for the live surfaces, collapsed by default.
 *
 * ## Why these pages had no navigation at all
 *
 * They render outside `AdminLayout` on purpose: the live surfaces are show-running tooling,
 * opened in their own tab so an operator configuring a class does not lose their place in
 * admin. That reasoning stands. What did not stand was the conclusion I drew from it, which was
 * to ship no navigation whatsoever - so the tab was a dead end with no way back except the
 * browser's own history.
 *
 * Ali's correction on 2026-11-11: "Don't 100% remove navigation, just make it collapsable to
 * one skinny line with icons about a 1/5 of the current size."
 *
 * ## It is a rail, not a sidebar
 *
 * The admin sidebar is 240px and carries labels, section headers and live ticket counts. This
 * is 48px and carries icons, which is the fifth asked for. Expanded it reaches 200px for people
 * who would rather read the words than learn the glyphs, and the choice is remembered - an
 * operator who expands it once should not have to expand it on every class.
 *
 * `localStorage` is wrapped because it throws in a private window and the rail must render
 * either way: a navigation bar that disappears when site data is blocked is worse than one that
 * forgets its width.
 */

const KEY = 'clv-rail-expanded';

function remembered(): boolean {
  try { return window.localStorage.getItem(KEY) === '1'; } catch { return false; }
}

function remember(expanded: boolean): void {
  try { window.localStorage.setItem(KEY, expanded ? '1' : '0'); } catch { /* private window */ }
}

export interface StudioRailProps {
  /** Opens the tour on the page that has one. Omitted where there is nothing to tour. */
  onTour?: () => void;
}

export default function StudioRail({ onTour }: StudioRailProps): React.ReactElement {
  const [expanded, setExpanded] = useState(remembered);

  const toggle = useCallback(() => {
    setExpanded((prev) => { remember(!prev); return !prev; });
  }, []);

  // Escape collapses, which is the cheap way out for somebody who expanded it by accident.
  useEffect(() => {
    if (!expanded) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setExpanded(false); remember(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  /**
   * The same destinations the admin sidebar offers, read from the same module.
   *
   * Hand-listing a few favourites here would be a second navigation that drifts from the first,
   * and the drift is invisible: nothing fails, the rail just quietly stops matching admin.
   */
  const links = PINNED_LINKS;

  return (
    <nav
      className={`clv-rail${expanded ? ' is-open' : ''}`}
      aria-label="Admin navigation"
      data-testid="studio-rail"
      data-expanded={expanded ? 'yes' : 'no'}
    >
      <button
        type="button"
        className="clv-rail-toggle"
        onClick={toggle}
        aria-expanded={expanded}
        title={expanded ? 'Collapse' : 'Expand navigation'}
        data-testid="rail-toggle"
      >
        <i className={`ri-${expanded ? 'contract-left-line' : 'menu-line'}`} aria-hidden="true" />
        <span className="clv-rail-text">Collapse</span>
      </button>

      {onTour && (
        <button
          type="button"
          className="clv-rail-item clv-rail-tour"
          onClick={onTour}
          title="Show me how this works"
          data-testid="rail-tour"
        >
          <i className="ri-question-line" aria-hidden="true" />
          <span className="clv-rail-text">How this works</span>
        </button>
      )}

      <div className="clv-rail-links">
        {links.map((item) => (
          <a
            key={item.path}
            href={item.path}
            className="clv-rail-item"
            title={item.label}
            data-testid={`rail-link-${item.path}`}
          >
            <i className={`ri-${item.icon}`} aria-hidden="true" />
            <span className="clv-rail-text">{item.label}</span>
          </a>
        ))}
      </div>

      {/*
        * A plain link rather than an entry in the list above: the live surfaces are their own
        * tab, so "back to admin" is the one destination an operator here is most likely to
        * want and it should not be hunted for among twenty others.
        */}
      <Link to="/admin/dashboard" className="clv-rail-item clv-rail-home" title="Back to admin">
        <i className="ri-arrow-go-back-line" aria-hidden="true" />
        <span className="clv-rail-text">Back to admin</span>
      </Link>
    </nav>
  );
}
