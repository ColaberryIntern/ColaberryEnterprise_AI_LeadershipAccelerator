/**
 * govSubmission — THE RAILS: export is readiness-gated (no packaging an unapproved proposal); EXPORTED ≠ SUBMITTED
 * (a receipt only after export, an acknowledgement only after submission); recordOutcome generates PRIVATE
 * candidates for won/lost and never fabricates. Upsert is idempotent.
 */
const sFindOne = jest.fn();
const sCreate = jest.fn();
jest.mock('../../../models/GovSubmission', () => ({ __esModule: true, default: { findOne: (...a: any[]) => sFindOne(...a), create: (...a: any[]) => sCreate(...a) } }));

import { getSubmission, exportSubmission, recordSubmissionReceipt, acknowledgeSubmission, reopenSubmission, recordOutcome, SubmissionError } from '../govSubmission';

const mockRow = (over: any = {}) => {
  const state: any = { id: 's-1', delivery_project_id: 'dp-1', status: 'preparing', outcome: 'pending', export_manifest: null, exported_at: null, external_ref: null, externally_submitted_at: null, acknowledged_ref: null, acknowledged_at: null, outcome_note: null, outcome_recorded_at: null, case_study_candidate: null, service_capability_candidate: null, ...over };
  return { get: () => ({ ...state }), update: jest.fn(async (p: any) => { Object.assign(state, p); }) };
};
const slot = (id: string, status: any) => ({ requirementId: id, statement: 'x', sourceRef: null, status, content: 'c', figures: [] });

beforeEach(() => { jest.clearAllMocks(); });

describe('exportSubmission — readiness-gated', () => {
  it('REFUSES to export when a response is not approved (not_ready + blocking), nothing created', async () => {
    sFindOne.mockResolvedValue(null);
    await expect(exportSubmission({ deliveryProjectId: 'dp-1', projectName: 'X', slots: [slot('R1', 'draft')], coverageSufficient: true, canApproveBid: true }))
      .rejects.toMatchObject({ reason: 'not_ready' });
    expect(sCreate).not.toHaveBeenCalled();
  });

  it('exports when ready: status exported + a manifest of the responses', async () => {
    sFindOne.mockResolvedValue(null);
    sCreate.mockImplementation(async (v: any) => mockRow(v));
    const v = await exportSubmission({ deliveryProjectId: 'dp-1', projectName: 'X', slots: [slot('R1', 'approved')], coverageSufficient: true, canApproveBid: true });
    expect(sCreate.mock.calls[0][0].status).toBe('exported');
    expect(v.status).toBe('exported');
    expect(v.exportManifest.responseCount).toBe(1);
  });
});

describe('recordSubmissionReceipt — EXPORTED ≠ SUBMITTED', () => {
  it('REFUSES before an export (not_exported), nothing updated', async () => {
    const row = mockRow({ status: 'preparing' });
    sFindOne.mockResolvedValue(row);
    await expect(recordSubmissionReceipt('dp-1', 'CONF-9')).rejects.toMatchObject({ reason: 'not_exported' });
    expect(row.update).not.toHaveBeenCalled();
  });

  it('records the receipt after an export → externally_submitted with the ref', async () => {
    const row = mockRow({ status: 'exported' });
    sFindOne.mockResolvedValue(row);
    const v = await recordSubmissionReceipt('dp-1', 'CONF-9');
    expect(v.status).toBe('externally_submitted');
    expect(v.externalRef).toBe('CONF-9');
  });

  it('requires a receipt reference', async () => {
    await expect(recordSubmissionReceipt('dp-1', '   ')).rejects.toMatchObject({ reason: 'no_ref' });
  });
});

describe('acknowledgeSubmission', () => {
  it('REFUSES unless the submission was externally recorded first (not_submitted)', async () => {
    sFindOne.mockResolvedValue(mockRow({ status: 'exported' }));
    await expect(acknowledgeSubmission('dp-1', 'ACK-1')).rejects.toMatchObject({ reason: 'not_submitted' });
  });

  it('acknowledges after an external submission', async () => {
    const row = mockRow({ status: 'externally_submitted' });
    sFindOne.mockResolvedValue(row);
    const v = await acknowledgeSubmission('dp-1', 'ACK-1');
    expect(v.status).toBe('acknowledged');
    expect(v.acknowledgedRef).toBe('ACK-1');
  });
});

describe('recordOutcome — private candidates for won/lost, never for the rest', () => {
  it('won → sets the outcome + a PRIVATE case-study candidate + a suggested service capability', async () => {
    const row = mockRow();
    sFindOne.mockResolvedValue(row);
    const v = await recordOutcome({ deliveryProjectId: 'dp-1', projectName: 'TxDOT', outcome: 'won', slots: [slot('R1', 'approved')] });
    expect(v.outcome).toBe('won');
    expect(v.caseStudyCandidate.published).toBe(false);
    expect(v.caseStudyCandidate.status).toBe('candidate');
    expect(v.serviceCapabilityCandidate.state).toBe('suggested');
  });

  it('lost → ALSO generates candidates', async () => {
    const row = mockRow();
    sFindOne.mockResolvedValue(row);
    const v = await recordOutcome({ deliveryProjectId: 'dp-1', projectName: 'TxDOT', outcome: 'lost', slots: [slot('R1', 'approved')] });
    expect(v.outcome).toBe('lost');
    expect(v.caseStudyCandidate.outcome).toBe('lost');
  });

  it('withdrawn → records the outcome only, NO candidates', async () => {
    const row = mockRow();
    sFindOne.mockResolvedValue(row);
    const v = await recordOutcome({ deliveryProjectId: 'dp-1', projectName: 'TxDOT', outcome: 'withdrawn', slots: [slot('R1', 'approved')] });
    expect(v.outcome).toBe('withdrawn');
    expect(v.caseStudyCandidate).toBeNull();
    expect(v.serviceCapabilityCandidate).toBeNull();
  });

  it('rejects a bad outcome, and getSubmission returns the default when none exists', async () => {
    await expect(recordOutcome({ deliveryProjectId: 'dp-1', projectName: 'X', outcome: 'maybe' as any, slots: [] })).rejects.toMatchObject({ reason: 'bad_outcome' });
    sFindOne.mockResolvedValue(null);
    expect((await getSubmission('dp-1')).status).toBe('preparing');
  });

  it('reopenSubmission upserts to preparing (existing row updated in place)', async () => {
    const row = mockRow({ status: 'exported' });
    sFindOne.mockResolvedValue(row);
    const v = await reopenSubmission('dp-1');
    expect(v.status).toBe('preparing');
  });
});
