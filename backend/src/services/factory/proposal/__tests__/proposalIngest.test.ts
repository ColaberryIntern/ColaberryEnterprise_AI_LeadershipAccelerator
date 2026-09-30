/**
 * ingestProposal must atomically REPLACE the unassessed shell with the extractor's real requirements:
 * delete the UNASSESSED marker, upsert the source-cited requirements (unassessed + not human-confirmed),
 * flip the tracks off 'unassessed', and attach the source blocks to each draft doc with an EMPTY
 * decomposition. One transaction; idempotent; abort-writes-nothing. Everything mocked (no DB, no real zip).
 */
const transaction = jest.fn(async (cb: any) => cb('TX'));
jest.mock('../../../../config/database', () => ({ sequelize: { transaction: (...a: any[]) => transaction(...a) } }));

const extractProposal = jest.fn();
jest.mock('../proposalExtractor', () => ({ extractProposal: (...a: any[]) => extractProposal(...a) }));

const trackUpdate = jest.fn().mockResolvedValue([1]);
const reqDestroy = jest.fn().mockResolvedValue(1);
const reqUpsert = jest.fn().mockResolvedValue([{}, true]);
const docUpsert = jest.fn().mockResolvedValue([{}, true]);
jest.mock('../../../../models/ContractTrack', () => ({ __esModule: true, default: { update: (...a: any[]) => trackUpdate(...a) } }));
jest.mock('../../../../models/ContractRequirement', () => ({ __esModule: true, default: { destroy: (...a: any[]) => reqDestroy(...a), upsert: (...a: any[]) => reqUpsert(...a) } }));
jest.mock('../../../../models/ContractProcessDocument', () => ({ __esModule: true, default: { upsert: (...a: any[]) => docUpsert(...a) } }));

import { ingestProposal } from '../proposalIngest';

const DP = 'dp-gov-1';
const extraction = {
  blocks: [
    { id: 'blk-ctx-rfp-txt', locator: 'RFP.txt', text: 'full text', kind: 'context' },
    { id: 'blk-REQ-001', locator: 'RFP.txt', text: 'The vendor shall provide X.', kind: 'requirement' },
  ],
  requirements: [
    { canonicalReqId: 'REQ-001', statement: 'The vendor shall provide X.', kind: 'compliance', priority: 'must',
      tracks: ['proposal', 'solution_build'], sourceDocument: 'RFP.txt', section: 'RFP.txt',
      extractedText: 'The vendor shall provide X.', interpretation: null, humanConfirmed: false,
      evidenceState: 'unassessed', sourceEvidence: ['blk-REQ-001'] },
  ],
  fileCount: 1,
};

beforeEach(() => { jest.clearAllMocks(); extractProposal.mockResolvedValue(extraction); });

const args = (fn: jest.Mock) => fn.mock.calls.map((c) => c[0]);

describe('ingestProposal', () => {
  it('deletes the UNASSESSED marker, upserts real requirements, flips tracks, attaches source blocks', async () => {
    const res = await ingestProposal(DP, Buffer.from('zip'), 'RFP.zip');
    expect(res).toEqual({ requirements: 1, blocks: 2, fileName: 'RFP.zip' });

    // (a) marker deleted
    expect(reqDestroy).toHaveBeenCalledTimes(1);
    // (b) real requirement upserted, honestly unassessed + source-cited
    expect(reqUpsert).toHaveBeenCalledTimes(1);
    const req = args(reqUpsert)[0];
    expect(req).toMatchObject({ canonical_req_id: 'REQ-001', evidence_state: 'unassessed', human_confirmed: false });
    expect(req.source_evidence).toEqual(['blk-REQ-001']);
    expect(req.extracted_text).toBe('The vendor shall provide X.');
    // (c) tracks flipped off unassessed
    expect(trackUpdate).toHaveBeenCalledTimes(1);
    expect(args(trackUpdate)[0]).toEqual({ status: 'in_progress' });
    expect(trackUpdate.mock.calls[0][1].where).toMatchObject({ delivery_project_id: DP, status: 'unassessed' });
    // (d) both draft docs carry the source blocks, empty decomposition
    expect(docUpsert).toHaveBeenCalledTimes(2);
    for (const d of args(docUpsert)) {
      expect(d.status).toBe('draft');
      expect(d.version).toBe(1);
      expect(d.doc_json.source_blocks).toHaveLength(2);
      expect(d.doc_json.tasks).toEqual([]);
      expect(d.doc_json.processes).toEqual([]);
    }
  });

  it('runs every write inside ONE transaction, and aborts writing nothing further on a failure', async () => {
    await ingestProposal(DP, Buffer.from('zip'), 'RFP.zip');
    expect(transaction).toHaveBeenCalledTimes(1);
    for (const call of [...reqDestroy.mock.calls, ...reqUpsert.mock.calls, ...trackUpdate.mock.calls, ...docUpsert.mock.calls]) {
      expect(call[call.length - 1]).toMatchObject({ transaction: 'TX' });
    }

    jest.clearAllMocks(); extractProposal.mockResolvedValue(extraction);
    reqDestroy.mockRejectedValueOnce(new Error('constraint'));
    await expect(ingestProposal(DP, Buffer.from('zip'), 'RFP.zip')).rejects.toThrow(/constraint/);
    expect(docUpsert).not.toHaveBeenCalled();
  });

  it('handles an empty extraction (no obligations) — deletes the marker, upserts no requirements', async () => {
    extractProposal.mockResolvedValue({ blocks: [], requirements: [], fileCount: 1 });
    const res = await ingestProposal(DP, Buffer.from('zip'), 'RFP.zip');
    expect(res.requirements).toBe(0);
    expect(reqDestroy).toHaveBeenCalledTimes(1);
    expect(reqUpsert).not.toHaveBeenCalled();
    expect(docUpsert).toHaveBeenCalledTimes(2);
  });
});
