const handoffFindOne = jest.fn();
const policyFindOne = jest.fn();
jest.mock('../../../../models', () => ({
  GrowthJourneyHandoff: { findOne: (...a: unknown[]) => handoffFindOne(...a) },
  GrowthJourneyPolicy: { findOne: (...a: unknown[]) => policyFindOne(...a) },
}));

import { Op } from 'sequelize';
import {
  DEFAULT_QUALIFIED_COOLDOWN_DAYS,
  DEFAULT_RETURN_COOLDOWN_DAYS,
  NO_RETURN,
  RETURNED_TO_AI_OVERLAY,
  RETURNED_TO_AI_REASON,
  cooldownDaysFor,
  cooldownUntil,
  qualifiedCooldownDays,
  readReturnToAi,
  resolveReturnToAi,
} from '../returnToAi';

/**
 * T405 — the return-to-AI record and its two readers.
 *
 * One record, on the handoff row; the loader asks `resolveReturnToAi` and the
 * answer is active exactly while `cooldown_until` is ahead of the clock. The
 * cooldown's length is the body's, else the brand's `cooldown` policy, else
 * 14 days - in that order, and a paused policy or a non-positive number does
 * not count.
 */

const AS_OF = new Date('2026-09-16T15:00:00Z');
const DAY = 86_400_000;

beforeEach(() => {
  handoffFindOne.mockReset().mockResolvedValue(null);
  policyFindOne.mockReset().mockResolvedValue(null);
});

describe('the vocabulary', () => {
  it('is the overlay and the reason the strategies spell, and the default is 14 days', () => {
    expect(RETURNED_TO_AI_OVERLAY).toBe('RETURNED_TO_AI');
    expect(RETURNED_TO_AI_REASON).toBe('returned_to_ai_cooldown');
    expect(DEFAULT_RETURN_COOLDOWN_DAYS).toBe(14);
    expect(NO_RETURN).toEqual({ active: false, handoff_id: null, cooldown_until: null, reason: null });
    expect(Object.isFrozen(NO_RETURN)).toBe(true);
  });
});

describe('readReturnToAi', () => {
  it('reads a stored record; a missing, malformed or undated record is null (never a throw)', () => {
    expect(readReturnToAi({ return_to_ai: { program_slug: 'business-growth', cooldown_until: '2026-10-01T00:00:00.000Z', reason: 'not_ready:q1' } }))
      .toEqual({ cooldown_until: new Date('2026-10-01T00:00:00.000Z'), reason: 'not_ready:q1' });
    expect(readReturnToAi({ return_to_ai: null })).toBeNull();
    expect(readReturnToAi({ return_to_ai: { program_slug: 'x', cooldown_until: 'not a date', reason: 'r' } })).toBeNull();
    expect(readReturnToAi({ return_to_ai: { program_slug: 'x', cooldown_until: 42 as unknown as string, reason: 'r' } })).toBeNull();
    expect(readReturnToAi({ return_to_ai: { program_slug: 'x', cooldown_until: '2026-10-01T00:00:00.000Z', reason: null as unknown as string } })).toEqual({ cooldown_until: new Date('2026-10-01T00:00:00.000Z'), reason: '' });
  });
});

describe('resolveReturnToAi', () => {
  it('T502: asks for the newest row CARRYING the record - returned_to_ai or a qualified dispositioned row - by subject ref, or by lead when there is one', async () => {
    type Q = { where: Record<string | symbol, unknown>; order: unknown };
    const lastWhere = () => (handoffFindOne.mock.calls[handoffFindOne.mock.calls.length - 1][0] as Q);
    await resolveReturnToAi({ subjectRef: 'lead:501', brandId: 'b-ent', asOf: AS_OF });
    // Symbol keys asserted one by one: a matcher that skipped them would pass whatever the query said.
    expect(lastWhere().order).toEqual([['updated_at', 'DESC']]);
    expect(lastWhere().where.brand_id).toBe('b-ent');
    expect((lastWhere().where.return_to_ai as Record<symbol, unknown>)[Op.ne]).toBeNull();
    expect(lastWhere().where[Op.or]).toEqual([{ subject_ref: 'lead:501' }]);
    await resolveReturnToAi({ subjectRef: 'enrollment:e-1', brandId: 'b-trn', asOf: AS_OF, leadId: 501 });
    expect(lastWhere().where[Op.or]).toEqual([{ subject_ref: 'enrollment:e-1' }, { lead_id: 501 }]);
    // No status filter: the record, not the status, is what says "hold off".
    expect(Object.keys(lastWhere().where).sort()).toEqual(['brand_id', 'return_to_ai']);
  });

  it('T502: a qualified row (status dispositioned) with an open record is active, exactly like a returned one', async () => {
    const until = new Date(AS_OF.getTime() + 30 * DAY);
    handoffFindOne.mockResolvedValue({ id: 'h-9', status: 'dispositioned', return_to_ai: { program_slug: 'business-growth', cooldown_until: until.toISOString(), reason: 'qualified:budget confirmed' } });
    expect(await resolveReturnToAi({ subjectRef: 'lead:501', brandId: 'b-ent', asOf: AS_OF, leadId: 501 })).toEqual({ active: true, handoff_id: 'h-9', cooldown_until: until, reason: 'qualified:budget confirmed' });
  });

  it('no row → not active; a row whose cooldown is ahead of the clock → active with the id, the date and the reason', async () => {
    expect(await resolveReturnToAi({ subjectRef: 'lead:501', brandId: 'b-ent', asOf: AS_OF })).toBe(NO_RETURN);
    const until = new Date(AS_OF.getTime() + 3 * DAY);
    handoffFindOne.mockResolvedValue({ id: 'h-1', return_to_ai: { program_slug: 'business-growth', cooldown_until: until.toISOString(), reason: 'not_ready:q1' } });
    expect(await resolveReturnToAi({ subjectRef: 'lead:501', brandId: 'b-ent', asOf: AS_OF })).toEqual({ active: true, handoff_id: 'h-1', cooldown_until: until, reason: 'not_ready:q1' });
  });

  it('after cooldown_until the overlay is simply gone: the same row, a later clock, not active - and exactly AT the instant it is already over', async () => {
    const until = new Date(AS_OF.getTime() + 3 * DAY);
    handoffFindOne.mockResolvedValue({ id: 'h-1', return_to_ai: { program_slug: 'business-growth', cooldown_until: until.toISOString(), reason: 'not_ready:q1' } });
    expect((await resolveReturnToAi({ subjectRef: 'lead:501', brandId: 'b-ent', asOf: new Date(until.getTime() - 1) })).active).toBe(true);
    expect(await resolveReturnToAi({ subjectRef: 'lead:501', brandId: 'b-ent', asOf: until })).toBe(NO_RETURN);
    expect(await resolveReturnToAi({ subjectRef: 'lead:501', brandId: 'b-ent', asOf: new Date(until.getTime() + 30 * DAY) })).toBe(NO_RETURN);
  });

  it('a returned row with no readable record is not active (the human said returned, but nothing says until when)', async () => {
    handoffFindOne.mockResolvedValue({ id: 'h-1', return_to_ai: null });
    expect(await resolveReturnToAi({ subjectRef: 'lead:501', brandId: 'b-ent', asOf: AS_OF })).toBe(NO_RETURN);
  });

  it('a lookup failure propagates - the loader names it, this module never guesses', async () => {
    handoffFindOne.mockRejectedValue(new Error('connection reset'));
    await expect(resolveReturnToAi({ subjectRef: 'lead:501', brandId: 'b-ent', asOf: AS_OF })).rejects.toThrow('connection reset');
  });
});

describe('cooldownDaysFor', () => {
  it('the body first: a positive number is taken as given and the policy is not read', async () => {
    expect(await cooldownDaysFor('b-ent', 7)).toEqual({ days: 7, source: 'body' });
    expect(policyFindOne).not.toHaveBeenCalled();
  });

  it('else the brand-wide cooldown policy (owner_queue null, active), read by the exact key', async () => {
    policyFindOne.mockResolvedValue({ cooldown_days: 21 });
    expect(await cooldownDaysFor('b-ent', undefined)).toEqual({ days: 21, source: 'policy' });
    expect(policyFindOne).toHaveBeenCalledWith({ where: { brand_id: 'b-ent', policy_type: 'cooldown', owner_queue: null, status: 'active' } });
  });

  it('else 14: no policy row, a policy row with no number, a non-positive number, or a non-positive body', async () => {
    expect(await cooldownDaysFor('b-ent', undefined)).toEqual({ days: 14, source: 'default' });
    policyFindOne.mockResolvedValue({ cooldown_days: null });
    expect(await cooldownDaysFor('b-ent', undefined)).toEqual({ days: 14, source: 'default' });
    policyFindOne.mockResolvedValue({ cooldown_days: 0 });
    expect(await cooldownDaysFor('b-ent', undefined)).toEqual({ days: 14, source: 'default' });
    expect(await cooldownDaysFor('b-ent', 0)).toEqual({ days: 14, source: 'default' });
    expect(await cooldownDaysFor('b-ent', -3)).toEqual({ days: 14, source: 'default' });
  });
});

describe('qualifiedCooldownDays (T502)', () => {
  it('the body when positive, else 30 - longer than a return, and never the brand policy', () => {
    expect(DEFAULT_QUALIFIED_COOLDOWN_DAYS).toBe(30);
    expect(DEFAULT_QUALIFIED_COOLDOWN_DAYS).toBeGreaterThan(DEFAULT_RETURN_COOLDOWN_DAYS);
    expect(qualifiedCooldownDays(45)).toEqual({ days: 45, source: 'body' });
    expect(qualifiedCooldownDays(undefined)).toEqual({ days: 30, source: 'default' });
    expect(qualifiedCooldownDays(0)).toEqual({ days: 30, source: 'default' });
    expect(qualifiedCooldownDays(-1)).toEqual({ days: 30, source: 'default' });
    expect(policyFindOne).not.toHaveBeenCalled();
  });
});

describe('cooldownUntil', () => {
  it('is asOf plus whole days, in UTC arithmetic (no daylight-saving drift)', () => {
    expect(cooldownUntil(AS_OF, 14)).toEqual(new Date('2026-09-30T15:00:00Z'));
    expect(cooldownUntil(new Date('2026-10-30T12:00:00Z'), 7)).toEqual(new Date('2026-11-06T12:00:00Z'));
  });
});
