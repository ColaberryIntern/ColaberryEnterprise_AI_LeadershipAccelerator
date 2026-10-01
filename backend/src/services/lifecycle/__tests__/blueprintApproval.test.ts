/**
 * The approval refusal matrix, with a deliberately-violating case for every rule.
 *
 * This is the unit half: the ordering, the refusals, idempotency and supersede-first, all with
 * the persistence layer doubled so it runs inside the CI gate (which has no `DATABASE_URL` and
 * therefore cannot load Sequelize models for real).
 *
 * The concurrency proof is NOT here and cannot be. A doubled unique index proves nothing about a
 * race — it only proves the double behaves as written. That one needs a real Postgres and lives
 * in `blueprintApproval.concurrency.integration.test.ts`, with a positive control that drops the
 * index to show the test can fail. LC-13 was a real incident; it does not get settled by a mock.
 */

// Hoisted above imports. Both exports of config/database are declared, because a factory that
// enumerates exports silently deletes the ones it omits.
jest.mock('../../../config/database', () => ({
  sequelize: {
    // Run the callback immediately with a sentinel transaction, so ordering is observable.
    transaction: jest.fn(async (cb: any) => cb({ __tx: true })),
  },
  connectDatabase: jest.fn(),
}));
jest.mock('../../../models/OperatingBlueprintManifest', () => ({
  __esModule: true,
  default: { findOne: jest.fn(), update: jest.fn() },
}));
jest.mock('../../../models/BlueprintApproval', () => ({
  __esModule: true,
  default: { findOne: jest.fn(), create: jest.fn() },
}));

import OperatingBlueprintManifest from '../../../models/OperatingBlueprintManifest';
import BlueprintApproval from '../../../models/BlueprintApproval';
import {
  approveBlueprint,
  approvalErrorStatus,
  manifestContentHash,
  ApprovalConflictError,
  ApprovalGateError,
  SelfApprovalError,
  SupersededRevisionError,
  ManifestNotFoundError,
} from '../blueprintApproval';

const ManifestMock = OperatingBlueprintManifest as unknown as {
  findOne: jest.Mock; update: jest.Mock;
};
const ApprovalMock = BlueprintApproval as unknown as { findOne: jest.Mock; create: jest.Mock };

/** A manifest in a state that SHOULD approve cleanly. */
function manifest(over: Record<string, unknown> = {}) {
  return {
    id: 'man-1',
    tenant_id: 'tenant-1',
    student_project_id: 'proj-1',
    delivery_project_id: null,
    revision: 4,
    status: 'draft',
    refs_json: { requirements: ['REQ-1'] },
    content_sha256: null,
    proposed_by: 'architect@example.test',
    update: jest.fn(),
    ...over,
  };
}

function input(over: Partial<Parameters<typeof approveBlueprint>[0]> = {}) {
  return {
    tenantId: 'tenant-1',
    manifestId: 'man-1',
    expectedRevision: 4,
    scope: 'full' as const,
    approvedBy: 'owner@example.test',
    approvedByRole: 'DELIVERY_OWNER',
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  ManifestMock.findOne.mockResolvedValue(manifest());
  ManifestMock.update.mockResolvedValue([0]);
  ApprovalMock.findOne.mockResolvedValue(null);
  ApprovalMock.create.mockImplementation(async (vals: any) => ({ id: 'appr-1', ...vals }));
});

describe('the happy path', () => {
  it('writes an approval bound to tenant, manifest, revision, hash, scope, actor and role', async () => {
    const res = await approveBlueprint(input());
    expect(res.alreadyApproved).toBe(false);
    const vals = ApprovalMock.create.mock.calls[0][0];
    expect(vals).toMatchObject({
      tenant_id: 'tenant-1',
      manifest_id: 'man-1',
      revision: 4,
      scope: 'full',
      approved_by: 'owner@example.test',
      approved_by_role: 'DELIVERY_OWNER',
    });
    expect(vals.content_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('marks the manifest approved and stamps the hash', async () => {
    const m = manifest();
    ManifestMock.findOne.mockResolvedValue(m);
    await approveBlueprint(input());
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved' }),
      expect.anything(),
    );
  });

  it('scopes the lookup by tenant, not by id alone', async () => {
    await approveBlueprint(input());
    expect(ManifestMock.findOne.mock.calls[0][0].where).toEqual({ id: 'man-1', tenant_id: 'tenant-1' });
  });

  it('does every write inside one transaction', async () => {
    await approveBlueprint(input());
    for (const call of [ManifestMock.findOne, ApprovalMock.findOne, ApprovalMock.create]) {
      expect(call.mock.calls[0][call === ApprovalMock.create ? 1 : 0]).toHaveProperty('transaction', { __tx: true });
    }
  });
});

describe('refusals, each with its own class and status', () => {
  it('404s an unknown manifest', async () => {
    ManifestMock.findOne.mockResolvedValue(null);
    await expect(approveBlueprint(input())).rejects.toThrow(ManifestNotFoundError);
    expect(approvalErrorStatus(new ManifestNotFoundError())).toBe(404);
  });

  it('gives a cross-tenant attempt the SAME error as a missing one, not an existence oracle', async () => {
    // The service scopes by tenant in the where-clause, so a wrong tenant simply finds nothing.
    ManifestMock.findOne.mockResolvedValue(null);
    const err = await approveBlueprint(input({ tenantId: 'other-tenant' })).catch((e) => e);
    expect(err).toBeInstanceOf(ManifestNotFoundError);
    expect(String(err.message)).not.toMatch(/tenant|permission|exists/i);
  });

  it('409s a superseded revision, and never writes', async () => {
    ManifestMock.findOne.mockResolvedValue(manifest({ status: 'superseded' }));
    await expect(approveBlueprint(input())).rejects.toThrow(SupersededRevisionError);
    expect(ApprovalMock.create).not.toHaveBeenCalled();
  });

  it('409s a stale expected revision and reports the real one', async () => {
    ManifestMock.findOne.mockResolvedValue(manifest({ revision: 7 }));
    const err = await approveBlueprint(input({ expectedRevision: 4 })).catch((e) => e);
    expect(err).toBeInstanceOf(ApprovalConflictError);
    expect(err.currentRevision).toBe(7);
    expect(approvalErrorStatus(err)).toBe(409);
    expect(ApprovalMock.create).not.toHaveBeenCalled();
  });

  it('422s with the issue list when the gate is not clean', async () => {
    const err = await approveBlueprint(input({ gateIssues: ['allocation_unknown', 'effort_coverage_undisclosed'] })).catch((e) => e);
    expect(err).toBeInstanceOf(ApprovalGateError);
    expect(err.issues).toHaveLength(2);
    expect(approvalErrorStatus(err)).toBe(422);
    expect(ApprovalMock.create).not.toHaveBeenCalled();
  });

  it('403s self-approval when the approver is the proposer', async () => {
    ManifestMock.findOne.mockResolvedValue(manifest({ proposed_by: 'owner@example.test' }));
    const err = await approveBlueprint(input({ approvedBy: 'owner@example.test' })).catch((e) => e);
    expect(err).toBeInstanceOf(SelfApprovalError);
    expect(err.message).toContain('owner@example.test');
    expect(approvalErrorStatus(err)).toBe(403);
  });

  it('403s when NO proposer is recorded — the ceremonial-loophole case', async () => {
    // The equivalent check elsewhere short-circuits on a null identity, which would pass every
    // row predating the column. Here it refuses, and nothing is written.
    ManifestMock.findOne.mockResolvedValue(manifest({ proposed_by: null }));
    const err = await approveBlueprint(input()).catch((e) => e);
    expect(err).toBeInstanceOf(SelfApprovalError);
    expect(err.message).toMatch(/no proposer/i);
    expect(ApprovalMock.create).not.toHaveBeenCalled();
  });

  it('maps an unexpected error to 500 rather than silently to a 4xx', () => {
    expect(approvalErrorStatus(new Error('boom'))).toBe(500);
  });
});

describe('idempotency: a retry returns the original, it does not re-stamp', () => {
  it('returns the existing approval with its original approver and timestamp', async () => {
    const original = {
      id: 'appr-original',
      approved_by: 'first@example.test',
      approved_at: new Date('2026-09-01T12:00:00Z'),
      revision: 4,
    };
    ApprovalMock.findOne.mockResolvedValue(original);
    const res = await approveBlueprint(input({ approvedBy: 'second@example.test' }));
    expect(res.alreadyApproved).toBe(true);
    expect(res.approval).toBe(original);
    // The crucial assertion: the second caller's identity did NOT overwrite the first's.
    expect(res.approval.approved_by).toBe('first@example.test');
    expect(ApprovalMock.create).not.toHaveBeenCalled();
  });

  it('does not supersede anything on an idempotent hit', async () => {
    ApprovalMock.findOne.mockResolvedValue({ id: 'appr-original', approved_by: 'first@example.test', revision: 4 });
    await approveBlueprint(input());
    expect(ManifestMock.update).not.toHaveBeenCalled();
  });

  it('looks for a prior approval of THIS manifest and revision', async () => {
    await approveBlueprint(input());
    expect(ApprovalMock.findOne.mock.calls[0][0].where).toEqual({ manifest_id: 'man-1', revision: 4 });
  });
});

describe('supersede-first ordering', () => {
  it('supersedes older approved revisions BEFORE writing the new approval', async () => {
    const order: string[] = [];
    ManifestMock.update.mockImplementation(async () => { order.push('supersede'); return [1]; });
    ApprovalMock.create.mockImplementation(async (v: any) => { order.push('create'); return { id: 'a', ...v }; });
    await approveBlueprint(input());
    expect(order).toEqual(['supersede', 'create']);
  });

  it('scopes the supersede to this tenant and project, excluding the manifest being approved', async () => {
    await approveBlueprint(input());
    const where = ManifestMock.update.mock.calls[0][1].where;
    expect(where).toMatchObject({ tenant_id: 'tenant-1', student_project_id: 'proj-1', status: 'approved' });
    expect(where.id).toBeDefined(); // Op.ne exclusion of the current manifest
  });

  it('uses the delivery project scope for a delivery-side manifest', async () => {
    ManifestMock.findOne.mockResolvedValue(manifest({ student_project_id: null, delivery_project_id: 'dproj-9' }));
    await approveBlueprint(input());
    expect(ManifestMock.update.mock.calls[0][1].where).toMatchObject({ delivery_project_id: 'dproj-9' });
  });

  it('leaves nothing approved if the supersede fails', async () => {
    ManifestMock.update.mockRejectedValue(new Error('db down'));
    await expect(approveBlueprint(input())).rejects.toThrow('db down');
    expect(ApprovalMock.create).not.toHaveBeenCalled();
  });
});

describe('manifestContentHash binds tenant, project and revision', () => {
  const base = { tenantId: 't1', projectId: 'p1', revision: 1, refs: { a: 1 } };

  it('is stable for identical input', () => {
    expect(manifestContentHash(base)).toBe(manifestContentHash({ ...base }));
    expect(manifestContentHash(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when the tenant changes — the gap the existing factory hash leaves open', () => {
    expect(manifestContentHash({ ...base, tenantId: 't2' })).not.toBe(manifestContentHash(base));
  });

  it('changes when the project or revision changes', () => {
    expect(manifestContentHash({ ...base, projectId: 'p2' })).not.toBe(manifestContentHash(base));
    expect(manifestContentHash({ ...base, revision: 2 })).not.toBe(manifestContentHash(base));
  });

  it('changes when the pinned references change', () => {
    expect(manifestContentHash({ ...base, refs: { a: 2 } })).not.toBe(manifestContentHash(base));
  });

  it('cannot be collided by shifting a boundary between parts', () => {
    // The NUL separator exists precisely so ("t1","p1") and ("t1\0p1","") cannot hash alike.
    const a = manifestContentHash({ tenantId: 't1', projectId: 'p1', revision: 1, refs: null });
    const b = manifestContentHash({ tenantId: 't1p1', projectId: '', revision: 1, refs: null });
    expect(a).not.toBe(b);
  });
});
