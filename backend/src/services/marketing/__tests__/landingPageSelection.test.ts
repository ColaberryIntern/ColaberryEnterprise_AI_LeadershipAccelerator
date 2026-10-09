// Only `publicAppUrl` is overridden. Replacing the whole env module breaks the import chain:
// WorkflowError pulls in the models, which pull in config/database, which needs real env fields.
jest.mock('../../../config/env', () => ({
  env: { ...jest.requireActual('../../../config/env').env, publicAppUrl: 'https://www.refactored.ai' },
}));

import {
  absoluteLandingPageUrl,
  assertSelectable,
  itemDestination,
  landingPagePath,
} from '../landingPageSelection';

/**
 * The rules about which page a post may point at.
 *
 * These are the ones a picker makes trivially easy to get wrong, so each refusal is tested by
 * the message an operator would actually see.
 */

const BRAND = { id: 'b-train', slug: 'colaberry-training' };
const OTHER_BRAND = { id: 'b-ent', slug: 'colaberry-enterprise' };

function page(over: Partial<Parameters<typeof assertSelectable>[0]> = {}) {
  return {
    id: 'lp-1', brand_id: 'b-train', slug: 'six-week-build',
    kind: 'hosted', status: 'published', ...over,
  } as NonNullable<Parameters<typeof assertSelectable>[0]>;
}

describe('the URL is derived, not stored', () => {
  it('builds the public path from the brand and page slugs', () => {
    expect(landingPagePath('colaberry-training', 'six-week-build')).toBe('/lp/colaberry-training/six-week-build');
  });

  it('builds an absolute URL on the same origin the short link is minted on', () => {
    // A tracked link re-validates its destination against the brand-domain allowlist, which only
    // works on an absolute URL.
    expect(absoluteLandingPageUrl('colaberry-training', 'six-week-build'))
      .toBe('https://www.refactored.ai/lp/colaberry-training/six-week-build');
  });

  it('does not double the slash when the configured origin has a trailing one', () => {
    jest.resetModules();
    jest.doMock('../../../config/env', () => ({
      env: { ...jest.requireActual('../../../config/env').env, publicAppUrl: 'https://www.refactored.ai/' },
    }));
    const { absoluteLandingPageUrl: fn } = require('../landingPageSelection');
    expect(fn('b', 's')).toBe('https://www.refactored.ai/lp/b/s');
  });
});

describe('what may be selected', () => {
  it('accepts a published hosted page on the post\'s own brand', () => {
    expect(() => assertSelectable(page(), BRAND)).not.toThrow();
  });

  it('refuses a page that does not exist', () => {
    expect(() => assertSelectable(null, BRAND)).toThrow(/does not exist/);
  });

  it('refuses an external_path row - the click is counted and then the trail stops', () => {
    expect(() => assertSelectable(page({ kind: 'external_path' }), BRAND))
      .toThrow(/not a page this platform built/);
  });

  it('refuses another brand\'s page - the mis-click a picker makes easy', () => {
    expect(() => assertSelectable(page(), OTHER_BRAND)).toThrow(/different brand/);
  });

  it('refuses when the post has no brand at all', () => {
    expect(() => assertSelectable(page(), null)).toThrow(/different brand/);
  });

  it('refuses a draft - the post would go out pointing at a 404', () => {
    expect(() => assertSelectable(page({ status: 'draft' }), BRAND)).toThrow(/not published yet/);
  });

  it('refuses an archived page for the same reason', () => {
    expect(() => assertSelectable(page({ status: 'archived' }), BRAND)).toThrow(/not published yet/);
  });

  it('refuses a page with no slug, which has no URL', () => {
    expect(() => assertSelectable(page({ slug: null }), BRAND)).toThrow(/no slug/);
  });

  it('checks the brand BEFORE the status, so the worse mistake is named first', () => {
    // A draft on the wrong brand is two problems. The brand is the one that would send a post
    // somewhere it has no business pointing, so that is the message.
    expect(() => assertSelectable(page({ status: 'draft' }), OTHER_BRAND)).toThrow(/different brand/);
  });
});

describe('where a post actually sends people', () => {
  it('a selected page wins, and says so', () => {
    const d = itemDestination(
      { landing_page_id: 'lp-1', destination_url: 'https://example.com/old' },
      { slug: 'six-week-build' },
      BRAND,
    );
    expect(d).toEqual({
      url: 'https://www.refactored.ai/lp/colaberry-training/six-week-build',
      source: 'landing_page',
      landingPageId: 'lp-1',
    });
  });

  it('falls back to a typed URL when no page is selected', () => {
    const d = itemDestination({ landing_page_id: null, destination_url: 'https://partner.example/signup' }, null, BRAND);
    expect(d).toEqual({ url: 'https://partner.example/signup', source: 'external_url', landingPageId: null });
  });

  it('reports none rather than guessing', () => {
    expect(itemDestination({ landing_page_id: null, destination_url: null }, null, BRAND))
      .toEqual({ url: null, source: 'none', landingPageId: null });
  });

  it('does not claim a landing page destination when the page could not be loaded', () => {
    // A dangling id must not silently become the typed URL without the source saying so.
    const d = itemDestination({ landing_page_id: 'lp-missing', destination_url: 'https://example.com/x' }, null, BRAND);
    expect(d.source).toBe('external_url');
  });

  it('names the source, so the confirmation can state it instead of showing a bare URL', () => {
    // The point: an operator who typed a URL and then picked a page must be told which one wins.
    const typed = itemDestination({ landing_page_id: null, destination_url: 'https://e.com' }, null, BRAND);
    const picked = itemDestination({ landing_page_id: 'lp-1', destination_url: 'https://e.com' }, { slug: 's' }, BRAND);
    expect(typed.source).not.toBe(picked.source);
  });
});
