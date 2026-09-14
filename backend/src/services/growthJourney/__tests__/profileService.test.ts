import * as fs from 'fs';
import * as path from 'path';

const m = {
  profileFindOne: jest.fn(),
  profileCreate: jest.fn(),
  profileUpdate: jest.fn(),
  transitionCreate: jest.fn(),
  transitionFindOne: jest.fn(),
};

jest.mock('../../../models', () => ({
  GrowthJourneyProfile: {
    findOne: (...a: unknown[]) => m.profileFindOne(...a),
    create: (...a: unknown[]) => m.profileCreate(...a),
  },
  GrowthJourneyTransition: {
    create: (...a: unknown[]) => m.transitionCreate(...a),
    findOne: (...a: unknown[]) => m.transitionFindOne(...a),
  },
}));

import { upsertProfile, type UpsertProfileArgs } from '../profileService';

/**
 * T307 — the profile projection and the transition it owes.
 *
 * `transitionService` is deliberately NOT mocked: Phase 2's idempotency is the
 * thing being composed here, so the replay case has to go through the real
 * hashed key and the real unique-violation branch. Mocking it would test that
 * this file calls a function, which is not the property that matters.
 */

const AT = new Date('2026-09-14T12:00:00Z');
const ENTERED = new Date('2026-09-01T00:00:00Z');

const args = (over: Partial<UpsertProfileArgs> = {}): UpsertProfileArgs => ({
  tenantId: 't-col',
  brandId: 'b-ent',
  programId: 'p-ent',
  subjectRef: 'lead:501',
  leadId: 501,
  enrollmentId: null,
  state: 'PROBLEM_IDENTIFIED',
  stateEnteredAt: AT,
  overlays: ['NO_RESPONSE'],
  scores: null,
  evidence: ['a problem was stated in idea_input'],
  source: 'cron:growth-journey-nightly',
  ...over,
});

const uniqueViolation = () => {
  const err = new Error('duplicate key value violates unique constraint') as Error & { name: string };
  err.name = 'SequelizeUniqueConstraintError';
  return err;
};

beforeEach(() => {
  m.profileFindOne.mockReset().mockResolvedValue(null);
  m.profileCreate.mockReset().mockResolvedValue({ id: 'profile-1' });
  m.profileUpdate.mockReset().mockResolvedValue(undefined);
  m.transitionCreate.mockReset().mockResolvedValue({ id: 'transition-1' });
  m.transitionFindOne.mockReset().mockResolvedValue({ id: 'transition-existing' });
});

describe('a new subject', () => {
  it('creates the profile and records the transition from nothing', async () => {
    const out = await upsertProfile(args());
    expect(out).toEqual({
      profileId: 'profile-1',
      previousState: null,
      stateChanged: true,
      transitionId: 'transition-1',
      transitionReplayed: false,
    });
    expect(m.profileCreate).toHaveBeenCalledTimes(1);
    expect(m.transitionCreate).toHaveBeenCalledTimes(1);
    const row = m.transitionCreate.mock.calls[0][0];
    expect(row.transition_type).toBe('state_changed');
    expect(row.from_value).toBeNull();
    expect(row.to_value).toEqual({ state: 'PROBLEM_IDENTIFIED', overlays: ['NO_RESPONSE'] });
  });

  it('looks the profile up by brand AND subject, never by subject alone', async () => {
    // One person stands in a different place in each brand, so a lookup on
    // subject_ref alone would find another brand's projection and overwrite it.
    await upsertProfile(args());
    expect(m.profileFindOne.mock.calls[0][0].where).toEqual({
      brand_id: 'b-ent',
      subject_ref: 'lead:501',
    });
  });
});

describe('an existing subject whose state changed', () => {
  it('updates in place and writes exactly ONE transition', async () => {
    m.profileFindOne.mockResolvedValue({
      id: 'profile-9',
      state: 'NEW_BUSINESS_LEAD',
      update: (...a: unknown[]) => m.profileUpdate(...a),
    });
    const out = await upsertProfile(args({ state: 'EXPLORING_SOLUTIONS' }));
    expect(out.previousState).toBe('NEW_BUSINESS_LEAD');
    expect(out.stateChanged).toBe(true);
    expect(m.profileCreate).not.toHaveBeenCalled();
    expect(m.profileUpdate).toHaveBeenCalledTimes(1);
    expect(m.transitionCreate).toHaveBeenCalledTimes(1);
    expect(m.transitionCreate.mock.calls[0][0].from_value).toEqual({ state: 'NEW_BUSINESS_LEAD' });
  });

  it('writes the profile BEFORE the transition', async () => {
    // If the transition write fails the projection is still right and the next
    // run records the change. The reverse order would leave a transition
    // claiming a state the profile does not hold.
    const order: string[] = [];
    m.profileFindOne.mockResolvedValue({
      id: 'profile-9',
      state: 'NEW_BUSINESS_LEAD',
      update: async () => {
        order.push('profile');
      },
    });
    m.transitionCreate.mockImplementation(async () => {
      order.push('transition');
      return { id: 'transition-1' };
    });
    await upsertProfile(args({ state: 'QUALIFIED_OPPORTUNITY' }));
    expect(order).toEqual(['profile', 'transition']);
  });
});

describe('no state change, no transition', () => {
  it('updates the projection and writes NO transition row', async () => {
    // A nightly re-run that reaches the same state must not fill the
    // transitions table with rows saying nothing happened.
    m.profileFindOne.mockResolvedValue({
      id: 'profile-9',
      state: 'PROBLEM_IDENTIFIED',
      update: (...a: unknown[]) => m.profileUpdate(...a),
    });
    const out = await upsertProfile(args({ state: 'PROBLEM_IDENTIFIED' }));
    expect(out).toEqual({
      profileId: 'profile-9',
      previousState: 'PROBLEM_IDENTIFIED',
      stateChanged: false,
      transitionId: null,
      transitionReplayed: false,
    });
    expect(m.profileUpdate).toHaveBeenCalledTimes(1);
    expect(m.transitionCreate).not.toHaveBeenCalled();
  });
});

describe('the same change twice is one row', () => {
  it('replays through the real hashed idempotency key', async () => {
    // Phase 2's writer, not a second scheme: the key is hashed from what changed
    // and who asked, so the unique violation on the second write resolves to the
    // existing row.
    m.profileFindOne.mockResolvedValue({
      id: 'profile-9',
      state: 'NEW_BUSINESS_LEAD',
      update: (...a: unknown[]) => m.profileUpdate(...a),
    });
    const first = await upsertProfile(args({ state: 'EXPLORING_SOLUTIONS' }));
    expect(first.transitionReplayed).toBe(false);

    m.transitionCreate.mockRejectedValueOnce(uniqueViolation());
    const second = await upsertProfile(args({ state: 'EXPLORING_SOLUTIONS' }));
    expect(second.transitionReplayed).toBe(true);
    expect(second.transitionId).toBe('transition-existing');
    // Two attempts, one row: the second resolved to what was already there.
    expect(m.transitionCreate).toHaveBeenCalledTimes(2);
    expect(m.transitionFindOne).toHaveBeenCalledTimes(1);
  });

  it('the idempotency key is the SAME for the same change', async () => {
    m.profileFindOne.mockResolvedValue({
      id: 'p',
      state: 'NEW_BUSINESS_LEAD',
      update: async () => undefined,
    });
    await upsertProfile(args({ state: 'EXPLORING_SOLUTIONS' }));
    await upsertProfile(args({ state: 'EXPLORING_SOLUTIONS' }));
    const [a, b] = m.transitionCreate.mock.calls.map((c) => c[0].idempotency_key);
    expect(a).toBe(b);
    expect(String(a)).toHaveLength(64);
  });

  it('and DIFFERENT for a different destination', async () => {
    m.profileFindOne.mockResolvedValue({
      id: 'p',
      state: 'NEW_BUSINESS_LEAD',
      update: async () => undefined,
    });
    await upsertProfile(args({ state: 'EXPLORING_SOLUTIONS' }));
    await upsertProfile(args({ state: 'QUALIFIED_OPPORTUNITY' }));
    const [a, b] = m.transitionCreate.mock.calls.map((c) => c[0].idempotency_key);
    expect(a).not.toBe(b);
  });
});

describe('state_entered_at is passed through, never recomputed', () => {
  it('writes exactly what the lifecycle decided', async () => {
    // Two places deciding when the clock resets is two places to get it wrong.
    m.profileFindOne.mockResolvedValue({
      id: 'p',
      state: 'PROBLEM_IDENTIFIED',
      update: (...a: unknown[]) => m.profileUpdate(...a),
    });
    await upsertProfile(args({ state: 'PROBLEM_IDENTIFIED', stateEnteredAt: ENTERED }));
    expect(m.profileUpdate.mock.calls[0][0].state_entered_at).toEqual(ENTERED);
  });

  it('and does the same on a create', async () => {
    await upsertProfile(args({ stateEnteredAt: ENTERED }));
    expect(m.profileCreate.mock.calls[0][0].state_entered_at).toEqual(ENTERED);
  });
});

describe('the score vector travels with the projection', () => {
  it('splits the gaps and the timestamp out of the vector', async () => {
    const computed = new Date('2026-09-14T06:00:00Z');
    await upsertProfile(
      args({
        scores: {
          dimensions: [],
          summary: null,
          gaps: ['urgency:default_not_distinguishable_from_unasked'],
          available: false,
          computed_at: computed,
        },
      }),
    );
    const row = m.profileCreate.mock.calls[0][0];
    expect(row.score_gaps).toEqual(['urgency:default_not_distinguishable_from_unasked']);
    expect(row.scores_computed_at).toEqual(computed);
  });

  it('a null vector is empty gaps and no timestamp, not a crash', async () => {
    await upsertProfile(args({ scores: null }));
    const row = m.profileCreate.mock.calls[0][0];
    expect(row.score_gaps).toEqual([]);
    expect(row.scores_computed_at).toBeNull();
  });

  it('the evidence is recorded on the projection as well as the transition', async () => {
    await upsertProfile(args({ evidence: ['a reply arrived', 'held at QUALIFIED_OPPORTUNITY'] }));
    expect(m.profileCreate.mock.calls[0][0].signals_summary).toEqual({
      evidence: ['a reply arrived', 'held at QUALIFIED_OPPORTUNITY'],
    });
    expect(m.transitionCreate.mock.calls[0][0].evidence).toEqual([
      'a reply arrived',
      'held at QUALIFIED_OPPORTUNITY',
    ]);
  });
});

describe('a failed transition write does not lose the projection', () => {
  it('keeps the profile, reports the change, and logs the error class', async () => {
    // Losing the audit row is bad; losing the current state is worse.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    m.transitionCreate.mockRejectedValue(new Error('connection reset'));
    const out = await upsertProfile(args());
    expect(out.stateChanged).toBe(true);
    expect(out.transitionId).toBeNull();
    expect(m.profileCreate).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0]?.[0] ?? '');
    expect(line).toContain('growth_journey.state_transition_write_failed');
    expect(line).toContain('error_class');
    warn.mockRestore();
  });

  it('logs no address, even when the error text carries one', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    m.transitionCreate.mockRejectedValue(new Error('buyer@example.com could not be written'));
    await upsertProfile(args());
    expect(String(warn.mock.calls[0]?.[0] ?? '')).not.toContain('buyer@example.com');
    warn.mockRestore();
  });
});

describe('the projection is the only mutable write this run owns', () => {
  const SRC = fs.readFileSync(path.join(__dirname, '..', 'profileService.ts'), 'utf8');
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('updates the profile and nothing else', () => {
    const updates = [...CODE.matchAll(/(\w+)\.update\(/g)].map((x) => x[1]);
    expect(updates).toEqual(['existing']);
    expect(CODE).not.toMatch(/\.destroy\(/);
  });

  it('never names an append-only model, so it may hold `update` at all', () => {
    // The append-only guard's rule: a file that imports one of those models
    // contains no `.update(` and no `.destroy(`. This file mutates, so it must
    // reach the transition writer through the SERVICE rather than the model.
    for (const model of ['GrowthJourneyTransition', 'GrowthJourneyClassification', 'GrowthJourneyDecision', 'GrowthJourneyScoreSnapshot']) {
      expect({ model, named: CODE.includes(model) }).toEqual({ model, named: false });
    }
    expect(CODE).toContain("from './transitionService'");
  });

  it('writes no lead column at all', () => {
    // The projection is ours; `leads` belongs to the rest of the system.
    expect(CODE).not.toMatch(/Lead\.(update|create)/);
    expect(CODE).not.toMatch(/pipeline_stage/);
  });
});
