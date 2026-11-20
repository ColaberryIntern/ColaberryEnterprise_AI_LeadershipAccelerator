/**
 * CH6.2 approvals against an in-memory store that behaves like the tables: the approval row records
 * who and the hash; changing a body, a destination or the send time VOIDS it and returns the message
 * to needs_approval; an unchanged (or reverted) edit keeps it; undo voids as 'undone'; created_by and
 * approved_by are recorded separately and may be the same person.
 */
type Row = Record<string, any>;
const messages = new Map<string, Row>();
let drafts: Row[] = [];
let destinations: Row[] = [];
let approvals: Row[] = [];
const activity: Row[] = [];
const withUpdate = (r: Row): Row => Object.assign(r, { update: jest.fn(async (p: Row) => Object.assign(r, p)) });

jest.mock('../../../../config/database', () => ({ sequelize: { transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb({ LOCK: { UPDATE: 'UPDATE' } })) } }));
jest.mock('../../../../models/CommsHubMessage', () => ({ __esModule: true, default: { findByPk: jest.fn(async (id: string) => messages.get(id) ?? null) } }));
jest.mock('../../../../models/CommsHubDraft', () => ({ __esModule: true, default: { findAll: jest.fn(async ({ where }: Row) => drafts.filter((d) => d.message_id === where.message_id).sort((a, b) => (a.channel < b.channel ? -1 : a.channel > b.channel ? 1 : b.version - a.version))) } }));
jest.mock('../../../../models/CommsHubDestination', () => ({ __esModule: true, default: { findAll: jest.fn(async ({ where }: Row) => destinations.filter((d) => d.message_id === where.message_id)) } }));
jest.mock('../../../../models/CommsHubApproval', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(async ({ where }: Row) => approvals.find((a) => a.message_id === where.message_id && a.voided_at == null) ?? null),
    create: jest.fn(async (r: Row) => {
      if (approvals.some((a) => a.message_id === r.message_id && a.voided_at == null)) throw Object.assign(new Error('uq_comms_hub_approvals_active'), { name: 'SequelizeUniqueConstraintError' });
      const row = withUpdate({ id: `ap${approvals.length + 1}`, voided_at: null, voided_reason: null, ...r });
      approvals.push(row);
      return row;
    }),
  },
}));
jest.mock('../../activityLog', () => ({ logActivity: jest.fn(async (_a: Row, action: string, _t: string, id: string, detail: Row) => { activity.push({ action, id, ...detail }); }) }));

import { sequelize } from '../../../../config/database';
import { approveMessage, cancelMessage, MessageRuleError, reconcileApproval, rejectMessage, scheduleMessage, submitForApproval, undoApproval } from '../approvals';
import { approvalHash } from '../messageStatus';

const JACKIE = { id: 'jackie-1', label: 'Jackie' };
const TAIWO = { id: 'taiwo-1', label: 'Taiwo' };
const AT = new Date('2026-12-01T18:00:00Z');

beforeEach(() => {
  messages.clear(); activity.length = 0; approvals = []; jest.clearAllMocks();
  messages.set('m1', withUpdate({ id: 'm1', status: 'needs_approval', send_at: AT, created_by: 'jackie-1' }));
  drafts = [
    { message_id: 'm1', channel: 'community_post', version: 1, title: null, body: 'old body' },
    { message_id: 'm1', channel: 'community_post', version: 2, title: null, body: 'Demo Tuesday is tomorrow at 6:00 PM CST.' },
    { message_id: 'm1', channel: 'in_app', version: 1, title: 'Demo Tuesday', body: 'Tomorrow, 6:00 PM CST' },
  ];
  destinations = [{ message_id: 'm1', channel: 'community_post', target_type: 'cohort_feed', target_id: 'c1' }];
});

const err = async (p: Promise<unknown>): Promise<MessageRuleError> => { try { await p; } catch (e) { return e as MessageRuleError; } throw new Error('expected a refusal'); };

describe('CH6.2 approve', () => {
  it('records who approved and the hash of the LATEST version of each channel, the destinations and the send time', async () => {
    const { message, approval } = await approveMessage('m1', TAIWO, AT);
    expect(message.status).toBe('approved');
    expect(approval).toMatchObject({ message_id: 'm1', approved_by: 'taiwo-1' });
    expect(approval.content_hash).toBe(approvalHash({
      drafts: [{ channel: 'community_post', title: null, body: 'Demo Tuesday is tomorrow at 6:00 PM CST.' }, { channel: 'in_app', title: 'Demo Tuesday', body: 'Tomorrow, 6:00 PM CST' }],
      destinations: [{ channel: 'community_post', target_type: 'cohort_feed', target_id: 'c1' }],
      send_at: AT,
    }));
    expect(activity.find((a) => a.action === 'message.approved')).toMatchObject({ created_by: 'jackie-1', same_person: false });
  });

  it('created_by and approved_by are recorded separately; the same person may do both', async () => {
    const { approval } = await approveMessage('m1', JACKIE, AT);
    expect([messages.get('m1')!.created_by, approval.approved_by]).toEqual(['jackie-1', 'jackie-1']);
    expect(activity.find((a) => a.action === 'message.approved')!.same_person).toBe(true);
  });

  it('nothing to send is refused: no draft, or no destination; and only from needs_approval', async () => {
    destinations = [];
    expect((await err(approveMessage('m1', JACKIE, AT))).reason).toBe('no_destination');
    destinations = [{ message_id: 'm1', channel: 'in_app', target_type: 'in_app_audience', target_id: 'all_members' }];
    drafts = [];
    expect((await err(approveMessage('m1', JACKIE, AT))).reason).toBe('no_draft');
    messages.get('m1')!.status = 'draft';
    expect((await err(approveMessage('m1', JACKIE, AT))).reason).toBe('invalid_transition');
    expect(approvals).toEqual([]);
  });

  it('needs a signed-in person', async () => {
    expect((await err(approveMessage('m1', { id: null, label: 'Scheduled sender' }, AT))).reason).toBe('no_actor');
  });
});

describe('CH6.2 a change voids the approval and returns the message to needs_approval', () => {
  beforeEach(async () => { await approveMessage('m1', TAIWO, AT); });

  it('changing the body', async () => {
    drafts.push({ message_id: 'm1', channel: 'community_post', version: 3, title: null, body: 'Demo Tuesday is TOMORROW at 6:00 PM CST!' });
    expect(await reconcileApproval('m1', 'draft_changed', JACKIE, AT)).toBe(true);
    expect(messages.get('m1')!.status).toBe('needs_approval');
    expect(approvals[0]).toMatchObject({ voided_at: AT, voided_reason: 'draft_changed' });
  });

  it('changing a destination', async () => {
    destinations.push({ message_id: 'm1', channel: 'in_app', target_type: 'in_app_audience', target_id: 'all_members' });
    expect(await reconcileApproval('m1', 'destinations_changed', JACKIE, AT)).toBe(true);
    expect(messages.get('m1')!.status).toBe('needs_approval');
    expect(approvals[0].voided_reason).toBe('destinations_changed');
  });

  it('changing the send time (also once scheduled)', async () => {
    messages.get('m1')!.status = 'scheduled';
    messages.get('m1')!.send_at = new Date('2026-12-01T19:00:00Z');
    expect(await reconcileApproval('m1', 'send_time_changed', JACKIE, AT)).toBe(true);
    expect(messages.get('m1')!.status).toBe('needs_approval');
    expect(approvals[0].voided_reason).toBe('send_time_changed');
  });

  it('CONTROL: an edit that leaves the content identical keeps the approval', async () => {
    drafts.push({ message_id: 'm1', channel: 'community_post', version: 3, title: null, body: 'Demo Tuesday is tomorrow at 6:00 PM CST.' });
    expect(await reconcileApproval('m1', 'draft_changed', JACKIE, AT)).toBe(false);
    expect(messages.get('m1')!.status).toBe('approved');
    expect(approvals[0].voided_at).toBeNull();
  });

  it('a message that is not approved is left alone', async () => {
    messages.get('m1')!.status = 'sending';
    expect(await reconcileApproval('m1', 'draft_changed', JACKIE, AT)).toBe(false);
  });

  it('re-approving after a void writes a NEW approval; the voided one is kept (one in force at a time)', async () => {
    destinations.push({ message_id: 'm1', channel: 'in_app', target_type: 'in_app_audience', target_id: 'all_members' });
    await reconcileApproval('m1', 'destinations_changed', JACKIE, AT);
    await approveMessage('m1', TAIWO, AT);
    expect(approvals).toHaveLength(2);
    expect(approvals.filter((a) => a.voided_at == null)).toHaveLength(1);
    expect(approvals[0].content_hash).not.toBe(approvals[1].content_hash);
  });
});

describe('CH6.2 submit, reject, undo', () => {
  it('submit: draft -> needs_approval; reject: back to draft with the note', async () => {
    messages.get('m1')!.status = 'draft';
    await submitForApproval('m1', JACKIE);
    expect(messages.get('m1')!.status).toBe('needs_approval');
    await rejectMessage('m1', TAIWO, 'Say the time once, not twice.');
    expect(messages.get('m1')!.status).toBe('draft');
    expect(activity.find((a) => a.action === 'message.rejected')!.note).toBe('Say the time once, not twice.');
  });

  it('undo approval: voided as undone, back to needs_approval; undo on a message that is not approved is refused', async () => {
    await approveMessage('m1', TAIWO, AT);
    await undoApproval('m1', TAIWO, AT);
    expect(messages.get('m1')!.status).toBe('needs_approval');
    expect(approvals[0].voided_reason).toBe('undone');
    expect((await err(undoApproval('m1', TAIWO, AT))).status).toBe(409);
  });

  it('an unknown message is a 404', async () => {
    expect((await err(approveMessage('nope', TAIWO, AT))).status).toBe(404);
  });
});

describe('CH6.2 attempt 2', () => {
  it('a partly failed send that is edited: the approval is voided and the message goes back for approval before any retry', async () => {
    await approveMessage('m1', TAIWO, AT);
    messages.get('m1')!.status = 'partially_failed';
    drafts.push({ message_id: 'm1', channel: 'community_post', version: 3, title: null, body: 'Corrected: Demo Tuesday is tomorrow at 6:30 PM CST.' });
    expect(await reconcileApproval('m1', 'draft_changed', JACKIE, AT)).toBe(true);
    expect(messages.get('m1')!.status).toBe('needs_approval');
    expect(approvals[0]).toMatchObject({ voided_reason: 'draft_changed' });
    // ...and the same for a failed one, by undo.
    await approveMessage('m1', TAIWO, AT);
    messages.get('m1')!.status = 'failed';
    await undoApproval('m1', TAIWO, AT);
    expect(messages.get('m1')!.status).toBe('needs_approval');
  });

  it('cancelling voids the approval in force (kept, reason cancelled); a sending message cannot be cancelled', async () => {
    await approveMessage('m1', TAIWO, AT);
    await cancelMessage('m1', JACKIE, AT);
    expect(messages.get('m1')!.status).toBe('cancelled');
    expect(approvals[0]).toMatchObject({ voided_at: AT, voided_reason: 'cancelled' });
    messages.get('m1')!.status = 'sending';
    expect((await err(cancelMessage('m1', JACKIE, AT))).reason).toBe('invalid_transition');
  });

  it('"send now": scheduling never writes the send time, so the approval stays valid', async () => {
    messages.get('m1')!.send_at = null;
    await approveMessage('m1', TAIWO, AT);
    await scheduleMessage('m1', TAIWO);
    expect(messages.get('m1')).toMatchObject({ status: 'scheduled', send_at: null });
    expect(await reconcileApproval('m1', 'send_time_changed', JACKIE, AT)).toBe(false);
    expect(approvals[0].voided_at).toBeNull();
  });

  it("joins the caller's transaction when given one (the edit and the void commit together)", async () => {
    await approveMessage('m1', TAIWO, AT);
    (sequelize.transaction as jest.Mock).mockClear();
    destinations.push({ message_id: 'm1', channel: 'in_app', target_type: 'in_app_audience', target_id: 'all_members' });
    const outer = { LOCK: { UPDATE: 'UPDATE' } } as never;
    expect(await reconcileApproval('m1', 'destinations_changed', JACKIE, AT, outer)).toBe(true);
    expect(sequelize.transaction).not.toHaveBeenCalled();
  });
});
