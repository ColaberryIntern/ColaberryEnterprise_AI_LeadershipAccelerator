/**
 * certPointsService — the anti-gaming shape.
 *
 * The behaviour under test is not "does it award points" but "does it pay for
 * improvement rather than repetition". Volume is capped, mastery pays once per
 * domain forever, and every key is idempotent.
 */
jest.mock('../../pointsService', () => ({
  award: jest.fn(),
  sumPointsTodayByEventTypes: jest.fn().mockResolvedValue(0),
}));
jest.mock('../../centralDate', () => ({ centralDateKey: jest.fn().mockReturnValue('2026-09-03') }));

import { award, sumPointsTodayByEventTypes } from '../../pointsService';
import {
  awardSessionCompletion,
  awardDomainMastery,
  awardSustainedReadiness,
  awardForCompletedSession,
  CERT_POINT_VALUES,
  CERT_PRACTICE_DAILY_CAP,
  DOMAIN_MASTERY_PCT,
  DOMAIN_MASTERY_MIN_ITEMS,
} from '../certPointsService';

const mAward = award as unknown as jest.Mock;
const mSpent = sumPointsTodayByEventTypes as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mAward.mockResolvedValue({ awarded: true, points: 5 });
  mSpent.mockResolvedValue(0);
});

describe('awardSessionCompletion — keys are idempotent by construction', () => {
  it('a mock is keyed on its session id, so completing twice cannot pay twice', async () => {
    await awardSessionCompletion('e1', { id: 's9', mode: 'mock' });
    expect(mAward).toHaveBeenCalledWith('e1', expect.objectContaining({
      eventType: 'cert_mock_complete',
      eventKey: 'cert_mock_complete:s9',
      points: CERT_POINT_VALUES.cert_mock_complete,
    }));
  });

  it('the diagnostic is keyed WITHOUT the session id — it pays for the first one only', async () => {
    await awardSessionCompletion('e1', { id: 's1', mode: 'diagnostic' });
    const call = mAward.mock.calls[0][1];
    expect(call.eventKey).toBe('cert_diagnostic_complete');
    expect(call.eventKey).not.toContain('s1'); // repeating the baseline is free, not paid
  });

  it('practice is keyed per session so distinct sets each pay, up to the cap', async () => {
    await awardSessionCompletion('e1', { id: 'p1', mode: 'practice' });
    expect(mAward).toHaveBeenCalledWith('e1', expect.objectContaining({
      eventKey: 'cert_practice_complete:p1',
      points: CERT_POINT_VALUES.cert_practice_complete,
    }));
  });
});

describe('awardSessionCompletion — the daily cap stops grinding', () => {
  it('suppresses practice points once the day’s cap is reached', async () => {
    mSpent.mockResolvedValue(CERT_PRACTICE_DAILY_CAP);
    const result = await awardSessionCompletion('e1', { id: 'p2', mode: 'practice' });
    expect(result).toEqual({ event: 'cert_practice_complete', awarded: false, points: 0 });
    expect(mAward).not.toHaveBeenCalled();
  });

  it('boundary: one point under the cap still awards', async () => {
    mSpent.mockResolvedValue(CERT_PRACTICE_DAILY_CAP - 1);
    await awardSessionCompletion('e1', { id: 'p3', mode: 'practice' });
    expect(mAward).toHaveBeenCalled();
  });

  it('the cap does NOT apply to mocks or the diagnostic — achievement is not farmable', async () => {
    mSpent.mockResolvedValue(CERT_PRACTICE_DAILY_CAP * 10);
    await awardSessionCompletion('e1', { id: 'm1', mode: 'mock' });
    await awardSessionCompletion('e1', { id: 'd1', mode: 'diagnostic' });
    expect(mAward).toHaveBeenCalledTimes(2);
  });

  it('mocks and diagnostics do not consume the practice cap', async () => {
    await awardSessionCompletion('e1', { id: 'm1', mode: 'mock' });
    expect(mSpent).not.toHaveBeenCalled();
  });

  it('the cap is a CENTRAL-time day, so crossing midnight locally grants no second allowance', async () => {
    await awardSessionCompletion('e1', { id: 'p4', mode: 'practice' }, new Date('2026-09-03T23:30:00Z'));
    // third argument is the central-time day key, not a local one
    expect(mSpent).toHaveBeenCalledWith('e1', ['cert_practice_complete'], '2026-09-03');
  });
});

describe('awardDomainMastery — pays for improvement, once per domain, forever', () => {
  const domain = (over: Partial<{ domain_id: string; correct: number; total: number; pct: number }> = {}) => ({
    domain_id: 'D1', correct: 9, total: 10, pct: 0.9, ...over,
  });

  it('awards a mastered domain, keyed per domain so it never pays twice', async () => {
    await awardDomainMastery('e1', [domain()]);
    expect(mAward).toHaveBeenCalledWith('e1', expect.objectContaining({
      eventType: 'cert_domain_mastered',
      eventKey: 'cert_domain_mastered:D1',
      points: CERT_POINT_VALUES.cert_domain_mastered,
    }));
  });

  it('the mastery bar sits ABOVE the exam pass mark — a scraped pass is not mastery', async () => {
    expect(DOMAIN_MASTERY_PCT).toBeGreaterThan(0.689); // the exam's own passing proportion
    await awardDomainMastery('e1', [domain({ pct: 0.7, correct: 7, total: 10 })]);
    expect(mAward).not.toHaveBeenCalled();
  });

  it('boundary: exactly at the bar awards; a hair under does not', async () => {
    await awardDomainMastery('e1', [domain({ pct: DOMAIN_MASTERY_PCT })]);
    expect(mAward).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();
    await awardDomainMastery('e1', [domain({ pct: DOMAIN_MASTERY_PCT - 0.01 })]);
    expect(mAward).not.toHaveBeenCalled();
  });

  it('refuses mastery on too small a sample — lucky answers are not command of a domain', async () => {
    await awardDomainMastery('e1', [domain({ total: DOMAIN_MASTERY_MIN_ITEMS - 1, correct: 3, pct: 1 })]);
    expect(mAward).not.toHaveBeenCalled();
  });

  it('awards each qualifying domain separately', async () => {
    await awardDomainMastery('e1', [
      domain({ domain_id: 'D1' }),
      domain({ domain_id: 'D3' }),
      domain({ domain_id: 'D5', pct: 0.5 }), // not mastered
    ]);
    const keys = mAward.mock.calls.map((c) => c[1].eventKey);
    expect(keys).toEqual(['cert_domain_mastered:D1', 'cert_domain_mastered:D3']);
  });

  it('boundary: no domain results awards nothing and does not throw', async () => {
    await expect(awardDomainMastery('e1', [])).resolves.toEqual([]);
    expect(mAward).not.toHaveBeenCalled();
  });
});

describe('awardSustainedReadiness', () => {
  it('is once per enrollment and carries the policy version that justified it', async () => {
    await awardSustainedReadiness('e1', { overall_scaled: 780, policy_version: 'v1-linear' });
    expect(mAward).toHaveBeenCalledWith('e1', expect.objectContaining({
      eventKey: 'cert_readiness_sustained',
      points: CERT_POINT_VALUES.cert_readiness_sustained,
      metadata: { overall_scaled: 780, policy_version: 'v1-linear' },
    }));
  });

  it('is the largest single award — improvement outranks participation', () => {
    expect(CERT_POINT_VALUES.cert_readiness_sustained)
      .toBeGreaterThan(CERT_POINT_VALUES.cert_domain_mastered);
    expect(CERT_POINT_VALUES.cert_domain_mastered)
      .toBeGreaterThan(CERT_POINT_VALUES.cert_mock_complete);
    expect(CERT_POINT_VALUES.cert_mock_complete)
      .toBeGreaterThan(CERT_POINT_VALUES.cert_practice_complete);
  });
});

describe('awardForCompletedSession', () => {
  it('pays completion and every qualifying mastery in one pass', async () => {
    const results = await awardForCompletedSession('e1', {
      id: 'm2',
      mode: 'mock',
      domain_results: [
        { domain_id: 'D1', correct: 9, total: 10, pct: 0.9 },
        { domain_id: 'D2', correct: 4, total: 10, pct: 0.4 },
      ],
    });
    expect(results.map((r) => r.event)).toEqual(['cert_mock_complete', 'cert_domain_mastered:D1']);
  });

  it('reports awards that did NOT fire, so a caller cannot mistake silence for success', async () => {
    mSpent.mockResolvedValue(CERT_PRACTICE_DAILY_CAP);
    const results = await awardForCompletedSession('e1', { id: 'p9', mode: 'practice', domain_results: [] });
    expect(results).toEqual([{ event: 'cert_practice_complete', awarded: false, points: 0 }]);
  });

  it('handles a session with no domain results', async () => {
    const results = await awardForCompletedSession('e1', { id: 'p1', mode: 'practice', domain_results: null });
    expect(results).toHaveLength(1);
  });
});
