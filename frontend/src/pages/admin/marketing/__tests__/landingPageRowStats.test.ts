import { trafficPath, statsByPath, statsForPage, rowSummary } from '../landingPageRowStats';
import type { LandingPageTrafficRow } from '../../../../services/landingPageApi';

/**
 * The failure this guards is somebody else's numbers on your row.
 *
 * The traffic endpoint reports every hosted page across ALL brands; the table shows one brand's.
 * A bad join does not throw - it prints a plausible visitor count beside the wrong page, and
 * there is nothing on screen that would look wrong. That is the whole reason the key is the
 * public path and not the slug.
 */

const row = (over: Partial<LandingPageTrafficRow> = {}): LandingPageTrafficRow => ({
  brand_slug: 'colaberry-training', slug: 'open-house', status: 'published',
  views: 38, visitors: 16, identified_leads: 2, ad_clicks: 2,
  cta_clicks: 8, cta_clickers: 4, engaged_visitors: 9,
  first_seen: '2026-10-01T12:00:00Z', last_seen: '2026-10-15T12:00:00Z',
  ...over,
} as LandingPageTrafficRow);

describe('the join key', () => {
  it('is the public path the page is served at', () => {
    expect(trafficPath(row())).toBe('/lp/colaberry-training/open-house');
  });

  it('does not give two brands the same key for the same slug', () => {
    // The bug a slug-only join would ship: Refactored's numbers on Training's row.
    const a = trafficPath(row({ brand_slug: 'colaberry-training', slug: 'open-house' }));
    const b = trafficPath(row({ brand_slug: 'refactored', slug: 'open-house' }));
    expect(a).not.toBe(b);
  });
});

describe('finding a page its own numbers', () => {
  const byPath = statsByPath([
    row({ brand_slug: 'colaberry-training', slug: 'open-house', visitors: 16 }),
    row({ brand_slug: 'refactored', slug: 'open-house', visitors: 999 }),
  ]);

  it('matches on the full path, so the other brand is not picked up', () => {
    const found = statsForPage({ path: '/lp/colaberry-training/open-house' }, byPath);
    expect(found?.visitors).toBe(16);
  });

  it('returns null for a page that has never been published', () => {
    // No path means it was never served; a zero here would be a measurement that never happened.
    expect(statsForPage({ path: null }, byPath)).toBeNull();
  });

  it('returns null for a published page nothing was recorded for', () => {
    expect(statsForPage({ path: '/lp/colaberry-training/not-measured' }, byPath)).toBeNull();
  });
});

describe('the one-line summary on a collapsed row', () => {
  it('says the page is not published rather than showing zeros', () => {
    expect(rowSummary(null)).toBe('Not published yet');
  });

  it('leads with people, not loads', () => {
    // 38 views is the flattering number and is deliberately absent here.
    const s = rowSummary(row({ visitors: 16, cta_clickers: 4, views: 38 }));
    expect(s).toBe('16 visitors, 4 clicked');
    expect(s).not.toContain('38');
  });

  it('distinguishes nobody came from nobody acted', () => {
    expect(rowSummary(row({ visitors: 0, cta_clickers: 0 }))).toBe('No visitors yet');
    expect(rowSummary(row({ visitors: 7, cta_clickers: 0 }))).toBe('7 visitors, none clicked');
  });

  it('reads correctly for a single visitor', () => {
    expect(rowSummary(row({ visitors: 1, cta_clickers: 0 }))).toBe('1 visitor, none clicked');
  });
});
