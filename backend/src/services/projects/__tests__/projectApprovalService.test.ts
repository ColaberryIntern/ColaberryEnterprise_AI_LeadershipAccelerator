/**
 * The review-and-approve state machine, and the two guarantees that keep it from
 * hurting anyone: ownership is the query (a foreign id is a 404, never a write),
 * and the publish-time mark is gated + never throws into the build.
 */

// A mutable env mock so a test can flip the gate between 'off' and 'all'.
jest.mock('../../../config/env', () => ({ env: { projectApprovalGate: 'off' } }));

const findOne = jest.fn();
jest.mock('../../../models/Project', () => ({ __esModule: true, default: { findOne: (...a: any[]) => findOne(...a) } }));

import { env } from '../../../config/env';
import {
  approvalGateAppliesTo,
  approveProject,
  requestProjectChanges,
  markProjectPendingApproval,
} from '../projectApprovalService';

function fakeProject(overrides: Record<string, any> = {}) {
  return {
    id: 'p1',
    enrollment_id: 'e1',
    approval_state: null,
    approved_at: null,
    approved_by: null,
    approval_notes: null,
    approval_updated_at: null,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (env as any).projectApprovalGate = 'off';
});

describe('approvalGateAppliesTo', () => {
  it('is off by default and for an empty setting', () => {
    expect(approvalGateAppliesTo('e1', 'off')).toBe(false);
    expect(approvalGateAppliesTo('e1', '')).toBe(false);
  });
  it('is on for everyone with "all"', () => {
    expect(approvalGateAppliesTo('e1', 'all')).toBe(true);
    expect(approvalGateAppliesTo(null, 'all')).toBe(true);
  });
  it('matches an enrollment in a comma-separated list, and no one else', () => {
    expect(approvalGateAppliesTo('e2', 'e1, e2 ,e3')).toBe(true);
    expect(approvalGateAppliesTo('e9', 'e1,e2,e3')).toBe(false);
    expect(approvalGateAppliesTo(null, 'e1,e2')).toBe(false);
  });
});

describe('ownership is the query', () => {
  it('returns null (→404) when the project is not the enrollment\'s', async () => {
    findOne.mockResolvedValue(null);
    expect(await approveProject('e1', 'p-someone-else')).toBeNull();
    expect(await requestProjectChanges('e1', 'p-someone-else', 'x')).toBeNull();
    // Both looked up scoped by BOTH id and enrollment, never id alone.
    expect(findOne).toHaveBeenCalledWith({ where: { id: 'p-someone-else', enrollment_id: 'e1' } });
  });
});

describe('approveProject', () => {
  it('moves a pending project to approved and stamps who/when', async () => {
    const p = fakeProject({ approval_state: 'pending_approval', approval_notes: 'was off' });
    findOne.mockResolvedValue(p);
    const dto = await approveProject('e1', 'p1');
    expect(p.approval_state).toBe('approved');
    expect(p.approved_by).toBe('e1');
    expect(p.approved_at).toBeInstanceOf(Date);
    expect(p.approval_notes).toBeNull(); // an approval clears a prior change request
    expect(p.save).toHaveBeenCalledTimes(1);
    expect(dto).toMatchObject({ id: 'p1', approval_state: 'approved' });
    expect(typeof dto!.approved_at).toBe('string'); // serialized ISO, not a Date
  });

  it('is idempotent — approving an approved project does not write again', async () => {
    const p = fakeProject({ approval_state: 'approved' });
    findOne.mockResolvedValue(p);
    const dto = await approveProject('e1', 'p1');
    expect(p.save).not.toHaveBeenCalled();
    expect(dto).toMatchObject({ approval_state: 'approved' });
  });
});

describe('requestProjectChanges', () => {
  it('flags the project and records the note, clearing any approval', async () => {
    const p = fakeProject({ approval_state: 'approved', approved_at: new Date(), approved_by: 'e1' });
    findOne.mockResolvedValue(p);
    const dto = await requestProjectChanges('e1', 'p1', '  the finder ignores SAM.gov  ');
    expect(p.approval_state).toBe('changes_requested');
    expect(p.approval_notes).toBe('the finder ignores SAM.gov'); // trimmed
    expect(p.approved_at).toBeNull();
    expect(p.approved_by).toBeNull();
    expect(dto).toMatchObject({ approval_state: 'changes_requested', approval_notes: 'the finder ignores SAM.gov' });
  });

  it('stores null, not empty string, for a blank note', async () => {
    const p = fakeProject({ approval_state: 'pending_approval' });
    findOne.mockResolvedValue(p);
    await requestProjectChanges('e1', 'p1', '   ');
    expect(p.approval_notes).toBeNull();
  });
});

describe('markProjectPendingApproval (publish hook)', () => {
  it('is a no-op when the gate is OFF — existing students are never touched', async () => {
    (env as any).projectApprovalGate = 'off';
    const p = fakeProject();
    findOne.mockResolvedValue(p);
    expect(await markProjectPendingApproval('p1', 'e1')).toBe(false);
    // The gate short-circuits before any load, so nothing is even read.
    expect(findOne).not.toHaveBeenCalled();
    expect(p.save).not.toHaveBeenCalled();
  });

  it('holds a first-build (null state) project for review when the gate is ON', async () => {
    (env as any).projectApprovalGate = 'all';
    const p = fakeProject({ approval_state: null });
    findOne.mockResolvedValue(p);
    expect(await markProjectPendingApproval('p1', 'e1')).toBe(true);
    expect(p.approval_state).toBe('pending_approval');
    expect(p.save).toHaveBeenCalledTimes(1);
  });

  it('re-gates a changes_requested project (a revision needs re-review)', async () => {
    (env as any).projectApprovalGate = 'all';
    const p = fakeProject({ approval_state: 'changes_requested' });
    findOne.mockResolvedValue(p);
    expect(await markProjectPendingApproval('p1', 'e1')).toBe(true);
    expect(p.approval_state).toBe('pending_approval');
  });

  it('leaves an already-approved project alone — republishing does not re-gate it', async () => {
    (env as any).projectApprovalGate = 'all';
    const p = fakeProject({ approval_state: 'approved' });
    findOne.mockResolvedValue(p);
    expect(await markProjectPendingApproval('p1', 'e1')).toBe(false);
    expect(p.approval_state).toBe('approved');
    expect(p.save).not.toHaveBeenCalled();
  });

  it('never throws into the build — a save failure is swallowed and returns false', async () => {
    (env as any).projectApprovalGate = 'all';
    const p = fakeProject({ approval_state: null, save: jest.fn().mockRejectedValue(new Error('db down')) });
    findOne.mockResolvedValue(p);
    await expect(markProjectPendingApproval('p1', 'e1')).resolves.toBe(false);
  });
});
