import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
  type NavigateFunction,
} from 'react-router-dom';
import StoriesV2 from '../StoriesV2';
import { summary } from '../../../components/caseStudy/__fixtures__/caseStudyPublicFixtures';
import type {
  CaseStudyLedgerCounts,
  PublicCaseStudyListResponse,
  PublicCaseStudyTaxonomyResponse,
  PublicSurfaceView,
} from '../../../services/caseStudyPublicTypes';

/**
 * The harness and payloads the two `/stories` behaviour suites share.
 *
 * WHY jsdom AT ALL. The house convention for publicV2 is
 * `renderToStaticMarkup` + `MemoryRouter` + a `textOf()` stripper, and
 * `staticHtml()` below is exactly that, used for the assertions it can carry.
 * But every state this page has except "loading" sits behind an effect, and
 * `renderToStaticMarkup` runs no effects - a suite written only that way would
 * assert against the loading skeleton forever and pass. So the data-dependent
 * rules are driven through `react-dom/client` and `act`, the way the admin Case
 * Study suites do it. This app has no `@testing-library` dependency.
 *
 * WHY `__fixtures__` AND NOT `__tests__`. CRA's jest claims every file under a
 * `__tests__` directory as a suite and fails any that contains no test. A shared
 * helper can only live here.
 *
 * WHY A REAL <Route>. `StoriesV2` reads and writes its filter state through
 * `useSearchParams`, which resolves against the matched route. A bare
 * `MemoryRouter` with no `<Route>` would still render, and would still pass most
 * assertions, while resolving navigation against the wrong base - the same class
 * of silent mis-setup that let `ServiceDetailV2` be "tested" for months against
 * its not-found branch.
 */

/* ------------------------------------------------------------- payloads --- */

export const SURFACE: PublicSurfaceView = {
  key: 'enterprise',
  brandLabel: 'Colaberry Enterprise',
  hero: {
    eyebrow: 'Enterprise / shipped work',
    title: 'What we shipped, and who built it.',
    // THIS is the field that differs from the page's pre-flight copy, so "the
    // server owns the hero" is an assertion rather than a coincidence — the
    // eyebrow and title above are deliberately identical to the fallback,
    // because the real profile's are too, and a fixture that differed there
    // would test a swap production must never show.
    description: 'Assembled from repository evidence and approved verification.',
  },
  cta: { eyebrow: 'e', heading: 'h', buttonLabel: 'b', href: '/lab' },
  sectionOrder: [],
  hiddenSections: [],
  emphasis: [],
  defaultSort: 'featured',
};

export const ledger = (over: Partial<CaseStudyLedgerCounts> = {}): CaseStudyLedgerCounts => ({
  projects: 2, verifiedOutcomes: 2, publicRepositories: 3, shipped: 1, ...over,
});

export const list = (
  over: Partial<PublicCaseStudyListResponse> = {},
): PublicCaseStudyListResponse => ({
  surface: SURFACE,
  collection: null,
  items: [summary()],
  page: 1,
  limit: 24,
  total: 1,
  hasMore: false,
  ledger: ledger(),
  ...over,
});

export const TAXONOMY: PublicCaseStudyTaxonomyResponse = {
  surface: SURFACE,
  facets: {
    capabilities: [{ slug: 'agents', label: 'agents', count: 2 }],
    industries: [{ slug: 'Energy', label: 'Energy', count: 1 }],
    stack: [{ slug: 'Claude', label: 'Claude', count: 2 }, { slug: 'MCP', label: 'MCP', count: 1 }],
    programs: [{ slug: 'delivery', label: 'delivery', count: 1 }],
    builtBy: [{ slug: 'colaberry_team', count: 2 }],
    verificationClasses: [{ slug: 'verified', count: 2 }, { slug: 'illustrative', count: 1 }],
  },
};

/** A record with no verified figure, and no digit anywhere in its own strings. */
export const NO_METRIC = summary({
  slug: 'no-metric-record',
  title: 'A knowledge agent for field technicians',
  standfirst: 'What the team shipped, and what changed afterwards.',
  headlineMetric: null,
  primaryCapability: 'Retrieval',
  deliverables: ['Technician console'],
  stack: ['Claude'],
  verificationClass: 'anonymized',
  verificationMethod: 'client',
});

/** The two empty sentences, quoted here so both suites test the same strings. */
export const FILTERED_EMPTY = 'No published projects match these filters.';
export const LIBRARY_EMPTY = "We're verifying the first project records for this proof library.";

/* -------------------------------------------------------------- harness --- */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let navigate: NavigateFunction | null = null;
let location: ReturnType<typeof useLocation> | null = null;

function Probe(): null {
  navigate = useNavigate();
  location = useLocation();
  return null;
}

export function mount(path = '/stories'): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <MemoryRouter initialEntries={[path]}>
        <Probe />
        <Routes>
          <Route path="/stories" element={<StoriesV2 />} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

export function unmount(): void {
  if (root) act(() => root!.unmount());
  if (container?.parentNode) document.body.removeChild(container);
  root = null;
  container = null;
}

/** Six microtask turns: the page chains a taxonomy read and an index read. */
export async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve();
    }
  });
}

export const text = (): string => container?.textContent ?? '';

export const q = (selector: string): HTMLElement | null =>
  (container?.querySelector(selector) as HTMLElement | null) ?? null;

export const all = (selector: string): HTMLElement[] =>
  Array.from(container?.querySelectorAll(selector) ?? []) as HTMLElement[];

/** The current URL query, which is the only place filter state lives. */
export const search = (): string => location?.search ?? '';

/** History travel, for the back/forward assertions. */
export const go = (delta: number): void => {
  act(() => { navigate!(delta); });
};

/** A real click, which is also what Space on a focused checkbox dispatches. */
export const click = (selector: string): void => {
  const node = q(selector);
  if (!node) throw new Error(`No element matches ${selector}`);
  act(() => { (node as HTMLElement).click(); });
};

/* --------------------------------------------------------- static render --- */

/** The house helper, for the assertions a server render can carry. */
export const textOf = (html: string): string =>
  html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

export const staticHtml = (path = '/stories'): string =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/stories" element={<StoriesV2 />} />
      </Routes>
    </MemoryRouter>,
  );
