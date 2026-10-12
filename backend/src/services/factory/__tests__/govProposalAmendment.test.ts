/**
 * govProposalAmendment — the inbox + THE INVALIDATION RAIL: recording an `amendment` whose `affects` lists
 * requirement ids flips every reviewed/approved response for those requirements back to `revision_required`; a
 * `message` (or an amendment with no affects) invalidates nothing. Upsert is idempotent per (project, key).
 */
const amCreate = jest.fn();
const amFindOne = jest.fn();
const amFindAll = jest.fn();
jest.mock('../../../models/GovProposalAmendment', () => ({
  __esModule: true,
  default: { create: (...a: any[]) => amCreate(...a), findOne: (...a: any[]) => amFindOne(...a), findAll: (...a: any[]) => amFindAll(...a) },
}));
const prUpdate = jest.fn();
jest.mock('../../../models/GovProposalResponse', () => ({ __esModule: true, default: { update: (...a: any[]) => prUpdate(...a) } }));

import { recordProposalAmendment, invalidateResponsesForRequirements, listProposalAmendments, AmendmentError } from '../govProposalAmendment';

const amRow = (v: any) => ({ get: () => ({ id: 'am-1', created_at: new Date('2026-10-08T00:00:00Z'), observed_at: null, ...v }) });

beforeEach(() => { jest.clearAllMocks(); prUpdate.mockResolvedValue([0]); });

describe('invalidateResponsesForRequirements', () => {
  it('flips reviewed/approved responses for the affected requirements and returns the count', async () => {
    prUpdate.mockResolvedValue([2]);
    const n = await invalidateResponsesForRequirements('dp-1', ['R1', 'R2']);
    expect(n).toBe(2);
    const [data, opts] = prUpdate.mock.calls[0];
    expect(data).toMatchObject({ status: 'revision_required' });     // flips TO revision_required
    expect(opts.where.delivery_project_id).toBe('dp-1');
    expect(opts.where.requirement_id).toBeDefined();                  // scoped to the affected requirement ids (Op.in)
    expect(opts.where.status).toBeDefined();                          // only reviewed/approved are matched (Op.in)
  });

  it('is total on empty input (no project / no ids) and never calls update', async () => {
    expect(await invalidateResponsesForRequirements('', ['R1'])).toBe(0);
    expect(await invalidateResponsesForRequirements('dp-1', [])).toBe(0);
    expect(prUpdate).not.toHaveBeenCalled();
  });
});

describe('recordProposalAmendment — records the inbox entry AND runs the invalidation', () => {
  it('an amendment with affects INVALIDATES the affected responses and records the count', async () => {
    prUpdate.mockResolvedValue([3]);
    amFindOne.mockResolvedValue(null);
    amCreate.mockImplementation(async (v: any) => amRow(v));
    const r = await recordProposalAmendment({ deliveryProjectId: 'dp-1', amendmentKey: 'ADD-2', summary: 'Scope changed', affects: ['R1', 'R2'], provenance: 'portal/addendum-2' });
    expect(prUpdate).toHaveBeenCalledTimes(1);                         // THE RAIL: invalidation ran
    expect(prUpdate.mock.calls[0][0]).toMatchObject({ status: 'revision_required' });
    expect(amCreate.mock.calls[0][0].invalidated_count).toBe(3);      // the effect is recorded
    expect(r.affects).toEqual(['R1', 'R2']);
    expect(r.invalidatedCount).toBe(3);
  });

  it('a MESSAGE (no affects) records context and invalidates NOTHING', async () => {
    amFindOne.mockResolvedValue(null);
    amCreate.mockImplementation(async (v: any) => amRow(v));
    const r = await recordProposalAmendment({ deliveryProjectId: 'dp-1', amendmentKey: 'Q-1', kind: 'message', summary: 'Agency clarified the demo date', affects: ['R1'] });
    expect(prUpdate).not.toHaveBeenCalled();                          // a message never invalidates
    expect(r.kind).toBe('message');
    expect(r.affects).toEqual([]);                                    // a message carries no affects
    expect(amCreate.mock.calls[0][0].invalidated_count).toBe(0);
  });

  it('an amendment with an EMPTY affects list invalidates nothing', async () => {
    amFindOne.mockResolvedValue(null);
    amCreate.mockImplementation(async (v: any) => amRow(v));
    await recordProposalAmendment({ deliveryProjectId: 'dp-1', amendmentKey: 'ADD-3', summary: 'Administrative correction', affects: [] });
    expect(prUpdate).not.toHaveBeenCalled();
  });

  it('is idempotent: re-recording the same key UPDATES the entry, never a duplicate', async () => {
    prUpdate.mockResolvedValue([1]);
    const existing: any = { get: () => ({ id: 'am-1', amendment_key: 'ADD-2', created_at: new Date(), observed_at: null }), update: jest.fn() };
    amFindOne.mockResolvedValue(existing);
    await recordProposalAmendment({ deliveryProjectId: 'dp-1', amendmentKey: 'ADD-2', summary: 'Scope changed again', affects: ['R1'] });
    expect(existing.update).toHaveBeenCalled();
    expect(amCreate).not.toHaveBeenCalled();
  });

  it('rejects missing identifiers and an empty summary', async () => {
    await expect(recordProposalAmendment({ deliveryProjectId: 'dp-1', amendmentKey: '', summary: 'x' })).rejects.toMatchObject({ reason: 'bad_input' });
    await expect(recordProposalAmendment({ deliveryProjectId: 'dp-1', amendmentKey: 'K', summary: '  ' })).rejects.toMatchObject({ reason: 'no_summary' });
  });

  it('listProposalAmendments is total on empty input', async () => {
    expect(await listProposalAmendments('')).toEqual([]);
  });
});
