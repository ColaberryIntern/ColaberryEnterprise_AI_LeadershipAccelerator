import { assembleEvidence } from '../evidenceAssembly';
import { StudentSuccessSnapshot } from '../../studentSuccessSnapshot/types';

function known<T>(value: T, overrides: Partial<any> = {}): any {
  return {
    value, status: 'known', sourceSystem: 'x', sourceRecordIds: ['rec-1'], observedAt: new Date('2026-09-05T00:00:00Z'),
    freshnessPolicy: 'n/a', reliabilityState: 'healthy', ...overrides,
  };
}

function unknown(reason: string): any {
  return {
    value: null, status: 'unknown', sourceSystem: 'x', sourceRecordIds: [], observedAt: null,
    freshnessPolicy: 'n/a', reliabilityState: 'healthy', reliabilityReason: reason,
  };
}

function quarantined(reason: string): any {
  return {
    value: null, status: 'quarantined', sourceSystem: 'x', sourceRecordIds: [], observedAt: null,
    freshnessPolicy: 'n/a', reliabilityState: 'quarantined', reliabilityReason: reason,
  };
}

function fullSnapshot(overrides: Partial<StudentSuccessSnapshot> = {}): StudentSuccessSnapshot {
  return {
    enrollmentId: 'enrollment-1',
    asOf: new Date('2026-09-05T00:00:00Z'),
    identity: known({ fullName: 'Test Student', status: 'active', cohortId: 'c1', cohortName: 'Cohort A' }),
    attendance: known({ sessionsPresent: 8, sessionsHeldSoFar: 10, attendancePct: 80 }),
    timelineProgress: known({ cardsCompleted: 20, totalCardsSeen: 40, lastActivityAt: '2026-09-04T00:00:00Z' }),
    assessmentTrend: known({ evalsTaken: 5, evalsPassed: 4, avgEvalPct: 82, weakCompetencies: [], trend: 'up' }),
    reflectionCompletion: known({ count: 3, lastSubmittedAt: '2026-09-01T00:00:00Z', lastReadiness: 70 }),
    competencyEvidence: known({ domains: [] }),
    projectProgress: known({ name: 'Widget', stage: 'build', requirementsCompletionPct: 60, repoConnected: true, totalStories: 5, verifiedStories: 2 }),
    certReadiness: known({ overallState: 'approaching', overallScaled: 72, knowledgeScaled: 75, evidenceCoveragePct: 60, weightsAvailable: true }),
    artifactsEvidence: known({ totalValidated: 3, bySourceType: {} }),
    communityActivity: known({ postCount: 2, totalLikesReceived: 5, totalCommentsReceived: 1, communityPoints: 10, communityLevel: 2 }),
    ticketsInterventions: known({ openCount: 0, totalCount: 1, recentTickets: [] }),
    previousReeseCommunications: known({ messageCount: 4, lastMessageAt: '2026-09-03T00:00:00Z', recentMessages: [] }),
    instructorFeedback: known({ releasedCount: 1, lastReleasedAt: '2026-08-20T00:00:00Z', avgConfidence: 80 }),
    agreedNextSteps: { value: null, status: 'not_applicable', sourceSystem: 'work_ledger', sourceRecordIds: [], observedAt: null, freshnessPolicy: 'n/a', reliabilityState: 'healthy', reliabilityReason: 'no work ledger yet' },
    ...overrides,
  };
}

describe('assembleEvidence', () => {
  it('happy path: full known snapshot yields all 12 categories usable, high confidence, and the 5 derivable momentum signals', () => {
    const result = assembleEvidence(fullSnapshot());

    expect(result.usable).toHaveLength(12);
    expect(result.excluded).toHaveLength(0);
    expect(result.meetsMinimumBar).toBe(true);
    expect(result.confidenceScore).toBe(100);
    expect(result.confidenceBand).toBe('high');
    expect(result.positiveMomentumSignals.sort()).toEqual(
      ['certification_readiness_milestone', 'first_milestone', 'improving_assessment_trend', 'peer_contribution', 'portfolio_ready_artifact'].sort(),
    );
  });

  it('honesty boundary: below the minimum-known-categories bar forces insufficient_evidence, zero confidence, no momentum claimed', () => {
    const snapshot = fullSnapshot({
      attendance: unknown('DB timeout'),
      timelineProgress: unknown('no data'),
      assessmentTrend: quarantined('Attendance is broken.'),
      reflectionCompletion: unknown('no data'),
      competencyEvidence: unknown('no data'),
      projectProgress: unknown('no active project'),
      certReadiness: unknown('no practice exam yet'),
      artifactsEvidence: unknown('no data'),
      communityActivity: unknown('no data'),
      ticketsInterventions: unknown('no data'),
      previousReeseCommunications: unknown('no data'),
      instructorFeedback: unknown('no data'),
    });

    const result = assembleEvidence(snapshot);

    expect(result.knownCount).toBe(0);
    expect(result.meetsMinimumBar).toBe(false);
    expect(result.confidenceScore).toBe(0);
    expect(result.confidenceBand).toBe('insufficient_evidence');
    expect(result.positiveMomentumSignals).toEqual([]);
    expect(result.excluded).toHaveLength(12);
  });

  it('a quarantined metric is excluded with its real reason, never silently treated as usable', () => {
    const snapshot = fullSnapshot({ attendance: quarantined('Attendance is broken.') });

    const result = assembleEvidence(snapshot);

    expect(result.usable.find((e) => e.category === 'attendance')).toBeUndefined();
    const excludedAttendance = result.excluded.find((e) => e.category === 'attendance');
    expect(excludedAttendance).toEqual({ category: 'attendance', status: 'quarantined', reliabilityReason: 'Attendance is broken.' });
  });

  it('a declining assessment trend does not produce the improving-trend momentum signal', () => {
    const snapshot = fullSnapshot({
      assessmentTrend: known({ evalsTaken: 5, evalsPassed: 2, avgEvalPct: 40, weakCompetencies: ['sql'], trend: 'down' }),
    });

    const result = assembleEvidence(snapshot);

    expect(result.positiveMomentumSignals).not.toContain('improving_assessment_trend');
  });

  it('identity not known (bad enrollment id upstream) forces the bar to fail even if other fields are known', () => {
    const snapshot = fullSnapshot({
      identity: { value: null, status: 'unknown', sourceSystem: 'enrollment', sourceRecordIds: [], observedAt: null, freshnessPolicy: 'n/a', reliabilityState: 'healthy', reliabilityReason: 'No enrollment row found for this id.' },
    });

    const result = assembleEvidence(snapshot);

    expect(result.meetsMinimumBar).toBe(false);
  });
});
