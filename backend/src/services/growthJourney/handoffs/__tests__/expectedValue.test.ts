jest.mock('../../ledger', () => ({ recordJourneyEvent: jest.fn(async () => ({ recorded: true })) }));  // T410: the ledger adapter, at its boundary
import { BUSINESS_STATES } from '../../lifecycle/businessLifecycle';
import { FLOTATION_STATES } from '../../lifecycle/aiFlotationLifecycle';
import { OFFER_FAMILIES } from '../../../../models/OfferFamily';
import {
  EXPECTED_VALUE_FORMULA,
  LEARNER_STATE_ORDER,
  PATH_WEIGHT,
  computeExpectedValue,
  priorityFor,
  rankHandoffs,
  stateRank,
} from '../expectedValue';

/**
 * T404 — the expected value is transparent and additive, and the ranking
 * puts an explicit request first regardless of it.
 */

const at = (iso: string) => new Date(iso);

describe('state rank', () => {
  it('is the index in the lifecycle, terminal 0, unknown 0, no programme 0', () => {
    expect(stateRank('business', 'NEW_BUSINESS_LEAD')).toBe(0);
    expect(stateRank('business', 'DISCOVERY_READY')).toBe(BUSINESS_STATES.indexOf('DISCOVERY_READY'));
    expect(stateRank('business', 'CUSTOMER')).toBe(0);
    expect(stateRank('consulting', 'PROJECT_STARTED')).toBe(0);
    expect(stateRank('consulting', 'BUILD_QUALIFIED')).toBe(FLOTATION_STATES.indexOf('BUILD_QUALIFIED'));
    expect(stateRank('learner', 'ENROLLMENT_READY')).toBe(LEARNER_STATE_ORDER.indexOf('ENROLLMENT_READY'));
    expect(stateRank('learner', 'CONVERTED')).toBe(0);
    expect(stateRank('business', 'NOT_A_STATE')).toBe(0);
    expect(stateRank(null, 'DISCOVERY_READY')).toBe(0);
    expect(stateRank('business', null)).toBe(0);
  });

  it('the learner order is Explorer\'s own eight states', () => {
    expect(LEARNER_STATE_ORDER).toEqual(['NEW_EXPLORER', 'ACTIVATING', 'ACTIVE_LEARNER', 'ENGAGED_LEARNER', 'CONNECTED_TO_COMMUNITY', 'CONSIDERING_NEXT_STEP', 'ENROLLMENT_READY', 'CONVERTED']);
  });
});

describe('the value', () => {
  it('every offer family has a weight 1-5, and only offer families do', () => {
    expect(Object.keys(PATH_WEIGHT).sort()).toEqual([...OFFER_FAMILIES].sort());
    for (const w of Object.values(PATH_WEIGHT)) expect(w >= 1 && w <= 5).toBe(true);
  });

  it('adds the three components and shows its work', () => {
    const v = computeExpectedValue({ program_kind: 'business', state: 'DISCOVERY_READY', path: 'ai_consulting', score_summary: 62 });
    expect(v.components).toEqual({ state_rank: 4, path_weight: 4, engagement: 6 });
    expect(v.value).toBe(4 * 10 + 4 * 5 + 6);
    expect(v.formula).toBe(EXPECTED_VALUE_FORMULA);
  });

  it('a missing component counts 0 and cannot zero the rest (additive, not multiplied)', () => {
    expect(computeExpectedValue({ program_kind: 'business', state: 'DISCOVERY_READY', path: null, score_summary: null }).value).toBe(40);
    expect(computeExpectedValue({ program_kind: null, state: null, path: 'application_build', score_summary: null }).value).toBe(25);
    expect(computeExpectedValue({ program_kind: 'business', state: 'DISCOVERY_READY', path: 'ai_consulting', score_summary: Number.NaN }).components.engagement).toBe(0);
  });

  it('engagement is clamped to 0-10', () => {
    expect(computeExpectedValue({ program_kind: null, state: null, path: null, score_summary: 240 }).components.engagement).toBe(10);
    expect(computeExpectedValue({ program_kind: null, state: null, path: null, score_summary: -5 }).components.engagement).toBe(0);
  });
});

describe('priority', () => {
  it('urgent is critical; otherwise by value', () => {
    expect(priorityFor(5, true)).toBe('critical');
    expect(priorityFor(50, false)).toBe('high');
    expect(priorityFor(25, false)).toBe('medium');
    expect(priorityFor(24, false)).toBe('low');
  });
});

describe('rankHandoffs', () => {
  const row = (id: string, urgent: boolean, value: number | null, created: string) => ({ id, urgent, expected_value: value, created_at: at(created) });

  it('an urgent lower-value subject outranks a higher-value non-urgent one', () => {
    const ranked = rankHandoffs([row('big', false, 90, '2026-09-16T10:00:00Z'), row('urgent', true, 5, '2026-09-16T11:00:00Z')]);
    expect(ranked.map((r) => r.id)).toEqual(['urgent', 'big']);
  });

  it('then by value, then older first (fair ageing); null value ranks as 0', () => {
    const ranked = rankHandoffs([
      row('newer-40', false, 40, '2026-09-16T12:00:00Z'),
      row('older-40', false, 40, '2026-09-16T08:00:00Z'),
      row('null', false, null, '2026-09-15T08:00:00Z'),
      row('70', false, 70, '2026-09-16T13:00:00Z'),
    ]);
    expect(ranked.map((r) => r.id)).toEqual(['70', 'older-40', 'newer-40', 'null']);
  });

  it('is pure: the input is not reordered', () => {
    const input = [row('b', false, 1, '2026-09-16T10:00:00Z'), row('a', true, 0, '2026-09-16T10:00:00Z')];
    rankHandoffs(input);
    expect(input.map((r) => r.id)).toEqual(['b', 'a']);
  });
});
