/**
 * Contract tests for versioning and frozen approval snapshots.
 *
 * The property under test throughout: what was agreed stays readable exactly as it was
 * agreed, even after the working row moves on.
 */
jest.mock('../../../models/DeliveryContract', () => ({
  __esModule: true,
  default: { findByPk: jest.fn(), findOne: jest.fn(), create: jest.fn(), update: jest.fn() },
}));

import DeliveryContract from '../../../models/DeliveryContract';
import {
  ContractError,
  approveContract,
  approvedTerms,
  buildSnapshot,
  draftContract,
  hasDriftedFromApproval,
} from '../deliveryContractService';

const M = DeliveryContract as unknown as {
  findByPk: jest.Mock;
  findOne: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
};

/** A contract row with a working `update` that mutates in place, like Sequelize's. */
function row(overrides: Record<string, any> = {}): any {
  const r: any = {
    id: 'c1',
    delivery_project_id: 'p1',
    version: 1,
    status: 'draft',
    business_outcome: 'Reduce handling time',
    data_sensitivity: 'internal',
    approved_snapshot: null,
    approved_by_identity_id: null,
    approved_at: null,
    ...overrides,
  };
  r.update = jest.fn(async (patch: Record<string, any>) => {
    Object.assign(r, patch);
    return r;
  });
  return r;
}

beforeEach(() => {
  jest.clearAllMocks();
  M.update.mockResolvedValue([0]);
});

describe('snapshot construction', () => {
  it('captures the agreed terms', () => {
    const snapshot = buildSnapshot(row({ business_outcome: 'X', scope_in: { a: 1 } }));
    expect(snapshot.business_outcome).toBe('X');
    expect(snapshot.scope_in).toEqual({ a: 1 });
    expect(snapshot.version).toBe(1);
  });

  it('does NOT capture internal bookkeeping', () => {
    // An explicit field list, not a spread. The snapshot may be shown to a client, so
    // what goes into it is a decision rather than a consequence of adding a column.
    const snapshot = buildSnapshot(row({ id: 'c1', approved_by_identity_id: 'someone' }));
    expect(snapshot).not.toHaveProperty('id');
    expect(snapshot).not.toHaveProperty('approved_by_identity_id');
    expect(snapshot).not.toHaveProperty('approved_at');
    expect(snapshot).not.toHaveProperty('status');
  });

  it('records absent fields as null rather than omitting them', () => {
    const snapshot = buildSnapshot(row({ change_policy: undefined }));
    expect(snapshot).toHaveProperty('change_policy', null);
  });
});

describe('drafting and versioning', () => {
  it('creates version 1 when none exists', async () => {
    M.findOne.mockResolvedValue(null);
    M.create.mockImplementation(async (v: any) => row(v));

    await draftContract({ deliveryProjectId: 'p1', businessOutcome: 'X' });

    expect(M.create).toHaveBeenCalledWith(
      expect.objectContaining({ version: 1, status: 'draft' }),
    );
  });

  it('updates an existing DRAFT in place rather than versioning every keystroke', async () => {
    const existing = row({ status: 'draft' });
    M.findOne.mockResolvedValue(existing);

    await draftContract({ deliveryProjectId: 'p1', businessOutcome: 'Updated' });

    expect(M.create).not.toHaveBeenCalled();
    expect(existing.business_outcome).toBe('Updated');
  });

  it('creates version N+1 when the current version is approved', async () => {
    M.findOne.mockResolvedValue(row({ version: 3, status: 'approved' }));
    M.create.mockImplementation(async (v: any) => row(v));

    await draftContract({ deliveryProjectId: 'p1', businessOutcome: 'New terms' });

    expect(M.create).toHaveBeenCalledWith(expect.objectContaining({ version: 4, status: 'draft' }));
  });

  it('defaults data_sensitivity to internal, never public', async () => {
    // A contract nobody has classified must not become publishable by omission.
    M.findOne.mockResolvedValue(null);
    M.create.mockImplementation(async (v: any) => row(v));

    await draftContract({ deliveryProjectId: 'p1' });

    expect(M.create).toHaveBeenCalledWith(
      expect.objectContaining({ data_sensitivity: 'internal' }),
    );
  });
});

describe('approval freezes a snapshot', () => {
  it('records the snapshot, approver and time', async () => {
    const contract = row();
    M.findByPk.mockResolvedValue(contract);

    const { contract: approved, alreadyApproved } = await approveContract({
      contractId: 'c1',
      approvedByIdentityId: 'ident-1',
    });

    expect(alreadyApproved).toBe(false);
    expect(approved.status).toBe('approved');
    expect(approved.approved_by_identity_id).toBe('ident-1');
    expect(approved.approved_snapshot.business_outcome).toBe('Reduce handling time');
  });

  it('supersedes older approved versions so exactly one governs', async () => {
    M.findByPk.mockResolvedValue(row({ id: 'c2', version: 2 }));

    await approveContract({ contractId: 'c2', approvedByIdentityId: 'ident-1' });

    expect(M.update).toHaveBeenCalledWith(
      { status: 'superseded' },
      expect.objectContaining({
        where: expect.objectContaining({ delivery_project_id: 'p1', status: 'approved' }),
      }),
    );
  });

  it('is idempotent: re-approving returns the ORIGINAL approver and time', async () => {
    // Master plan §15. Re-freezing would quietly change who approved what, and when.
    const original = new Date('2026-01-01T00:00:00Z');
    const contract = row({
      status: 'approved',
      approved_by_identity_id: 'first-approver',
      approved_at: original,
      approved_snapshot: { business_outcome: 'As agreed' },
    });
    M.findByPk.mockResolvedValue(contract);

    const result = await approveContract({ contractId: 'c1', approvedByIdentityId: 'second' });

    expect(result.alreadyApproved).toBe(true);
    expect(result.contract.approved_by_identity_id).toBe('first-approver');
    expect(result.contract.approved_at).toBe(original);
    expect(contract.update).not.toHaveBeenCalled();
  });

  it('refuses to approve a superseded version', async () => {
    M.findByPk.mockResolvedValue(row({ status: 'superseded' }));
    await expect(
      approveContract({ contractId: 'c1', approvedByIdentityId: 'x' }),
    ).rejects.toThrow(ContractError);
  });

  it('throws when the contract does not exist', async () => {
    M.findByPk.mockResolvedValue(null);
    await expect(
      approveContract({ contractId: 'missing', approvedByIdentityId: 'x' }),
    ).rejects.toThrow(/not_found/);
  });
});

describe('the snapshot survives the working row changing', () => {
  it('approvedTerms returns what was agreed, not what the row now says', async () => {
    const contract = row();
    M.findByPk.mockResolvedValue(contract);
    await approveContract({ contractId: 'c1', approvedByIdentityId: 'ident-1' });

    // The working row moves on.
    contract.business_outcome = 'Something else entirely';

    expect(approvedTerms(contract)!.business_outcome).toBe('Reduce handling time');
  });

  it('returns null for a contract that was never approved', () => {
    expect(approvedTerms(row({ status: 'draft' }))).toBeNull();
  });

  it('detects drift between the live row and the approved terms', async () => {
    const contract = row();
    M.findByPk.mockResolvedValue(contract);
    await approveContract({ contractId: 'c1', approvedByIdentityId: 'ident-1' });

    expect(hasDriftedFromApproval(contract)).toBe(false);
    contract.business_outcome = 'Changed';
    expect(hasDriftedFromApproval(contract)).toBe(true);
  });

  it('an unapproved contract cannot drift', () => {
    expect(hasDriftedFromApproval(row({ status: 'draft' }))).toBe(false);
  });
});
