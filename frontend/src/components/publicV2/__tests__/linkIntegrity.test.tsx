/**
 * linkIntegrity.test.tsx
 *
 * WHY THIS EXISTS
 * The V2 site shipped with its entire primary navigation broken. Every nav item
 * (/solutions, /services, /platform, /proof), both header CTAs, the brand logo,
 * the homepage's primary hero CTA, and nine footer links pointed at root paths
 * while every V2 page is mounted under /v2. None of them resolved.
 *
 * Every one of those had passing tests. The tests asserted that links RENDERED
 * and that their labels were right -- never that their destinations existed. A
 * comment in the header even read "Routes here must exist by the time this
 * header ships"; a comment is not a check.
 *
 * This walks every V2 page and asserts every internal href resolves to a route
 * that is actually declared. It is deliberately exhaustive rather than
 * per-component, because the bug was systemic.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import HomeV2 from '../../../pages/publicV2/HomeV2';
import { ServicesV2, ServiceDetailV2 } from '../../../pages/publicV2/ServicesV2';
import PlatformV2 from '../../../pages/publicV2/PlatformV2';
import ProofV2 from '../../../pages/publicV2/ProofV2';
import OpportunityLabV2 from '../../../pages/publicV2/OpportunityLabV2';
import TryV2 from '../../../pages/publicV2/TryV2';
import PrivacyV2 from '../../../pages/publicV2/PrivacyV2';
import PublicHeaderV2, { V2_NAV } from '../PublicHeaderV2';
import PublicFooterV2 from '../PublicFooterV2';
import { SERVICE_DETAILS } from '../../../config/v2Services';

/**
 * Mirrors the <Route> tree in App.tsx, plus the live routes V2 legitimately
 * links out to. Kept as an explicit list so adding a link to a page that does
 * not exist fails here rather than in a customer's browser.
 */
const V2_ROUTES = [
  '/v2',
  '/v2/services',
  '/v2/platform',
  '/v2/proof',
  '/v2/lab',
  '/v2/try',
  '/v2/privacy',
  '/v2/start',
  ...SERVICE_DETAILS.map((s) => `/v2/services/${s.slug}`),
];

/** Routes outside the V2 tree that exist in publicRoutes/portalRoutes. */
const LIVE_ROUTES = ['/pricing', '/contact', '/try', '/portal/login'];

const ALL_ROUTES = [...V2_ROUTES, ...LIVE_ROUTES];

const PAGES: [string, React.ReactElement, string][] = [
  ['HomeV2', <HomeV2 />, '/v2'],
  ['ServicesV2', <ServicesV2 />, '/v2/services'],
  ['ServiceDetailV2', <ServiceDetailV2 />, `/v2/services/${SERVICE_DETAILS[0].slug}`],
  ['PlatformV2', <PlatformV2 />, '/v2/platform'],
  ['ProofV2', <ProofV2 />, '/v2/proof'],
  ['OpportunityLabV2', <OpportunityLabV2 />, '/v2/lab'],
  ['TryV2', <TryV2 />, '/v2/try'],
  ['PrivacyV2', <PrivacyV2 />, '/v2/privacy'],
  ['PublicHeaderV2', <PublicHeaderV2 />, '/v2'],
  ['PublicFooterV2', <PublicFooterV2 />, '/v2'],
];

/** Every internal href in the rendered markup, ignoring anchors and externals. */
function internalHrefs(html: string): string[] {
  const found = html.match(/href="([^"]+)"/g) || [];
  return found
    .map((h) => h.slice(6, -1))
    .filter((h) => h.startsWith('/'))
    .map((h) => h.split('#')[0].split('?')[0])
    .filter((h) => h.length > 0)
    // Static assets under /site-v2/ and root images are files, not routes.
    .filter((h) => !/\.(png|jpe?g|svg|webp|woff2?|ico)$/i.test(h))
    .filter((h) => !h.startsWith('/site-v2/'));
}

describe('link integrity — every internal link resolves to a declared route', () => {
  PAGES.forEach(([name, element, path]) => {
    it(`${name} links only to routes that exist`, () => {
      const html = renderToStaticMarkup(
        <MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>,
      );
      const dead = internalHrefs(html).filter((h) => !ALL_ROUTES.includes(h));
      expect(dead).toEqual([]);
    });
  });
});

describe('link integrity — the specific paths that were broken', () => {
  it('primary nav points into the V2 tree, not at root paths', () => {
    V2_NAV.forEach((item) => {
      expect(item.to.startsWith('/v2')).toBe(true);
      expect(ALL_ROUTES).toContain(item.to);
    });
  });

  it('drops the Solutions nav item, which had no page', () => {
    expect(V2_NAV.some((i) => i.label === 'Solutions')).toBe(false);
    expect(V2_NAV.some((i) => i.to === '/solutions')).toBe(false);
  });

  it('header CTA and brand link stay inside V2', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/v2']}>
        <PublicHeaderV2 />
      </MemoryRouter>,
    );
    expect(html).toContain('href="/v2/platform"');
    expect(html).toContain('href="/v2"');
    // The brand used to send visitors to the LIVE homepage from inside V2.
    expect(html).not.toMatch(/class="cbv2-brand" href="\/"/);
  });

  it('homepage hero CTAs resolve', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/v2']}>
        <HomeV2 />
      </MemoryRouter>,
    );
    expect(html).toContain('href="/v2/platform"');
    expect(html).toContain('href="/v2/lab"');
    expect(html).not.toContain('href="/opportunity-lab"');
  });
});
