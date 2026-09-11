import { buildCaseStudyFoundation, computeMaturity, summarise } from '../caseStudyFoundation';
import { CASE_STUDY_MATURITIES } from '../caseStudyHypothesis';
import type { StoryEnrichmentRow } from '../storyEnrichmentLedger';
import type { UnderstandingItem } from '../../delivery/projectUnderstanding';

/**
 * Four sections that cannot be confused, and a rung that cannot be edited.
 * The tests that matter are the ones proving what a build alone can never be.
 */

const item = (over: Partial<UnderstandingItem> = {}): UnderstandingItem => ({
  dimension: 'problem',
  value: 'A tool that checks invoices against purchase orders.',
  classification: 'FACT',
  provenance: 'source_message',
  source_quote: 'A tool that checks invoices against purchase orders.',
  ...over,
});

const row = (over: Partial<StoryEnrichmentRow> = {}): StoryEnrichmentRow => ({
  storyId: 'STORY-003',
  outcome: 'merged',
  baseRevision: 1,
  mergedRevision: 2,
  sourceCommitSha: 'abc1234',
  counts: { added: 1, strengthened: 0, questions: 0, unchanged: 0, refused: 0 },
  event: {
    schemaVersion: '1', projectId: 'cce94c20-a398-45b3-a6fb-b3fc87b6b1ef', storyId: 'STORY-003',
    projectTruthBaseRevision: 1, observedAt: '2026-09-11T12:00:00.000Z', sourceCommitSha: 'abc1234',
    factProposals: [], decisions: [], limitations: [],
    demonstrationEvidence: [], measurementEvents: [],
  },
  createdAt: '2026-09-11T12:00:00.000Z',
  ...over,
});

const withDemo = (over: Partial<StoryEnrichmentRow> = {}) => row({
  ...over,
  event: { ...row().event, ...(over.event ?? {}), demonstrationEvidence: [{ kind: 'test', ref: 'invoice.match.test.ts' }] },
});

describe('the four sections stay apart', () => {
  it('puts what the student said in the hypothesis and what the build showed in buildEvidence', () => {
    const f = buildCaseStudyFoundation({
      items: [
        item(),
        item({ dimension: 'actors', value: 'Two people in accounts payable.' }),
        item({ dimension: 'integrations', value: 'Reads invoices from the Xero API.', provenance: 'repo_evidence', source_quote: 'src/xero/client.ts' }),
      ],
      truthRevision: 2,
      enrichments: [row()],
      verifiedStories: 0,
    });
    expect(f.hypothesis.beneficiary).toBe('Two people in accounts payable.');
    expect(f.buildEvidence.facts).toEqual([{
      dimension: 'integrations', label: 'What it talks to', value: 'Reads invoices from the Xero API.', evidence: 'src/xero/client.ts',
    }]);
    expect(f.buildEvidence.stories[0]).toMatchObject({ storyId: 'STORY-003', outcome: 'merged', mergedRevision: 2, added: 1 });
  });

  it('keeps demonstration references as pointers, with the story that made them', () => {
    const f = buildCaseStudyFoundation({ items: [item()], enrichments: [withDemo()], verifiedStories: 1 });
    expect(f.demonstrationEvidence).toEqual([{
      storyId: 'STORY-003', kind: 'test', ref: 'invoice.match.test.ts', note: null, reportedAt: '2026-09-11T12:00:00.000Z',
    }]);
  });

  it('drops demonstration pointers from refused or replayed events', () => {
    const f = buildCaseStudyFoundation({
      items: [item()],
      enrichments: [withDemo({ outcome: 'refused' }), withDemo({ outcome: 'replay' })],
      verifiedStories: 1,
    });
    expect(f.demonstrationEvidence).toEqual([]);
  });

  it('outcome evidence is empty by construction and says why', () => {
    const f = buildCaseStudyFoundation({
      items: [item()],
      enrichments: [row({ event: { ...row().event, measurementEvents: [{ name: 'tickets_per_run', value: 12, evidence: 'logs/run.json' }] } })],
      verifiedStories: 3,
    });
    expect(f.outcomeEvidence.items).toEqual([]);
    expect(f.outcomeEvidence.why).toMatch(/No approved measurement definitions/);
    expect(f.outcomeEvidence.heldMeasurementEvents).toBe(1);
    expect(f.limitations.join(' ')).toMatch(/1 measurement event is held unmerged/);
  });

  it('a question a story raised is not build evidence; it is counted as open', () => {
    const f = buildCaseStudyFoundation({
      items: [
        item({ dimension: 'actors', value: 'Priya.', provenance: 'client_confirmed' }),
        item({ dimension: 'actors', value: 'STORY-003 found "the dispatcher", but you confirmed "Priya.". Which is right?', classification: 'QUESTION', provenance: 'repo_evidence', source_quote: 'src/review.ts' }),
      ],
      enrichments: [], verifiedStories: 0,
    });
    expect(f.buildEvidence.facts).toEqual([]);
    expect(f.openQuestions).toBe(1);
    expect(f.limitations.join(' ')).toMatch(/1 question a story raised is still unsettled/);
  });
});

describe('maturity is computed, and the top two rungs are unreachable', () => {
  it('story_hypothesis with nothing built', () => {
    expect(computeMaturity({ verifiedStories: 0, mergedEnrichments: 0, demonstrations: 0 }).maturity).toBe('story_hypothesis');
  });

  it('build_record on a verified story, or on a merged enrichment alone', () => {
    expect(computeMaturity({ verifiedStories: 1, mergedEnrichments: 0, demonstrations: 0 }).maturity).toBe('build_record');
    expect(computeMaturity({ verifiedStories: 0, mergedEnrichments: 1, demonstrations: 0 }).maturity).toBe('build_record');
  });

  it('capability_demonstration needs a verified story AND a demonstration; a demo alone is not enough', () => {
    expect(computeMaturity({ verifiedStories: 1, mergedEnrichments: 1, demonstrations: 1 }).maturity).toBe('capability_demonstration');
    expect(computeMaturity({ verifiedStories: 0, mergedEnrichments: 1, demonstrations: 1 }).maturity).toBe('build_record');
  });

  it('never returns operational_result or impact_case_study, whatever it is given', () => {
    const big = computeMaturity({ verifiedStories: 40, mergedEnrichments: 40, demonstrations: 40 });
    expect(big.maturity).toBe('capability_demonstration');
    expect(big.nextRungNeeds).toMatch(/Not reachable from a build alone/);
    for (const m of ['operational_result', 'impact_case_study']) {
      expect(CASE_STUDY_MATURITIES).toContain(m);
      expect(big.maturity).not.toBe(m);
    }
  });

  it('says why, and what the next rung needs, in words', () => {
    const r = computeMaturity({ verifiedStories: 2, mergedEnrichments: 0, demonstrations: 0 });
    expect(r.reason).toBe('2 verified stories, no demonstration reference yet.');
    expect(r.nextRungNeeds).toMatch(/points at a demonstration/);
  });

  it('the foundation carries the ladder, its rung, and never a publishable flag set true', () => {
    const f = buildCaseStudyFoundation({ items: [item()], enrichments: [withDemo()], verifiedStories: 1 });
    expect(f.ladder).toEqual(CASE_STUDY_MATURITIES);
    expect(f.maturity).toBe('capability_demonstration');
    expect(f.publishable).toBe(false);
    expect(f.publicationPreference).toBe('undecided');
  });
});

describe('it is a projection', () => {
  it('is deterministic for the same inputs', () => {
    const input = { items: [item()], truthRevision: 3, enrichments: [withDemo()], verifiedStories: 1 };
    expect(buildCaseStudyFoundation(input)).toEqual(buildCaseStudyFoundation(input));
  });

  it('summarises to the two numbers the gate needs', () => {
    const f = buildCaseStudyFoundation({ items: [item()], enrichments: [], verifiedStories: 0 });
    expect(summarise(f)).toEqual({ maturity: 'story_hypothesis', openQuestions: 0 });
  });
});
