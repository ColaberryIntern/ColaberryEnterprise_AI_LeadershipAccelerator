import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

/**
 * The presentation pass: where a picture is met, what the page counts about
 * itself, and what happens to a control that cannot do anything.
 *
 * WHY A NEW FILE. `StoryDetailV2.test.tsx` is at 829 lines, past CLAUDE.md's
 * ceiling and explicitly not to be grown, and `storyMedia.test.tsx` belongs to
 * the band that shipped the carousel. This one owns the three behaviours the
 * UI pass added and nothing else.
 *
 * EVERY BEHAVIOUR HERE WAS MUTATED AND WATCHED GO RED. The mutation is recorded
 * beside the assertion in each case, because six tests earlier in this run could
 * not fail and looked exactly like tests that could.
 */

jest.mock('../../../components/visuals/MermaidDiagram', () => ({
  __esModule: true,
  default: () => <div data-testid="mermaid-mock" />,
}));

/* eslint-disable import/first */
import StoryFigureBand from '../StoryFigure';
import StoryMediaCarousel from '../StoryMediaCarousel';
import { StoryIndicatorRail, StorySectionCount } from '../StoryIndicators';
import { StorySectionBody } from '../storyDetailV2Sections';
import {
  ATMOSPHERE_EXCLUDED_AFTER,
  FIGURE_GAP_SECTIONS,
  figureAllowedAfter,
  figuresAfter,
  placeStoryFigures,
} from '../storyFigurePlacement';
import { SECTION_COUNT_NOUNS, sectionCount, storyIndicators } from '../storyIndicatorModel';
import { carouselSlides, imageSlides } from '../storyMediaModel';
import {
  architecture,
  cta,
  measurement,
  metric,
  photoArtifact,
  screenshotArtifact,
} from '../../../components/caseStudy/__fixtures__/caseStudyPublicFixtures';
import type {
  CaseStudySectionKey,
  PublicCaseStudyArtifact,
  PublicCaseStudyDetail,
} from '../../../services/caseStudyPublicTypes';
/* eslint-enable import/first */

/* -------------------------------------------------------------- harness --- */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const html = (node: React.ReactElement): string => renderToStaticMarkup(node);

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

/**
 * A distinguishable picture of either kind, so placement is readable in a diff.
 *
 * The URL is a named function rather than an inline literal because
 * `PublicCaseStudyArtifact` is a UNION and the `request` variant carries no
 * `url` at all - so `artifacts[0].url` does not typecheck even when the array
 * was built entirely from open ones. The fixtures' `overrides` parameter is
 * already narrowed to the open variant, which is why these go through it rather
 * than spreading the result and adding a field afterwards.
 */
const shotUrl = (n: number): string => `https://example.test/shot-${n}.png`;
const photoUrl = (n: number): string => `https://example.test/photo-${n}.jpg`;
const shot = (n: number): PublicCaseStudyArtifact =>
  screenshotArtifact({ title: `Shot ${n}`, url: shotUrl(n) });
const photo = (n: number): PublicCaseStudyArtifact =>
  photoArtifact({ title: `Photo ${n}`, url: photoUrl(n) });

const ALL_SECTIONS: readonly CaseStudySectionKey[] = [
  'hero', 'situation', 'build', 'architecture', 'measurement',
  'roadmap', 'contributors', 'artifacts', 'repositories', 'cta',
];

const detail = (over: Partial<PublicCaseStudyDetail> = {}): PublicCaseStudyDetail => ({
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
  artifacts: [],
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
  ...over,
});

/* ------------------------------------------------------ figure placement --- */

describe('a picture is met while the reading is still going on', () => {
  it('offers gaps only after narrative sections, never after the record-keeping ones', () => {
    // Pinned literally rather than re-derived from the list under test, so a
    // change to the rule is a change to this line and shows up in the diff.
    expect([...FIGURE_GAP_SECTIONS])
      .toEqual(['situation', 'build', 'architecture', 'measurement', 'roadmap', 'contributors']);
    for (const key of ['hero', 'cta', 'artifacts', 'repositories'] as CaseStudySectionKey[]) {
      expect({ key, offered: FIGURE_GAP_SECTIONS.includes(key) }).toEqual({ key, offered: false });
    }
  });

  /**
   * MUTATION: delete `'measurement'` from `ATMOSPHERE_EXCLUDED_AFTER`.
   * FAILS: "never lets an atmosphere photograph land next to a verified claim"
   *        -> expected { section: 'measurement', allowed: false }, got true.
   *
   * THE FIRST VERSION OF THIS TEST SURVIVED THAT MUTATION. It looped over
   * `ATMOSPHERE_EXCLUDED_AFTER` itself, so deleting an entry deleted the
   * assertion about it too and the suite stayed green while the rule was gone.
   * The four section names below are written out literally for that reason: a
   * test that reads the constant it is guarding is only testing that a `for`
   * loop works. Kept as a comment because the same shape is easy to write again.
   */
  it('never lets an atmosphere photograph land next to a verified claim', () => {
    const [photoSlide] = imageSlides([photo(1)]);
    const [shotSlide] = imageSlides([shot(1)]);
    expect(photoSlide.presentation).toBe('atmosphere');
    expect(shotSlide.presentation).toBe('evidence');

    const CLAIM_SECTIONS: readonly CaseStudySectionKey[] = [
      'architecture', 'measurement', 'roadmap', 'contributors',
    ];
    expect([...ATMOSPHERE_EXCLUDED_AFTER]).toEqual([...CLAIM_SECTIONS]);

    for (const section of CLAIM_SECTIONS) {
      expect({ section, allowed: figureAllowedAfter(photoSlide, section) })
        .toEqual({ section, allowed: false });
      // Non-vacuity: the same gap is open to evidence, so the rule is about the
      // KIND of picture and not about the gap being closed to everything.
      expect({ section, allowed: figureAllowedAfter(shotSlide, section) })
        .toEqual({ section, allowed: true });
    }

    // And the gaps a photograph IS allowed in, so "excluded" means something.
    for (const section of ['situation', 'build'] as CaseStudySectionKey[]) {
      expect({ section, allowed: figureAllowedAfter(photoSlide, section) })
        .toEqual({ section, allowed: true });
    }
  });

  /**
   * MUTATION: swap the two allocation loops in `placeStoryFigures` so evidence
   *   is assigned before atmosphere.
   * FAILS: "places every picture it can, by allocating the constrained kind
   *         first" -> expected 3 placed, got 2 (a photograph is stranded because
   *         the screenshot took the only gap it could have used).
   */
  it('places every picture it can, by allocating the constrained kind first', () => {
    const record = detail({ artifacts: [shot(1), photo(1), photo(2)] });
    const placement = placeStoryFigures(record.artifacts, ALL_SECTIONS);

    expect(placement.placedHrefs).toHaveLength(3);
    expect(figuresAfter(placement, 'situation').map((f) => f.title)).toEqual(['Photo 1']);
    expect(figuresAfter(placement, 'build').map((f) => f.title)).toEqual(['Photo 2']);
    expect(figuresAfter(placement, 'architecture').map((f) => f.title)).toEqual(['Shot 1']);
  });

  /**
   * MUTATION: drop the `excludeHref` filter in `placeStoryFigures`.
   * FAILS: "never places the cover again in the body" -> expected 1 placed,
   *        got 2 (the masthead's picture opens the body as well).
   *
   * WHY IT IS HERE. Measured on the live record the day the cover shipped: the
   * traceability capture rendered THREE times on one page - masthead, first
   * figure gap, and the artifacts strip. The masthead spending an image has to
   * remove it from the body, or every record with a cover repeats itself.
   */
  it('never places the cover again in the body', () => {
    const record = detail({ artifacts: [shot(1), shot(2)] });
    const first = record.artifacts[0];
    const second = record.artifacts[1];
    if (first.access !== 'open' || second.access !== 'open') throw new Error('fixture');
    const placement = placeStoryFigures(record.artifacts, ALL_SECTIONS, first.url);

    expect(placement.placedHrefs).toEqual([second.url]);
    expect(placement.placedHrefs).not.toContain(first.url);
  });

  it('places everything when no cover is named, so the exclusion is not vacuous', () => {
    const record = detail({ artifacts: [shot(1), shot(2)] });
    expect(placeStoryFigures(record.artifacts, ALL_SECTIONS, null).placedHrefs).toHaveLength(2);
    expect(placeStoryFigures(record.artifacts, ALL_SECTIONS).placedHrefs).toHaveLength(2);
  });

  it('puts at most one picture in a gap, so a gap never becomes a gallery', () => {
    const record = detail({ artifacts: [shot(1), shot(2), shot(3), shot(4)] });
    const placement = placeStoryFigures(record.artifacts, ALL_SECTIONS);
    for (const key of FIGURE_GAP_SECTIONS) {
      expect(figuresAfter(placement, key).length).toBeLessThanOrEqual(1);
    }
    // Non-vacuity: four pictures really were placed, so the cap is being
    // exercised rather than trivially satisfied by an empty map.
    expect(placement.placedHrefs).toHaveLength(4);
  });

  /**
   * MUTATION: change `placeStoryFigures` to iterate `FIGURE_GAP_SECTIONS`
   *   instead of the caller's `sections`.
   * FAILS: "never places a picture after a section this record does not print"
   *        -> expected 0 figures after 'measurement', got 1.
   */
  it('never places a picture after a section this record does not print', () => {
    // A record whose only visible narrative section is the situation.
    const visible: readonly CaseStudySectionKey[] = ['hero', 'situation', 'artifacts', 'cta'];
    const placement = placeStoryFigures([shot(1), shot(2), shot(3)], visible);
    expect(figuresAfter(placement, 'situation')).toHaveLength(1);
    for (const key of ['build', 'architecture', 'measurement', 'roadmap'] as CaseStudySectionKey[]) {
      expect({ key, placed: figuresAfter(placement, key).length }).toEqual({ key, placed: 0 });
    }
    // The two it could not place are leftovers, not losses: they still reach the
    // carousel, and every artifact is still in the artifacts list regardless.
    expect(placement.placedHrefs).toHaveLength(1);
  });

  it('places nothing at all for a record with no pictures, and says so with an empty map', () => {
    const placement = placeStoryFigures([], ALL_SECTIONS);
    expect(placement.placedHrefs).toEqual([]);
    for (const key of FIGURE_GAP_SECTIONS) expect(figuresAfter(placement, key)).toEqual([]);
  });
});

/* --------------------------------------------- the same picture, twice --- */

describe('no reader meets the same picture twice on one page', () => {
  /**
   * MUTATION: delete the `placed.has(...)` clause from `carouselSlides`, so the
   *   subtraction stops happening inside the model.
   * FAILS: "the artifacts band subtracts the pictures already placed inline"
   *        -> expected [], got 3 slides.
   */
  it('the artifacts band subtracts the pictures already placed inline', () => {
    const artifacts = [shot(1), photo(1), photo(2)];
    const placement = placeStoryFigures(artifacts, ALL_SECTIONS);
    expect(placement.placedHrefs).toHaveLength(3);
    expect(carouselSlides(artifacts, placement.placedHrefs)).toEqual([]);
    // Non-vacuity: with nothing placed, the same three are still a track.
    expect(carouselSlides(artifacts)).toHaveLength(3);
  });

  it('still refuses a one-slide track once the subtraction leaves a single picture', () => {
    const artifacts = [shot(1), photo(1), photo(2)];
    // Two placed, one left: below the floor, so no carousel rather than a
    // control that cannot move.
    expect(carouselSlides(artifacts, [shotUrl(1), photoUrl(1)])).toEqual([]);
  });

  it('keeps a genuine multi-image leftover set as a carousel', () => {
    const artifacts = [shot(1), shot(2), shot(3)];
    expect(carouselSlides(artifacts, [shotUrl(1)])).toHaveLength(2);
  });

  /**
   * MUTATION: drop the `placedHrefs` argument in `storyDetailV2Sections.tsx`,
   *   so the band calls `carouselSlides(record.artifacts)` again.
   * FAILS: "renders no carousel in the artifacts band once every picture was
   *        placed" -> expected null, got the carousel element.
   */
  it('renders no carousel in the artifacts band once every picture was placed', () => {
    const artifacts = [shot(1), photo(1)];
    const record = detail({ artifacts });
    const placement = placeStoryFigures(artifacts, ALL_SECTIONS);
    mount(
      <StorySectionBody sectionKey="artifacts" record={record} placedHrefs={placement.placedHrefs} />,
    );
    expect(q('[data-testid="story-carousel"]')).toBeNull();
    // ...and both artifacts are still listed, which is what keeps the record complete.
    expect(all('.cbv2-cs-artifact')).toHaveLength(2);
  });
});

/* ---------------------------------------------------------- the figures --- */

describe('the figure band', () => {
  it('renders nothing at all when nothing was placed', () => {
    expect(html(<StoryFigureBand figures={[]} />)).toBe('');
  });

  /**
   * MUTATION: replace `alt=""` with `alt={figure.title}` in `StoryFigure.tsx`.
   * FAILS: "captions the picture in real text rather than inventing alt text"
   *        -> expected alt "", got "Shot 1".
   */
  it('captions the picture in real text rather than inventing alt text', () => {
    const figures = imageSlides([shot(1)]);
    mount(<StoryFigureBand figures={figures} />);
    const image = q('.cbv2-story-figure__image') as HTMLImageElement | null;
    expect(image?.getAttribute('alt')).toBe('');
    // The meaning is in the figcaption, which is real text in the tree.
    expect(q('.cbv2-story-figure__kind')?.textContent).toBe('Screenshot');
    expect(q('.cbv2-story-figure__title')?.textContent).toBe('Shot 1');
    expect(q('figcaption')).not.toBeNull();
  });

  it('marks which kind of picture it is, so a photograph is never mistaken for evidence', () => {
    mount(<StoryFigureBand figures={imageSlides([photo(1), shot(1)])} />);
    expect(all('.cbv2-story-figure').map((n) => n.getAttribute('data-presentation')))
      .toEqual(['atmosphere', 'evidence']);
  });

  it('opens the asset in a new tab and says so out loud', () => {
    mount(<StoryFigureBand figures={imageSlides([shot(1)])} />);
    const link = q('.cbv2-story-figure__link') as HTMLAnchorElement | null;
    expect(link?.getAttribute('href')).toBe('https://example.test/shot-1.png');
    expect(link?.getAttribute('rel')).toContain('noopener');
    expect(link?.textContent).toContain('opens in a new tab');
    expect(link?.textContent).toContain('Shot 1');
  });
});

/* --------------------------------------------------------- the indicators --- */

describe('the indicators count, and never score', () => {
  /**
   * MUTATION: change the final `filter` in `storyIndicators` to
   *   `indicator.count >= 0`.
   * FAILS: "omits a zero rather than printing one" -> expected keys
   *        ['sections'], got ['sections','stack','evidence','repositories','roadmap'].
   */
  it('omits a zero rather than printing one', () => {
    const thin = detail();
    const keys = storyIndicators(thin, ['hero', 'situation', 'cta']).map((i) => i.key);
    expect(keys).toEqual(['sections']);
  });

  it('renders nothing whatsoever for a record with nothing countable', () => {
    // No sections beyond the page's own furniture, and nothing else to count.
    expect(storyIndicators(detail(), ['hero', 'cta'])).toEqual([]);
    expect(html(<StoryIndicatorRail indicators={[]} />)).toBe('');
  });

  it('counts the record, not the page furniture', () => {
    const record = detail({
      stack: ['react', 'postgres'],
      artifacts: [shot(1), photo(1)],
      repositories: [{ label: 'planner', role: 'primary', url: 'https://example.test/r', lastCommitDate: null }],
      roadmap: [{ label: 'Ship it', status: 'shipped', detail: null }],
    });
    const byKey = Object.fromEntries(
      storyIndicators(record, ALL_SECTIONS).map((i) => [i.key, i.count]),
    );
    // Ten section keys minus hero and cta.
    expect(byKey.sections).toBe(8);
    expect(byKey.stack).toBe(2);
    // One of the two artifacts is atmosphere, so it is not evidence.
    expect(byKey.evidence).toBe(1);
    expect(byKey.repositories).toBe(1);
    expect(byKey.roadmap).toBe(1);
  });

  it('agrees in number with what it counted', () => {
    const one = storyIndicators(detail({ stack: ['react'] }), ['hero', 'cta']);
    expect(one.find((i) => i.key === 'stack')?.label).toBe('technology');
    const two = storyIndicators(detail({ stack: ['react', 'sql'] }), ['hero', 'cta']);
    expect(two.find((i) => i.key === 'stack')?.label).toBe('technologies');
  });

  it('puts the number first on screen and the noun first in the tree', () => {
    mount(<StoryIndicatorRail indicators={storyIndicators(detail({ stack: ['react'] }), ['hero', 'cta'])} />);
    const row = q('.cbv2-story__indicator');
    // `dt` before `dd` in source order; the stylesheet reorders visually.
    expect(row?.firstElementChild?.tagName).toBe('DT');
    expect(row?.lastElementChild?.tagName).toBe('DD');
    expect(q('.cbv2-story__indicator-count')?.textContent).toBe('1');
  });

  /**
   * MUTATION: make `sectionCount` return `count` instead of
   *   `count > 0 ? count : null`.
   * FAILS: "gives a section with nothing to count no chip at all" -> expected
   *        null for 'roadmap', got 0.
   */
  it('gives a section with nothing to count no chip at all', () => {
    const empty = detail();
    for (const key of ['roadmap', 'artifacts', 'repositories', 'contributors', 'build'] as CaseStudySectionKey[]) {
      expect({ key, count: sectionCount(empty, key) }).toEqual({ key, count: null });
    }
    expect(html(<StorySectionCount count={null} noun="items" />)).toBe('');
  });

  it('counts prose sections not at all, because that would be counting paragraphs', () => {
    // `heading` is a non-nullable string on the wire; the page falls back to its
    // own label when the publisher left it empty, which is what '' models here.
    const record = detail({
      situation: { heading: '', body: ['one', 'two', 'three'], constraints: [], goals: [] },
    });
    expect(sectionCount(record, 'situation')).toBeNull();
    expect(SECTION_COUNT_NOUNS.situation).toBeUndefined();
  });

  it('shows the digit and reads the noun, so the chip is not a bare number aloud', () => {
    mount(<StorySectionCount count={3} noun="artifacts" />);
    expect(q('[aria-hidden="true"]')?.textContent).toBe('3');
    expect(q('.cbv2-cs-sr-only')?.textContent).toBe('3 artifacts');
  });

  it('counts only what a reader can actually see in the section', () => {
    // Two withheld repositories are disclosed by their own note; counting them
    // here would promise links the list does not contain.
    const record = detail({
      repositories: [{ label: 'planner', role: 'primary', url: 'https://example.test/r', lastCommitDate: null }],
      privateRepositoryCount: 2,
      contributors: [],
      anonymousContributorCount: 4,
    });
    expect(sectionCount(record, 'repositories')).toBe(1);
    expect(sectionCount(record, 'contributors')).toBeNull();
  });
});

/* ------------------------------------------------ a control that cannot act --- */

describe('the carousel arrows go away when the track cannot move', () => {
  /**
   * jsdom lays nothing out, so both measurements are 0 - the state this
   * component treats as "unknown" rather than as "it fits".
   */
  function sizeTrack(scrollWidth: number, clientWidth: number): void {
    const track = q('[data-testid="story-carousel-track"]') as HTMLElement;
    Object.defineProperty(track, 'scrollWidth', { value: scrollWidth, configurable: true });
    Object.defineProperty(track, 'clientWidth', { value: clientWidth, configurable: true });
    act(() => { window.dispatchEvent(new Event('resize')); });
  }

  /**
   * MUTATION: change the guard in `measure()` from an early return to
   *   `setCanScroll(false)` when both measurements are 0.
   * FAILS: "keeps the controls when the browser has told it nothing" ->
   *        expected a prev arrow, got null. It also reddens all six arrow tests
   *        in `storyMedia.test.tsx`, which is why the unknown case is a return
   *        and not a decision.
   */
  it('keeps the controls when the browser has told it nothing', () => {
    mount(<StoryMediaCarousel slides={imageSlides([shot(1), shot(2)])} />);
    expect(q('[data-testid="carousel-prev"]')).not.toBeNull();
    expect(q('[data-testid="carousel-next"]')).not.toBeNull();
  });

  /**
   * MUTATION: change `track.scrollWidth > track.clientWidth + 1` to
   *   `track.scrollWidth >= 0`.
   * FAILS: "removes them once the browser says every slide already fits" ->
   *        expected null, got a button.
   */
  it('removes them once the browser says every slide already fits', () => {
    mount(<StoryMediaCarousel slides={imageSlides([shot(1), shot(2), shot(3)])} />);
    // The live measurement at 1440px: 992px of slides inside a 1232px track.
    sizeTrack(992, 1232);
    expect(q('[data-testid="carousel-prev"]')).toBeNull();
    expect(q('[data-testid="carousel-next"]')).toBeNull();
    // The pictures themselves never go anywhere. Removing a control that cannot
    // act must not remove the content it could not have acted on.
    expect(all('.cbv2-story-carousel__slide')).toHaveLength(3);
  });

  it('brings them back when the track genuinely overflows', () => {
    mount(<StoryMediaCarousel slides={imageSlides([shot(1), shot(2), shot(3)])} />);
    sizeTrack(992, 1232);
    expect(q('[data-testid="carousel-next"]')).toBeNull();
    // The live measurement at 390px: 992px of slides inside a 342px track.
    sizeTrack(992, 342);
    expect(q('[data-testid="carousel-next"]')).not.toBeNull();
  });

  it('treats a sub-pixel scroll range as no scroll range', () => {
    mount(<StoryMediaCarousel slides={imageSlides([shot(1), shot(2)])} />);
    sizeTrack(1233, 1232);
    expect(q('[data-testid="carousel-next"]')).toBeNull();
  });
});
