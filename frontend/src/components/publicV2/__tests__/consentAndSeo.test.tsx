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
import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import ConsentBanner from '../ConsentBanner';
import { FOOTER_LINKS } from '../PublicFooterV2';
import { SEGMENTS, readySegments } from '../../../config/v2Segments';
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
  '/',
  '/services',
  // The three live services.
  '/services/build',
  '/services/guide',
  '/services/train',
  // The five retired engagement slugs. Still declared because /services/:slug
  // redirects each of them to the service that absorbed it, so they remain
  // valid destinations for an existing inbound link -- see
  // LEGACY_SERVICE_REDIRECTS in config/v2ServicePages.ts.
  '/services/ai-opportunity-sprint',
  '/services/claude-production-pilot',
  '/services/enterprise-build-modernization',
  '/services/workforce-architect-accelerator',
  '/services/embedded-ai-operations',
  '/how-it-works',
  '/book',
  '/demo-pilot',
  '/platform',
  '/proof',
  '/lab',
  '/try',
  '/privacy',
  '/free-workspace',
  '/start',
  '/pricing',
  '/stories',
  // The published-record detail surface. A PATTERN, not a path: a project
  // record has no fixed slug, so this is the shape App.tsx registers rather
  // than any one address. Nothing in the footer may link it directly, and the
  // check below proves that is still true.
  '/stories/:slug',
  '/pricing',
  '/contact',
  '/try',
  /*
      The segment pages. DERIVED, not typed out: `App.tsx` mounts them with
      `readySegments().map`, so a hand-written list here would be a second
      source of truth that goes stale the moment a segment flips ready. The
      footer links them for the same reason and from the same call.
  */
  ...readySegments().map((s) => `/${s.slug}`),
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

describe('SEO — indexable now that this IS the site', () => {
  /**
   * This asserted `true` while V2 was a preview at /v2, to stop a shadow copy
   * competing with the live site for its own terms. The cutover made V2 the real
   * "/", so the flag flipped and this assertion flipped with it. Leaving it at
   * `true` would have quietly de-indexed the whole site.
   */
  it('is indexable after cutover', () => {
    expect(PREVIEW_NOINDEX).toBe(false);
  });
});

/*
 * THE SEGMENT-DOOR GUARDS, MOVED HERE FROM HomeV2.test.tsx.
 *
 * Home's "Who is this for?" band was the segment pages' only entry point
 * anywhere on the site. It came off when home was brought to the v5 model,
 * which has no equivalent band, and the links moved to the footer. The
 * property worth protecting never was about home: it is that these links are
 * GENERATED from `readySegments()`, the same source `App.tsx` maps to routes,
 * so a link cannot point at a page that is not mounted.
 */
describe('footer — the segment pages are reachable', () => {
  it('links every ready segment', () => {
    expect(readySegments().length).toBeGreaterThan(0);
    readySegments().forEach((s) => expect(FOOTER_LINKS).toContain(`/${s.slug}`));
  });

  it('links no segment that is not ready', () => {
    const unready = SEGMENTS.filter((s) => !s.ready);
    // Guards the guard: if every segment were ready this would pass vacuously.
    expect(unready.length).toBeGreaterThan(0);
    unready.forEach((s) => expect(FOOTER_LINKS).not.toContain(`/${s.slug}`));
  });

  it('pairs the links with the routes App.tsx actually mounts', () => {
    const app = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'App.tsx'),
      'utf8',
    );
    expect(app).toContain('readySegments().map');
  });

  /*
      A ready segment whose slug also names a directory under `public/` would be
      shadowed by that static file: nginx `try_files $uri $uri/` serves the
      directory's index.html and the React route never runs. `government` is a
      segment slug AND a static page today; it is `ready: false`, so there is no
      collision, and this fails the day someone flips it without noticing.
  */
  it('has no ready segment shadowed by a static page of the same name', () => {
    const publicDir = path.join(__dirname, '..', '..', '..', '..', 'public');
    const shadowed = readySegments()
      .map((s) => s.slug)
      .filter((slug) => fs.existsSync(path.join(publicDir, slug, 'index.html')));
    expect(shadowed).toEqual([]);
  });
});

describe('footer — every link resolves', () => {
  it('points at no route that does not exist', () => {
    const dead = FOOTER_LINKS.filter((href) => !DECLARED_ROUTES.includes(href));
    expect(dead).toEqual([]);
  });

  it('links V2 pages by root path, which is what they are now', () => {
    /*
     * INVERTED AT CUTOVER, deliberately. Before cutover this asserted the
     * opposite: the bug then was /platform instead of /v2/platform, because V2
     * lived under /v2. V2 now owns "/", so a /v2/... link in the footer would be
     * the dead one. The assertion tracks the mount point rather than a fixed
     * string.
     */
    ['/platform', '/proof', '/privacy'].forEach((p) => expect(FOOTER_LINKS).toContain(p));
    FOOTER_LINKS.forEach((h) => expect(h.startsWith('/v2')).toBe(false));
  });

  it('claims no terms page, because none exists', () => {
    expect(FOOTER_LINKS.some((h) => h.includes('terms'))).toBe(false);
  });

  it('links the records index, and never one particular record', () => {
    /*
     * The index is a stable destination; a single record is not. A footer link
     * to one published slug would rot the day that record is unpublished, and
     * it would be a dead link in the site chrome rather than on one page. The
     * detail route is declared above so the table is complete, but the footer
     * must reach it only through the index.
     *
     * THE INDEX IS `/proof` NOW. The published records took that route over,
     * and `/stories` redirects to it. The invariant did not change - only the
     * address it points at - so this asserts the footer reaches the index at
     * its real URL rather than through a redirect.
     */
    expect(DECLARED_ROUTES).toContain('/proof');
    expect(DECLARED_ROUTES).toContain('/stories/:slug');
    expect(FOOTER_LINKS).toContain('/proof');
    expect(FOOTER_LINKS.filter((h) => h.startsWith('/stories/'))).toEqual([]);
  });
});
