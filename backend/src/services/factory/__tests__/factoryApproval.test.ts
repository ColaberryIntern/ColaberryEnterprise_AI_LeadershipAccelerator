/**
 * Transactional approval: the content hash is stable, the CAS guard refuses a stale write, and
 * an approval forks a new version rather than mutating the approved snapshot.
 */
const findOne = jest.fn();
const create = jest.fn();
jest.mock('../../../models/ContractProcessDocument', () => ({
  __esModule: true,
  default: { findOne: (...a: any[]) => findOne(...a), create: (...a: any[]) => create(...a) },
}));

import {
  approveProcessDocument, contentHash, canTransition, checkExpectedVersion, ApprovalConflictError,
  assertApprovable, ApprovalGateError,
} from '../factoryApproval';
import { buildSampleContractProject } from '../sample/sampleContractProject';

const validDoc = buildSampleContractProject();

beforeEach(() => jest.clearAllMocks());

describe('pure primitives', () => {
  it('contentHash is stable and content-addressed', () => {
    expect(contentHash('rev-1', { a: 1 })).toBe(contentHash('rev-1', { a: 1 }));
    expect(contentHash('rev-1', { a: 1 })).not.toBe(contentHash('rev-1', { a: 2 }));
    expect(contentHash('rev-1', { a: 1 })).not.toBe(contentHash('rev-2', { a: 1 })); // revision matters
    expect(contentHash('rev-1', { a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });

  it('canTransition allows the ladder and forbids skips / un-approvals', () => {
    expect(canTransition('draft', 'documented')).toBe(true);
    expect(canTransition('documented', 'full')).toBe(true);
    expect(canTransition('draft', 'full')).toBe(false);       // no skipping documented
    expect(canTransition('full', 'documented')).toBe(false);  // no un-approving
    expect(canTransition('full', 'superseded')).toBe(true);
  });

  it('checkExpectedVersion is a compare-and-swap', () => {
    expect(checkExpectedVersion(3, 3)).toEqual({ ok: true, currentVersion: 3 });
    expect(checkExpectedVersion(3, 2)).toEqual({ ok: false, currentVersion: 3 });
  });
});

describe('approveProcessDocument (fork-on-edit + CAS)', () => {
  const input = {
    deliveryProjectId: 'dp-1', trackType: 'proposal', expectedVersion: 1,
    level: 'documented' as const, revisionId: 'rev-1', approvedBy: 'ali', enrichmentStatus: 'partial' as const,
  };

  it('refuses a stale expected_version with a 409-shaped ApprovalConflictError', async () => {
    findOne.mockResolvedValue({ version: 3, status: 'draft', doc_json: {}, save: jest.fn() });
    await expect(approveProcessDocument({ ...input, expectedVersion: 1 })).rejects.toMatchObject({ status: 409, currentVersion: 3 });
    expect(create).not.toHaveBeenCalled();
  });

  it('forks a NEW version marked approved, hashes the doc, and supersedes the prior', async () => {
    // doc_json must now be a gate-clean FactoryProject (the write is gated) — use the known-valid sample.
    const current: any = { version: 1, status: 'draft', doc_json: validDoc, save: jest.fn().mockResolvedValue(undefined) };
    findOne.mockResolvedValue(current);
    create.mockResolvedValue({ id: 'new-id', version: 2 });

    const dto = await approveProcessDocument(input);

    expect(create).toHaveBeenCalledTimes(1);
    const created = create.mock.calls[0][0];
    expect(created.version).toBe(2);              // a NEW version, not an overwrite
    expect(created.status).toBe('documented');
    expect(created.content_sha256).toBe(contentHash('rev-1', validDoc));
    expect(created.enrichment_status).toBe('partial');   // decoupled from level
    expect(current.status).toBe('superseded');    // fork-on-edit: prior superseded, not mutated away
    expect(current.superseded_by_id).toBe('new-id');
    expect(current.save).toHaveBeenCalledTimes(1);
    expect(dto).toMatchObject({ version: 2, status: 'documented', approval_level: 'documented' });
  });

  it('REFUSES to approve a decomposition with gate errors (ApprovalGateError, nothing written)', async () => {
    // a valid project minus t-route-tech's PERFORMER → one PERFORMER gate error
    const broken = { ...validDoc, assignments: validDoc.assignments.filter((a) => !(a.task_id === 't-route-tech' && a.responsibility === 'PERFORMER')) };
    findOne.mockResolvedValue({ version: 1, status: 'draft', doc_json: broken, save: jest.fn() });
    await expect(approveProcessDocument(input)).rejects.toBeInstanceOf(ApprovalGateError);
    expect(create).not.toHaveBeenCalled(); // the write never happened
  });

  it('refuses a malformed document (not a complete FactoryProject) before writing', async () => {
    findOne.mockResolvedValue({ version: 1, status: 'draft', doc_json: { hello: 'world' }, save: jest.fn() });
    await expect(approveProcessDocument(input)).rejects.toMatchObject({ name: 'ApprovalGateError' });
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses an illegal transition (full -> documented) even when the version matches', async () => {
    findOne.mockResolvedValue({ version: 5, status: 'full', doc_json: {}, save: jest.fn() });
    await expect(approveProcessDocument({ ...input, expectedVersion: 5, level: 'documented' }))
      .rejects.toThrow(/illegal approval transition/);
    expect(create).not.toHaveBeenCalled();
  });

  it('throws when there is no document to approve', async () => {
    findOne.mockResolvedValue(null);
    await expect(approveProcessDocument(input)).rejects.toThrow(/no process document/);
  });
});

describe('assertApprovable — the pure write gate', () => {
  it('passes a gate-clean FactoryProject', () => {
    expect(() => assertApprovable(validDoc)).not.toThrow();
  });
  it('throws ApprovalGateError carrying the real gate issues on a broken project', () => {
    const broken = { ...validDoc, assignments: validDoc.assignments.filter((a) => a.responsibility !== 'PERFORMER') };
    try {
      assertApprovable(broken);
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ApprovalGateError);
      expect(e.issues.some((i: any) => i.code === 'PERFORMER')).toBe(true);
    }
  });
  it('throws MALFORMED_DOCUMENT when the document is not a complete FactoryProject', () => {
    try {
      assertApprovable({ tasks: [] }); // missing processes/assignments/transitions/source_blocks arrays
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ApprovalGateError);
      expect(e.issues[0].code).toBe('MALFORMED_DOCUMENT');
    }
  });
});
