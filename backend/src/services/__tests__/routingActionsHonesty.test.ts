/**
 * T226 — the three stubs that used to return `ok: true` while doing nothing
 * now say so; `runAction` maps a handler's `deferred` answer to `deferred`,
 * never `ok`; `tag_lead` persists the tags it computes; and the registry
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

describe('tag_lead persists what it computes', () => {
  it('writes the tags list into metadata and keeps interest_level', async () => {
    const update = jest.fn(async () => ({}));
    const r = await ACTION_HANDLERS.tag_lead({ type: 'tag_lead', tag: 'hot' }, ctx({ metadata: { tags: ['old'], other: 1 }, interest_level: 'warm', update }));
    expect(r).toEqual({ ok: true, detail: { tag: 'hot', tags: ['old', 'hot'] } });
    expect(update).toHaveBeenCalledWith({ metadata: { tags: ['old', 'hot'], other: 1 }, interest_level: 'warm' });
  });

  it('is idempotent on the tag', async () => {
    const update = jest.fn(async () => ({}));
    await ACTION_HANDLERS.tag_lead({ type: 'tag_lead', tag: 'hot' }, ctx({ metadata: { tags: ['hot'] }, update }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ metadata: { tags: ['hot'] } }));
  });
});

describe('the registry', () => {
  it('exposes exactly the seven existing types (Phase 2 actions register in T227)', () => {
    expect(knownActionTypes().sort()).toEqual(
      ['create_deal', 'enroll_campaign', 'notify_sales', 'request_callback', 'send_pdf', 'tag_lead', 'trigger_booking_flow'].sort(),
    );
  });
});
