import { Op } from 'sequelize';

/**
 * T409 - the nightly's outcomes stage for one brand: the normaliser over the
 * brand's handoff leads (each once, bounded), then the SLA sweep, then the
 * rates - three failure domains, the kill switch stopping the two writes and
 * not the read, and a summary that is numbers and nulls.
 */

const m = {
  handoffFindAll: jest.fn(),
  isKillSwitchActive: jest.fn(),
  expireOverdueHandoffs: jest.fn(),
  loadHandoffRates: jest.fn(),
  normalizeExistingOutcomes: jest.fn(),
};
jest.mock('../../../../models', () => ({ GrowthJourneyHandoff: { findAll: (...a: unknown[]) => m.handoffFindAll(...a) } }));
jest.mock('../../../launchSafety', () => ({ isKillSwitchActive: (...a: unknown[]) => m.isKillSwitchActive(...a) }));
jest.mock('../../handoffs/slaService', () => ({ expireOverdueHandoffs: (...a: unknown[]) => m.expireOverdueHandoffs(...a) }));
jest.mock('../handoffRatesQuery', () => ({ DEFAULT_RATES_WINDOW_DAYS: 30, loadHandoffRates: (...a: unknown[]) => m.loadHandoffRates(...a) }));
jest.mock('../outcomeNormalizer', () => ({ normalizeExistingOutcomes: (...a: unknown[]) => m.normalizeExistingOutcomes(...a) }));
const redactForLogs = jest.fn((s: string) => jest.requireActual('../../../../utils/piiRedaction').redactForLogs(s));
jest.mock('../../../../utils/piiRedaction', () => ({ redactForLogs: (s: string) => redactForLogs(s) }));

import { computeHandoffRates, type HandoffRates } from '../handoffRates';
import { DEFAULT_NORMALIZE_LEAD_LIMIT, runOutcomesPass, summarizeRates } from '../nightlyOutcomesPass';

const AS_OF = new Date('2026-09-17T04:20:00Z');
const BRAND = 'b-ent';
const WINDOW = { from: new Date(AS_OF.getTime() - 30 * 86_400_000), to: AS_OF };
const emptyRates = (): { all: HandoffRates; by_queue: Record<string, HandoffRates> } => ({
  all: computeHandoffRates({ brandId: BRAND, window: WINDOW, handoffs: [], outcomes: [] }),
  by_queue: { sales: computeHandoffRates({ brandId: BRAND, ownerQueue: 'sales', window: WINDOW, handoffs: [], outcomes: [] }) },
});
const normalized = (over: Record<string, unknown> = {}) => ({ status: 'normalized', created: 2, replayed: 1, unmapped: [{ source: 'interaction_outcomes', source_ref: '9', literal: 'no_answer' }], failed: [], by_type: {}, ...over });
const warned = () => (console.warn as jest.Mock).mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  redactForLogs.mockClear();
  m.handoffFindAll.mockResolvedValue([{ lead_id: 501 }, { lead_id: 502 }, { lead_id: 501 }, { lead_id: 503 }]);
  m.isKillSwitchActive.mockResolvedValue(false);
  m.expireOverdueHandoffs.mockResolvedValue({ skipped: false, scanned: 3, expired: 2, failed: [{ handoff_id: 'h-x', error_class: 'SequelizeDatabaseError' }], expired_ids: ['h-1', 'h-2'] });
  m.loadHandoffRates.mockResolvedValue(emptyRates());
  m.normalizeExistingOutcomes.mockResolvedValue(normalized());
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('the three stages', () => {
  it('normalises each DISTINCT lead the brand handed off in the window once, bounded, then sweeps the brand, then reads the rates - in that order', async () => {
    const order: string[] = [];
    m.normalizeExistingOutcomes.mockImplementation(async ({ leadId }: { leadId: number }) => { order.push(`normalize:${leadId}`); return normalized(); });
    m.expireOverdueHandoffs.mockImplementation(async () => { order.push('sweep'); return { skipped: false, scanned: 0, expired: 0, failed: [], expired_ids: [] }; });
    m.loadHandoffRates.mockImplementation(async () => { order.push('rates'); return emptyRates(); });
    const r = await runOutcomesPass({ brandId: BRAND, asOf: AS_OF, leadLimit: 50 });
    expect(order).toEqual(['normalize:501', 'normalize:502', 'normalize:503', 'sweep', 'rates']);
    expect(m.handoffFindAll).toHaveBeenCalledWith({ where: { brand_id: BRAND, lead_id: { [Op.ne]: null }, updated_at: { [Op.gte]: WINDOW.from } }, attributes: ['lead_id'], order: [['updated_at', 'DESC']], limit: 250 });
    expect(m.normalizeExistingOutcomes).toHaveBeenCalledTimes(3);
    expect(m.normalizeExistingOutcomes).toHaveBeenCalledWith({ leadId: 501, brandId: BRAND });
    expect(m.expireOverdueHandoffs).toHaveBeenCalledWith({ brandId: BRAND, asOf: AS_OF });
    expect(m.loadHandoffRates).toHaveBeenCalledWith({ brandId: BRAND, asOf: AS_OF, windowDays: 30 });
    expect(r.normalized).toEqual({ leads: 3, created: 6, replayed: 3, unmapped: 3, failed: 0, no_brand: 0 });
    expect(r.sla).toEqual({ scanned: 0, expired: 0, failed: 0 });
  });

  it('the lead bound holds: with a limit of 2 only the two most recently touched distinct leads normalise; the default is 200', async () => {
    await runOutcomesPass({ brandId: BRAND, asOf: AS_OF, leadLimit: 2 });
    expect(m.normalizeExistingOutcomes.mock.calls.map((c) => c[0].leadId)).toEqual([501, 502]);
    expect(DEFAULT_NORMALIZE_LEAD_LIMIT).toBe(200);
    m.normalizeExistingOutcomes.mockClear();
    await runOutcomesPass({ brandId: BRAND, asOf: AS_OF });
    expect(m.handoffFindAll).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 1000 }));
  });

  it("the sweep's counts land as numbers; a no_brand answer from the normaliser is counted, not thrown", async () => {
    m.normalizeExistingOutcomes.mockResolvedValue(normalized({ status: 'no_brand', created: 0, replayed: 0, unmapped: [], failed: [] }));
    const r = await runOutcomesPass({ brandId: BRAND, asOf: AS_OF });
    expect(r.normalized).toEqual({ leads: 3, created: 0, replayed: 0, unmapped: 0, failed: 0, no_brand: 3 });
    expect(r.sla).toEqual({ scanned: 3, expired: 2, failed: 1 });
  });

  it('the rates summary is values only - numbers and nulls, per queue too - never a row', async () => {
    const r = await runOutcomesPass({ brandId: BRAND, asOf: AS_OF, windowDays: 7 });
    expect(m.loadHandoffRates).toHaveBeenCalledWith({ brandId: BRAND, asOf: AS_OF, windowDays: 7 });
    expect(r.rates).toEqual({
      window_days: 7, handoffs: 0, accepted: 0, verdicts: 0,
      acceptance_rate: null, expiry_rate: null, connection_rate: null, meeting_rate: null, qualification_rate: null, conversion_rate: null, false_positive_handoff_rate: null, time_to_accept_hours: null,
      by_queue: { sales: { handoffs: 0, verdicts: 0, false_positive_handoff_rate: null } },
    });
    const all = computeHandoffRates({
      brandId: BRAND, window: WINDOW,
      handoffs: [{ id: 'h1', owner_queue: 'sales', status: 'dispositioned', disposition: 'no_contact', subject_ref: 'lead:1', created_at: new Date('2026-09-10T00:00:00Z'), accepted_at: new Date('2026-09-10T01:00:00Z'), disposition_at: new Date('2026-09-10T02:00:00Z') }],
      outcomes: [],
    });
    expect(summarizeRates(all, {}, 30)).toMatchObject({ handoffs: 1, accepted: 1, verdicts: 1, acceptance_rate: 1, false_positive_handoff_rate: 1, conversion_rate: 0, connection_rate: 0, time_to_accept_hours: null, by_queue: {} });
  });
});

describe('failure domains and the kill switch', () => {
  it('the normaliser stage failing (the lead read throws) is its own failure with a class and a redacted warning; the sweep and the rates still run', async () => {
    m.handoffFindAll.mockRejectedValue(Object.assign(new Error('relation missing'), { name: 'SequelizeDatabaseError' }));
    const r = await runOutcomesPass({ brandId: BRAND, asOf: AS_OF });
    expect(r.normalized).toEqual({ failed: true, error_class: expect.any(String) });
    expect(r.sla).toEqual({ scanned: 3, expired: 2, failed: 1 });
    expect((r.rates as { handoffs: number }).handoffs).toBe(0);
    expect(warned().some((l) => l.includes('growth_journey.nightly.normalize_failed') && l.includes(BRAND))).toBe(true);
    expect(redactForLogs).toHaveBeenCalledTimes(1);
  });

  it('one lead throwing inside the normaliser is the stage failed; the sweep still runs', async () => {
    m.normalizeExistingOutcomes.mockRejectedValueOnce(new Error('boom'));
    const r = await runOutcomesPass({ brandId: BRAND, asOf: AS_OF });
    expect(r.normalized).toMatchObject({ failed: true });
    expect(m.expireOverdueHandoffs).toHaveBeenCalledTimes(1);
  });

  it('the sweep throwing is the sla stage failed; the rates still run', async () => {
    m.expireOverdueHandoffs.mockRejectedValue(new Error('deadlock'));
    const r = await runOutcomesPass({ brandId: BRAND, asOf: AS_OF });
    expect(r.normalized).toMatchObject({ leads: 3 });
    expect(r.sla).toEqual({ failed: true, error_class: expect.any(String) });
    expect(m.loadHandoffRates).toHaveBeenCalledTimes(1);
    expect(warned().some((l) => l.includes('growth_journey.nightly.sla_sweep_failed'))).toBe(true);
  });

  it('the rates read throwing is the rates stage failed; the other two stand', async () => {
    m.loadHandoffRates.mockRejectedValue(new Error('timeout'));
    const r = await runOutcomesPass({ brandId: BRAND, asOf: AS_OF });
    expect(r.rates).toEqual({ failed: true, error_class: expect.any(String) });
    expect(r.normalized).toMatchObject({ leads: 3 });
    expect(r.sla).toMatchObject({ expired: 2 });
    expect(warned().some((l) => l.includes('growth_journey.nightly.rates_failed'))).toBe(true);
  });

  it('the kill switch, read once, skips the two writes by name - no lead read, no normaliser, no sweep - and the read-only rates still compute', async () => {
    m.isKillSwitchActive.mockResolvedValue(true);
    const r = await runOutcomesPass({ brandId: BRAND, asOf: AS_OF });
    expect(r.normalized).toEqual({ skipped: true, reason: 'kill_switch_active' });
    expect(r.sla).toEqual({ skipped: true, reason: 'kill_switch_active' });
    expect(m.handoffFindAll).not.toHaveBeenCalled();
    expect(m.normalizeExistingOutcomes).not.toHaveBeenCalled();
    expect(m.expireOverdueHandoffs).not.toHaveBeenCalled();
    expect(m.isKillSwitchActive).toHaveBeenCalledTimes(1);
    expect(m.loadHandoffRates).toHaveBeenCalledTimes(1);
  });

  it("the sweep's own kill-switch answer is passed through as skipped", async () => {
    m.expireOverdueHandoffs.mockResolvedValue({ skipped: true, reason: 'kill_switch_active' });
    const r = await runOutcomesPass({ brandId: BRAND, asOf: AS_OF });
    expect(r.sla).toEqual({ skipped: true, reason: 'kill_switch_active' });
  });
});
