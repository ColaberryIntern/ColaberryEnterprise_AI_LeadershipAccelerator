/**
 * Step 9 actions: each is a transition PLUS the side effect that makes the new status true.
 *
 *   - schedule / publish_now create one job per variant, and a second identical call creates
 *     NONE (the idempotency key is derived, not random);
 *   - every forward action is gated on validation, and a failed gate leaves the status alone;
 *   - a past scheduled_for is refused before anything is touched;
 *   - save_draft from review withdraws the open request so it cannot be approved later.
 */

const mockItem = { id: 'ci-1', tenant_id: 't-1', brand_id: 'b-1', status: 'approved', revision: 2, content_type: 'text', update: jest.fn() };
const mockVariants = [
  { id: 'v-li', provider: 'linkedin_organization', channel_account_id: null },
  { id: 'v-x', provider: 'x', channel_account_id: null },
];
const mockJobStore = new Map<string, { id: string }>();
const mockApprovalUpdate = jest.fn();
const mockApprovalCreate = jest.fn();
const mockApprovalFindOne = jest.fn();
const mockValidateItem = jest.fn();

jest.mock('../../../models', () => ({
  ContentItem: { findByPk: jest.fn(async (id: string) => (id === 'ci-1' ? mockItem : null)) },
  ContentVariant: { findAll: jest.fn(async () => mockVariants) },
  ContentApprovalRequest: { update: mockApprovalUpdate, create: mockApprovalCreate, findOne: mockApprovalFindOne },
  PublishingJob: {
    findOrCreate: jest.fn(async ({ where }: { where: { idempotency_key: string } }) => {
      const key = where.idempotency_key;
      if (mockJobStore.has(key)) return [mockJobStore.get(key), false];
      const row = { id: `job-${mockJobStore.size + 1}` };
      mockJobStore.set(key, row);
      return [row, true];
    }),
  },
}));

jest.mock('../composerService', () => ({ validateItem: (...a: unknown[]) => mockValidateItem(...a) }));

import { publishNow, saveDraft, schedule, sendForApproval } from '../composerActionService';
import { WorkflowError } from '../contentWorkflowService';

const OK = { ok: true, providers: { ok: true, variants: [], blockers: [] }, governance: null };
const BLOCKED = { ok: false, providers: { ok: false, variants: [], blockers: [{ provider: 'x', field: 'text', severity: 'block', message: 'X: 300 of 280 characters - 20 over.' }] }, governance: null };

beforeEach(() => {
  mockItem.status = 'approved';
  mockItem.update.mockReset().mockImplementation(async (patch: Record<string, unknown>) => Object.assign(mockItem, patch));
  mockJobStore.clear();
  mockApprovalUpdate.mockReset();
  mockApprovalCreate.mockReset().mockImplementation(async (v: Record<string, unknown>) => ({ id: 'ar-1', ...v }));
  mockApprovalFindOne.mockReset().mockResolvedValue(null);
  mockValidateItem.mockReset().mockResolvedValue(OK);
});

describe('schedule', () => {
  const NOW = new Date('2026-11-01T12:00:00Z');
  const WHEN = new Date('2026-11-03T15:00:00Z');

  it('creates one job per variant and moves the item to scheduled', async () => {
    const r = await schedule('ci-1', WHEN, NOW);
    expect(r.jobs.map((j) => [j.provider, j.created])).toEqual([['linkedin_organization', true], ['x', true]]);
    expect(r.jobs.every((j) => j.publishAt === WHEN.toISOString())).toBe(true);
    expect(mockItem.status).toBe('scheduled');
    expect(mockItem.update).toHaveBeenCalledWith({ scheduled_for: WHEN });
  });

  it('is idempotent: the same call again creates no new jobs and returns the same ids', async () => {
    const first = await schedule('ci-1', WHEN, NOW);
    mockItem.status = 'approved'; // as if a reviewer re-approved and the operator clicked again
    const second = await schedule('ci-1', WHEN, NOW);
    expect(second.jobs.map((j) => j.id)).toEqual(first.jobs.map((j) => j.id));
    expect(second.jobs.every((j) => j.created === false)).toBe(true);
    expect(mockJobStore.size).toBe(2);
  });

  it('a new revision at the same time is a DIFFERENT job, by design', async () => {
    await schedule('ci-1', WHEN, NOW);
    mockItem.status = 'approved';
    mockItem.revision = 3;
    const r = await schedule('ci-1', WHEN, NOW);
    expect(r.jobs.every((j) => j.created === true)).toBe(true);
    expect(mockJobStore.size).toBe(4);
    mockItem.revision = 2;
  });

  it('refuses a past time before touching anything', async () => {
    await expect(schedule('ci-1', new Date('2026-10-01T00:00:00Z'), NOW)).rejects.toMatchObject({ status: 400, errorClass: 'ValidationError' });
    expect(mockItem.update).not.toHaveBeenCalled();
    expect(mockJobStore.size).toBe(0);
  });

  it('refuses from a non-approved status as an illegal transition, not a validation error', async () => {
    mockItem.status = 'draft';
    await expect(schedule('ci-1', WHEN, NOW)).rejects.toMatchObject({ status: 409, errorClass: 'IllegalTransition' });
    expect(mockValidateItem).not.toHaveBeenCalled();
  });

  it('a validation blocker stops it and the status does not move', async () => {
    mockValidateItem.mockResolvedValue(BLOCKED);
    await expect(schedule('ci-1', WHEN, NOW)).rejects.toMatchObject({ status: 409, errorClass: 'ValidationFailed' });
    expect(mockItem.status).toBe('approved');
    expect(mockJobStore.size).toBe(0);
  });
});

describe('publish_now', () => {
  it('queues jobs due at the moment of the call', async () => {
    const NOW = new Date('2026-11-01T12:00:00Z');
    const r = await publishNow('ci-1', NOW);
    expect(r.jobs).toHaveLength(2);
    expect(r.jobs[0].publishAt).toBe(NOW.toISOString());
    expect(mockItem.status).toBe('scheduled');
  });
});

describe('send_for_approval', () => {
  it('moves a draft to review and opens exactly one request pinned to the revision', async () => {
    mockItem.status = 'draft';
    const r = await sendForApproval('ci-1', { adminId: 'a-sohail', email: 'sohail@colaberry.com' });
    expect(r.approvalRequestId).toBe('ar-1');
    // requested_by is a UUID column: the admin id. This test used to pin the email here,
    // which is exactly the value the database refused on production.
    expect(mockApprovalCreate).toHaveBeenCalledWith(expect.objectContaining({ content_item_id: 'ci-1', status: 'pending', revision_at_request: 2, requested_by: 'a-sohail' }));
    expect(mockItem.status).toBe('ready_for_review');
  });

  it('never writes the email into requested_by when the actor has no id', async () => {
    mockItem.status = 'draft';
    await sendForApproval('ci-1', { email: 'sohail@colaberry.com' });
    expect(mockApprovalCreate.mock.calls[0][0].requested_by).toBeNull();
  });

  it('a second click reuses the open request rather than opening another', async () => {
    mockItem.status = 'changes_requested';
    mockApprovalFindOne.mockResolvedValue({ id: 'ar-existing', revision_at_request: 2, update: jest.fn() });
    const r = await sendForApproval('ci-1', { email: 'sohail@colaberry.com' });
    expect(r.approvalRequestId).toBe('ar-existing');
    expect(mockApprovalCreate).not.toHaveBeenCalled();
  });

  it('an open request for an OLDER revision is withdrawn and replaced', async () => {
    mockItem.status = 'draft';
    const stale = { id: 'ar-old', revision_at_request: 1, update: jest.fn() };
    mockApprovalFindOne.mockResolvedValue(stale);
    const r = await sendForApproval('ci-1', { email: 'sohail@colaberry.com' });
    expect(stale.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'withdrawn' }));
    expect(r.approvalRequestId).toBe('ar-1');
  });

  it('is gated on validation, and the failure names the count', async () => {
    mockItem.status = 'draft';
    mockValidateItem.mockResolvedValue(BLOCKED);
    let caught: unknown;
    try { await sendForApproval('ci-1', {}); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(WorkflowError);
    expect((caught as WorkflowError).message).toBe('Validation failed: 1 blocking problem across platform variants.');
    expect(mockItem.status).toBe('draft');
    expect(mockApprovalCreate).not.toHaveBeenCalled();
  });
});

describe('save_draft', () => {
  it('from review: withdraws the open request and returns to draft', async () => {
    mockItem.status = 'ready_for_review';
    await saveDraft('ci-1');
    expect(mockApprovalUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'withdrawn' }), { where: { content_item_id: 'ci-1', status: 'pending' } });
    expect(mockItem.status).toBe('draft');
  });

  it('from draft: a no-op that does not write', async () => {
    mockItem.status = 'draft';
    await saveDraft('ci-1');
    expect(mockItem.update).not.toHaveBeenCalled();
    expect(mockApprovalUpdate).not.toHaveBeenCalled();
  });

  it('from scheduled: not a legal way back (unschedule is a different action)', async () => {
    mockItem.status = 'scheduled';
    await expect(saveDraft('ci-1')).rejects.toMatchObject({ status: 409, errorClass: 'IllegalTransition' });
  });
});
