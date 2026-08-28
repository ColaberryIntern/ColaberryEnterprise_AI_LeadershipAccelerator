import React, { useRef } from 'react';
import { LIVE_SURFACE_KEY, SURFACE_LENS_TABS } from './caseStudySurfaceLabModel';
import type { CaseStudySurfaceKey } from '../../services/caseStudyAdminTypes';

/**
 * CaseStudySurfaceTabs — the four-lens segmented control, shared by the two
 * Story Studio tabs that need one.
 *
 * WHY IT IS SHARED RATHER THAN COPIED. SURFACES and PREVIEW both let an operator
 * move between the same four surfaces, and they must move between them the SAME
 * way — same order, same live marker, same keyboard behaviour. Two copies would
 * agree on the day they were written and diverge afterwards, and the divergence
 * would show up as an operator learning one control and then meeting a
 * different one on the next tab.
 *
 * SEGMENTED TABS, NOT A SLIDER. Four audiences are not a continuum, and a slider
 * would imply an interpolated surface halfway between Training and Refactored,
 * which is meaningless. `role="tablist"` is the correct pattern because the tabs
 * select which view of ONE object is shown.
 *
 * SWITCHING A TAB WRITES NOTHING, AND THAT IS A PROPERTY OF THIS FILE'S IMPORT
 * LIST, NOT A PROMISE. It imports one model module and React. There is no API
 * client here, so no arrangement of props can make pressing a tab publish
 * anything. Each caller supplies its own `onSelect`, and both of them re-read.
 *
 * AUTHORIZATION IS SERVER-SIDE. The tabs are drawn for every admin; the server
 * decides. A non-allowlisted admin who presses one gets a 403, which the caller
 * renders as a sentence naming the environment variable. Hiding the control in
 * CSS would not be authorization, and drawing it and letting the server refuse
 * is honest about where the boundary actually is.
 *
 * THE TEST IDS ARE A PROP because two instances can exist in one page's DOM
 * across a tab change, and a suite that reads `.first()` cannot tell two
 * elements answering to one id from one element that works. SURFACES keeps
 * `cs-lens-`; PREVIEW uses `cs-preview-surface-`.
 */

export interface CaseStudySurfaceTabsProps {
  activeSurface: CaseStudySurfaceKey;
  onSelectSurface: (surfaceKey: CaseStudySurfaceKey) => void;
  /** Disables every tab while a read is in flight. */
  loading: boolean;
  /** e.g. `cs-lens-` produces `cs-lens-tab-training` and `cs-lens-live-marker`. */
  idPrefix: string;
  /** The `data-testid` on the tablist itself. */
  tablistTestId: string;
  /** The id of the tabpanel these tabs control. */
  panelId: string;
  ariaLabel: string;
}

export function CaseStudySurfaceTabs({
  activeSurface, onSelectSurface, loading, idPrefix, tablistTestId, panelId, ariaLabel,
}: CaseStudySurfaceTabsProps): React.ReactElement {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  /**
   * Arrow-key navigation across the tablist, per the ARIA tabs pattern: Left and
   * Right move and select, Home and End jump to the ends. Without it a keyboard
   * user has to Tab through four controls to reach the fourth, which is the
   * behaviour a tablist exists to replace.
   */
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const last = SURFACE_LENS_TABS.length - 1;
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    else if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    if (next === null) return;
    event.preventDefault();
    onSelectSurface(SURFACE_LENS_TABS[next].key);
    tabRefs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="btn-group flex-wrap mb-3"
      data-testid={tablistTestId}
    >
      {SURFACE_LENS_TABS.map((tab, index) => {
        const selected = tab.key === activeSurface;
        return (
          <button
            key={tab.key}
            ref={(el) => { tabRefs.current[index] = el; }}
            type="button"
            role="tab"
            /* The DOM id matches the test id on purpose: each caller's tabpanel
               points its `aria-labelledby` at exactly this string, so renaming
               one without the other silently unlabels the panel. */
            id={`${idPrefix}tab-${tab.key}`}
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            className={`btn ${selected ? 'btn-dark' : 'btn-outline-secondary'} px-3`}
            style={{ minHeight: '44px', minWidth: '44px' }}
            data-testid={`${idPrefix}tab-${tab.key}`}
            onClick={() => onSelectSurface(tab.key)}
            onKeyDown={(event) => onKeyDown(event, index)}
            disabled={loading}
          >
            <span className="text-uppercase fw-semibold small">{tab.label}</span>
            {/* The live surface is marked in TEXT, not by colour alone — the
                same rule the roadmap glyphs follow. */}
            {tab.key === LIVE_SURFACE_KEY && (
              <span className="d-block small fw-normal" data-testid={`${idPrefix}live-marker`}>
                ↑ LIVE
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default CaseStudySurfaceTabs;
