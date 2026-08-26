import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import StorySituation from '../StorySituation';
import StoryContextStrip from '../StoryContextStrip';
import StorySectionList from '../StorySectionList';
import { StoryFigureBand } from '../StoryFigure';
import { architectureHasContent, isSectionSupported } from '../storyDetailV2Model';
import { placeStoryFigures } from '../storyFigurePlacement';
import CaseStudyArchitecture from '../../../components/caseStudy/CaseStudyArchitecture';
import CaseStudyArtifacts from '../../../components/caseStudy/CaseStudyArtifacts';
import { normalizeDetailResponse } from '../../../services/caseStudyApi';
import {
  architecture,
  cta,
  measurement,
  metric,
  openArtifact,
} from '../../../components/caseStudy/__fixtures__/caseStudyPublicFixtures';
import type {
  CaseStudySectionKey,
  PublicCaseStudyDetail,
  PublicCaseStudySituation,
} from '../../../services/caseStudyPublicTypes';

/**
 * Story Format V1 - the behaviours added when the Enterprise surface was given
 * its locked visual grammar.
 *
 * A NEW FILE RATHER THAN A LONGER `StoryDetailV2.test.tsx`. That suite is
 * already past CLAUDE.md's 500-line ceiling and may not be grown without being
 * split first - the same reason `storyDetailV2HeroInvariant.test.ts` exists
 * beside it rather than inside it.
 *
 * EVERY ASSERTION HERE WAS SEEN RED. Seven assertions written earlier in this
 * workstream could not fail, and the one that was caught had been *verified
 * false against a genuinely lazy App.tsx* while staying green. So each block
 * below names the mutation that breaks it, and each mutation was applied,
 * watched fail, and reverted byte-exact before this file was committed.
 */

const html = (node: React.ReactElement | null): string =>
  (node === null ? '' : renderToStaticMarkup(node));

const situation = (
  overrides: Partial<PublicCaseStudySituation> = {},
): PublicCaseStudySituation => ({
  heading: 'The situation',
  body: ['Planners rebuilt the same route by hand every morning.'],
  constraints: [],
  goals: [],
  ...overrides,
});

/* There is no shared `detail` fixture in this repository - each suite builds its
   own, and this one follows `storyPresentation.test.tsx`. */
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
  situation: situation(),
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

/* A record with no images places no figures, which is the placement this suite
   wants: the tone test is about the SECTIONS, and a figure band between two of
   them would be a second source of `data-tone` in the same markup. */
const NO_FIGURES = placeStoryFigures([], []);

/* ------------------------------------------------------------- version skew --- */

describe('a server older than this bundle does not white-screen the route', () => {
  /**
   * THIS WAS FOUND IN A BROWSER, NOT REASONED ABOUT, and it is the single most
   * valuable thing the visual-acceptance step produced. Pointed at the live
   * production API - which does not yet project the three new fields - the page
   * rendered NOTHING: `StorySituation` threw on `goals.length` and `TagGroup`
   * threw on `dataStores.length`, both reading `.length` of `undefined`, and
   * React unmounted the whole tree. Every unit test was green, both type-checks
   * were clean, and the contract test passed, because the TYPE says these are
   * arrays and the type is right about the NEW server.
   *
   * THE SKEW IS PERMANENT, NOT A MIGRATION WINDOW. Frontend and backend ship as
   * separate containers, an nginx bundle can outlive a backend restart, and a
   * browser can hold a cached bundle indefinitely. "Both sides deployed
   * together" is not a property this system has.
   *
   * MUTATION: change `normalizeDetailResponse` to `return body;`, or drop the
   * call from `fetchCaseStudyDetail`.
   */
  const oldServerBody = () => ({
    surface: { key: 'enterprise' },
    caseStudy: {
      // Exactly the shape the deployed server sends today: no `constraints`, no
      // `goals`, no `dataStores`.
      situation: { heading: 'The situation', body: ['A paragraph.'] },
      architecture: {
        narrative: [], stack: ['react'], capabilities: [], integrations: [],
        diagram: null, diagramSource: null,
      },
    },
  }) as unknown as Parameters<typeof normalizeDetailResponse>[0];

  it('fills the three lists an older server omits', () => {
    const out = normalizeDetailResponse(oldServerBody());
    expect(out.caseStudy.situation?.constraints).toEqual([]);
    expect(out.caseStudy.situation?.goals).toEqual([]);
    expect(out.caseStudy.architecture?.dataStores).toEqual([]);
  });

  it('renders the situation band instead of throwing, on that exact payload', () => {
    const raw = oldServerBody().caseStudy.situation as PublicCaseStudySituation;
    // The unguarded path is the defect: prove it throws, so the guard below is
    // not passing for some other reason.
    expect(() => html(<StorySituation situation={raw} />)).toThrow();

    const fixed = normalizeDetailResponse(oldServerBody()).caseStudy.situation;
    expect(html(<StorySituation situation={fixed} />)).toContain('A paragraph.');
  });

  it('renders the architecture band instead of throwing, on that exact payload', () => {
    const fixed = normalizeDetailResponse(oldServerBody()).caseStudy.architecture!;
    expect(html(<CaseStudyArchitecture architecture={fixed} />)).toContain('react');
  });

  it('leaves a null situation and a null architecture null', () => {
    const empty = {
      surface: { key: 'enterprise' },
      caseStudy: { situation: null, architecture: null },
    } as unknown as Parameters<typeof normalizeDetailResponse>[0];
    const out = normalizeDetailResponse(empty);
    expect(out.caseStudy.situation).toBeNull();
    expect(out.caseStudy.architecture).toBeNull();
  });

  it('passes a new server payload through unchanged', () => {
    const body = {
      surface: { key: 'enterprise' },
      caseStudy: {
        situation: { heading: 'H', body: ['B'], constraints: ['C'], goals: ['G'] },
        architecture: {
          narrative: [], stack: [], capabilities: [], integrations: [],
          dataStores: ['postgres'], diagram: null, diagramSource: null,
        },
      },
    } as unknown as Parameters<typeof normalizeDetailResponse>[0];
    const out = normalizeDetailResponse(body);
    expect(out.caseStudy.situation?.constraints).toEqual(['C']);
    expect(out.caseStudy.situation?.goals).toEqual(['G']);
    expect(out.caseStudy.architecture?.dataStores).toEqual(['postgres']);
  });

  it('drops a non-string entry rather than handing it to a renderer', () => {
    const body = {
      surface: { key: 'enterprise' },
      caseStudy: {
        situation: { heading: 'H', body: ['B'], constraints: [1, 'C', null], goals: 'nope' },
        architecture: null,
      },
    } as unknown as Parameters<typeof normalizeDetailResponse>[0];
    const out = normalizeDetailResponse(body);
    expect(out.caseStudy.situation?.constraints).toEqual(['C']);
    expect(out.caseStudy.situation?.goals).toEqual([]);
  });
});

/* ------------------------------------------- the two invisible situation lists --- */

describe('situation.constraints and .goals reach the page at all', () => {
  /**
   * THE DEFECT THIS CLOSES. Both fields have been on the snapshot type since it
   * was written, are populated by the sync pipeline, and are walked by the
   * publish gate's claim scan - so a sentence in either can BLOCK a record from
   * publishing. Neither was ever projected, so no reader could see them. These
   * assertions are the proof that a constraint which can veto publication can
   * now also be read.
   *
   * MUTATION: delete `constraints: lines(s.constraints)` from `projectSituation`
   * in `backend/src/services/caseStudy/caseStudyPublicSections.ts`, or delete
   * the `<QualifierList ... items={constraints} />` line in `StorySituation.tsx`.
   */
  it('renders both lists, each under its own heading', () => {
    const markup = html(<StorySituation situation={situation({
      goals: ['Cut the morning replan to under ten minutes.'],
      constraints: ['No change to the warehouse management system.'],
    })} />);
    expect(markup).toContain('What the work was for');
    expect(markup).toContain('Cut the morning replan to under ten minutes.');
    expect(markup).toContain('What it had to work within');
    expect(markup).toContain('No change to the warehouse management system.');
  });

  it('renders the aim before the boundary', () => {
    // Order is a decision, not an accident: read the other way round a reader
    // meets a limitation before they know what it limited.
    const markup = html(<StorySituation situation={situation({
      goals: ['GOAL-TEXT'],
      constraints: ['CONSTRAINT-TEXT'],
    })} />);
    expect(markup.indexOf('GOAL-TEXT')).toBeLessThan(markup.indexOf('CONSTRAINT-TEXT'));
    // Non-vacuity: both are actually present, so this is not passing on -1 < -1.
    expect(markup.indexOf('GOAL-TEXT')).toBeGreaterThan(-1);
  });

  it('hides each list independently when it is empty', () => {
    const goalsOnly = html(<StorySituation situation={situation({ goals: ['G'] })} />);
    expect(goalsOnly).toContain('What the work was for');
    expect(goalsOnly).not.toContain('What it had to work within');

    const constraintsOnly = html(<StorySituation situation={situation({ constraints: ['C'] })} />);
    expect(constraintsOnly).not.toContain('What the work was for');
    expect(constraintsOnly).toContain('What it had to work within');
  });

  it('renders no qualifier block at all when both are empty', () => {
    const markup = html(<StorySituation situation={situation()} />);
    expect(markup).not.toContain('story-situation-qualifiers');
    // ...but the narrative is still there, so the band did not vanish with them.
    expect(markup).toContain('Planners rebuilt the same route by hand every morning.');
  });

  /**
   * THE GUARD THAT MUST NOT BE WIDENED. A band headed "The situation" whose only
   * content is a bullet list of goals is not a situation. `isSectionSupported`
   * asks about the NARRATIVE, and adding `|| constraints.length` to it would be
   * the easy change and the wrong one.
   *
   * MUTATION: change the `situation` branch of `isSectionSupported` to
   * `!!detail.situation && (detail.situation.body.length > 0
   *   || detail.situation.goals.length > 0)`.
   */
  it('does not let goals or constraints rescue a band with no narrative', () => {
    const record = {
      ...detail(),
      situation: situation({ body: [], goals: ['G'], constraints: ['C'] }),
    };
    expect(isSectionSupported(record, 'situation')).toBe(false);
    // Non-vacuity: with a narrative the same record IS supported, so this is not
    // passing because the predicate returns false for everything.
    expect(isSectionSupported({ ...detail(), situation: situation() }, 'situation')).toBe(true);
  });

  it('carries no markup out of the prose arrays', () => {
    // Prose is `readonly string[]` and the renderer decides markup. A band that
    // needs structure needs a typed field, not markup smuggled in a string.
    const markup = html(<StorySituation situation={situation({
      goals: ['<img src=x onerror="alert(1)">'],
    })} />);
    expect(markup).not.toContain('<img src=x');
    expect(markup).toContain('&lt;img');
  });
});

/* ------------------------------------------------------- architecture.dataStores --- */

describe('architecture.dataStores reaches the page at all', () => {
  /**
   * Same class of defect as the two above: assembled from repository evidence,
   * counted by the snapshot's own emptiness check, and with no public shape to
   * arrive in - so a record could be judged to HAVE an architecture on their
   * strength and then render without them.
   *
   * MUTATION: delete the `<TagGroup title="Data stores" ... />` line in
   * `CaseStudyArchitecture.tsx`.
   */
  it('renders the data stores it was given', () => {
    const markup = html(
      <CaseStudyArchitecture architecture={architecture({ dataStores: ['PostgreSQL', 'Chroma'] })} />,
    );
    expect(markup).toContain('Data stores');
    expect(markup).toContain('PostgreSQL');
    expect(markup).toContain('Chroma');
  });

  it('renders no data-store group when the list is empty', () => {
    expect(html(<CaseStudyArchitecture architecture={architecture({ dataStores: [] })} />))
      .not.toContain('Data stores');
  });

  /**
   * THE THREE GUARDS MUST AGREE. The snapshot builder counts `dataStores` when
   * deciding whether an architecture section exists; so must the projector, so
   * must `architectureHasContent`, and so must the component's own `empty`
   * check. If any one of them disagrees the field survives one layer and
   * vanishes at the next, which is the exact bug being fixed.
   *
   * MUTATION: remove `|| architecture.dataStores.length > 0` from
   * `architectureHasContent`, or `&& architecture.dataStores.length === 0` from
   * `CaseStudyArchitecture`'s `empty`.
   */
  it('treats a record with only data stores as having an architecture, at every layer', () => {
    const only = architecture({
      narrative: [], stack: [], capabilities: [], integrations: [],
      dataStores: ['PostgreSQL'], diagram: null, diagramSource: null,
    });
    expect(architectureHasContent(only)).toBe(true);
    expect(isSectionSupported({ ...detail(), architecture: only }, 'architecture')).toBe(true);
    expect(html(<CaseStudyArchitecture architecture={only} />)).toContain('PostgreSQL');

    // Non-vacuity: with the data stores removed the same record is hidden at all
    // three layers, so none of the above is passing unconditionally.
    const none = architecture({ ...only, dataStores: [] });
    expect(architectureHasContent(none)).toBe(false);
    expect(isSectionSupported({ ...detail(), architecture: none }, 'architecture')).toBe(false);
    expect(html(<CaseStudyArchitecture architecture={none} />)).toBe('');
  });
});

/* ------------------------------------------------------------- the context strip --- */

describe('the hero gave up its second half', () => {
  /**
   * MUTATION: change the guard in `StoryContextStrip` to `if (false)`, or drop
   * `<StoryContextStrip .../>` from `StoryDetailV2.tsx`.
   */
  it('renders the counts, the facts and the figures it was given', () => {
    const markup = html(
      <StoryContextStrip
        indicators={[{ key: 'sections', label: 'sections', count: 7 }]}
        facts={[{ term: 'Organization', value: 'Colaberry' }]}
        metrics={[metric()]}
      />,
    );
    expect(markup).toContain('Organization');
    expect(markup).toContain('Colaberry');
    expect(markup).toContain('sections');
  });

  it('renders nothing at all when the record has none of the three', () => {
    expect(html(<StoryContextStrip indicators={[]} facts={[]} metrics={[]} />)).toBe('');
  });

  /**
   * IT MUST NOT BECOME AN ELEVENTH SECTION. `CaseStudySectionKey` is a closed
   * union of ten, and the render suite reads the section order straight off
   * `[data-section]`. A strip carrying that attribute would be counted as a
   * section by every test that walks the list.
   *
   * MUTATION: add `data-section="hero"` to the `<section>` in
   * `StoryContextStrip.tsx`.
   */
  it('carries no data-section attribute', () => {
    const markup = html(
      <StoryContextStrip indicators={[]} facts={[{ term: 'T', value: 'V' }]} metrics={[]} />,
    );
    expect(markup).toContain('story-context');
    expect(markup).not.toContain('data-section');
  });
});

/* --------------------------------------------------------------- the tone grammar --- */

describe('the tone alternation', () => {
  const SECTIONS: readonly CaseStudySectionKey[] = [
    'situation', 'build', 'architecture', 'measurement', 'roadmap',
    'artifacts', 'repositories',
  ];

  const rendered = (): string => html(
    <StorySectionList
      record={detail({ artifacts: [openArtifact()], roadmap: [] })}
      sections={SECTIONS}
      figures={NO_FIGURES}
    />,
  );

  /**
   * `STORY_FORMAT_V1.md` section 5: every VISUAL band sits on sunken ground and
   * every PROSE band on default ground, so a reader learns in two screens that a
   * change of ground means a change of medium.
   *
   * MUTATION: add `'measurement'` to `SUNKEN_SECTIONS` in `StorySectionList.tsx`,
   * or empty the set entirely.
   */
  it('puts the artifacts band on sunken ground and the prose bands on default', () => {
    const markup = rendered();
    const tones = [...markup.matchAll(/data-section="([a-z]+)" data-tone="([a-z]+)"/g)]
      .map(([, key, tone]) => `${key}:${tone}`);
    expect(tones).toEqual([
      'situation:default',
      'build:default',
      'architecture:default',
      'measurement:default',
      'roadmap:default',
      'artifacts:sunken',
      'repositories:default',
    ]);
  });

  /**
   * A figure band is visual by definition, so it carries tone unconditionally
   * rather than by a prop - a prop would only offer a way to break the grammar.
   *
   * MUTATION: remove `cbv2-story__section--sunken` from the band's className in
   * `StoryFigure.tsx`.
   */
  it('always puts a figure band on sunken ground', () => {
    const markup = html(<StoryFigureBand figures={[{
      href: 'https://example.com/a.png',
      imageUrl: 'https://example.com/a.png',
      title: 'A screenshot',
      artifactType: 'screenshot',
      presentation: 'evidence',
    }]} />);
    expect(markup).toContain('cbv2-story__section--sunken');
    expect(markup).toContain('data-tone="sunken"');
  });

  it('still renders no band when there is no figure to put on it', () => {
    expect(html(<StoryFigureBand figures={[]} />)).toBe('');
  });
});

/* ------------------------------------------------------ the artifacts heading level --- */

describe('the artifacts band no longer skips a heading level', () => {
  /**
   * A RECORDED DEFECT, NOW CLOSED. Section headings on this page are `h2` and
   * this component printed a fixed `h4`, so the band skipped `h3` for anyone
   * navigating by heading. It was documented rather than hidden because the
   * component belonged to a closed set another task owned; `headingLevel` is a
   * prop, so the set is still exactly ten files.
   *
   * MUTATION: change `headingLevel={3}` back to nothing at the call site in
   * `storyDetailV2Sections.tsx`, or hardcode `h4` in the component again.
   */
  it('renders the level it is asked for', () => {
    const artifacts = [openArtifact({ title: 'The learner command centre' })];
    expect(html(<CaseStudyArtifacts artifacts={artifacts} requestHref="/lab" headingLevel={3} />))
      .toContain('<h3 class="cbv2-cs-artifact__title">The learner command centre</h3>');
  });

  it('still defaults to h4, so no other caller changed', () => {
    const artifacts = [openArtifact({ title: 'A deck' })];
    expect(html(<CaseStudyArtifacts artifacts={artifacts} requestHref="/lab" />))
      .toContain('<h4 class="cbv2-cs-artifact__title">A deck</h4>');
  });
});
