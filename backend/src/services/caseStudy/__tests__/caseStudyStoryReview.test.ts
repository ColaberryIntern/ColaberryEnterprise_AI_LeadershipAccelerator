import { reviewCaseStudyStory, formatStoryReview } from '../caseStudyStoryReview';
import { internalSnapshotContent } from './publicFixtures';
import type { CaseStudySnapshotContent } from '../../../types/caseStudy';

/**
 * The editorial read, as code: the defects Ali's review of the CORA pilot
 * found are each a warning with a path; a record with no consented author is
 * a valid story with a note; nothing here blocks anything.
 */

const KES = {
  displayName: 'Kes', roleTitle: 'AI Systems Architect', organization: 'Colaberry', initials: 'K',
  intro: ['Kes joined as an intern and was hired.'], progression: ['Intern', 'Hired by Colaberry', 'AI Systems Architect'],
  contribution: 'Created the project and built the recovery system.',
  skills: [{ label: 'Workflow design', evidence: 'Detect, fetch, replay.' }],
  provenance: { source: 'user_confirmed' as const, confirmedAt: '2026-09-16' },
};
const DECISIONS = [
  { key: 'a', title: 'Make missing events visible', problem: 'p', decision: 'd', evidence: 'e', consequence: 'Operators see the gap; 18 cases remain unresolved.', stage: 'Detection query', figure: '28 Apr' },
  { key: 'b', title: 'Reuse the pipeline', problem: 'p', decision: 'd', evidence: 'e', consequence: 'c', stage: 'Same-pipeline replay', figure: '0' },
  { key: 'c', title: 'Measure the result', problem: 'p', decision: 'd', evidence: 'e', consequence: 'c', stage: 'Recovery audit row', figure: '97%' },
];

function story(over: Record<string, unknown> = {}, variantOver: Record<string, unknown> = {}): CaseStudySnapshotContent {
  const content = internalSnapshotContent() as unknown as Record<string, unknown>;
  content.identity = { ...(content.identity as object), builderIdentityMode: 'named', builderNamingConsent: true };
  content.surfaceVariants = {
    training: {
      standfirst: 'A voice call could finish while the event never arrived. Kes, an intern who became an AI Systems Architect, built the recovery.',
      situation: { narrative: ['The system places outbound calls for an admissions team.', 'Hundreds of calls fired in one second.'], verification: (content.situation as { verification: unknown }).verification },
      contributors: [{ displayMode: 'named', displayName: 'Kes', role: 'AI Systems Architect', kind: 'colaberry_team', consentRecordedAt: '2026-09-16T00:35:51.715Z' }],
      builder: KES,
      decisions: DECISIONS,
      closing: 'Kes resolved 586 of 604; 18 remain unresolved.',
      ...variantOver,
    },
  };
  Object.assign(content, over);
  return content as unknown as CaseStudySnapshotContent;
}

const codes = (c: CaseStudySnapshotContent, s: 'training' | 'enterprise' | 'ai-flotation' = 'training') =>
  reviewCaseStudyStory(c, s).findings.map((f) => `${f.level}:${f.code}`);

describe('the story review', () => {
  it('finds nothing to warn about on the pilot-shaped record, and scores it', () => {
    const review = reviewCaseStudyStory(story(), 'training');
    expect(review.findings.filter((f) => f.level === 'warning')).toEqual([]);
    const score = Object.fromEntries(review.rubric.map((r) => [r.dimension, r.score]));
    expect(score.identifiable_person_or_team).toBe(2);
    expect(score.decision_progression).toBe(2);
    expect(score.honest_complication).toBe(2);
    expect(score.audience_relevance).toBe(2);
    expect(review.rubric.every((r) => r.evidence.length > 0)).toBe(true);
  });

  it('reads the canonical words on a surface without a variant and says what is missing, without blocking', () => {
    const review = reviewCaseStudyStory(story(), 'enterprise');
    const found = review.findings.map((f) => f.code);
    expect(found).toEqual(expect.arrayContaining(['story_no_builder', 'story_no_decisions', 'story_no_closing']));
    expect(review.rubric.find((r) => r.dimension === 'audience_relevance')?.score).toBe(1);
    expect(formatStoryReview(review)).toContain('WARNING story_no_builder @ builder');
  });

  it('flags bookkeeping, a dash and "n/a" with the path that carries each', () => {
    const c = story({}, {
      measurementNarrative: ['This revision adds what the first one could not.'],
      metricNotes: { stockouts: { baseline: 'n/a' } },
      closing: 'Resolved most cases — the rest remain.',
    });
    const f = reviewCaseStudyStory(c, 'training').findings;
    expect(f.find((x) => x.code === 'story_bookkeeping')?.path).toBe('measurement.narrative[0]');
    expect(f.find((x) => x.code === 'story_dash')?.path).toBe('closing');
    expect(f.find((x) => x.code === 'story_na_note')?.path).toMatch(/^(measurement\.metrics|heroMetrics)\[\d+\]\.measurement\.baseline$/);
  });

  it('warns when the situation opens on the biography or the progression is repeated outside the card', () => {
    const c = story({}, {
      situation: { narrative: ['Kes joined Colaberry as an intern and, after being hired, became an AI Systems Architect. He built this.'], verification: { source: 'human_authored', verifiedAt: '2026-09-16', verifiedBy: 'x' } },
    });
    const f = codes(c);
    expect(f).toContain('warning:story_situation_opens_on_biography');
    expect(f).toContain('warning:story_progression_repeated');
    // The standfirst may say it once, and the current role title is a role, not a repeat:
    // "what an AI Systems Architect is responsible for" in the closing is fine.
    expect(reviewCaseStudyStory(story(), 'training').findings.map((x) => x.code)).not.toContain('story_progression_repeated');
    const roleInClosing = story({}, { closing: 'This shows what an AI Systems Architect is responsible for.' });
    expect(reviewCaseStudyStory(roleInClosing, 'training').findings.map((x) => x.code)).not.toContain('story_progression_repeated');
  });

  it('treats a role-only builder as a valid story with a note, and an unpinned card as a warning, a missing figure as a note', () => {
    const c = story({}, {
      contributors: [{ displayMode: 'role_only', role: 'Builder', kind: 'colaberry_team' }],
      // The sparse-author card as the rollout ships it: an empty name, an initial for the mark.
      builder: { ...KES, displayName: '', initials: 'L', intro: [], progression: [] },
      decisions: [{ ...DECISIONS[0], stage: undefined, figure: undefined }],
    });
    const f = codes(c);
    expect(f).toContain('note:story_biography_unavailable');
    expect(f).toContain('warning:story_decision_unpinned');
    expect(f).toContain('note:story_decision_no_figure');
    expect(f).not.toContain('warning:story_no_builder');
    expect(reviewCaseStudyStory(c, 'training').rubric.find((r) => r.dimension === 'identifiable_person_or_team')?.score).toBe(1);
  });

  it('scores a demonstration honestly: no metrics and no impact wording is a 1, impact wording without a metric is a 0', () => {
    const base = story({ measurement: { narrative: ['What was shown.'], metrics: [] } });
    const demo = reviewCaseStudyStory(base, 'training').rubric.find((r) => r.dimension === 'supported_outcome');
    expect(demo?.score).toBe(1);
    expect(demo?.editorial).toBe(true);
    const puffed = story({ measurement: { narrative: ['Reduced the backlog by 40%.'], metrics: [] } });
    expect(reviewCaseStudyStory(puffed, 'training').rubric.find((r) => r.dimension === 'supported_outcome')?.score).toBe(0);
  });
});
