import React from 'react';
import { BRAND_TABS, type BrandTabKey } from './brandSetup';

/**
 * The tabs of a brand's setup.
 *
 * Loomly puts everything about a calendar behind one row of tabs, which is what makes setting one
 * up a task rather than a tour across four pages. These are ours, in the order the work happens:
 * connect something, prove the email domain, clear what is waiting, then the brand's own details.
 *
 * Counts sit on the tabs that have a number worth seeing before you click - how many channels are
 * connected, how many posts are waiting - so the page answers "is there anything here?" without
 * being opened.
 */

export interface BrandSetupTabsProps {
  active: BrandTabKey;
  counts: { channels: number; approvals: number };
  onGo: (tab: BrandTabKey) => void;
}

export default function BrandSetupTabs({ active, counts, onGo }: BrandSetupTabsProps) {
  const countFor = (key: BrandTabKey): number | null => {
    if (key === 'channels') return counts.channels;
    if (key === 'approvals') return counts.approvals;
    return null;
  };

  return (
    <ul className="nav nav-tabs px-3" data-testid="brand-setup-tabs">
      {BRAND_TABS.map((t) => {
        const n = countFor(t.key);
        return (
          <li className="nav-item" key={t.key}>
            <button
              type="button"
              className={`nav-link ${active === t.key ? 'active' : ''}`}
              aria-current={active === t.key ? 'page' : undefined}
              title={t.hint}
              onClick={() => onGo(t.key)}
              data-testid={`brand-tab-${t.key}`}
            >
              {t.label}
              {n !== null && n > 0 && <span className="badge text-bg-light border ms-1">{n}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
