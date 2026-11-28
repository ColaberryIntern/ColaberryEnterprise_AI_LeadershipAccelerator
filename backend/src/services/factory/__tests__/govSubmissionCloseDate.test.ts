/**
 * govSubmission x M5 - when a bid is marked externally submitted it becomes a potential-win, so recordSubmissionReceipt
 * stamps the solicitation close date onto the submission row. These tests pin: the close date is stamped from the
 * resolver; a resolver miss NEVER nulls a date recorded earlier (idempotent + safe); and the stamp is independent of
 * whether the bid is priced.
 */
const sFindOne = jest.fn();
const sCreate = jest.fn();
jest.mock('../../../models/GovSubmission', () => ({ __esModule: true, default: { findOne: (...a: any[]) => sFindOne(...a), create: (...a: any[]) => sCreate(...a) } }));
const resolveSolicitationCloseDate = jest.fn();
jest.mock('../proposal/solicitationCloseDate', () => ({ __esModule: true, resolveSolicitationCloseDate: (...a: any[]) => resolveSolicitationCloseDate(...a) }));

import { recordSubmissionReceipt } from '../govSubmission';

const mockRow = (over: any = {}) => {
  const state: any = { id: 's-1', delivery_project_id: 'dp-1', status: 'exported', outcome: 'pending', export_manifest: null, exported_at: new Date(), external_ref: null, externally_submitted_at: null, acknowledged_ref: null, acknowledged_at: null, outcome_note: null, outcome_recorded_at: null, close_date: null, case_study_candidate: null, service_capability_candidate: null, ...over };
  const update = jest.fn(async (p: any) => { Object.assign(state, p); });
  return { get: () => ({ ...state }), update, _state: state };
};

beforeEach(() => { jest.clearAllMocks(); });

describe('recordSubmissionReceipt - stamps the solicitation close date (M5)', () => {
  it('stamps close_date from the resolver onto the submitted bid', async () => {
    resolveSolicitationCloseDate.mockResolvedValue('2026-09-30');
    const row = mockRow({ status: 'exported' });
    sFindOne.mockResolvedValue(row);
    const v = await recordSubmissionReceipt('dp-1', 'CONF-1');
    expect(v.status).toBe('externally_submitted');
    expect(v.closeDate).toBe('2026-09-30');
    expect(row.update.mock.calls[0][0].close_date).toBe('2026-09-30');
  });

  it('stamps the date the SAME whether or not the bid is priced (pricing is a separate human act)', async () => {
    resolveSolicitationCloseDate.mockResolvedValue('2026-10-15');
    const row = mockRow({ status: 'exported' });
    sFindOne.mockResolvedValue(row);
    const v = await recordSubmissionReceipt('dp-unpriced', 'CONF-2');
    // The submission carries the close date; it holds no amount at all - value stays in gov_bid_values, pending here.
    expect(v.closeDate).toBe('2026-10-15');
    expect(v).not.toHaveProperty('proposalValueCents');
  });

  it('does NOT null an existing close_date when the resolver misses (fail-soft, idempotent)', async () => {
    resolveSolicitationCloseDate.mockResolvedValue(null);
    const row = mockRow({ status: 'exported', close_date: '2026-09-30' });
    sFindOne.mockResolvedValue(row);
    const v = await recordSubmissionReceipt('dp-1', 'CONF-3');
    expect(row.update.mock.calls[0][0]).not.toHaveProperty('close_date');
    expect(v.closeDate).toBe('2026-09-30');
  });

  it('survives a resolver throw and still records the submission', async () => {
    resolveSolicitationCloseDate.mockRejectedValue(new Error('boom'));
    const row = mockRow({ status: 'exported' });
    sFindOne.mockResolvedValue(row);
    const v = await recordSubmissionReceipt('dp-1', 'CONF-4');
    expect(v.status).toBe('externally_submitted');
    expect(row.update.mock.calls[0][0]).not.toHaveProperty('close_date');
  });

  it('is idempotent: re-running with the same solicitation re-stamps the same date', async () => {
    resolveSolicitationCloseDate.mockResolvedValue('2026-11-01');
    const row = mockRow({ status: 'exported' });
    sFindOne.mockResolvedValue(row);
    await recordSubmissionReceipt('dp-1', 'CONF-5');
    // Re-run: row now externally_submitted, but recordSubmissionReceipt only runs after export; simulate the
    // operator re-submitting from an exported state (reopen->export->receipt), same solicitation.
    const row2 = mockRow({ status: 'exported', close_date: '2026-11-01' });
    sFindOne.mockResolvedValue(row2);
    const v2 = await recordSubmissionReceipt('dp-1', 'CONF-5');
    expect(v2.closeDate).toBe('2026-11-01');
  });
});
