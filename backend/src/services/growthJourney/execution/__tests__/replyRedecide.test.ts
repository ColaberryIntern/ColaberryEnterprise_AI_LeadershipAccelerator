const m = {
  campaignFindByPk: jest.fn(),
  enrolFindAll: jest.fn(),
  decide: jest.fn(),
};
jest.mock('../../../../models', () => ({
  Campaign: { findByPk: (...a: unknown[]) => m.campaignFindByPk(...a) },
  GrowthJourneyEnrollment: { findAll: (...a: unknown[]) => m.enrolFindAll(...a) },
}));
jest.mock('../../decisionService', () => ({ decideForSubjectAndRecord: (...a: unknown[]) => m.decide(...a) }));

import type { GrowthJourneyFlags } from '../../../../config/growthJourneyFlags';
import { MAX_BRANDS, brandsForReply, redecideOnReply } from '../replyRedecide';

/**
 * T515 - the re-decision on a reply: which brands, one decide call per brand
 * with `trigger: 'reply'`, the flag gate before any read, one brand's failure
 * not the next's.
 */

const flags = (over: Partial<GrowthJourneyFlags> = {}): GrowthJourneyFlags => ({
  growthJourneyEnabled: true, journeySignalIngest: false, journeyClassification: true, journeyDecisions: true, journeyHandoffs: true, journeyExecution: true, ...over,
});
const row = (brand_id: string) => ({ get: (k: string) => (k === 'brand_id' ? brand_id : null) });
const LEAD = 515;

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());
beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  m.campaignFindByPk.mockResolvedValue(null);
  m.enrolFindAll.mockResolvedValue([]);
  m.decide.mockResolvedValue({ status: 'recorded', replayed: false });
});

describe('which brands', () => {
  it('the replied-to campaign that carries a brand: that brand alone, the enrolments never read', async () => {
    m.campaignFindByPk.mockResolvedValue({ get: (k: string) => (k === 'brand_id' ? 'b-camp' : 'c-1') });
    expect(await brandsForReply(LEAD, 'c-1')).toEqual([{ brand_id: 'b-camp', source: 'campaign' }]);
    expect(m.campaignFindByPk).toHaveBeenCalledWith('c-1', { attributes: ['id', 'brand_id'] });
    expect(m.enrolFindAll).not.toHaveBeenCalled();
  });

  it('a campaign without a brand, or no campaign: every brand where the lead has an ACTIVE enrolment, deduplicated, at most four', async () => {
    m.campaignFindByPk.mockResolvedValue({ get: () => null });
    m.enrolFindAll.mockResolvedValue([row('b-1'), row('b-2'), row('b-1'), row('b-3'), row('b-4'), row('b-5')]);
    const brands = await brandsForReply(LEAD, 'c-nobrand');
    expect(brands.map((b) => b.brand_id)).toEqual(['b-1', 'b-2', 'b-3', 'b-4']);
    expect(brands.every((b) => b.source === 'enrollment')).toBe(true);
    expect(m.enrolFindAll).toHaveBeenCalledWith(expect.objectContaining({ where: { lead_id: LEAD, status: 'active' } }));
    expect(MAX_BRANDS).toBe(4);
    m.enrolFindAll.mockResolvedValue([row('b-9')]);
    expect(await brandsForReply(LEAD, null)).toEqual([{ brand_id: 'b-9', source: 'enrollment' }]);
  });

  it('neither: no brand, no re-decision, one logged line naming the lead id and no address', async () => {
    const r = await redecideOnReply({ leadId: LEAD, campaignId: null, flags: flags() });
    expect(r).toEqual({ status: 'no_brand' });
    expect(m.decide).not.toHaveBeenCalled();
    const line = (console.log as jest.Mock).mock.calls.map((c) => String(c[0])).find((l) => l.includes('growth_journey.reply.no_brand'))!;
    expect(JSON.parse(line)).toMatchObject({ context: { lead_id: LEAD, campaign_id: null } });
    expect(line).not.toContain('@');
  });
});

describe('acceptance 3: one reply, one decide call per chosen brand, with trigger reply and the hook flags', () => {
  it('two brands from enrolments -> two calls in order, each trigger reply, anchored on the lead, carrying the flags and the asOf', async () => {
    m.enrolFindAll.mockResolvedValue([row('b-1'), row('b-2')]);
    const asOf = new Date('2026-09-21T15:00:00Z');
    const f = flags();
    const r = await redecideOnReply({ leadId: LEAD, campaignId: null, flags: f, asOf });
    expect(r).toEqual({ status: 'decided', brands: [{ brand_id: 'b-1', source: 'enrollment', result: 'recorded' }, { brand_id: 'b-2', source: 'enrollment', result: 'recorded' }] });
    expect(m.decide).toHaveBeenCalledTimes(2);
    expect(m.decide.mock.calls.map((c) => c[0])).toEqual([
      { anchor: { leadId: LEAD }, brandId: 'b-1', trigger: 'reply', flags: f, explorerFlags: undefined, asOf },
      { anchor: { leadId: LEAD }, brandId: 'b-2', trigger: 'reply', flags: f, explorerFlags: undefined, asOf },
    ]);
  });

  it('flags off (the decisions flag, or the master) -> disabled before any read: zero decide calls, zero model reads', async () => {
    for (const over of [{ journeyDecisions: false }, { growthJourneyEnabled: false }]) {
      expect(await redecideOnReply({ leadId: LEAD, campaignId: 'c-1', flags: flags(over) })).toEqual({ status: 'disabled' });
    }
    expect(m.decide).not.toHaveBeenCalled();
    expect(m.campaignFindByPk).not.toHaveBeenCalled();
    expect(m.enrolFindAll).not.toHaveBeenCalled();
  });

  it('one brand that throws is one error line with its class; the next brand still decides; nothing throws out', async () => {
    m.enrolFindAll.mockResolvedValue([row('b-1'), row('b-2')]);
    m.decide.mockRejectedValueOnce(Object.assign(new Error('deadlock'), { name: 'SequelizeDatabaseError' })).mockResolvedValueOnce({ status: 'recorded', replayed: true });
    const r = await redecideOnReply({ leadId: LEAD, campaignId: null, flags: flags() });
    expect(r).toEqual({ status: 'decided', brands: [{ brand_id: 'b-1', source: 'enrollment', result: 'failed' }, { brand_id: 'b-2', source: 'enrollment', result: 'recorded' }] });
    const line = (console.error as jest.Mock).mock.calls.map((c) => String(c[0])).find((l) => l.includes('growth_journey.reply.redecide_failed'))!;
    expect(JSON.parse(line)).toMatchObject({ level: 'error', outcome: 'failure', error_class: 'SequelizeDatabaseError', context: { lead_id: LEAD, brand_id: 'b-1' } });
  });
});
