'use strict';
/**
 * Unit tests for the pure decision logic of the daily points-earn smoke test.
 *
 * Covers the four mandatory shapes from CLAUDE.md: happy path, failure path,
 * boundary cases, and the idempotency contract (a re-run must not re-send).
 */
const {
  GATED_BANDS,
  badgeOf,
  selectCandidates,
  evaluateEarn,
  decideAlert,
  nextState,
  formatFailureEmail,
  formatRecoveryEmail,
} = require('../pointsSmokeChecks');

const card = (over = {}) => ({
  id: 'c1',
  status: 'available',
  render_band: 'warmup',
  points: { learning: 10, builder: 0, community: 0 },
  ...over,
});

describe('badgeOf', () => {
  it('sums the three point buckets', () => {
    expect(badgeOf(card({ points: { learning: 10, builder: 5, community: 3 } }))).toBe(18);
  });

  it('treats missing points, missing buckets and a missing card as zero', () => {
    expect(badgeOf(card({ points: undefined }))).toBe(0);
    expect(badgeOf(card({ points: { learning: 7 } }))).toBe(7);
    expect(badgeOf(undefined)).toBe(0);
    expect(badgeOf(null)).toBe(0);
  });
});

describe('selectCandidates', () => {
  it('keeps available, non-gated, point-bearing cards in feed order', () => {
    const cards = [
      card({ id: 'a', render_band: 'warmup' }),
      card({ id: 'b', render_band: 'deepdive' }),
    ];
    expect(selectCandidates(cards).map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('drops locked/completed cards, gated bands, and zero-point cards', () => {
    const cards = [
      card({ id: 'locked', status: 'locked' }),
      card({ id: 'done', status: 'completed' }),
      ...GATED_BANDS.map((b) => card({ id: `gated-${b}`, render_band: b })),
      card({ id: 'zero', points: { learning: 0, builder: 0, community: 0 } }),
      card({ id: 'keeper' }),
    ];
    expect(selectCandidates(cards).map((c) => c.id)).toEqual(['keeper']);
  });

  it('survives an empty, absent or malformed feed rather than throwing', () => {
    expect(selectCandidates([])).toEqual([]);
    expect(selectCandidates(undefined)).toEqual([]);
    expect(selectCandidates(null)).toEqual([]);
    expect(selectCandidates([null, undefined])).toEqual([]);
  });
});

describe('evaluateEarn', () => {
  it('passes when the award equals the badge and the total rises by it', () => {
    const r = evaluateEarn({ total0: 0, total1: 10, awarded: 10, badge: 10 });
    expect(r).toEqual({ ok: true, failures: [] });
  });

  it('passes from a non-zero baseline', () => {
    expect(evaluateEarn({ total0: 45, total1: 63, awarded: 18, badge: 18 }).ok).toBe(true);
  });

  it('flags check 5 when the award does not match the advertised badge', () => {
    const r = evaluateEarn({ total0: 0, total1: 5, awarded: 5, badge: 10 });
    expect(r.ok).toBe(false);
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0]).toMatchObject({ check: 5, error_class: 'ContractViolation' });
    expect(r.failures[0].message).toContain('advertised 10');
  });

  it('flags check 6 when the total does not move by the award', () => {
    const r = evaluateEarn({ total0: 0, total1: 0, awarded: 10, badge: 10 });
    expect(r.ok).toBe(false);
    expect(r.failures.map((f) => f.check)).toEqual([6]);
    expect(r.failures[0].message).toContain('expected 10');
  });

  it('reports BOTH violations rather than stopping at the first', () => {
    const r = evaluateEarn({ total0: 0, total1: 99, awarded: 5, badge: 10 });
    expect(r.failures.map((f) => f.check)).toEqual([5, 6]);
  });
});

describe('decideAlert', () => {
  const today = '2026-08-18';

  it('sends nothing when a healthy run follows a healthy run', () => {
    expect(decideAlert({ prev: { status: 'pass' }, outcome: 'pass', todayUtc: today }).send).toBe(false);
  });

  it('sends nothing on a healthy first-ever run', () => {
    expect(decideAlert({ prev: null, outcome: 'pass', todayUtc: today }).send).toBe(false);
  });

  it('alerts on the first failure of the day', () => {
    const d = decideAlert({ prev: { status: 'pass' }, outcome: 'fail', todayUtc: today });
    expect(d).toMatchObject({ send: true, kind: 'failure' });
  });

  it('alerts on a failing first-ever run', () => {
    expect(decideAlert({ prev: null, outcome: 'fail', todayUtc: today }).send).toBe(true);
  });

  // IDEMPOTENCY: the cron firing twice, or a human re-running during triage,
  // must not produce a second email for the same failure on the same day.
  it('suppresses a second failure alert on the same UTC day', () => {
    const prev = { status: 'fail', lastAlertKind: 'failure', lastAlertDate: today };
    const d = decideAlert({ prev, outcome: 'fail', todayUtc: today });
    expect(d.send).toBe(false);
    expect(d.reason).toMatch(/dedup/);
  });

  it('alerts again the NEXT day if it is still failing', () => {
    const prev = { status: 'fail', lastAlertKind: 'failure', lastAlertDate: '2026-08-17' };
    expect(decideAlert({ prev, outcome: 'fail', todayUtc: today }).send).toBe(true);
  });

  it('sends exactly one recovery notice on the fail -> pass transition', () => {
    const prev = { status: 'fail', lastAlertKind: 'failure', lastAlertDate: today };
    const d = decideAlert({ prev, outcome: 'pass', todayUtc: today });
    expect(d).toMatchObject({ send: true, kind: 'recovery' });

    // and the run after that is silent again
    const after = nextState({ prev, outcome: 'pass', todayUtc: today, nowIso: 'x', alert: d });
    expect(decideAlert({ prev: after, outcome: 'pass', todayUtc: today }).send).toBe(false);
  });
});

describe('nextState', () => {
  it('records the alert date/kind only when an alert was actually sent', () => {
    const s = nextState({
      prev: null,
      outcome: 'fail',
      todayUtc: '2026-08-18',
      nowIso: '2026-08-18T13:00:00.000Z',
      alert: { send: true, kind: 'failure' },
    });
    expect(s).toMatchObject({
      status: 'fail',
      lastAlertDate: '2026-08-18',
      lastAlertKind: 'failure',
      lastRunDate: '2026-08-18',
    });
  });

  it('carries the prior alert stamp forward when this run sent nothing', () => {
    const prev = { status: 'fail', lastAlertKind: 'failure', lastAlertDate: '2026-08-18' };
    const s = nextState({
      prev,
      outcome: 'fail',
      todayUtc: '2026-08-18',
      nowIso: '2026-08-18T14:00:00.000Z',
      alert: { send: false, kind: null },
    });
    expect(s.lastAlertDate).toBe('2026-08-18');
    expect(s.lastAlertKind).toBe('failure');
  });

  it('starts clean with no prior state', () => {
    const s = nextState({
      prev: null,
      outcome: 'pass',
      todayUtc: '2026-08-18',
      nowIso: 'now',
      alert: { send: false },
    });
    expect(s).toMatchObject({ status: 'pass', lastAlertDate: null, lastAlertKind: null });
  });
});

describe('email bodies', () => {
  it('names every failed check and stays free of em-dashes', () => {
    const body = formatFailureEmail({
      base: 'https://enterprise.colaberry.ai',
      failures: [
        { check: 5, error_class: 'ContractViolation', message: 'award/badge mismatch: card advertised 10 pts, completion awarded 5' },
        { check: 6, error_class: 'ContractViolation', message: 'accrual mismatch: total went 0 -> 99, expected 5' },
      ],
      context: { card_id: 'c1', render_band: 'warmup' },
    });
    expect(body).toContain('Failed check(s): 5, 6');
    expect(body).toContain('card_id: c1');
    expect(body).toContain('points-earn-smoke.log');
    expect(body).not.toMatch(/—/);
  });

  it('recovery notice states the parity that was restored', () => {
    const body = formatRecoveryEmail({
      base: 'https://enterprise.colaberry.ai',
      awarded: 10, badge: 10, total0: 0, total1: 10, renderBand: 'warmup',
    });
    expect(body).toContain('GREEN again');
    expect(body).toContain('10 == 10');
    expect(body).not.toMatch(/—/);
  });
});
