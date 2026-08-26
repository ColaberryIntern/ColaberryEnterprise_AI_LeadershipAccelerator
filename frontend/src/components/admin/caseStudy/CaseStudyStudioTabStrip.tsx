import React, { useRef } from 'react';
import { CASE_STUDY_STUDIO_TABS, studioTabByKey } from './caseStudyStudioTabs';
import type { CaseStudyStudioTabKey } from './caseStudyStudioTabs';

/**
 * CaseStudyStudioTabStrip — the seven tabs, as a real ARIA tablist.
 *
 * KEYBOARD BEHAVIOUR IS COPIED FROM `CaseStudySurfaceLab`'s lens strip on
 * purpose: roving `tabIndex`, arrow keys that wrap, Home and End. Two tablists
 * on one page that behave differently is worse than either behaviour alone,
 * because the second one teaches the operator the first was broken.
 *
 * The 44px minimums are the `--target-min` touch target the V2 system declares.
 * They are inline here rather than in a stylesheet because this whole admin
 * surface is Bootstrap utilities with no stylesheet of its own, and introducing
 * one file of CSS for two rules would put the admin desk under the token,
 * namespace and hex contracts that govern the public V2 sheets without giving
 * it any of their benefits.
 */

interface Props {
  active: CaseStudyStudioTabKey;
  onSelect: (key: CaseStudyStudioTabKey) => void;
  /** Disabled while the record is still loading its first payload. */
  busy?: boolean;
}

export default function CaseStudyStudioTabStrip({
  active, onSelect, busy = false,
}: Props): React.ReactElement {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: React.KeyboardEvent, index: number): void => {
    const last = CASE_STUDY_STUDIO_TABS.length - 1;
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    else if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    if (next === null) return;
    event.preventDefault();
    onSelect(CASE_STUDY_STUDIO_TABS[next].key);
    tabRefs.current[next]?.focus();
  };

  const current = studioTabByKey(active);

  return (
    <div className="mb-3" data-testid="cs-studio-tabs">
      <div
        className="btn-group flex-wrap"
        role="tablist"
        aria-label="Story Studio"
      >
        {CASE_STUDY_STUDIO_TABS.map((tab, index) => {
          const selected = tab.key === active;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`cs-studio-tab-${tab.key}`}
              aria-selected={selected}
              aria-controls="cs-studio-panel"
              tabIndex={selected ? 0 : -1}
              ref={(el) => { tabRefs.current[index] = el; }}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`btn ${selected ? 'btn-dark' : 'btn-outline-secondary'} px-3`}
              style={{ minHeight: '44px', minWidth: '44px' }}
              data-testid={`cs-studio-tab-${tab.key}`}
              disabled={busy}
              onClick={() => onSelect(tab.key)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <p className="small text-muted mb-0 mt-2" data-testid="cs-studio-tab-question">
        {current.question}
      </p>
    </div>
  );
}
