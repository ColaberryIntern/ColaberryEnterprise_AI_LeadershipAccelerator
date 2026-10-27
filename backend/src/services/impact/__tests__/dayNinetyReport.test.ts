jest.mock('../dayNinetyReportService', () => ({
  resolvePopulation: jest.fn(),
  readEnrollmentAnchors: jest.fn(),
  readEvidenceTallies: jest.fn(),
  readVerifiedCommits: jest.fn(),
  readAssessments: jest.fn(),
  readSkillStandings: jest.fn(),
  readSponsorStanding: jest.fn(),
  readIntakeClaims: jest.fn(),
}));

import {
  assertGapsAreStatedNotHidden,
  assertNoClaimWithoutASource,
  buildDayNinetyReport,
  type DayNinetyReport,
} from '../dayNinetyReport';
import * as svc from '../dayNinetyReportService';

/**
 * C8.12 report assembly.
 *
 * The report is a customer document, so the tests are written against the sentences it
 * must refuse to produce: a fabricated improvement off a zero baseline, a quiz reported
 * as failed when it was never graded, a commit presented as checkable when nobody can
 * open it, and an empty population presented as a clean bill of health.
 */

const SHA = 'abc1234567890abcdef1234567890abcdef12345';
const E1 = '11111111-1111-4111-8111-111111111111';
const mocked = svc as jest.Mocked<typeof svc>;

function setup(over: {
  ids?: string[]; note?: string; tallies?: any[]; commits?: any[];
  assessments?: any[]; standings?: any[]; sponsor?: any; anchors?: any[]; claims?: any[];
} = {}) {
  mocked.readIntakeClaims.mockResolvedValue(over.claims ?? []);
  mocked.resolvePopulation.mockResolvedValue({
    enrollmentIds: over.ids ?? [E1],
    note: over.note ?? 'test population',
  });
  mocked.readEnrollmentAnchors.mockResolvedValue(
    over.anchors ?? [{ enrollmentId: E1, enrolledAt: '2026-07-01T00:00:00.000Z' }]);
  mocked.readEvidenceTallies.mockResolvedValue(over.tallies ?? []);
  mocked.readVerifiedCommits.mockResolvedValue(over.commits ?? []);
  mocked.readAssessments.mockResolvedValue(over.assessments ?? []);
  mocked.readSkillStandings.mockResolvedValue(over.standings ?? []);
  mocked.readSponsorStanding.mockResolvedValue(over.sponsor ?? null);
}

const tally = (over: Partial<svc.EvidenceTally> = {}): svc.EvidenceTally => ({
  enrollmentId: E1,
  sourceType: 'deliverable',
  records: 3,
  firstAt: '2026-07-01T00:00:00.000Z',
  lastAt: '2026-10-01T00:00:00.000Z',
  observationDays: 5,
  ...over,
});

const commit = (over: Partial<svc.VerifiedCommit> = {}): svc.VerifiedCommit => ({
  enrollmentId: E1,
  projectId: 'p1',
  taskTitle: 'Ship the ingest worker',
  storyId: 'STORY-004',
  verifiedRef: SHA,
  verifiedBy: 'build_pipeline:repo_verification',
  verifiedAt: '2026-09-01T00:00:00.000Z',
  repoUrl: 'https://github.com/acme/widget',
  ...over,
});

beforeEach(() => jest.clearAllMocks());

const claim = (over: Partial<svc.IntakeClaim> = {}): svc.IntakeClaim => ({
  enrollmentId: E1,
  skillId: 'a',
  resumeVersion: 1,
  creditWeight: 8.64,
  evidenceKind: 'job_bullet',
  claimedAt: '2026-08-03T00:00:00.000Z',
  ...over,
});

describe('baseline refusal', () => {
  it('ignores a non-zero placement score entirely, however tempting it looks', async () => {
    // This is the test that stops the report lying. A placement score of 42 with a
    // proficiency of 60 would read as a tidy improvement and would be fiction.
    setup({
      tallies: [tally({ observationDays: 9 })],
      standings: [{ enrollmentId: E1, skillId: 's1', placementScore: 42, proficiency: 60,
        evidenceCount: 9, lastEvidenceAt: null }],
    });
    const r = await buildDayNinetyReport({ kind: 'cohort', cohortId: 'c1' });
    expect(r.learners[0].movement.state).toBe('no_baseline');
    expect(r.learners[0].movement.from).toBeNull();
    expect(r.summary.learnersWithMeasuredMovement).toBe(0);
  });

  it('records the gap when nothing at all is available as a starting point', async () => {
    setup({ tallies: [tally()] });
    const l = (await buildDayNinetyReport({ kind: 'cohort', cohortId: 'c1' })).learners[0];
    expect(l.movement.state).toBe('no_baseline');
    expect(l.gaps.join(' ')).toContain('nothing in the platform measured this learner at intake');
  });

  it('uses the earliest resume claim, and labels it a claim rather than a measurement', async () => {
    setup({ tallies: [tally({ observationDays: 6 })], claims: [claim()],
      standings: [{ enrollmentId: E1, skillId: 's1', placementScore: 0, proficiency: 20,
        evidenceCount: 9, lastEvidenceAt: null }] });
    const r = await buildDayNinetyReport({ kind: 'cohort', cohortId: 'c1' });
    expect(r.learners[0].movement).toMatchObject({
      state: 'claim_to_evidence', from: 8.64, to: 20, isLikeForLike: false,
    });
    expect(r.summary.learnersWithMeasuredMovement).toBe(0);
    expect(r.summary.learnersWithClaimToEvidence).toBe(1);
    expect(r.learners[0].gaps.join(' ')).toContain('not an improvement figure');
  });

  it('says so when the earliest surviving claim is not the first resume version', async () => {
    // Production: three enrollments whose version-1 upload produced no usable claims, so
    // their earliest surviving row is version 2 and was not recorded at intake.
    setup({ tallies: [tally({ observationDays: 4 })], claims: [claim({ resumeVersion: 2 })] });
    const l = (await buildDayNinetyReport({ kind: 'cohort', cohortId: 'c1' })).learners[0];
    expect(l.earliestClaimVersion).toBe(2);
    expect(l.gaps.join(' ')).toContain('resume version 2');
  });

  it('takes the highest claim, never a mean dragged down by unclaimed skills', async () => {
    setup({
      tallies: [tally({ observationDays: 3 })],
      claims: [claim({ skillId: 'a', creditWeight: 0 }), claim({ skillId: 'b', creditWeight: 16.2 }),
        claim({ skillId: 'c', creditWeight: 8.64 })],
    });
    const r = await buildDayNinetyReport({ kind: 'cohort', cohortId: 'c1' });
    expect(r.learners[0].movement.from).toBe(16.2);
  });

  it('refuses any comparison from a single observation day', async () => {
    setup({ tallies: [tally({ observationDays: 1 })], claims: [claim()] });
    const r = await buildDayNinetyReport({ kind: 'cohort', cohortId: 'c1' });
    expect(r.learners[0].movement.state).toBe('single_observation');
    expect(r.learners[0].gaps.join(' ')).toContain('single observation date');
  });

  it('states at report level that measured movement is impossible, not merely absent', async () => {
    setup({ tallies: [tally({ observationDays: 6 })], claims: [claim()] });
    const r = await buildDayNinetyReport({ kind: 'cohort', cohortId: 'c1' });
    expect(r.gaps.join(' ')).toContain('needs an intake instrument, not a report change');
  });
});

describe('commit claims', () => {
  it('produces an openable url when the project carries a repository', async () => {
    setup({ commits: [commit()] });
    const r = await buildDayNinetyReport({ kind: 'cohort', cohortId: 'c1' });
    const claim = r.learners[0].claims[0];
    expect(claim.openableUrl).toBe(`https://github.com/acme/widget/commit/${SHA}`);
    expect(claim.whyNotOpenable).toBeNull();
    expect(r.summary.openableClaims).toBe(1);
  });

  it('still reports the commit when no repository was recorded, and says why', async () => {
    setup({ commits: [commit({ repoUrl: null })] });
    const r = await buildDayNinetyReport({ kind: 'cohort', cohortId: 'c1' });
    const claim = r.learners[0].claims[0];
    expect(claim.openableUrl).toBeNull();
    expect(claim.whyNotOpenable).toContain('no repository');
    // Dropping it would shrink the learner's evidence to only the flattering parts.
    expect(r.learners[0].verifiedCommits).toBe(1);
    expect(r.summary.openableClaims).toBe(0);
  });

  it('passes a link-shaped reference through as the artifact itself', async () => {
    setup({ commits: [commit({ verifiedRef: 'https://drive.google.com/file/d/x/view',
      verifiedBy: 'demo_evidence' })] });
    const r = await buildDayNinetyReport({ kind: 'cohort', cohortId: 'c1' });
    expect(r.learners[0].claims[0]).toMatchObject({
      sourceType: 'submitted_artifact',
      openableUrl: 'https://drive.google.com/file/d/x/view',
    });
  });

  it('does not double count the duplicate github_commit evidence rows', async () => {
    // The same work is recorded in both student_tasks and evidence_records.
    setup({
      commits: [commit()],
      tallies: [tally({ sourceType: 'github_commit', records: 20 }), tally({ records: 3 })],
    });
    const r = await buildDayNinetyReport({ kind: 'cohort', cohortId: 'c1' });
    expect(r.learners[0].claims).toHaveLength(2); // one commit + one deliverable tally
    expect(r.learners[0].claims.some((c) => c.statement.includes('20'))).toBe(false);
  });

  it('ignores an evidence source type it does not have a class for', async () => {
    setup({ tallies: [tally({ sourceType: 'self_reported', records: 99 })] });
    const r = await buildDayNinetyReport({ kind: 'cohort', cohortId: 'c1' });
    expect(r.learners[0].claims).toHaveLength(0);
  });
});

describe('assessments', () => {
  it('reports an ungraded quiz as ungraded and records the gap', async () => {
    setup({
      tallies: [tally()],
      assessments: [{ enrollmentId: E1, kind: 'quiz', attempts: 4, graded: 0,
        meanScore: 0.835, threshold: null, lastAt: null }],
    });
    const r = await buildDayNinetyReport({ kind: 'cohort', cohortId: 'c1' });
    expect(r.learners[0].assessments[0].reading.state).toBe('not_graded');
    expect(r.learners[0].gaps.join(' ')).toContain('no pass threshold');
  });

  it('reports a graded evaluation normally and adds no gap for it', async () => {
    setup({
      tallies: [tally()],
      assessments: [{ enrollmentId: E1, kind: 'evaluation', attempts: 3, graded: 3,
        meanScore: 0.87, threshold: 0.7, lastAt: null }],
    });
    const r = await buildDayNinetyReport({ kind: 'cohort', cohortId: 'c1' });
    expect(r.learners[0].assessments[0].reading.state).toBe('passed');
    expect(r.learners[0].gaps.join(' ')).not.toContain('pass threshold');
  });
});

describe('scale comparability', () => {
  it('flags a learner whose proficiencies span two scales', async () => {
    setup({
      tallies: [tally()],
      standings: [
        { enrollmentId: E1, skillId: 'a', placementScore: 0, proficiency: 0.5, evidenceCount: 1, lastEvidenceAt: null },
        { enrollmentId: E1, skillId: 'b', placementScore: 0, proficiency: 60, evidenceCount: 1, lastEvidenceAt: null },
      ],
    });
    const r = await buildDayNinetyReport({ kind: 'cohort', cohortId: 'c1' });
    expect(r.learners[0].gaps.join(' ')).toContain('incompatible scales');
  });
});

describe('the day-90 window', () => {
  it('marks a learner short of 90 days as in-flight, not finished', async () => {
    setup({ tallies: [tally({ firstAt: '2026-08-01T00:00:00.000Z', lastAt: '2026-10-01T00:00:00.000Z' })] });
    const r = await buildDayNinetyReport({ kind: 'cohort', cohortId: 'c1' });
    expect(r.learners[0].reachedDayNinety).toBe(false);
    expect(r.learners[0].daysObserved).toBe(61);
    expect(r.gaps.join(' ')).toContain('in-flight report');
  });

  it('boundary: exactly 90 observed days counts as reached', async () => {
    setup({ tallies: [tally({ firstAt: '2026-07-01T00:00:00.000Z', lastAt: '2026-09-29T00:00:00.000Z' })] });
    const r = await buildDayNinetyReport({ kind: 'cohort', cohortId: 'c1' });
    expect(r.learners[0].daysObserved).toBe(90);
    expect(r.learners[0].reachedDayNinety).toBe(true);
    expect(r.summary.learnersPastDayNinety).toBe(1);
  });

  it('calls the anchor an enrollment date and never day one', async () => {
    setup({ tallies: [tally()] });
    const r = await buildDayNinetyReport({ kind: 'cohort', cohortId: 'c1' });
    expect(r.learners[0].enrolledAt).toBe('2026-07-01T00:00:00.000Z');
  });
});

describe('an empty population', () => {
  it('explains a sponsor with no assigned seats instead of returning a clean report', async () => {
    setup({
      ids: [],
      note: 'seats actually minted',
      sponsor: { sponsorId: 's1', companyName: 'Northwind Trading Co.', seatsPurchased: 25,
        seatsMinted: 0, seatsAssigned: 0, hasPortalToken: false },
    });
    const r = await buildDayNinetyReport({ kind: 'sponsor', sponsorId: 's1' });
    expect(r.learners).toHaveLength(0);
    expect(r.gaps[0]).toContain('no participants');
    expect(r.gaps[0]).toContain('25 seats were purchased and 0');
    expect(r.summary.learnersInPopulation).toBe(0);
  });

  it('explains an empty cohort too', async () => {
    setup({ ids: [], note: 'cohort_memberships for this cohort' });
    const r = await buildDayNinetyReport({ kind: 'cohort', cohortId: 'c1' });
    expect(r.gaps[0]).toContain('No learners resolved');
  });

  it('reads the sponsor population from minted seats, not the purchased count', async () => {
    setup({ ids: [], sponsor: { sponsorId: 's1', companyName: 'X', seatsPurchased: 25,
      seatsMinted: 0, seatsAssigned: 0, hasPortalToken: false } });
    await buildDayNinetyReport({ kind: 'sponsor', sponsorId: 's1' });
    expect(mocked.resolvePopulation).toHaveBeenCalledWith({ kind: 'sponsor', sponsorId: 's1' });
  });
});

describe('the assembly guards', () => {
  it('rejects a claim with no source type', () => {
    expect(() => assertNoClaimWithoutASource([
      { statement: 'Did a thing', sourceType: '', sourceRef: null, openableUrl: null,
        whyNotOpenable: 'because', verifiedBy: null, verifiedAt: null },
    ])).toThrow(/no source type/);
  });

  it('rejects a claim that is neither openable nor explained', () => {
    expect(() => assertNoClaimWithoutASource([
      { statement: 'Did a thing', sourceType: 'deliverable', sourceRef: null, openableUrl: null,
        whyNotOpenable: null, verifiedBy: null, verifiedAt: null },
    ])).toThrow(/neither openable nor explained/);
  });

  it('rejects an empty population reported without a gap', () => {
    const bare = {
      generatedAt: '', selector: { kind: 'cohort', cohortId: 'c' }, populationNote: '',
      sponsor: null, learners: [], gaps: [],
      summary: { learnersInPopulation: 0, learnersWithAnyEvidence: 0, learnersPastDayNinety: 0,
        totalClaims: 0, openableClaims: 0, learnersWithMeasuredMovement: 0,
        learnersWithClaimToEvidence: 0 },
    } as unknown as DayNinetyReport;
    expect(() => assertGapsAreStatedNotHidden(bare)).toThrow(/without explaining why/);
  });

  it('rejects an unmeasurable movement reported with no gap at all', () => {
    const quiet = {
      generatedAt: '', selector: { kind: 'cohort', cohortId: 'c' }, populationNote: '',
      sponsor: null, gaps: [],
      learners: [{ enrollmentId: E1, gaps: [], movement: { state: 'no_baseline' } }],
      summary: { learnersInPopulation: 1, learnersWithAnyEvidence: 1, learnersPastDayNinety: 0,
        totalClaims: 0, openableClaims: 0, learnersWithMeasuredMovement: 0,
        learnersWithClaimToEvidence: 0 },
    } as unknown as DayNinetyReport;
    expect(() => assertGapsAreStatedNotHidden(quiet)).toThrow(/no gap was recorded/);
  });
});

describe('determinism', () => {
  it('two builds of the same data agree on everything but the timestamp', async () => {
    setup({ tallies: [tally()], commits: [commit()] });
    const a = await buildDayNinetyReport({ kind: 'cohort', cohortId: 'c1' });
    setup({ tallies: [tally()], commits: [commit()] });
    const b = await buildDayNinetyReport({ kind: 'cohort', cohortId: 'c1' });
    expect({ ...a, generatedAt: '' }).toEqual({ ...b, generatedAt: '' });
  });

  it('does not query anything when the population is empty', async () => {
    setup({ ids: [] });
    await buildDayNinetyReport({ kind: 'cohort', cohortId: 'c1' });
    expect(mocked.readEvidenceTallies).toHaveBeenCalledWith([]);
  });
});
