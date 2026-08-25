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
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import HomeV2 from '../../../pages/publicV2/HomeV2';
import { ServicesV2, ServiceDetailV2 } from '../../../pages/publicV2/ServicesV2';
import PlatformV2 from '../../../pages/publicV2/PlatformV2';
import ProofV2 from '../../../pages/publicV2/ProofV2';
import OpportunityLabV2 from '../../../pages/publicV2/OpportunityLabV2';
import TryV2 from '../../../pages/publicV2/TryV2';
import PrivacyV2 from '../../../pages/publicV2/PrivacyV2';
import StoriesV2 from '../../../pages/publicV2/StoriesV2';
import StoryDetailV2 from '../../../pages/publicV2/StoryDetailV2';
import PublicHeaderV2, { V2_NAV } from '../PublicHeaderV2';
import PublicFooterV2 from '../PublicFooterV2';
import { SERVICE_DETAILS } from '../../../config/v2Services';
import { CASE_STUDY_SURFACES, caseStudyDetailPath } from '../../../config/caseStudySurfaces';

/**
 * Mirrors the <Route> tree in App.tsx, plus the live routes V2 legitimately
 * links out to. Kept as an explicit list so adding a link to a page that does
 * not exist fails here rather than in a customer's browser.
 *
 * `/stories/:slug` is a PATTERN, not a path. Every other entry here is a
 * literal because the page behind it is a literal; a published project record
 * has no fixed slug, so the only honest way to declare its route is the shape
 * App.tsx actually registers. `routeResolves()` below matches it segment by
 * segment, so the guard stays exactly as strict as it was for everything else.
 */
const V2_ROUTES = [
  '/',
  '/services',
  '/platform',
  '/proof',
  '/lab',
  '/try',
  '/privacy',
  '/free-workspace',
  '/start',
  '/pricing',
  '/stories',
  '/stories/:slug',
  ...SERVICE_DETAILS.map((s) => `/services/${s.slug}`),
];

/** Routes outside the V2 tree that exist in publicRoutes/portalRoutes. */
const LIVE_ROUTES = ['/pricing', '/contact', '/try', '/portal/login'];

const ALL_ROUTES = [...V2_ROUTES, ...LIVE_ROUTES];

/**
 * Whether an href resolves to a declared route. An exact match, or a declared
 * pattern whose segments line up one for one with `:param` standing in for
 * exactly one segment. Nothing wildcards across a `/`, so `/stories/a/b` is
 * still dead.
 */
function routeResolves(href: string): boolean {
  if (ALL_ROUTES.includes(href)) return true;
  const parts = href.split('/');
  return ALL_ROUTES.some((route) => {
    if (!route.includes(':')) return false;
    const pattern = route.split('/');
    if (pattern.length !== parts.length) return false;
    return pattern.every((segment, index) => segment.startsWith(':') || segment === parts[index]);
  });
}

const deadLinks = (html: string): string[] => internalHrefs(html).filter((h) => !routeResolves(h));

const PAGES: [string, React.ReactElement, string][] = [
  ['HomeV2', <HomeV2 />, '/'],
  ['ServicesV2', <ServicesV2 />, '/services'],
  // ServiceDetailV2 is NOT listed here — it reads its slug from useParams, so it
  // needs a real <Route> to resolve. It gets its own describe block below.
  ['PlatformV2', <PlatformV2 />, '/platform'],
  ['ProofV2', <ProofV2 />, '/proof'],
  ['OpportunityLabV2', <OpportunityLabV2 />, '/lab'],
  ['TryV2', <TryV2 />, '/try'],
  ['PrivacyV2', <PrivacyV2 />, '/privacy'],
  // StoriesV2 was the only V2 page this suite had never walked. It renders its
  // records from an API, so a static render reaches the loading state - which is
  // exactly the state whose links (the closing CTA) are hardcoded and therefore
  // the ones this suite can prove. Card hrefs are built by
  // `caseStudyDetailPath()` and covered by StoriesV2.test.tsx.
  ['StoriesV2', <StoriesV2 />, '/stories'],
  ['PublicHeaderV2', <PublicHeaderV2 />, '/'],
  ['PublicFooterV2', <PublicFooterV2 />, '/'],
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
      const dead = deadLinks(html);
      expect(dead).toEqual([]);
    });
  });
});

/**
 * All five drill-throughs, each rendered through a real <Route>.
 *
 * WHY THIS EXISTS. The suite used to render ServiceDetailV2 inside a bare
 * MemoryRouter with `initialEntries={['/services/<slug>']}` and no <Route>
 * matching it. useParams() returns {} in that arrangement, so `slug` was
 * undefined, getServiceBySlug missed, and the component rendered its
 * "Service not found" branch. Every assertion was passing against the
 * not-found page — no service detail page had ever actually been tested.
 *
 * What it let through: service 01's next-step CTA pointed at `/opportunity-lab`,
 * which has never been a declared route. It shipped, and it was a live 404 on
 * production until this test was fixed. Rendering only SERVICE_DETAILS[0] would
 * not have been enough either, so all five are covered.
 */
describe('link integrity — every service drill-through', () => {
  SERVICE_DETAILS.forEach((s) => {
    it(`/services/${s.slug} links only to routes that exist`, () => {
      const html = renderToStaticMarkup(
        <MemoryRouter initialEntries={[`/services/${s.slug}`]}>
          <Routes>
            <Route path="/services/:slug" element={<ServiceDetailV2 />} />
          </Routes>
        </MemoryRouter>,
      );
      // Guard the guard: if the route ever stops resolving we are back to
      // asserting against the not-found page, which passes trivially.
      expect(html).toContain(s.name);
      expect(html).not.toContain('Service not found');

      const dead = deadLinks(html);
      expect(dead).toEqual([]);
    });
  });

  it('every nextRoute is a declared route', () => {
    SERVICE_DETAILS.forEach((s) => {
      expect(ALL_ROUTES).toContain(s.nextRoute);
    });
  });
});

describe('link integrity — the specific paths that were broken', () => {
  it('primary nav points into the V2 tree, not at root paths', () => {
    V2_NAV.forEach((item) => {
      expect(item.to.startsWith('/')).toBe(true);
      expect(ALL_ROUTES).toContain(item.to);
    });
  });

  it('drops the Solutions nav item, which had no page', () => {
    expect(V2_NAV.some((i) => i.label === 'Solutions')).toBe(false);
    expect(V2_NAV.some((i) => i.to === '/solutions')).toBe(false);
  });

  it('header CTA and brand link stay inside V2', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/']}>
        <PublicHeaderV2 />
      </MemoryRouter>,
    );
    expect(html).toContain('href="/platform"');
    expect(html).toContain('href="/"');
    // The brand used to send visitors to the LIVE homepage from inside V2.
    expect(html).not.toMatch(/class="cbv2-brand" href="\/"/);
  });

  it('homepage hero CTAs resolve', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/']}>
        <HomeV2 />
      </MemoryRouter>,
    );
    expect(html).toContain('href="/platform"');
    expect(html).toContain('href="/lab"');
    expect(html).not.toContain('href="/opportunity-lab"');
  });
});

/**
 * `/stories/:slug` — the one route in this table that is a pattern.
 *
 * The index builds its card hrefs through `caseStudyDetailPath()`, which is the
 * only place in the app that composes a detail URL. So the check that matters is
 * not "does some rendered anchor resolve" — a static render of either stories
 * page reaches its loading state and emits no card links at all — but "does the
 * function that composes those links target a route App.tsx actually declares".
 * That is the link the ServiceDetailV2 bug broke, one layer up.
 */
describe('link integrity — the published-record detail route', () => {
  it('resolves the path the index link builder produces', () => {
    const href = caseStudyDetailPath(CASE_STUDY_SURFACES.enterprise, 'a-published-record');
    expect(href).toBe('/stories/a-published-record');
    expect(routeResolves(href as string)).toBe(true);
  });

  it('is still strict: an undeclared path and a deeper one stay dead', () => {
    // Guarding the guard. A pattern matcher that wildcards too eagerly would
    // make every assertion in this file pass, including the broken ones.
    expect(routeResolves('/stories/a-record/extra')).toBe(false);
    expect(routeResolves('/solutions')).toBe(false);
    expect(routeResolves('/services/not-a-service')).toBe(false);
  });

  it('renders through its real <Route> without dead links or a blank page', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/stories/a-published-record']}>
        <Routes>
          <Route path="/stories/:slug" element={<StoryDetailV2 />} />
        </Routes>
      </MemoryRouter>,
    );
    // A server render runs no effects, so this is the pre-fetch state. What it
    // proves is that the route matches and the page paints something rather
    // than nothing while the record is on its way.
    expect(html).toContain('story-loading');
    expect(deadLinks(html)).toEqual([]);
  });
});
