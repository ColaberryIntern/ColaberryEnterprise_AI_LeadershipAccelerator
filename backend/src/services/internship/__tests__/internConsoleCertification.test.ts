/**
 * The console's certification panel — two subsystems that must stay two.
 *
 * The practice blueprint's track is `ccar-f` (certBlueprints/ccarFoundations.ts). The official
 * claim's enum is `cca_f` (studentCertificationService.ts). They are the same credential spelled
 * two ways, and nothing in the repo maps one to the other. `internCertification()` already does
 * the right thing by querying each side on `enrollment_id` and never comparing the tracks — these
 * tests exist so that stays true when someone later notices the mismatch and "fixes" it.
 *
 * **Why the positive control matters here.** "This function never branches on the track" cannot be
 * shown by grepping for `===`; a grep proves nothing about behaviour. So one fixture gives the two
 * sides DIFFERENT track strings and requires both to come back, and a second gives them the SAME
 * string and requires identical output. Only the pair is evidence: the first alone would pass
 * against a function that filtered on a track it happened to match, and the second alone would
 * pass against one that dropped everything.
 */
const mockReadinessField = jest.fn();
const mockClaims = jest.fn();
const mockSessions = jest.fn();

jest.mock('../../studentSuccessSnapshot/certReadinessSource', () => ({
  getCertReadinessField: (...a: unknown[]) => mockReadinessField(...a),
}));
jest.mock('../../../models/StudentCertification', () => ({
  __esModule: true,
  default: { findAll: (...a: unknown[]) => mockClaims(...a) },
}));
jest.mock('../../../models/CertSession', () => ({
  __esModule: true,
  default: { findAll: (...a: unknown[]) => mockSessions(...a) },
}));
jest.mock('../../../config/env', () => ({ env: { certPrepEnabled: true } }));

import {
  internCertification, certAttempts, toCertAttempts, type CertSessionRow,
} from '../internshipCertification';
import { PASSING_SCALED } from '../../certPrep/certScoring';
import { CCAR_FOUNDATIONS_BLUEPRINT } from '../../../data/certBlueprints/ccarFoundations';
import { env } from '../../../config/env';

const ENR = 'enr-1';

/** The practice side, carrying the blueprint's own track id. */
const practiceField = (track: string) => ({
  value: {
    overallState: 'approaching', overallScaled: 710, knowledgeScaled: 690,
    evidenceCoveragePct: 55, weightsAvailable: true, trackId: track,
  },
  observedAt: '2026-09-20T00:00:00.000Z',
});

/** The official side, carrying the enum's own spelling. */
const claim = (track: string) => ([{
  status: 'approved', track, passed_on: '2026-09-01',
  submitted_at: new Date('2026-08-20T00:00:00Z'), reviewed_at: new Date('2026-08-25T00:00:00Z'),
}]);

const session = (
  completed: string | null, score: number | null, mode = 'practice',
  items: number | null = 10, correct: number | null = null,
) => ({
  mode, completed_at: completed, scaled_score: score,
  total_count: items, correct_count: correct ?? (score === null ? null : items),
} as CertSessionRow);

beforeEach(() => {
  jest.clearAllMocks();
  (env as any).certPrepEnabled = true;
});

describe('the two cert facts stay separate', () => {
  it('returns practice readiness and the official claim as different fields', async () => {
    mockReadinessField.mockResolvedValue(practiceField('ccar-f'));
    mockClaims.mockResolvedValue(claim('cca_f'));

    const out = await internCertification(ENR);

    // Both present, under their own keys, with the practice estimate never standing in for the
    // credential and never summed into it.
    expect(out.readiness.overall_scaled).toBe(710);
    expect(out.readiness.state).toBe('approaching');
    expect(out.official.status).toBe('approved');
    expect(out.official.passed_on).toBe('2026-09-01');
  });

  it('asks each side for this enrollment only, and never for a track', async () => {
    mockReadinessField.mockResolvedValue(practiceField('ccar-f'));
    mockClaims.mockResolvedValue(claim('cca_f'));

    await internCertification(ENR);

    expect(mockReadinessField).toHaveBeenCalledWith(ENR);
    expect(mockClaims.mock.calls[0][0].where).toEqual({ enrollment_id: ENR });
  });

  it('POSITIVE CONTROL: the same track on both sides changes nothing', async () => {
    // If the function compared tracks at all, making them agree would change the result. It does
    // not, so this must be identical to the mismatched run above — which is what proves there is
    // no comparison, rather than a comparison that happens to pass.
    mockReadinessField.mockResolvedValue(practiceField('ccar-f'));
    mockClaims.mockResolvedValue(claim('cca_f'));
    const mismatched = await internCertification(ENR);

    mockReadinessField.mockResolvedValue(practiceField('cca_f'));
    mockClaims.mockResolvedValue(claim('cca_f'));
    const matched = await internCertification(ENR);

    expect(matched).toEqual(mismatched);
  });

  it('answers the not-measured / no-claim state for an intern with neither', async () => {
    mockReadinessField.mockResolvedValue({ value: null, observedAt: null });
    mockClaims.mockResolvedValue([]);

    const out = await internCertification(ENR);

    expect(out.readiness.state).toBe('not_measured');
    expect(out.official.status).toBe('none');
  });
});

describe('the practice-score series', () => {
  it('orders oldest to newest however the rows arrive', () => {
    // Shuffled deliberately: the SQL ORDER BY cannot be what makes this true, because a mocked
    // model does not honour it. The sort has to be in the function.
    const out = toCertAttempts([
      session('2026-09-01T00:00:00Z', 640),
      session('2026-07-01T00:00:00Z', 520),
      session('2026-08-01T00:00:00Z', 600),
    ]);

    expect(out.map((a) => a.scaled_score)).toEqual([520, 600, 640]);
  });

  it('drops a sitting that was never scored instead of plotting it as zero', () => {
    // An abandoned session has no scaled_score. Drawing it as 0 would show a collapse that
    // never happened, right next to the real scores.
    const out = toCertAttempts([
      session('2026-07-01T00:00:00Z', 520),
      session('2026-08-01T00:00:00Z', null),
      session(null, 700),
      session('2026-09-01T00:00:00Z', 640),
    ]);

    expect(out).toHaveLength(2);
    expect(out.map((a) => a.scaled_score)).toEqual([520, 640]);
  });

  it('keeps every mode, so the diagnostic baseline is visible', () => {
    const out = toCertAttempts([
      session('2026-07-01T00:00:00Z', 420, 'diagnostic'),
      session('2026-08-01T00:00:00Z', 600, 'practice'),
      session('2026-09-01T00:00:00Z', 740, 'mock'),
    ]);

    expect(out.map((a) => a.mode)).toEqual(['diagnostic', 'practice', 'mock']);
  });

  it('is empty for an intern who has never sat one', () => {
    expect(toCertAttempts([])).toEqual([]);
  });

  it('reads completed sittings for this enrollment, with no track filter', async () => {
    mockSessions.mockResolvedValue([session('2026-08-01T00:00:00Z', 600)]);

    const out = await certAttempts(ENR);

    const where = mockSessions.mock.calls[0][0].where;
    expect(where).toEqual({ enrollment_id: ENR, status: 'completed' });
    expect(Object.keys(where)).not.toContain('track_id');
    expect(out.attempts).toHaveLength(1);
  });

  it("carries each sitting's item count, so 1000 from one item cannot pass as 1000 from sixty", () => {
    // Both of these are real shapes in production: a 1-item practice sitting scoring the top of
    // the scale, and a 60-item mock below the pass line. Without the denominator the first looks
    // like the better result.
    const out = toCertAttempts([
      session('2026-09-01T00:00:00Z', 1000, 'practice', 1, 1),
      session('2026-09-20T00:00:00Z', 895, 'mock', 60, 54),
    ]);

    expect(out.map((a) => [a.scaled_score, a.items, a.correct])).toEqual([
      [1000, 1, 1], [895, 60, 54],
    ]);
  });

  it('reports an unrecorded item count as null, never as zero', () => {
    // A denominator of 0 would be read as "scored on no items", which is a different claim from
    // "the row does not say".
    const out = toCertAttempts([
      { mode: 'practice', completed_at: '2026-09-01T00:00:00Z', scaled_score: 700 } as CertSessionRow,
    ]);

    expect(out[0].items).toBeNull();
    expect(out[0].correct).toBeNull();
  });


  it('draws the pass line from the scoring engine, not a literal', async () => {
    mockSessions.mockResolvedValue([]);

    expect((await certAttempts(ENR)).passing_scaled_score).toBe(PASSING_SCALED);
  });

  it('selects the item counts from the database rather than declaring them unread', async () => {
    mockSessions.mockResolvedValue([]);

    await certAttempts(ENR);

    expect(mockSessions.mock.calls[0][0].attributes).toEqual(
      expect.arrayContaining(['mode', 'completed_at', 'scaled_score', 'correct_count', 'total_count']),
    );
  });

  it('the scoring engine and the blueprint agree on the pass mark', () => {
    // Two definitions of 720 exist. The console draws the engine's. If they ever diverge, the
    // line would contradict the cert-prep UI — so the divergence has to fail here, loudly.
    expect(PASSING_SCALED).toBe(CCAR_FOUNDATIONS_BLUEPRINT.passing_scaled_score);
  });
});

describe('when cert prep is switched off', () => {
  it('returns an empty series rather than throwing, and still carries the pass line', async () => {
    // The console renders an intern's training and project panels regardless. A throw here would
    // blank the whole page over a feature flag.
    (env as any).certPrepEnabled = false;

    const out = await certAttempts(ENR);

    expect(out).toEqual({ attempts: [], passing_scaled_score: PASSING_SCALED });
    expect(mockSessions).not.toHaveBeenCalled();
  });

  it('does not query for a missing enrollment id either', async () => {
    const out = await certAttempts('');

    expect(out.attempts).toEqual([]);
    expect(mockSessions).not.toHaveBeenCalled();
  });
});
