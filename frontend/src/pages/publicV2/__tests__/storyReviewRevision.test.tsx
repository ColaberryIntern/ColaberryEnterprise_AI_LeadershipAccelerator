import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

/**
 * The four page rules that came out of the first review of a live record
 * under this format ("a shipped capability presented as though it were a
 * measured result"). Each one is a behaviour a reader saw go wrong, not a
 * wording preference, so each has a test that fails without the rule.
 *
 * WHY A NEW FILE. `storyPresentation.test.tsx` is past CLAUDE.md's 500-line
 * ceiling and, like `StoryDetailV2.test.tsx`, is not to be grown.
 */

jest.mock('../../../components/visuals/MermaidDiagram', () => ({
  __esModule: true,
  default: () => <div data-testid="mermaid-mock" />,
}));

/* eslint-disable import/first */
import { StoryDetailArticle } from '../StoryDetailArticle';
import StoryContextStrip from '../StoryContextStrip';
import { StorySectionBody } from '../storyDetailV2Sections';
import { heroFacts } from '../storyDetailV2Model';
import { sectionCountNoun, storyIndicators } from '../storyIndicatorModel';
import { CAPABILITY_DEMONSTRATION, evidenceMaturity } from '../storyMaturityModel';
import {
  architecture,
  cta,
  measurement,
  metric,
  screenshotArtifact,
} from '../../../components/caseStudy/__fixtures__/caseStudyPublicFixtures';
import type {
  PublicCaseStudyDetail,
  PublicSurfaceView,
} from '../../../services/caseStudyPublicTypes';
/* eslint-enable import/first */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
});

const q = (selector: string): HTMLElement | null =>
  (container?.querySelector(selector) as HTMLElement | null) ?? null;
const all = (selector: string): HTMLElement[] =>
  Array.from(container?.querySelectorAll(selector) ?? []) as HTMLElement[];

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
  walkthroughVideo: null,
  visualStory: null,
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

const surface: PublicSurfaceView = {
  key: 'enterprise',
  brandLabel: 'Enterprise',
  hero: { eyebrow: 'Enterprise · shipped work', title: 'Shipped work', lede: '' },
  cta: { label: 'Map an opportunity', href: '/map' },
  sectionOrder: [],
  hiddenSections: [],
  requiredSections: [],
  emphasis: 'business',
  defaultSort: 'recent',
} as unknown as PublicSurfaceView;

const video = {
  url: 'https://example.test/walkthrough.mp4',
  title: 'How it works',
  captionsUrl: null,
  posterUrl: 'https://example.test/poster.jpg',
  durationSeconds: 88,
  narrationSource: 'synthetic',
  embedUrl: null,
  provider: null,
  watchUrl: null,
};

/* ------------------------------------------------------ evidence maturity --- */

describe('a shipped record with no measured result says so at the top', () => {
  /**
   * MUTATION: return `CAPABILITY_DEMONSTRATION` unconditionally from
   *   `evidenceMaturity`. FAILS: "stays silent beside a headline figure".
   * MUTATION: drop the `productionStatus` clause. FAILS: "stays silent when
   *   the software is not verified shipped".
   */
  it('labels a shipped record with an empty hero a capability demonstration', () => {
    expect(evidenceMaturity(detail({ heroMetrics: [], productionStatus: 'shipped' })))
      .toBe(CAPABILITY_DEMONSTRATION);
  });

  it('stays silent beside a headline figure', () => {
    expect(evidenceMaturity(detail({ heroMetrics: [metric()], productionStatus: 'shipped' })))
      .toBeNull();
  });

  it('stays silent when the software is not verified shipped', () => {
    expect(evidenceMaturity(detail({ heroMetrics: [], productionStatus: null }))).toBeNull();
    expect(evidenceMaturity(detail({ heroMetrics: [], productionStatus: 'in_progress' }))).toBeNull();
  });

  it('puts the label in the facts grid beside the status', () => {
    const facts = heroFacts(detail({ heroMetrics: [], productionStatus: 'shipped' }));
    const terms = facts.map((f) => f.term);
    expect(terms.indexOf('Evidence')).toBe(terms.indexOf('Status') + 1);
    expect(facts.find((f) => f.term === 'Evidence')?.value).toBe('Capability demonstration');
    // Non-vacuity: with a figure, no such fact.
    expect(heroFacts(detail({ productionStatus: 'shipped' })).map((f) => f.term))
      .not.toContain('Evidence');
  });

  /**
   * MUTATION: remove the `metrics.length === 0` guard in `StoryContextStrip`.
   *   FAILS: "never renders the statement beside a figure".
   */
  it('renders the statement in the headline slot, and never beside a figure', () => {
    mount(
      <StoryContextStrip indicators={[]} facts={[]} metrics={[]} maturity={CAPABILITY_DEMONSTRATION} />,
    );
    expect(q('[data-testid="story-maturity"]')?.textContent).toContain('Capability demonstration');
    expect(q('[data-testid="story-maturity"]')?.textContent).toContain('not yet measured');
    act(() => root!.unmount());
    root = null;
    mount(
      <StoryContextStrip
        indicators={[]}
        facts={[]}
        metrics={[metric()]}
        maturity={CAPABILITY_DEMONSTRATION}
      />,
    );
    expect(q('[data-testid="story-maturity"]')).toBeNull();
  });
});

/* -------------------------------------------------------- what is counted --- */

describe('the counts name what they count', () => {
  it('counts pictures as visual artifacts, not as the evidence', () => {
    const record = detail({ artifacts: [screenshotArtifact(), screenshotArtifact({ url: 'https://example.test/b.png' })] });
    const evidence = storyIndicators(record, ['hero', 'cta']).find((i) => i.key === 'evidence');
    expect(evidence?.label).toBe('visual artifacts');
  });

  it('calls roadmap entries decisions, since shipped and not-pursued items are among them', () => {
    const record = detail({
      roadmap: [
        { title: 'Shipped it', status: 'shipped', summary: null },
        { title: 'Did not', status: 'not_pursued', summary: null },
      ] as unknown as PublicCaseStudyDetail['roadmap'],
    });
    expect(storyIndicators(record, ['hero', 'cta']).find((i) => i.key === 'roadmap')?.label)
      .toBe('roadmap decisions');
  });

  /**
   * MUTATION: return `SECTION_COUNT_NOUNS[key]` for every key in
   *   `sectionCountNoun`. FAILS: "does not call a role-only contributor named".
   */
  it('does not call a role-only contributor named', () => {
    const roleOnly = detail({
      contributors: [{ displayMode: 'role_only', role: 'Automation architect', kind: 'colaberry_team' }],
    });
    expect(sectionCountNoun(roleOnly, 'contributors')).toBe('contributor roles');
    const named = detail({
      contributors: [{ displayMode: 'named', displayName: 'A. Person', role: 'Builder', kind: 'learner' }],
    });
    expect(sectionCountNoun(named, 'contributors')).toBe('named contributors');
    // Every other key keeps its static noun.
    expect(sectionCountNoun(roleOnly, 'build')).toBe('milestones');
  });
});

/* --------------------------------------------------- the architecture band --- */

describe('the drawing leads and the inventory folds', () => {
  const drawn = architecture({ diagramSource: 'flowchart TD\n  a --> b' });

  /**
   * MUTATION: render `CaseStudyArchitecture` unconditionally in the
   *   `architecture` case. FAILS: "folds the inventory under a disclosure when
   *   a diagram exists" (no details element).
   */
  it('folds the inventory under a disclosure when a diagram exists', () => {
    mount(<StorySectionBody sectionKey="architecture" record={detail({ architecture: drawn })} placedHrefs={[]} />);
    const proof = q('[data-testid="story-technical-proof"]');
    expect(proof?.tagName).toBe('DETAILS');
    expect(proof?.querySelector('summary')?.textContent).toBe('View technical proof');
    // Still in the document: the lists are folded, not removed.
    expect(proof?.querySelector('.cbv2-cs-tags')).not.toBeNull();
    // The diagram precedes the disclosure.
    const order = all('[data-testid="mermaid-mock"], [data-testid="story-technical-proof"]').map((el) => el.tagName);
    expect(order).toEqual(['DIV', 'DETAILS']);
  });

  it('keeps the lists open when there is nothing drawn', () => {
    mount(<StorySectionBody sectionKey="architecture" record={detail({ architecture: architecture() })} placedHrefs={[]} />);
    expect(q('[data-testid="story-technical-proof"]')).toBeNull();
    expect(q('.cbv2-cs-tags')).not.toBeNull();
  });
});

/* ------------------------------------------------------- the cover's place --- */

describe('the cover opens the body when the masthead shows the player instead', () => {
  const coverUrl = 'https://example.test/cover.png';
  const cover = screenshotArtifact({ title: 'The panel', url: coverUrl });
  const other = screenshotArtifact({ title: 'The cards', url: 'https://example.test/cards.png' });
  const base = {
    heroImageUrl: coverUrl,
    artifacts: [cover, other],
    situation: { heading: null, body: ['One paragraph.'], constraints: [], goals: [] },
    timeline: [{ date: '2026-04-27', title: 'Started', summary: null, source: 'repo' }],
  } as unknown as Partial<PublicCaseStudyDetail>;

  /**
   * MUTATION: pass `cover?.src ?? null` unconditionally in `StoryDetailArticle`.
   *   FAILS: "places the cover inline when a walkthrough with a poster holds
   *   the masthead" (the cover only appears in the artifacts band).
   */
  it('places the cover inline when a walkthrough with a poster holds the masthead', () => {
    mount(
      <MemoryRouter>
        <StoryDetailArticle record={detail({ ...base, walkthroughVideo: video })} surface={surface} />
      </MemoryRouter>,
    );
    expect(q('.cbv2-story__cover img')).toBeNull();
    // The figure's <img> carries the preview thumbnail, so identify the figure
    // by the caption it prints from the artifact's title.
    const inline = all('.cbv2-story-figure').map((fig) => fig.textContent ?? '');
    expect(inline.some((text) => text.includes('The panel'))).toBe(true);
    expect(inline).toHaveLength(2);
  });

  it('still keeps the cover out of the body when the masthead drew it', () => {
    mount(
      <MemoryRouter>
        <StoryDetailArticle record={detail(base)} surface={surface} />
      </MemoryRouter>,
    );
    expect(q('.cbv2-story__cover img')?.getAttribute('src')).toBe(coverUrl);
    const inline = all('.cbv2-story-figure').map((fig) => fig.textContent ?? '');
    expect(inline.some((text) => text.includes('The panel'))).toBe(false);
    expect(inline).toHaveLength(1);
  });
});
