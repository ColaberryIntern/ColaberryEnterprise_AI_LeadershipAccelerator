import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  architecture,
  cta,
  measurement,
  metric,
  openArtifact,
  requestArtifact,
  roadmapItem,
  timelineEntry,
} from '../../../components/caseStudy/__fixtures__/caseStudyPublicFixtures';
import type {
  PublicCaseStudyDetail,
  PublicSurfaceView,
} from '../../../services/caseStudyPublicTypes';

/**
 * StoryDetailV2 - what the detail surface shows, what it refuses to show, and
 * what it says when the record is not there.
 *
 * THE MOCK IS PARTIAL ON PURPOSE. Only the network call and the five emitters
 * are replaced; `describeCaseStudyError`, `CaseStudyNotFoundError` and the
 * pure model stay real, so the copy a reader sees and the not-found branch a
 * 404 reaches are the shipped ones.
 *
 * WHY jsdom AND NOT ONLY `renderToStaticMarkup`. The house convention for
 * publicV2 is a static render plus a `textOf()` stripper, and `staticHtml()`
 * below is exactly that. But every state on this page except "loading" sits
 * behind an effect, and a static render runs none - a suite written only that
 * way would assert against the loading skeleton forever and pass. The
 * data-dependent rules therefore run through `react-dom/client` and `act`, the
 * way the `/stories` index suites do. This app has no `@testing-library`.
 *
 * TWO TRAPS THIS SUITE AVOIDS, both found in the sibling tasks:
 *   - `<time dateTime>` serialises as `dateTime=` under `renderToStaticMarkup`
 *     and as `datetime=` in a real DOM, so nothing here matches that attribute
 *     case-sensitively;
 *   - the verification badge's `textContent` carries a screen-reader prefix and
 *     reads like `Verified verification method: Client`, so assertions go
 *     through its `data-` attributes instead of its words.
 */

jest.mock('../../../services/caseStudyApi', () => {
  const actual = jest.requireActual('../../../services/caseStudyApi');
  return { ...actual, fetchCaseStudyDetail: jest.fn() };
});
jest.mock('../../../utils/caseStudyTracking', () => {
  const actual = jest.requireActual('../../../utils/caseStudyTracking');
  return {
    ...actual,
    trackCaseStudyView: jest.fn(),
    trackCaseStudyRepoClick: jest.fn(),
    trackCaseStudyArtifactClick: jest.fn(),
    trackCaseStudyCtaClick: jest.fn(),
    trackCaseStudyShare: jest.fn(),
  };
});

/* eslint-disable import/first */
import * as api from '../../../services/caseStudyApi';
import * as tracking from '../../../utils/caseStudyTracking';
import StoryDetailV2 from '../StoryDetailV2';
import {
  hasEvidenceContext,
  heroMetricsFor,
  isSectionSupported,
  visibleSections,
  withheldRepositoryNote,
} from '../storyDetailV2Model';
/* eslint-enable import/first */

const detailMock = api.fetchCaseStudyDetail as jest.MockedFunction<typeof api.fetchCaseStudyDetail>;

/* ------------------------------------------------------------- payloads --- */

const SURFACE: PublicSurfaceView = {
  key: 'enterprise',
  brandLabel: 'Colaberry Enterprise',
  hero: {
    eyebrow: 'Enterprise / shipped work',
    title: 'What we shipped, and who built it.',
    description: 'Assembled from repository evidence and approved verification.',
  },
  cta: cta(),
  sectionOrder: [
    'hero', 'situation', 'build', 'architecture', 'measurement',
    'roadmap', 'contributors', 'artifacts', 'repositories', 'cta',
  ],
  hiddenSections: [],
  emphasis: [],
  defaultSort: 'featured',
};

const REPO_URL = 'https://github.com/example-org/planner-console';

const detail = (over: Partial<PublicCaseStudyDetail> = {}): PublicCaseStudyDetail => ({
  surfaceKey: 'enterprise',
  slug: 'sample-record',
  title: 'A routing agent for dispatch planners',
  standfirst: 'What the team shipped, and what changed afterwards.',
  organizationLabel: 'A regional distributor',
  industry: 'Logistics',
  primaryCapability: 'Agentic workflow',
  capabilities: ['Agentic workflow', 'Retrieval'],
  stack: ['Claude', 'MCP'],
  programLabel: 'Delivery cohort',
  builtBy: 'colaberry_team',
  verificationClass: 'verified',
  verificationMethod: 'repo',
  publishedAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-02T00:00:00.000Z',
  heroImageUrl: null,
  engagementDuration: 'Eleven weeks',
  productionStatus: 'shipped',
  heroMetrics: [metric()],
  situation: {
    heading: 'The situation',
    body: ['Planners rebuilt the same route by hand every morning.'],
    // Empty by default: both lists are optional on every real record, so the
    // ordinary fixture must exercise the path where they render nothing.
    constraints: [],
    goals: [],
  },
  timeline: [timelineEntry()],
  architecture: architecture(),
  measurement: measurement(),
  roadmap: [roadmapItem()],
  contributors: [
    {
      displayMode: 'named',
      displayName: 'Dana Okafor',
      role: 'Lead engineer',
      kind: 'colaberry_team',
    },
  ],
  artifacts: [openArtifact(), requestArtifact()],
  repositories: [
    { label: 'planner-console', role: 'primary', url: REPO_URL, lastCommitDate: null },
  ],
  privateRepositoryCount: 0,
  anonymousContributorCount: 0,
  cta: cta(),
  seo: {
    title: 'A routing agent for dispatch planners',
    description: 'How a regional distributor cut hand-built routing.',
    canonicalUrl: 'https://enterprise.colaberry.ai/stories/sample-record',
    ogImageUrl: null,
    ogType: 'article',
  },
  ...over,
});

/** Nothing but a hero and a CTA: every optional section is empty or null. */
const bareDetail = (): PublicCaseStudyDetail => detail({
  heroMetrics: [],
  situation: null,
  timeline: [],
  architecture: null,
  measurement: null,
  roadmap: [],
  contributors: [],
  artifacts: [],
  repositories: [],
  privateRepositoryCount: 0,
  anonymousContributorCount: 0,
});

const response = (over: Partial<PublicCaseStudyDetail> = {}) => ({
  surface: SURFACE,
  caseStudy: detail(over),
});

/* -------------------------------------------------------------- harness --- */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function tree(path: string): React.ReactElement {
  return (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/stories/:slug" element={<StoryDetailV2 />} />
        {/* The CTA points into the site; without a destination a click would
            navigate the router to a path that matches nothing. */}
        <Route path="/lab" element={<p>Opportunity lab</p>} />
        <Route path="/stories" element={<p>Index</p>} />
      </Routes>
    </MemoryRouter>
  );
}

function mount(path = '/stories/sample-record'): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(tree(path));
  });
}

function unmount(): void {
  if (root) act(() => root!.unmount());
  if (container?.parentNode) document.body.removeChild(container);
  root = null;
  container = null;
}

/** Four microtask turns: the page awaits one request. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve();
    }
  });
}

const text = (): string => container?.textContent ?? '';
const html = (): string => container?.innerHTML ?? '';
const q = (selector: string): HTMLElement | null =>
  (container?.querySelector(selector) as HTMLElement | null) ?? null;
const all = (selector: string): HTMLElement[] =>
  Array.from(container?.querySelectorAll(selector) ?? []) as HTMLElement[];

/**
 * A real click with the browser's default action suppressed. jsdom would
 * otherwise try to navigate on an external anchor and log a not-implemented
 * error; react-router's `<Link>` also checks `defaultPrevented`, so an internal
 * CTA stays put while the page's own handler still runs.
 */
function clickLink(selector: string): void {
  const node = q(selector);
  if (!node) throw new Error(`No element matches ${selector}`);
  const swallow = (event: Event): void => event.preventDefault();
  document.addEventListener('click', swallow, true);
  try {
    act(() => {
      node.click();
    });
  } finally {
    document.removeEventListener('click', swallow, true);
  }
}

const click = (selector: string): void => {
  const node = q(selector);
  if (!node) throw new Error(`No element matches ${selector}`);
  act(() => {
    node.click();
  });
};

/** The house helper, for the assertions a server render can carry. */
const textOf = (markup: string): string =>
  markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const staticHtml = (path = '/stories/sample-record'): string =>
  renderToStaticMarkup(tree(path));

const sectionsShown = (): string[] =>
  all('[data-section]').map((node) => node.getAttribute('data-section') ?? '');

const SITE_OG_IMAGE = '/colaberry-logo.png';

/**
 * The head `public/index.html` actually ships, modelled rather than assumed.
 *
 * Two things depend on it. `SEOHead` UPDATES the description tag rather than
 * creating one, so a jsdom document without it would make every description
 * assertion below pass on `undefined`. And index.html ships a site-wide
 * `og:type` and `og:image`, which is what makes "restore the default" a
 * testable property instead of a theory.
 */
beforeAll(() => {
  const seed = (attribute: 'name' | 'property', key: string, content: string): void => {
    if (document.querySelector(`meta[${attribute}="${key}"]`)) return;
    const meta = document.createElement('meta');
    meta.setAttribute(attribute, key);
    meta.setAttribute('content', content);
    document.head.appendChild(meta);
  };
  seed('name', 'description', 'from index.html');
  seed('property', 'og:type', 'website');
  seed('property', 'og:image', SITE_OG_IMAGE);
});

beforeEach(() => {
  detailMock.mockResolvedValue(response());
  sessionStorage.clear();
});

afterEach(() => {
  unmount();
  jest.clearAllMocks();
});

/* ------------------------------------------------------------ the route --- */

describe('the page is reachable and never blank', () => {
  it('reads the detail endpoint with the slug from the URL', async () => {
    mount('/stories/a-different-record');
    await settle();
    expect(detailMock).toHaveBeenCalledTimes(1);
    expect(detailMock.mock.calls[0][0]).toBe('a-different-record');
  });

  it('paints a loading state before the response lands, not an empty page', () => {
    const markup = staticHtml();
    expect(markup).toContain('story-loading');
    expect(textOf(markup).length).toBeGreaterThan(10);
  });

  it('renders the record once it arrives', async () => {
    mount();
    await settle();
    expect(text()).toContain('A routing agent for dispatch planners');
  });
});

/* ---------------------------------------------------------- not found ----- */

describe('an unknown or unpublished slug gets the not-found treatment', () => {
  /**
   * The API returns a byte-identical 404 for "no such slug" and "published, but
   * not on this surface", so a visitor cannot probe the difference. Both arrive
   * here as the same error, and both must land on the same page - which is why
   * the two cases below assert the same thing from different starting points
   * rather than one standing in for the other.
   */
  it('renders the not-found page for a slug that does not exist', async () => {
    detailMock.mockRejectedValue(new api.CaseStudyNotFoundError('/api/public/case-studies/nope'));
    mount('/stories/nope');
    await settle();
    expect(text()).toContain('Project record not found');
    // The way back is the index, which is /proof now - the records took that
    // route over. The detail URL itself is unchanged, so the mount path above
    // is still /stories/<slug>.
    expect(q('a[href="/proof"]')).not.toBeNull();
  });

  it('renders the same page for a record that exists but is not published here', async () => {
    detailMock.mockRejectedValue(
      new api.CaseStudyNotFoundError('/api/public/case-studies/withdrawn-record'),
    );
    mount('/stories/withdrawn-record');
    await settle();
    expect(text()).toContain('Project record not found');
    // Not a crash and not a blank page: there is a heading and a way back.
    expect(q('h1')?.textContent).toBe('Project record not found');
    expect(html().length).toBeGreaterThan(50);
  });

  it('tells a crawler not to index it, since an SPA cannot answer 404', async () => {
    detailMock.mockRejectedValue(new api.CaseStudyNotFoundError('/api/public/case-studies/nope'));
    mount('/stories/nope');
    await settle();
    const robots = document.querySelector('meta[name="robots"]');
    expect(robots?.getAttribute('content')).toBe('noindex, nofollow');
  });

  it('emits no view event for a record that was never shown', async () => {
    detailMock.mockRejectedValue(new api.CaseStudyNotFoundError('/api/public/case-studies/nope'));
    mount('/stories/nope');
    await settle();
    expect(tracking.trackCaseStudyView).not.toHaveBeenCalled();
  });

  it('does not confuse a failed request with a missing record', async () => {
    // The admin leads page rendered "No leads yet" against 24,244 real rows
    // because a failed fetch left the list empty. Here the equivalent collapse
    // would tell a visitor a published record does not exist.
    detailMock.mockRejectedValue(
      new api.CaseStudyRequestError('UpstreamUnavailable', 'boom', [], 503),
    );
    mount();
    await settle();
    expect(text()).not.toContain('Project record not found');
    expect(q('[data-testid="story-failure"]')).not.toBeNull();
    expect(q('[data-testid="story-retry"]')).not.toBeNull();
  });

  it('retries on demand after a failure', async () => {
    detailMock.mockRejectedValueOnce(
      new api.CaseStudyRequestError('TimeoutError', 'slow', [], null),
    );
    mount();
    await settle();
    click('[data-testid="story-retry"]');
    await settle();
    expect(detailMock).toHaveBeenCalledTimes(2);
    expect(text()).toContain('A routing agent for dispatch planners');
  });
});

/* ------------------------------------------------------------ sections --- */

describe('sections hide when unsupported rather than rendering empty', () => {
  it('states the rule directly, so the render assertions below mean something', () => {
    const full = detail();
    const bare = bareDetail();
    for (const key of ['situation', 'build', 'architecture', 'measurement', 'roadmap',
      'contributors', 'artifacts', 'repositories'] as const) {
      expect({ key, supported: isSectionSupported(full, key) })
        .toEqual({ key, supported: true });
      expect({ key, supported: isSectionSupported(bare, key) })
        .toEqual({ key, supported: false });
    }
    expect(visibleSections(bare, SURFACE)).toEqual(['hero', 'cta']);
  });

  it('renders all eight optional sections for a complete record', async () => {
    mount();
    await settle();
    expect(sectionsShown()).toEqual([
      'situation', 'build', 'architecture', 'measurement',
      'roadmap', 'contributors', 'artifacts', 'repositories', 'cta',
    ]);
  });

  it('renders none of them, and no empty headings, for a bare record', async () => {
    detailMock.mockResolvedValue({ surface: SURFACE, caseStudy: bareDetail() });
    mount();
    await settle();
    expect(sectionsShown()).toEqual(['cta']);
    for (const heading of ['The situation', 'The build', 'What was built', 'The measurement',
      'What happened next', 'Who built it', 'Artifacts', 'Repositories and provenance']) {
      expect({ heading, shown: text().includes(heading) }).toEqual({ heading, shown: false });
    }
    // Still a real page: the title and the CTA are there.
    expect(text()).toContain('A routing agent for dispatch planners');
  });

  it('drops a section the surface profile hides, even when the record supports it', async () => {
    detailMock.mockResolvedValue({
      surface: { ...SURFACE, hiddenSections: ['artifacts', 'repositories'] },
      caseStudy: detail(),
    });
    mount();
    await settle();
    expect(sectionsShown()).not.toContain('artifacts');
    expect(sectionsShown()).not.toContain('repositories');
  });

  it('follows the order the server sent, not one written here', async () => {
    detailMock.mockResolvedValue({
      surface: { ...SURFACE, sectionOrder: ['hero', 'repositories', 'situation', 'cta'] },
      caseStudy: detail(),
    });
    mount();
    await settle();
    expect(sectionsShown()).toEqual(['repositories', 'situation', 'cta']);
  });

  it('hides an architecture section whose every field is empty', async () => {
    detailMock.mockResolvedValue(response({
      architecture: {
        narrative: [], stack: [], capabilities: [], integrations: [], dataStores: [],
        diagram: null, diagramSource: null,
      },
    }));
    mount();
    await settle();
    expect(sectionsShown()).not.toContain('architecture');
    expect(text()).not.toContain('What was built');
  });
});

/* --------------------------------------------------------- measurement --- */

describe('a figure never appears without the context that makes it readable', () => {
  it('prints baseline, unit, sample, methodology and limitations when present', async () => {
    detailMock.mockResolvedValue(response({
      measurement: measurement({
        metrics: [metric({
          unit: 'stockouts',
          limitations: ['One season of data.'],
        })],
      }),
    }));
    mount();
    await settle();
    const shown = text();
    expect(shown).toContain('approximately 300 per quarter');
    expect(shown).toContain('eight distribution sites');
    expect(shown).toContain('Counted from the client inventory export before and after.');
    expect(shown).toContain('One season of data.');
    expect(shown).toContain('stockouts');
  });

  it('states the completeness rule directly', () => {
    expect(hasEvidenceContext(metric())).toBe(true);
    expect(hasEvidenceContext(metric({
      baseline: null, sample: null, methodology: null, limitations: [],
    }))).toBe(false);
  });

  it('does not headline a high-impact number that carries no evidence context', async () => {
    const bare = metric({
      label: 'Time saved',
      valueDisplay: '96% faster',
      baseline: null,
      sample: null,
      methodology: null,
      limitations: [],
    });
    detailMock.mockResolvedValue(response({ heroMetrics: [bare] }));
    mount();
    await settle();
    expect(heroMetricsFor(detail({ heroMetrics: [bare] }))).toEqual([]);
    expect(q('.cbv2-story__metrics')).toBeNull();
    expect(text()).not.toContain('96% faster');
  });

  it('does headline the same number once it carries a baseline', async () => {
    // Guarding the guard: a hero that never renders a figure would pass the
    // assertion above too.
    const supported = metric({ label: 'Time saved', valueDisplay: '96% faster' });
    detailMock.mockResolvedValue(response({ heroMetrics: [supported] }));
    mount();
    await settle();
    expect(text()).toContain('96% faster');
    expect(text()).toContain('approximately 300 per quarter');
  });

  it('prints the verification class and method beside every headline figure', async () => {
    mount();
    await settle();
    // The badge's textContent carries a screen-reader prefix, so this reads the
    // attributes rather than the words.
    const badge = q('.cbv2-story__metric .cbv2-cs-verify');
    expect(badge?.getAttribute('data-verification-class')).toBe('verified');
    expect(badge?.getAttribute('data-verification-method')).toBe('client');
  });
});

/* -------------------------------------------------- repositories/consent --- */

describe('repositories and artifacts respect visibility and consent', () => {
  it('links every repository the projection let through', async () => {
    mount();
    await settle();
    const link = q('.cbv2-story__repo-link') as HTMLAnchorElement | null;
    expect(link?.getAttribute('href')).toBe(REPO_URL);
    expect(link?.getAttribute('rel')).toContain('noopener');
  });

  it('renders no address and no owner for a withheld repository', async () => {
    /*
     * END TO END, not a second filter. The public projection DROPS a repository
     * that is not public, not consented, or not parseable; it survives only as
     * one increment of `privateRepositoryCount`, and
     * `PublicCaseStudyRepository` has no owner, no visibility and no url field
     * that could carry a withheld one. So the payload below is what the server
     * actually sends for a record with two withheld repositories, and the
     * assertion is that nothing on the page invents what the wire cannot carry.
     */
    detailMock.mockResolvedValue(response({
      repositories: [],
      privateRepositoryCount: 2,
    }));
    mount();
    await settle();
    expect(all('.cbv2-story__repo-link')).toEqual([]);
    expect(html()).not.toContain('github.com');
    expect(html()).not.toContain('example-org');
    expect(text()).not.toContain('planner-console');
    // The count is still told, because provenance is the point of the section.
    expect(text()).toContain('2 further repositories');
  });

  it('says "not linked here", never "private", because three reasons collapse into one count', () => {
    expect(withheldRepositoryNote(0)).toBeNull();
    expect(withheldRepositoryNote(1)).toContain('One further repository');
    expect(withheldRepositoryNote(2)).toContain('2 further repositories');
    expect(withheldRepositoryNote(2)).not.toMatch(/private/i);
  });

  it('renders the section for a record whose repositories are ALL withheld', async () => {
    // The honest case: no links, but the reader is still told repositories exist.
    detailMock.mockResolvedValue(response({ repositories: [], privateRepositoryCount: 1 }));
    mount();
    await settle();
    expect(sectionsShown()).toContain('repositories');
    expect(text()).toContain('One further repository');
  });

  it('hides the section entirely when there is nothing to say about provenance', async () => {
    detailMock.mockResolvedValue(response({ repositories: [], privateRepositoryCount: 0 }));
    mount();
    await settle();
    expect(sectionsShown()).not.toContain('repositories');
  });

  // REVISED by the media task: spec 23 forbids a control it cannot honour, not
  // every control. A link to the surface's contact route, never a button posting
  // nowhere; with no destination it degrades to the sentence (sections suite).
  it('gives a request-only artifact a real destination, and no fake control', async () => {
    mount();
    await settle();
    const request = all('.cbv2-cs-artifact')
      .find((n) => n.getAttribute('data-artifact-access') === 'request');
    expect(request?.querySelector('button')).toBeNull();
    expect(request?.querySelector('a')?.getAttribute('href')).toBe(cta().href);
    expect(request?.textContent).not.toMatch(/download|we will send|will be sent/i);
  });

  it('names a contributor only through the consent-resolved payload', async () => {
    detailMock.mockResolvedValue(response({
      contributors: [{ displayMode: 'role_only', role: 'Client data team', kind: 'client_team' }],
      anonymousContributorCount: 3,
    }));
    mount();
    await settle();
    expect(q('[data-display-mode]')?.getAttribute('data-display-mode')).toBe('role_only');
    expect(text()).toContain('Client data team');
    expect(text()).toContain('3 further contributors are not named here.');
    expect(text()).not.toContain('Dana Okafor');
  });
});

/* ------------------------------------------------------------------ seo --- */

describe('SEO is unique per record, and OpenGraph waits for approved media', () => {
  it('sets a title, description and canonical from the record', async () => {
    mount();
    await settle();
    expect(document.title).toContain('A routing agent for dispatch planners');
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content'))
      .toBe('How a regional distributor cut hand-built routing.');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href'))
      .toBe('https://enterprise.colaberry.ai/stories/sample-record');
  });

  it('sets a DIFFERENT title, description and canonical for a different record', async () => {
    // Guarding the guard: a hardcoded head would pass the assertion above too.
    detailMock.mockResolvedValue(response({
      slug: 'second-record',
      seo: {
        title: 'An evaluation harness for claim review',
        description: 'A second record, with its own words.',
        canonicalUrl: 'https://enterprise.colaberry.ai/stories/second-record',
        ogImageUrl: null,
        ogType: 'article',
      },
    }));
    mount('/stories/second-record');
    await settle();
    expect(document.title).toContain('An evaluation harness for claim review');
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content'))
      .toBe('A second record, with its own words.');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href'))
      .toBe('https://enterprise.colaberry.ai/stories/second-record');
  });

  it('claims no og:image and no JSON-LD when no approved media exists', async () => {
    mount();
    await settle();
    const image = document.querySelector('meta[property="og:image"]');
    const type = document.querySelector('meta[property="og:type"]');
    // The site-wide defaults from index.html are left exactly as they were, and
    // this page has taken ownership of neither.
    expect(image?.getAttribute('content')).toBe(SITE_OG_IMAGE);
    expect(image?.hasAttribute('data-cbv2-seo')).toBe(false);
    expect(type?.getAttribute('content')).toBe('website');
    expect(type?.hasAttribute('data-cbv2-seo')).toBe(false);
    expect(document.querySelector('script[type="application/ld+json"][data-cbv2-seo]')).toBeNull();
  });

  it('writes og:image, og:type and an Article block once media is approved', async () => {
    detailMock.mockResolvedValue(response({
      heroImageUrl: 'https://cdn.example.org/approved/planner.png',
      seo: {
        title: 'A routing agent for dispatch planners',
        description: 'How a regional distributor cut hand-built routing.',
        canonicalUrl: 'https://enterprise.colaberry.ai/stories/sample-record',
        ogImageUrl: 'https://cdn.example.org/approved/planner.png',
        ogType: 'article',
      },
    }));
    mount();
    await settle();
    expect(document.querySelector('meta[property="og:image"]')?.getAttribute('content'))
      .toBe('https://cdn.example.org/approved/planner.png');
    expect(document.querySelector('meta[property="og:type"]')?.getAttribute('content'))
      .toBe('article');

    const script = document.querySelector('script[type="application/ld+json"][data-cbv2-seo]');
    expect(script).not.toBeNull();
    const data = JSON.parse(script?.textContent ?? '{}');
    expect(data['@type']).toBe('Article');
    expect(data.url).toBe('https://enterprise.colaberry.ai/stories/sample-record');
    expect(data.image).toEqual(['https://cdn.example.org/approved/planner.png']);
    // Never a person: contributor consent is per-record, and structured data is
    // the one place a name would outlive its withdrawal.
    expect(JSON.stringify(data)).not.toContain('Dana Okafor');
  });

  it('gives the site default back on the way out, rather than deleting it', async () => {
    /*
     * The leak this prevents runs both ways. Leave the override in place and the
     * next record is shared with a picture of somebody else's work. Delete the
     * tag instead of restoring it and the whole SPA loses the site-wide card
     * index.html shipped, for the rest of the session, after one visit.
     */
    detailMock.mockResolvedValue(response({
      seo: {
        title: 'With media', description: 'd',
        canonicalUrl: 'https://enterprise.colaberry.ai/stories/sample-record',
        ogImageUrl: 'https://cdn.example.org/approved/planner.png',
        ogType: 'article',
      },
    }));
    mount();
    await settle();
    expect(document.querySelector('meta[property="og:image"]')?.getAttribute('content'))
      .toBe('https://cdn.example.org/approved/planner.png');

    unmount();
    expect(document.querySelector('meta[property="og:image"]')?.getAttribute('content'))
      .toBe(SITE_OG_IMAGE);
    expect(document.querySelector('meta[property="og:type"]')?.getAttribute('content'))
      .toBe('website');
    expect(document.querySelector('script[type="application/ld+json"][data-cbv2-seo]')).toBeNull();
  });

  it('leaves the site indexable for a record that does exist', async () => {
    mount();
    await settle();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content'))
      .toBe('index, follow');
  });
});

/* ------------------------------------------------------------- tracking --- */

describe('tracking goes through the sanitising surface, once', () => {
  it('emits one view event from an effect, not from the render path', async () => {
    mount();
    await settle();
    expect(tracking.trackCaseStudyView).toHaveBeenCalledTimes(1);
    expect(tracking.trackCaseStudyView).toHaveBeenCalledWith(expect.objectContaining({
      slug: 'sample-record',
      surface: 'enterprise',
      source: 'stories-detail',
    }));

    // A re-render must not emit again. The ingest has no event-level dedup, so
    // a render-path call would write one row per render forever.
    click('[data-testid="story-share"]');
    expect(tracking.trackCaseStudyView).toHaveBeenCalledTimes(1);
  });

  it('sends a repository click as a role and a visibility class, never an address', async () => {
    mount();
    await settle();
    clickLink('.cbv2-story__repo-link');
    expect(tracking.trackCaseStudyRepoClick).toHaveBeenCalledTimes(1);
    const payload = (tracking.trackCaseStudyRepoClick as jest.Mock).mock.calls[0][0];
    expect(payload).toEqual(expect.objectContaining({
      slug: 'sample-record',
      repo_role: 'primary',
      repo_visibility: 'public',
    }));
    expect(JSON.stringify(payload)).not.toContain('github.com');
    expect(JSON.stringify(payload)).not.toContain('example-org');
  });

  it('sends an artifact click as its kind, not its file', async () => {
    mount();
    await settle();
    clickLink('.cbv2-cs-artifact__link');
    expect(tracking.trackCaseStudyArtifactClick).toHaveBeenCalledTimes(1);
    expect(tracking.trackCaseStudyArtifactClick).toHaveBeenCalledWith(expect.objectContaining({
      slug: 'sample-record',
      artifact_kind: 'deck',
    }));
  });

  it('sends the CTA click with its placement', async () => {
    mount();
    await settle();
    clickLink('.cbv2-cs-cta__button');
    expect(tracking.trackCaseStudyCtaClick).toHaveBeenCalledTimes(1);
    expect(tracking.trackCaseStudyCtaClick).toHaveBeenCalledWith(expect.objectContaining({
      slug: 'sample-record',
      placement: 'story-detail-footer',
    }));
  });

  it('records a share, and says so honestly when the browser refuses to copy', async () => {
    mount();
    await settle();
    click('[data-testid="story-share"]');
    expect(tracking.trackCaseStudyShare).toHaveBeenCalledWith(expect.objectContaining({
      slug: 'sample-record',
      channel: 'copy-link',
    }));
    // jsdom has no clipboard, which is exactly the case a real browser can also
    // present. The control must not claim it worked.
    expect(text()).toContain('would not let us copy');
  });

  it('reports a successful copy, and copies the canonical URL', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText }, configurable: true, writable: true,
    });
    try {
      mount();
      await settle();
      click('[data-testid="story-share"]');
      await settle();
      expect(writeText).toHaveBeenCalledWith(
        'https://enterprise.colaberry.ai/stories/sample-record',
      );
      expect(text()).toContain('Link copied.');
    } finally {
      Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, 'clipboard');
    }
  });

  it('records nothing for a click that was not on a link', async () => {
    mount();
    await settle();
    click('.cbv2-story__body');
    expect(tracking.trackCaseStudyRepoClick).not.toHaveBeenCalled();
    expect(tracking.trackCaseStudyArtifactClick).not.toHaveBeenCalled();
    expect(tracking.trackCaseStudyCtaClick).not.toHaveBeenCalled();
  });
});
