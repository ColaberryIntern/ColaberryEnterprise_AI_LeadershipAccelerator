/**
 * TryV2.test.tsx
 *
 * The risk on this page is claiming an entitlement boundary nobody verified.
 * There is no evidenced free-vs-paid feature matrix, so the tests below assert
 * that none is invented, and that route scoping keeps unapproved prices off the
 * page even though the free-tier claim is allowed here.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import TryV2 from '../TryV2';
import HomeV2 from '../HomeV2';
import PlatformV2 from '../PlatformV2';
import { FREE_INCLUDES, PAID_BOUNDARIES, ARRIVAL_NOTE } from '../../../config/v2Try';
import { publicClaim } from '../../../config/claimsRegistry';

const html = (): string =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={['/v2/try']}>
      <TryV2 />
    </MemoryRouter>,
  );

const textOf = (h: string): string => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

describe('TryV2 — route scoping is enforced, not decorative', () => {
  it('renders the free-tier claim, which IS approved for this route', () => {
    expect(publicClaim('pricing.free', '/try')).not.toBeNull();
    expect(textOf(html())).toContain('Free to start');
  });

  it('shows no subscription figure, because it is not approved for this route', () => {
    // Approved for /pricing and '/', deliberately not for /try.
    expect(publicClaim('pricing.individual.annual', '/try')).toBeNull();
    const text = textOf(html());
    expect(text).not.toContain('$149');
    expect(text).not.toContain('$199');
  });

  it('renders no price of any kind', () => {
    expect(textOf(html())).not.toMatch(/\$\s?[\d,]/);
  });

  it('renders no retired or repo-only price', () => {
    const text = textOf(html());
    expect(text).not.toContain('4,500');
    expect(text).not.toContain('1,788');
  });
});

describe('TryV2 — the boundary is stated, never invented', () => {
  it('names exactly the two evidenced paid categories', () => {
    const text = textOf(html());
    expect(PAID_BOUNDARIES).toHaveLength(2);
    PAID_BOUNDARIES.forEach((b) => expect(text).toContain(b.title));
  });

  it('builds no free-vs-paid feature matrix', () => {
    const h = html();
    // A comparison table would need a table or a check/cross column. There is no
    // verified source for which capability sits on which side of the line.
    expect(h).not.toContain('<table');
    expect(textOf(h)).not.toContain('Included in free');
    expect(textOf(h)).not.toContain('Not included');
  });

  it('sends people to the live pricing page for figures it will not state', () => {
    expect(html()).toContain('href="/pricing"');
  });
});

describe('TryV2 — expectations set before arrival', () => {
  it('warns that the workspace opens on sample data', () => {
    expect(textOf(html())).toContain(ARRIVAL_NOTE);
  });

  it('states what the free account includes', () => {
    const text = textOf(html());
    FREE_INCLUDES.forEach((f) => expect(text).toContain(f.title));
  });

  it('does not describe the sample team as customers', () => {
    const text = textOf(html());
    expect(text).not.toContain('our customers');
    expect(text).not.toContain('case study');
  });
});

describe('the reposition itself — V2 CTAs route through the front door', () => {
  const render = (el: React.ReactElement, path: string): string =>
    renderToStaticMarkup(<MemoryRouter initialEntries={[path]}>{el}</MemoryRouter>);

  it('HomeV2 sends free-workspace CTAs to /v2/try, not straight to /try', () => {
    const h = render(<HomeV2 />, '/v2');
    expect(h).toContain('href="/v2/try"');
    // A bare /try link would drop the visitor out of the V2 shell with no
    // expectation-setting, which is the incoherence this task exists to fix.
    expect(h).not.toMatch(/href="\/try"/);
  });

  it('PlatformV2 does the same', () => {
    const h = render(<PlatformV2 />, '/v2/platform');
    expect(h).toContain('href="/v2/try"');
    expect(h).not.toMatch(/href="\/try"/);
  });
});

describe('TryV2 — structure and routing', () => {
  it('links to the real workspace', () => {
    expect(html()).toContain('href="/try"');
  });

  it('has exactly one h1', () => {
    expect((html().match(/<h1/g) || []).length).toBe(1);
  });

  it('exposes no admin route', () => {
    expect(html()).not.toMatch(/\/admin\b/);
  });
});
