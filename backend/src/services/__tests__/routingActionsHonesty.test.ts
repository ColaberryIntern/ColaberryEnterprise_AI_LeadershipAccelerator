/**
 * T226 — the three stubs that used to return `ok: true` while doing nothing
 * now say so; `runAction` maps a handler's `deferred` answer to `deferred`,
 * never `ok`; `tag_lead` persists only what `leads` can hold and says so; and the registry
 * exposes its keys so the admin schema can validate against them.
 */
const mockLogActivity = jest.fn();
jest.mock('../emailService', () => ({ sendNewLeadAlert: jest.fn() }));
jest.mock('../communicationLogService', () => ({ logCommunication: jest.fn() }));
jest.mock('../callbackRequestService', () => ({ requestInstantCallback: jest.fn() }));
jest.mock('../activityService', () => ({ logActivity: (...a: unknown[]) => mockLogActivity(...a) }));
jest.mock('../../models', () => ({ Campaign: {}, CommunicationLog: { findOne: jest.fn() } }));

import { ACTION_HANDLERS, knownActionTypes, runAction, type ActionHandler } from '../routingActionsService';

const ctx = (lead: Record<string, any> = {}) => ({
  lead: { id: 7, ...lead },
  source_slug: 'ai-flotation',
  entry_slug: 'workflow_intake',
  raw_payload_id: 'raw-1',
  normalized: {},
});

beforeEach(() => mockLogActivity.mockReset().mockResolvedValue({}));

describe('the former silent-green stubs', () => {
  for (const type of ['send_pdf', 'create_deal', 'trigger_booking_flow'] as const) {
    it(`${type} returns not_implemented, and runAction records it as failed`, async () => {
      const action = type === 'send_pdf' ? { type, pdf_slug: 'x' } : { type };
      const direct = await ACTION_HANDLERS[type](action, ctx());
      expect(direct.ok).toBe(false);
      expect((direct as { error: string }).error).toMatch(/^not_implemented/);
      const viaRunner = await runAction(action, ctx());
      expect(viaRunner.status).toBe('failed');
      expect(viaRunner.error).toMatch(/^not_implemented/);
      // and the activity row says "failed", never "queued"
      const subjects = mockLogActivity.mock.calls.map((c) => c[0].subject as string);
      expect(subjects.some((s) => /queued|triggered/i.test(s))).toBe(false);
      expect(subjects.some((s) => /failed/i.test(s))).toBe(true);
    });
  }

  it('send_pdf still refuses a missing pdf_slug first', async () => {
    const r = await ACTION_HANDLERS.send_pdf({ type: 'send_pdf' }, ctx());
    expect(r).toEqual({ ok: false, error: 'pdf_slug is required' });
  });
});

describe('deferred is its own status', () => {
  it('a handler answering deferred is recorded as deferred, not ok, with its detail', async () => {
    const deferring: ActionHandler = async () => ({ ok: 'deferred', detail: { would: 'enter_campaign', deferred_reason: 'phase2_no_execution' } });
    ACTION_HANDLERS.__test_deferring = deferring;
    try {
      const r = await runAction({ type: '__test_deferring' }, ctx());
      expect(r.status).toBe('deferred');
      expect(r.detail).toEqual({ would: 'enter_campaign', deferred_reason: 'phase2_no_execution' });
      expect(mockLogActivity).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Routing action deferred: __test_deferring' }));
    } finally {
      delete ACTION_HANDLERS.__test_deferring;
    }
  });

  it('an unknown type is still unknown, not deferred', async () => {
    const r = await runAction({ type: 'no_such_thing' }, ctx());
    expect(r.status).toBe('unknown');
  });
});

describe('tag_lead persists only what leads can hold, and says so', () => {
  // `leads` has no tags/metadata column (live table checked 2026-09-11); the
  // Lead model declares none either, so a write to `metadata` would be dropped
  // by Sequelize with no error — exactly the silent green this file legislates
  // against. The one column it can write is interest_level.
  it('the first tag lands in interest_level', async () => {
    const update = jest.fn(async () => ({}));
    const r = await ACTION_HANDLERS.tag_lead({ type: 'tag_lead', tag: 'hot' }, ctx({ interest_level: null, update }));
    expect(r).toEqual({ ok: true, detail: { tag: 'hot', persisted_as: 'interest_level' } });
    expect(update).toHaveBeenCalledWith({ interest_level: 'hot' });
  });

  it('the same tag again is an idempotent no-op', async () => {
    const update = jest.fn(async () => ({}));
    const r = await ACTION_HANDLERS.tag_lead({ type: 'tag_lead', tag: 'hot' }, ctx({ interest_level: 'hot', update }));
    expect(r).toEqual({ ok: true, detail: { tag: 'hot', persisted_as: 'interest_level', already: true } });
    expect(update).not.toHaveBeenCalled();
  });

  it('a different tag on a lead that already has one is NOT silently dropped', async () => {
    const update = jest.fn(async () => ({}));
    const r = await ACTION_HANDLERS.tag_lead({ type: 'tag_lead', tag: 'hot' }, ctx({ interest_level: 'warm', update }));
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/not_persisted/);
    expect(update).not.toHaveBeenCalled();
  });

  it('never writes a column the Lead model does not declare', () => {
    // The guard for the write-to-nowhere: whatever tag_lead writes must be a real attribute.
    const Lead = jest.requireActual('../../models/Lead').default;
    const attrs = Object.keys(Lead.getAttributes());
    expect(attrs).toContain('interest_level');
    expect(attrs).not.toContain('metadata');
    expect(attrs).not.toContain('tags');
  });
});

describe('the registry', () => {
  it('exposes exactly the seven existing types (Phase 2 actions register in T227)', () => {
    expect(knownActionTypes().sort()).toEqual(
      ['create_deal', 'enroll_campaign', 'notify_sales', 'request_callback', 'send_pdf', 'tag_lead', 'trigger_booking_flow'].sort(),
    );
  });
});
