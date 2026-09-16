import * as fs from 'fs';
import * as path from 'path';
import { Op } from 'sequelize';

/**
 * T402 — conversation ownership, the source `human_conversation` never had.
 *
 * The ownership model is an IN-MEMORY STORE with the partial unique enforced
 * (one open row per lead per brand throws Sequelize's unique error), so the
 * idempotency claims are driven, not mocked: two reads that both derive an
 * opener leave exactly one row. `activities`, `communication_logs` and the
 * policy table are plain mocks whose `where` clauses are asserted literally,
 * because a mock cannot evaluate a filter — the filter itself is the claim.
 */

type Row = Record<string, unknown> & { id: string; lead_id: number; brand_id: string; cleared_at: Date | null };
const store: Row[] = [];
let seq = 0;

const m = {
  activityFindOne: jest.fn(),
  logFindOne: jest.fn(),
  policyFindOne: jest.fn(),
};

const uniqueError = () => Object.assign(new Error('duplicate key'), { name: 'SequelizeUniqueConstraintError' });

jest.mock('../../../models', () => ({
  Activity: { findOne: (...a: unknown[]) => m.activityFindOne(...a) },
  CommunicationLog: { findOne: (...a: unknown[]) => m.logFindOne(...a) },
  GrowthJourneyPolicy: { findOne: (...a: unknown[]) => m.policyFindOne(...a) },
  GrowthJourneyConversationOwnership: {
    findOne: async ({ where }: { where: Record<string, unknown> }) => {
      const hit = store
        .filter((r) => Object.entries(where).every(([k, v]) => (v === null ? r[k] === null : r[k] === v)))
        .sort((a, b) => (b.since_at as Date).getTime() - (a.since_at as Date).getTime())[0];
      return hit ?? null;
    },
    create: async (row: Record<string, unknown>) => {
      if (store.some((r) => r.lead_id === row.lead_id && r.brand_id === row.brand_id && r.cleared_at === null)) throw uniqueError();
      const created = { ...row, id: `own-${++seq}` } as Row;
      store.push(created);
      return created;
    },
    update: async (values: Record<string, unknown>, { where }: { where: Record<string, unknown> }) => {
      const hits = store.filter((r) => Object.entries(where).every(([k, v]) => (v === null ? r[k] === null : r[k] === v)));
      for (const r of hits) Object.assign(r, values);
      return [hits.length];
    },
  },
}));

import {
  clearHumanConversation,
  openHumanConversation,
  resolveHumanConversation,
} from '../conversationOwnershipService';
import { phase2SourceFiles } from './phase2Sources';

const ASOF = new Date('2026-09-16T12:00:00Z');
const args = (over: Record<string, unknown> = {}) => ({ leadId: 501, brandId: 'b-ent', tenantId: 't-col', asOf: ASOF, ...over });
const days = (n: number) => new Date(ASOF.getTime() - n * 86_400_000);

beforeEach(() => {
  store.length = 0;
  seq = 0;
  for (const fn of Object.values(m)) fn.mockReset();
  m.activityFindOne.mockResolvedValue(null);
  m.logFindOne.mockResolvedValue(null);
  m.policyFindOne.mockResolvedValue(null);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('the three answers', () => {
  it("'yes' when an open human row exists, with the source in the reason and the row's ids", async () => {
    await openHumanConversation({ tenantId: 't-col', brandId: 'b-ent', leadId: 501, ownerId: 'admin-1', source: 'handoff_accepted', sinceAt: days(1) });
    const a = await resolveHumanConversation(args());
    expect(a).toEqual({ value: 'yes', reason: 'open_human_conversation:handoff_accepted', ownership_id: 'own-1', source: 'handoff_accepted', since_at: days(1) });
    // An open row answers by itself: the derivation is never consulted.
    expect(m.activityFindOne).not.toHaveBeenCalled();
    expect(m.logFindOne).not.toHaveBeenCalled();
  });

  it("'no' when none exists and nothing derives one — the lookups all ran", async () => {
    const a = await resolveHumanConversation(args());
    expect(a).toEqual({ value: 'no', reason: 'no open human conversation', ownership_id: null, source: null, since_at: null });
    expect(m.activityFindOne).toHaveBeenCalledTimes(1);
    expect(m.logFindOne).toHaveBeenCalledTimes(1);
    expect(store).toHaveLength(0);
  });

  it("'unknown' only when a lookup FAILED, carrying the error class, logged with ids only, never thrown", async () => {
    m.activityFindOne.mockRejectedValue(Object.assign(new Error('connection reset buyer@example.com'), { name: 'SequelizeConnectionError' }));
    const a = await resolveHumanConversation(args());
    expect(a.value).toBe('unknown');
    expect(a.reason).toMatch(/^lookup_failed:/);
    expect(a.ownership_id).toBeNull();
    const lines = (console.warn as jest.Mock).mock.calls.map((c) => String(c[0])).join('\n');
    expect(lines).toContain('growth_journey.human_conversation_lookup_failed');
    expect(lines).toContain('"lead_id":501');
    expect(lines).not.toContain('buyer@example.com');
  });

  it("'unknown' with no_lead_anchor for a subject with no lead — nothing is queried", async () => {
    const a = await resolveHumanConversation(args({ leadId: null }));
    expect(a).toEqual({ value: 'unknown', reason: 'no_lead_anchor', ownership_id: null, source: null, since_at: null });
    expect(m.activityFindOne).not.toHaveBeenCalled();
  });

  it('a CLEARED row is history, not an answer', async () => {
    await openHumanConversation({ tenantId: 't-col', brandId: 'b-ent', leadId: 501, ownerId: 'admin-1', source: 'manual_claim' });
    await clearHumanConversation({ leadId: 501, brandId: 'b-ent', clearedBy: 'admin-1', reason: 'released', asOf: ASOF });
    expect((await resolveHumanConversation(args())).value).toBe('no');
  });

  it("an open row owned by the AI is not a human conversation: 'no', and the derivation still runs", async () => {
    store.push({ id: 'own-ai', tenant_id: 't-col', brand_id: 'b-ent', lead_id: 501, owner_type: 'ai', owner_id: null, source: 'manual_claim', since_at: ASOF, cleared_at: null });
    const a = await resolveHumanConversation(args());
    expect(a.value).toBe('no');
    expect(m.activityFindOne).toHaveBeenCalledTimes(1);
  });

  it('is brand-scoped: a human owning the thread under one brand says nothing about another', async () => {
    await openHumanConversation({ tenantId: 't-col', brandId: 'b-ent', leadId: 501, ownerId: 'admin-1', source: 'handoff_accepted' });
    expect((await resolveHumanConversation(args({ brandId: 'b-flot' }))).value).toBe('no');
  });
});

describe('the derived openers — read-side, no new detector', () => {
  const activity = { id: 'act-1', lead_id: 501, admin_user_id: 'admin-7', type: 'call', created_at: days(2) };

  it('asks activities for a HUMAN-authored call/meeting/note inside the window — the filter is the claim', async () => {
    await resolveHumanConversation(args());
    expect(m.activityFindOne.mock.calls[0][0]).toEqual({
      where: {
        lead_id: 501,
        admin_user_id: { [Op.ne]: null },
        type: { [Op.in]: ['call', 'meeting', 'note'] },
        created_at: { [Op.gt]: days(7), [Op.lte]: ASOF },
      },
      order: [['created_at', 'DESC']],
    });
  });

  it('asks communication_logs for an OUTBOUND row carrying the personal-outreach trigger inside the window', async () => {
    await resolveHumanConversation(args());
    expect(m.logFindOne.mock.calls[0][0]).toEqual({
      where: {
        lead_id: 501,
        direction: 'outbound',
        'metadata.trigger': 'ali_personal_outreach',
        created_at: { [Op.gt]: days(7), [Op.lte]: ASOF },
      },
      order: [['created_at', 'DESC']],
    });
  });

  it("the window is the brand's cooldown policy when an operator set one, else 7 days", async () => {
    m.policyFindOne.mockResolvedValue({ cooldown_days: 3 });
    await resolveHumanConversation(args());
    expect(m.policyFindOne.mock.calls[0][0]).toEqual({ where: { brand_id: 'b-ent', policy_type: 'cooldown', owner_queue: null, status: 'active' } });
    expect(m.activityFindOne.mock.calls[0][0].where.created_at).toEqual({ [Op.gt]: days(3), [Op.lte]: ASOF });
    m.policyFindOne.mockResolvedValue({ cooldown_days: null });
    await resolveHumanConversation(args());
    expect(m.activityFindOne.mock.calls[1][0].where.created_at).toEqual({ [Op.gt]: days(7), [Op.lte]: ASOF });
  });

  it("a human's call row opens the conversation: yes, derived, recorded ONCE with the activity's author and time", async () => {
    m.activityFindOne.mockResolvedValue(activity);
    const a = await resolveHumanConversation(args());
    expect(a.value).toBe('yes');
    expect(a.reason).toBe('derived_human_conversation:human_activity');
    expect(store).toHaveLength(1);
    expect(store[0]).toMatchObject({
      tenant_id: 't-col', brand_id: 'b-ent', lead_id: 501, owner_type: 'human', owner_id: 'admin-7',
      channel: 'voice', source: 'human_activity', since_at: days(2), cleared_at: null,
    });
    expect(a.ownership_id).toBe(store[0].id);
  });

  it('two consecutive reads that both see the activity leave exactly one ownership row', async () => {
    m.activityFindOne.mockResolvedValue(activity);
    const first = await resolveHumanConversation(args());
    const second = await resolveHumanConversation(args());
    expect(store).toHaveLength(1);
    expect(first.value).toBe('yes');
    // The second read finds the row the first recorded and does not derive again.
    expect(second).toEqual({ ...first, reason: 'open_human_conversation:human_activity' });
    expect(m.activityFindOne).toHaveBeenCalledTimes(1);
  });

  it("Ali's personal outreach opens it too, owned by 'ali', on the log's channel", async () => {
    m.logFindOne.mockResolvedValue({ id: 'log-1', lead_id: 501, channel: 'email', created_at: days(1) });
    const a = await resolveHumanConversation(args());
    expect(a.reason).toBe('derived_human_conversation:ali_personal_outreach');
    expect(store[0]).toMatchObject({ owner_id: 'ali', channel: 'email', source: 'ali_personal_outreach', since_at: days(1) });
  });

  it("the record failing to write does not un-see the human: still 'yes', the reason says record_failed, no row id, logged with ids only", async () => {
    m.activityFindOne.mockResolvedValue(activity);
    const model = (jest.requireMock('../../../models') as { GrowthJourneyConversationOwnership: { create: (...a: unknown[]) => Promise<unknown> } }).GrowthJourneyConversationOwnership;
    const spy = jest.spyOn(model, 'create').mockRejectedValueOnce(Object.assign(new Error('down buyer@example.com'), { name: 'SequelizeConnectionError' }));
    const a = await resolveHumanConversation(args());
    spy.mockRestore();
    expect(a.value).toBe('yes');
    expect(a.reason).toMatch(/^derived_human_conversation:human_activity:record_failed:/);
    expect(a.ownership_id).toBeNull();
    expect(a.source).toBe('human_activity');
    expect(store).toHaveLength(0);
    const lines = (console.warn as jest.Mock).mock.calls.map((c) => String(c[0])).join('\n');
    expect(lines).toContain('growth_journey.human_conversation_record_failed');
    expect(lines).not.toContain('buyer@example.com');
  });

  it('a human activity wins over the outreach log when both exist, and only one row is written', async () => {
    m.activityFindOne.mockResolvedValue(activity);
    m.logFindOne.mockResolvedValue({ id: 'log-1', lead_id: 501, channel: 'email', created_at: days(1) });
    await resolveHumanConversation(args());
    expect(store).toHaveLength(1);
    expect(store[0].source).toBe('human_activity');
    expect(m.logFindOne).not.toHaveBeenCalled();
  });
});

describe('the two writers', () => {
  it('openHumanConversation is idempotent on the open row: a second open is a replay of the first, the owner untouched', async () => {
    const a = await openHumanConversation({ tenantId: 't-col', brandId: 'b-ent', leadId: 501, ownerId: 'admin-1', source: 'handoff_accepted' });
    const b = await openHumanConversation({ tenantId: 't-col', brandId: 'b-ent', leadId: 501, ownerId: 'admin-2', source: 'manual_claim' });
    expect(a.replayed).toBe(false);
    expect(b.replayed).toBe(true);
    expect(b.row.id).toBe(a.row.id);
    expect(store).toHaveLength(1);
    expect(store[0].owner_id).toBe('admin-1');
  });

  it('a unique violation with no open row behind it is rethrown, not reported as a replay', async () => {
    // Simulate the race the index exists for: the create refuses, and the row
    // it refused for was cleared between the two calls.
    store.push({ id: 'own-9', tenant_id: 't-col', brand_id: 'b-ent', lead_id: 501, owner_type: 'human', owner_id: 'x', source: 'manual_claim', since_at: ASOF, cleared_at: null });
    const originalFind = (jest.requireMock('../../../models') as { GrowthJourneyConversationOwnership: { findOne: unknown } }).GrowthJourneyConversationOwnership;
    const spy = jest.spyOn(originalFind as { findOne: (...a: unknown[]) => Promise<unknown> }, 'findOne').mockResolvedValueOnce(null);
    await expect(openHumanConversation({ tenantId: 't-col', brandId: 'b-ent', leadId: 501, ownerId: 'admin-1', source: 'handoff_accepted' })).rejects.toThrow('duplicate key');
    spy.mockRestore();
  });

  it('a non-unique error from the create is rethrown untouched', async () => {
    const model = (jest.requireMock('../../../models') as { GrowthJourneyConversationOwnership: { create: (...a: unknown[]) => Promise<unknown> } }).GrowthJourneyConversationOwnership;
    const boom = Object.assign(new Error('down'), { name: 'SequelizeConnectionError' });
    const spy = jest.spyOn(model, 'create').mockRejectedValueOnce(boom);
    await expect(openHumanConversation({ tenantId: 't-col', brandId: 'b-ent', leadId: 501, ownerId: 'admin-1', source: 'handoff_accepted' })).rejects.toBe(boom);
    spy.mockRestore();
  });

  it('clearHumanConversation stamps who, why and when on every open row for the lead in the brand, and counts them', async () => {
    await openHumanConversation({ tenantId: 't-col', brandId: 'b-ent', leadId: 501, ownerId: 'admin-1', source: 'handoff_accepted' });
    await openHumanConversation({ tenantId: 't-col', brandId: 'b-flot', leadId: 501, ownerId: 'admin-1', source: 'handoff_accepted' });
    const r = await clearHumanConversation({ leadId: 501, brandId: 'b-ent', clearedBy: 'admin-1', reason: 'dispositioned:qualified', asOf: ASOF });
    expect(r).toEqual({ cleared: 1 });
    expect(store.find((x) => x.brand_id === 'b-ent')).toMatchObject({ cleared_at: ASOF, cleared_by: 'admin-1', cleared_reason: 'dispositioned:qualified' });
    expect(store.find((x) => x.brand_id === 'b-flot')?.cleared_at).toBeNull();
    // Clearing nothing is a valid answer, not an error.
    expect(await clearHumanConversation({ leadId: 501, brandId: 'b-ent', clearedBy: 'admin-1', reason: 'again' })).toEqual({ cleared: 0 });
  });
});

describe('what the new file is, and is not', () => {
  const file = path.join(__dirname, '..', 'conversationOwnershipService.ts');
  const src = fs.readFileSync(file, 'utf8');

  it('is in the guarded tree, so the no-send, redaction and fourth-detector scans walk it', () => {
    expect(phase2SourceFiles().map((f) => path.basename(f))).toContain('conversationOwnershipService.ts');
  });

  it('spells none of the opt-out vocabulary: it reads no suppression row and defines no detector', () => {
    for (const word of [/unsubscrib/i, /complain/i, /['"]dnd['"]/, /bounce/i, /UnsubscribeEvent|SuppressionEventRow/]) {
      expect({ word: String(word), hit: word.test(src) }).toEqual({ word: String(word), hit: false });
    }
  });

  it('answers the replay through the one shared unique-violation detector, and never updates from the reader', () => {
    expect(src).toMatch(/isUniqueViolation\(err\)/);
    // The one update in the file is the clear - by name.
    expect(src.match(/\.update\(/g)).toHaveLength(1);
    expect(src).toMatch(/export async function clearHumanConversation[\s\S]*?\.update\(/);
    expect(src).not.toMatch(/\.destroy\(/);
  });

  it('reads the two existing records by their real column names and the real trigger literal', () => {
    expect(src).toContain("'metadata.trigger': PERSONAL_OUTREACH_TRIGGER");
    expect(src).toContain("const PERSONAL_OUTREACH_TRIGGER = 'ali_personal_outreach'");
    expect(src).toContain("['call', 'meeting', 'note']");
    expect(src).toContain('admin_user_id: { [Op.ne]: null }');
  });
});
