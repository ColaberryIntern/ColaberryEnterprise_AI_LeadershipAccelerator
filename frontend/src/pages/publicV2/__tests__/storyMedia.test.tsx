import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

/**
 * The media band: the carousel, the human-authored diagram, and where a
 * photograph is allowed to appear.
 *
 * WHY MERMAID IS MOCKED. `MermaidDiagram` fetches mermaid from a CDN at runtime
 * through `import()`. Letting a unit test reach the network would make this
 * suite slow, offline-fragile and a test of jsdom's fetch rather than of this
 * band. The mock renders a marker carrying the `chart` prop, so the assertions
 * are about WHAT THIS CODE HANDS THE RENDERER - which is the part this task
 * owns. The renderer's own CDN failure path is already proven where it ships.
 *
 * THREE THINGS THIS FILE PINS, each with a mutation recorded beside it:
 *   1. the carousel is keyboard operable and traps nothing;
 *   2. the diagram band HIDES when the record carries no source, which is the
 *      normal case and the whole reason this page still works as a template;
 *   3. a photograph never appears in an evidence position.
 *
 * It is a new file rather than an addition to `StoryDetailV2.test.tsx`, which is
 * at 827 lines - past CLAUDE.md's ceiling and not to be grown.
 */

jest.mock('../../../components/visuals/MermaidDiagram', () => ({
  __esModule: true,
  default: ({ chart, caption }: { chart: string; caption?: string }) => (
    <div data-testid="mermaid-mock" data-chart={chart} data-caption={caption ?? ''} />
  ),
}));

/* eslint-disable import/first */
import StoryDiagram from '../StoryDiagram';
import StoryMediaCarousel from '../StoryMediaCarousel';
import { StorySectionBody } from '../storyDetailV2Sections';
import { architectureHasContent, isSectionSupported } from '../storyDetailV2Model';
import {
  CAROUSEL_MINIMUM_SLIDES,
  IMAGE_ARTIFACT_TYPES,
  carouselSlides,
  diagramSourceOf,
} from '../storyMediaModel';
import {
  architecture,
  cta,
  measurement,
  metric,
  openArtifact,
  photoArtifact,
  requestArtifact,
  screenshotArtifact,
} from '../../../components/caseStudy/__fixtures__/caseStudyPublicFixtures';
import type {
  PublicCaseStudyArtifact,
  PublicCaseStudyDetail,
} from '../../../services/caseStudyPublicTypes';
/* eslint-enable import/first */

/* -------------------------------------------------------------- harness --- */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const html = (node: React.ReactElement): string => renderToStaticMarkup(node);
const textOf = (markup: string): string =>
  markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mount(node: React.ReactElement): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root!.render(node); });
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  if (container?.parentNode) document.body.removeChild(container);
  root = null;
  container = null;
  jest.restoreAllMocks();
});

const q = (selector: string): HTMLElement | null =>
  (container?.querySelector(selector) as HTMLElement | null) ?? null;
const all = (selector: string): HTMLElement[] =>
  Array.from(container?.querySelectorAll(selector) ?? []) as HTMLElement[];

const PHOTO = photoArtifact();
const SHOT = screenshotArtifact();

const detail = (artifacts: readonly PublicCaseStudyArtifact[]): PublicCaseStudyDetail => ({
  surfaceKey: 'enterprise',
  slug: 'sample-record',
  title: 'A routing agent for dispatch planners',
  standfirst: null,
  organizationLabel: null,
  industry: null,
  primaryCapability: null,
  capabilities: [],
  stack: [],
  programLabel: null,
  builtBy: null,
  verificationClass: 'verified',
  verificationMethod: 'repo',
  publishedAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-02T00:00:00.000Z',
  heroImageUrl: null,
  engagementDuration: null,
  productionStatus: null,
  heroMetrics: [metric()],
  situation: null,
  timeline: [],
  architecture: architecture(),
  measurement: measurement(),
  roadmap: [],
  contributors: [],
  artifacts,
  repositories: [],
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
});

/* ------------------------------------------------------ slide selection --- */

describe('which approved artifacts become slides', () => {
  it('treats exactly the three still-image types as images', () => {
    // `demo` is a video and cannot be laid out as a slide. Pinned literally
    // rather than re-derived, so a change to the list is a change to this line.
    expect([...IMAGE_ARTIFACT_TYPES]).toEqual(['screenshot', 'architecture', 'photo']);
    expect(CAROUSEL_MINIMUM_SLIDES).toBe(2);
  });

  it('builds a slide per open image', () => {
    const slides = carouselSlides([SHOT, PHOTO]);
    expect(slides.map((s) => s.artifactType)).toEqual(['screenshot', 'photo']);
    expect(slides.map((s) => s.presentation)).toEqual(['evidence', 'atmosphere']);
  });

  it('prefers the publisher thumbnail and falls back to the asset itself', () => {
    const slides = carouselSlides([SHOT, PHOTO]);
    expect(slides[0].imageUrl).toBe('https://example.org/console-thumb.png');
    expect(slides[0].href).toBe('https://example.org/console.png');
    // The photograph carries no thumbnail, so the asset stands in for one.
    expect(slides[1].imageUrl).toBe('https://example.org/studio.jpg');
  });

  it('returns nothing below the floor, so a one-slide carousel cannot exist', () => {
    // A single slide behind two arrows that cannot move is a control that does
    // nothing. The band disappears instead and the artifact list carries the
    // picture - which is what keeps a one-image record looking deliberate.
    expect(carouselSlides([SHOT])).toEqual([]);
    expect(carouselSlides([])).toEqual([]);
  });

  it('ignores artifacts that are not open images', () => {
    // Two non-images plus one image is still below the floor: proves the filter
    // ran rather than the floor being met by counting everything.
    expect(carouselSlides([SHOT, openArtifact(), requestArtifact()])).toEqual([]);
  });

  it('ignores a request-only image, which has no url to open', () => {
    const requestedImage = { ...requestArtifact(), artifactType: 'screenshot' as const };
    expect(carouselSlides([SHOT, requestedImage])).toEqual([]);
  });
});

/* ---------------------------------------------------- the carousel itself --- */

describe('the carousel is operable from a keyboard and traps nothing', () => {
  it('renders nothing at all when there are no slides', () => {
    expect(html(<StoryMediaCarousel slides={[]} />)).toBe('');
  });

  it('gives every slide a real focusable link, not a click handler on a div', () => {
    mount(<StoryMediaCarousel slides={carouselSlides([SHOT, PHOTO])} />);
    const links = all('.cbv2-story-carousel__link');
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link.tagName).toBe('A');
      expect(link.getAttribute('href')).toMatch(/^https:\/\//);
      // Focusable by default: no negative tabindex pulling it out of tab order.
      expect(link.getAttribute('tabindex')).toBeNull();
    }
  });

  it('hides no slide from assistive technology and moves focus nowhere', () => {
    // An offscreen slide is offscreen, not removed. `aria-hidden` on a slide
    // containing a focusable link is the classic carousel defect: a keyboard
    // reaches content a screen reader has been told does not exist.
    mount(<StoryMediaCarousel slides={carouselSlides([SHOT, PHOTO])} />);
    expect(all('[aria-hidden="true"]').some((n) => n.querySelector('a'))).toBe(false);
    expect(all('[tabindex="-1"]')).toHaveLength(0);
    expect(document.activeElement).toBe(document.body);
  });

  it('gives both arrows an accessible name and a real button element', () => {
    mount(<StoryMediaCarousel slides={carouselSlides([SHOT, PHOTO])} />);
    for (const id of ['carousel-prev', 'carousel-next']) {
      const button = q(`[data-testid="${id}"]`);
      expect(button?.tagName).toBe('BUTTON');
      expect(button?.getAttribute('type')).toBe('button');
      expect((button?.textContent ?? '').trim().length).toBeGreaterThan(0);
    }
    expect(q('[data-testid="carousel-next"]')?.textContent).toContain('more images');
  });

  it('scrolls the track forward when the next arrow is activated', () => {
    mount(<StoryMediaCarousel slides={carouselSlides([SHOT, PHOTO])} />);
    const track = q('[data-testid="story-carousel-track"]') as HTMLElement;
    const scrollBy = jest.fn();
    (track as unknown as { scrollBy: unknown }).scrollBy = scrollBy;

    act(() => { q('[data-testid="carousel-next"]')!.click(); });
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy.mock.calls[0][0].left).toBeGreaterThan(0);

    act(() => { q('[data-testid="carousel-prev"]')!.click(); });
    expect(scrollBy.mock.calls[1][0].left).toBeLessThan(0);
  });

  it('still moves the track when the smooth-scroll API is missing', () => {
    // jsdom implements `scrollLeft` and not `scrollBy`, and so does an older
    // browser. The fallback is not a test accommodation: without it the arrows
    // would silently do nothing anywhere `scrollBy` is absent.
    mount(<StoryMediaCarousel slides={carouselSlides([SHOT, PHOTO])} />);
    const track = q('[data-testid="story-carousel-track"]') as HTMLElement;
    (track as unknown as { scrollBy: undefined }).scrollBy = undefined;
    track.scrollLeft = 0;

    act(() => { q('[data-testid="carousel-next"]')!.click(); });
    expect(track.scrollLeft).toBeGreaterThan(0);
  });

  it('asks for an instant scroll when the reader asked for less motion', () => {
    const matchMedia = jest.fn().mockReturnValue({ matches: true });
    (window as unknown as { matchMedia: unknown }).matchMedia = matchMedia;
    mount(<StoryMediaCarousel slides={carouselSlides([SHOT, PHOTO])} />);
    const track = q('[data-testid="story-carousel-track"]') as HTMLElement;
    const scrollBy = jest.fn();
    (track as unknown as { scrollBy: unknown }).scrollBy = scrollBy;

    act(() => { q('[data-testid="carousel-next"]')!.click(); });
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    expect(scrollBy.mock.calls[0][0].behavior).toBe('auto');
  });

  it('asks for a smooth scroll when they did not', () => {
    // The other half. Without it, an implementation hardcoding 'auto' would pass
    // the test above and quietly ignore the preference in the other direction.
    (window as unknown as { matchMedia: unknown }).matchMedia =
      jest.fn().mockReturnValue({ matches: false });
    mount(<StoryMediaCarousel slides={carouselSlides([SHOT, PHOTO])} />);
    const track = q('[data-testid="story-carousel-track"]') as HTMLElement;
    const scrollBy = jest.fn();
    (track as unknown as { scrollBy: unknown }).scrollBy = scrollBy;

    act(() => { q('[data-testid="carousel-next"]')!.click(); });
    expect(scrollBy.mock.calls[0][0].behavior).toBe('smooth');
  });

  it('survives an environment with no matchMedia at all', () => {
    delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    mount(<StoryMediaCarousel slides={carouselSlides([SHOT, PHOTO])} />);
    const track = q('[data-testid="story-carousel-track"]') as HTMLElement;
    const scrollBy = jest.fn();
    (track as unknown as { scrollBy: unknown }).scrollBy = scrollBy;
    act(() => { q('[data-testid="carousel-next"]')!.click(); });
    expect(scrollBy.mock.calls[0][0].behavior).toBe('smooth');
  });
});

/* ------------------------------------------------------- the diagram band --- */

describe('the human-authored diagram appears only when a human drew one', () => {
  it('renders nothing when the record carries no source', () => {
    // The normal case. `architecture()` defaults `diagramSource` to null.
    expect(diagramSourceOf(architecture())).toBeNull();
    expect(html(<StoryDiagram source={null} />)).toBe('');
  });

  it('renders nothing for a blank or whitespace-only source', () => {
    expect(diagramSourceOf(architecture({ diagramSource: '   ' }))).toBeNull();
    expect(html(<StoryDiagram source={''} />)).toBe('');
  });

  it('hands the source to the renderer verbatim and labels whose picture it is', () => {
    // Read off the DOM rather than out of a markup string: a newline inside an
    // attribute is entity-escaped by `renderToStaticMarkup`, so a string match
    // would be testing the serialiser rather than what the renderer was handed.
    const chart = 'flowchart TD\n  api --> worker';
    mount(<StoryDiagram source={chart} />);
    expect(q('[data-testid="mermaid-mock"]')?.getAttribute('data-chart')).toBe(chart);
    expect(container?.textContent).toContain('drawn by the team');
  });

  it('hides inside the architecture section when the record has no drawing', () => {
    const record = detail([]);
    const markup = html(<StorySectionBody sectionKey="architecture" record={record} />);
    expect(markup).not.toContain('mermaid-mock');
    // ...while the verified lists it sits beside are still there. Without this
    // the test would equally pass an architecture section that rendered nothing.
    expect(textOf(markup)).toContain('Planner API');
  });

  it('keeps the section VISIBLE for a record whose only content is the drawing', () => {
    // The trap this catches: `architectureHasContent` decides whether the page
    // mounts the section at all, and it originally asked only about the text
    // lists. A record carrying nothing but a hand-drawn chart would then have
    // the section hidden - the band unreachable on exactly the records it
    // exists for - while every test about an ordinary record stayed green.
    const bare = {
      narrative: [], stack: [], capabilities: [], integrations: [], dataStores: [],
      diagram: null,
      diagramSource: 'flowchart TD\n  api --> worker',
    };
    expect(architectureHasContent(bare)).toBe(true);
    // Through the section gate the page actually calls, with an architecture
    // that has nothing BUT the drawing - `detail()`'s default fixture is full,
    // so passing it here would make this assertion true either way.
    expect(isSectionSupported({ ...detail([]), architecture: bare }, 'architecture')).toBe(true);
    // ...and an architecture with genuinely nothing in it is still hidden.
    expect(architectureHasContent({ ...bare, diagramSource: null })).toBe(false);
    expect(architectureHasContent({ ...bare, diagramSource: '   ' })).toBe(false);
  });

  it('appears in that section, beside the verified lists, when it does', () => {
    const record = detail([]);
    const withChart = {
      ...record,
      architecture: architecture({ diagramSource: 'flowchart TD\n  api --> worker' }),
    };
    const markup = html(<StorySectionBody sectionKey="architecture" record={withChart} />);
    expect(markup).toContain('mermaid-mock');
    expect(textOf(markup)).toContain('Planner API');
  });
});

/* --------------------------------------- a photograph is never evidence --- */

describe('a photograph never renders in an evidence position', () => {
  const record = detail([PHOTO, SHOT]);

  it('is absent from the measurement section, which renders figures and prose', () => {
    const markup = html(<StorySectionBody sectionKey="measurement" record={record} />);
    expect(markup).not.toContain('studio.jpg');
    expect(textOf(markup)).not.toContain('Dallas studio');
    // Non-vacuity: the section did render something.
    expect(textOf(markup)).toContain('Stockouts per quarter');
  });

  it('is absent from the roadmap and contributor sections too', () => {
    for (const key of ['roadmap', 'contributors'] as const) {
      expect(html(<StorySectionBody sectionKey={key} record={record} />))
        .not.toContain('studio.jpg');
    }
  });

  /**
   * Both surfaces carry `data-artifact-kind`, so both selectors are scoped by
   * class. An unscoped `[data-artifact-kind="photo"]` matches the CAROUSEL SLIDE
   * first, because the carousel precedes the list in DOM order - which is how
   * the first draft of these two tests came to be asserting about the wrong
   * element while looking entirely reasonable.
   */
  const ARTIFACT_ROW = '.cbv2-cs-artifact[data-artifact-kind="photo"]';
  const SLIDE = '.cbv2-story-carousel__slide[data-artifact-kind="photo"]';

  it('renders in the artifacts band, marked as atmosphere rather than evidence', () => {
    mount(<StorySectionBody sectionKey="artifacts" record={record} />);
    const row = q(ARTIFACT_ROW);
    expect(row).not.toBeNull();
    expect(row?.getAttribute('data-presentation')).toBe('atmosphere');
    // And the screenshot beside it is not.
    expect(q('.cbv2-cs-artifact[data-artifact-kind="screenshot"]')
      ?.getAttribute('data-presentation')).toBe('evidence');
  });

  it('is marked as atmosphere in the carousel too, not only in the list', () => {
    mount(<StorySectionBody sectionKey="artifacts" record={record} />);
    expect(q(SLIDE)?.getAttribute('data-presentation')).toBe('atmosphere');
    expect(q('.cbv2-story-carousel__slide[data-artifact-kind="screenshot"]')
      ?.getAttribute('data-presentation')).toBe('evidence');
  });

  it('is captioned by its neutral type label and never as a product image', () => {
    mount(<StorySectionBody sectionKey="artifacts" record={record} />);
    const row = q(ARTIFACT_ROW);
    expect(row?.textContent).toContain('Photograph');
    expect(row?.textContent).toContain('Open photograph');
    expect(row?.textContent ?? '').not.toMatch(/screenshot|delivered|in production/i);
  });
});

/* ------------------------------------------------------------- controls --- */

describe('every artifact carries a control that says what it does', () => {
  it('names the kind of thing each open artifact opens', () => {
    mount(<StorySectionBody sectionKey="artifacts" record={detail([SHOT, PHOTO, openArtifact()])} />);
    const labels = all('.cbv2-cs-artifact__link').map((n) => (n.textContent ?? '').trim());
    expect(labels[0]).toContain('Open screenshot');
    expect(labels[1]).toContain('Open photograph');
    expect(labels[2]).toContain('Open deck');
  });

  it('gives each one an accessible name saying WHICH artifact opens', () => {
    // A list of links all reading "Open screenshot" is unusable out of context.
    mount(<StorySectionBody sectionKey="artifacts" record={detail([SHOT, PHOTO])} />);
    const first = q('.cbv2-cs-artifact__link');
    expect(first?.textContent).toContain('The planner console');
    expect(first?.textContent).toContain('opens in a new tab');
  });

  it('sends a request-only artifact somewhere a human can actually be asked', () => {
    // The page supplies the surface's own contact route. There is no
    // artifact-request endpoint, so the control is a link to a place and never a
    // claim that the artifact will be delivered.
    mount(<StorySectionBody sectionKey="artifacts" record={detail([SHOT, requestArtifact()])} />);
    const request = q('.cbv2-cs-artifact__request');
    expect(request?.tagName).toBe('A');
    expect(request?.getAttribute('href')).toBe(cta().href);
    expect(request?.textContent).toContain('Request access');
    expect(request?.textContent).toContain('Evaluation results');
  });

  it('carries a carousel only once the record has two images', () => {
    mount(<StorySectionBody sectionKey="artifacts" record={detail([SHOT, PHOTO])} />);
    expect(q('[data-testid="story-carousel"]')).not.toBeNull();
    act(() => { root!.render(<StorySectionBody sectionKey="artifacts" record={detail([SHOT])} />); });
    expect(q('[data-testid="story-carousel"]')).toBeNull();
    // ...and the artifact itself is still on the page, in the list. This is what
    // makes a one-image record look deliberate instead of broken.
    expect(q('.cbv2-cs-artifact[data-artifact-kind="screenshot"]')).not.toBeNull();
  });
});
