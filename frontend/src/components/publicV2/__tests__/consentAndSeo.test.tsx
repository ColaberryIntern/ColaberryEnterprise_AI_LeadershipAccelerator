/**
 * consentAndSeo.test.tsx — task 1.10.
 *
 * Three things are load-bearing here:
 *   1. Declining must actually stop and erase tracking, not just hide a banner.
 *      A decline that only dismisses the UI manufactures a consent record that
 *      was never given.
 *   2. The V2 preview must not be indexable while it shadows the live site.
 *   3. Every footer link must resolve. Nine of thirteen 404'd before this task
 *      because they were written as root paths while V2 is mounted under /v2,
 *      and the original tests only checked that they rendered.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import ConsentBanner from '../ConsentBanner';
import { FOOTER_LINKS } from '../PublicFooterV2';
import { PREVIEW_NOINDEX } from '../SeoV2';
import {
  CONSENT_KEY,
  TRACKING_KEYS,
  getConsent,
  setConsent,
  purgeTrackingData,
  trackingAllowed,
} from '../../../config/v2Consent';

/** Routes actually declared in App.tsx, plus the live routes V2 links out to. */
const DECLARED_ROUTES = [
  '/v2',
  '/v2/services',
  '/v2/services/ai-opportunity-sprint',
  '/v2/services/claude-production-pilot',
  '/v2/services/enterprise-build-modernization',
  '/v2/services/workforce-architect-accelerator',
  '/v2/services/embedded-ai-operations',
  '/v2/platform',
  '/v2/proof',
  '/v2/lab',
  '/v2/try',
  '/v2/privacy',
  '/v2/start',
  '/v2/pricing',
  '/pricing',
  '/contact',
  '/try',
];

beforeEach(() => {
  localStorage.clear();
});

describe('consent — decline is a real decision', () => {
  it('starts unset, so nothing is assumed', () => {
    expect(getConsent()).toBe('unset');
    expect(trackingAllowed()).toBe(false);
  });

  it('does not allow tracking until consent is explicitly granted', () => {
    expect(trackingAllowed()).toBe(false);
    setConsent('granted');
    expect(trackingAllowed()).toBe(true);
  });

  it('erases every tracking identifier when declined', () => {
    TRACKING_KEYS.forEach((k) => localStorage.setItem(k, 'value-from-a-previous-visit'));
    setConsent('denied');
    TRACKING_KEYS.forEach((k) => expect(localStorage.getItem(k)).toBeNull());
    expect(trackingAllowed()).toBe(false);
  });

  it('purges the device fingerprint specifically, since that is the identifier', () => {
    localStorage.setItem('cb_visitor_fp', 'a'.repeat(64));
    purgeTrackingData();
    expect(localStorage.getItem('cb_visitor_fp')).toBeNull();
  });

  it('remembers the decision across visits', () => {
    setConsent('denied');
    expect(localStorage.getItem(CONSENT_KEY)).toBe('denied');
    expect(getConsent()).toBe('denied');
  });

  it('treats a corrupted stored value as unset rather than as consent', () => {
    localStorage.setItem(CONSENT_KEY, 'yes-please');
    expect(getConsent()).toBe('unset');
    expect(trackingAllowed()).toBe(false);
  });
});

describe('consent banner — not a dark pattern', () => {
  const html = (): string =>
    renderToStaticMarkup(
      <MemoryRouter>
        <ConsentBanner />
      </MemoryRouter>,
    );

  it('offers decline with the same prominence as allow', () => {
    const h = html();
    expect(h).toContain('Allow');
    expect(h).toContain('Decline');
    // Both are buttons; neither is a de-emphasised text link.
    expect((h.match(/<button/g) || []).length).toBe(2);
  });

  it('discloses that the record is not anonymous for email arrivals', () => {
    // tracker.flush() reads ?email= from the URL and attaches it. Saying
    // "anonymous" would be false for anyone arriving from a campaign link.
    const text = html().replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    expect(text).toContain('includes your email address');
    // It must say it is NOT anonymous. A bare ban on the word "anonymous" would
    // reject the correct disclosure along with the false claim.
    expect(text).toContain('not anonymous');
    expect(text).not.toMatch(/\b(is|kept|held|stored)\s+anonymous(ly)?\b/);
  });

  it('says what happens on decline', () => {
    const text = html().replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    expect(text).toContain('anything already stored is deleted');
  });
});

describe('SEO — the preview must not be indexed while it shadows the live site', () => {
  it('is noindex until cutover', () => {
    expect(PREVIEW_NOINDEX).toBe(true);
  });
});

describe('footer — every link resolves', () => {
  it('points at no route that does not exist', () => {
    const dead = FOOTER_LINKS.filter((href) => !DECLARED_ROUTES.includes(href));
    expect(dead).toEqual([]);
  });

  it('links no V2 page by a bare root path', () => {
    // The original bug: /platform and /proof instead of /v2/platform, /v2/proof.
    ['/platform', '/proof', '/privacy', '/terms', '/services'].forEach((bare) => {
      expect(FOOTER_LINKS).not.toContain(bare);
    });
  });

  it('claims no terms page, because none exists', () => {
    expect(FOOTER_LINKS.some((h) => h.includes('terms'))).toBe(false);
  });
});
