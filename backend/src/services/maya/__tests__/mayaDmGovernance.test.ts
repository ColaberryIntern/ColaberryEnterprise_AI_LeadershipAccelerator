import {
  AI_DISCLOSURE, cohortDateAnswer, governedTopicReply, HANDOFF_CONFIRMED_LINE, person360Block, withAiDisclosure,
  type DmGovernanceDeps, type Person360Deps,
} from '../mayaDmGovernance';
import { BOOK_CALL_LINK } from '../mayaPortalTools';
import { resolveGrowthJourneyFlags } from '../../../config/growthJourneyFlags';

/**
 * M31 refusal rules. The ticket's own test: "a price question with no authoritative answer returns a handoff, not a
 * number". Price HAS an authoritative answer here (the pricing rule of record), so the same rule is proved on the topics
 * that do not: seats, deadlines, consent, and a cohort date when no batch of record exists.
 */

const NOW = new Date('2026-11-09T15:00:00Z');
const flags = resolveGrowthJourneyFlags({ GROWTH_JOURNEY_ENABLED: 'true', GROWTH_JOURNEY_HANDOFFS_ENABLED: 'true' });

function deps(over: Partial<DmGovernanceDeps> = {}): DmGovernanceDeps & { handoff: jest.Mock } {
  return {
    handoff: jest.fn(async () => ({ handoff: true, reason: 'created' as const })),
    batchForThisMonth: async () => null,
    now: () => NOW,
    flags,
    ...over,
  } as DmGovernanceDeps & { handoff: jest.Mock };
}

let warnSpy: jest.SpyInstance;
beforeEach(() => { warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => warnSpy.mockRestore());

describe('governedTopicReply', () => {
  it('REFUSAL TEST: a seat question returns a handoff, not a number', async () => {
    const d = deps();
    const r = await governedTopicReply('seat_count', 'enr-1', { dryRun: false }, d);
    expect(d.handoff).toHaveBeenCalledWith('enr-1', 'maya_dm_seat_count', flags);
    expect(r.handoff).toEqual({ handoff: true, reason: 'created' });
    expect(r.text).toContain(HANDOFF_CONFIRMED_LINE);
    expect(r.text.replace(BOOK_CALL_LINK, '')).not.toMatch(/\d/);
  });

  it('claims "someone will follow up" ONLY on a confirmed handoff; otherwise offers the booking link', async () => {
    const d = deps({ handoff: jest.fn(async () => ({ handoff: false, reason: 'disabled' as const })) });
    const r = await governedTopicReply('deadline', 'enr-1', { dryRun: false }, d);
    expect(r.text).not.toMatch(/follow up/i);
    expect(r.text).toContain(BOOK_CALL_LINK);
  });

  it('SHADOW (dryRun) writes no handoff and never claims one', async () => {
    const d = deps();
    const r = await governedTopicReply('consent', 'enr-1', { dryRun: true }, d);
    expect(d.handoff).not.toHaveBeenCalled();
    expect(r.handoff).toBeNull();
    expect(r.text).not.toMatch(/follow up/i);
  });

  it('a cohort date is answered from the batch of record, with no handoff', async () => {
    const d = deps({ batchForThisMonth: async () => ({ monthKey: '2026-11', startDate: '2026-12-07' }) });
    const r = await governedTopicReply('cohort_date', 'enr-1', { dryRun: false }, d);
    expect(r.text).toContain('November 2026 batch');
    expect(r.text).toContain('Monday, December 7, 2026');
    expect(d.handoff).not.toHaveBeenCalled();
  });

  it('no batch of record -> a handoff, never a generated date', async () => {
    const d = deps({ batchForThisMonth: async () => null });
    const r = await governedTopicReply('cohort_date', 'enr-1', { dryRun: false }, d);
    expect(d.handoff).toHaveBeenCalledWith('enr-1', 'maya_dm_cohort_date', flags);
    expect(r.text.replace(BOOK_CALL_LINK, '')).not.toMatch(/\d/);
  });

  it('a batch lookup that throws -> logged, then a handoff', async () => {
    const d = deps({ batchForThisMonth: async () => { throw new Error('db down'); } });
    await governedTopicReply('cohort_date', 'enr-1', { dryRun: false }, d);
    expect(d.handoff).toHaveBeenCalled();
    expect(JSON.parse(String(warnSpy.mock.calls[0][0])).event).toBe('dm_cohort_date_lookup_failed');
  });
});

describe('cohortDateAnswer', () => {
  it('a past orientation is not an answer', () => {
    expect(cohortDateAnswer({ monthKey: '2026-10', startDate: '2026-11-02' }, NOW)).toBeNull();
  });
  it('a missing start date is not an answer', () => {
    expect(cohortDateAnswer({ monthKey: '2026-11', startDate: null }, NOW)).toBeNull();
  });
});

describe('withAiDisclosure', () => {
  it('prefixes her first message in a conversation, and only the first', () => {
    expect(withAiDisclosure('Happy to help.', false)).toBe(`${AI_DISCLOSURE} Happy to help.`);
    expect(withAiDisclosure('Happy to help.', true)).toBe('Happy to help.');
    expect(withAiDisclosure(`${AI_DISCLOSURE} Hi.`, false)).toBe(`${AI_DISCLOSURE} Hi.`);
    expect(AI_DISCLOSURE).toMatch(/\bAI\b/);
  });
});

describe('person360Block', () => {
  const base = (over: Partial<Person360Deps> = {}): Person360Deps => ({
    mode: async () => ({ capability: 'readPerson360', mode: 'live', reason: 'promoted' }),
    who: async () => ({ status: 'present', data: { greetingName: 'Sam', stage: 'activating' } }),
    ready: async () => ({ status: 'present', data: { total: 31, scoreableMax: 60, coverage: 0.75 } }),
    ...over,
  });

  it('is empty unless readPerson360 is live (production today: shadow), and reads nothing', async () => {
    const who = jest.fn();
    expect(await person360Block('enr-1', base({ mode: async () => ({ capability: 'readPerson360', mode: 'shadow', reason: 'not_promoted' }), who }))).toBe('');
    expect(who).not.toHaveBeenCalled();
  });

  it('when live, gives stage and readiness, marked advisory, reading by the sender enrollment', async () => {
    const who = jest.fn(base().who);
    const out = await person360Block('enr-1', base({ who }));
    expect(who).toHaveBeenCalledWith('enrollment:enr-1');
    expect(out).toContain('advisory only');
    expect(out).toContain('lifecycle stage: activating');
    expect(out).toContain('readiness score 31 of 60 (coverage 75%)');
    expect(out).not.toContain('Sam@'); // no address ever
  });

  it('a read that throws is omitted, never fatal', async () => {
    expect(await person360Block('enr-1', base({ ready: async () => { throw new Error('boom'); } }))).toBe('');
  });
});
