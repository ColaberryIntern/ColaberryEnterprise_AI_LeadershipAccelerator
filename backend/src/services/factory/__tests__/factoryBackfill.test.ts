/**
 * backfillUnassessedContract must put a delivery project onto the factory model HONESTLY:
 * an `unassessed` shell (2 tracks + 1 explicit "not yet assessed" marker + a draft doc per track with
 * an EMPTY decomposition), fabricating no processes/tasks/assignments/roles; the student-build link is
 * used only if a real DeliveryProjectSourceLink exists; every write runs in ONE transaction (atomic);
 * ids are deterministic (idempotent). Everything mocked (no DB).
 */
const transaction = jest.fn(async (cb: any) => cb('TX'));
jest.mock('../../../config/database', () => ({ sequelize: { transaction: (...a: any[]) => transaction(...a) } }));

const trackUpsert = jest.fn().mockResolvedValue([{}, true]);
const reqUpsert = jest.fn().mockResolvedValue([{}, true]);
const docUpsert = jest.fn().mockResolvedValue([{}, true]);
const linkFindOne = jest.fn();
jest.mock('../../../models/ContractTrack', () => ({ __esModule: true, default: { upsert: (...a: any[]) => trackUpsert(...a) } }));
jest.mock('../../../models/ContractRequirement', () => ({ __esModule: true, default: { upsert: (...a: any[]) => reqUpsert(...a) } }));
jest.mock('../../../models/ContractProcessDocument', () => ({ __esModule: true, default: { upsert: (...a: any[]) => docUpsert(...a) } }));
jest.mock('../../../models/DeliveryProjectSourceLink', () => ({ __esModule: true, default: { findOne: (...a: any[]) => linkFindOne(...a) } }));

import { backfillUnassessedContract } from '../factoryBackfill';

const DP = 'dp-legacy-1';
const args = (fn: jest.Mock) => fn.mock.calls.map((c) => c[0]);
const solutionTrack = () => args(trackUpsert).find((t) => t.track_type === 'solution_build');

beforeEach(() => { jest.clearAllMocks(); linkFindOne.mockResolvedValue(null); });

describe('backfillUnassessedContract', () => {
  it('writes an honest unassessed shell: 2 tracks + 1 unassessed requirement + 2 draft docs', async () => {
    const res = await backfillUnassessedContract(DP);
    expect(res).toMatchObject({ tracks: 2, requirements: 1, process_documents: 2 });
    expect(args(trackUpsert).map((t) => t.track_type).sort()).toEqual(['proposal', 'solution_build']);
    expect(reqUpsert).toHaveBeenCalledTimes(1);
    const req = args(reqUpsert)[0];
    expect(req.evidence_state).toBe('unassessed');
    expect(req.human_confirmed).toBe(false);
    expect(docUpsert).toHaveBeenCalledTimes(2);
    args(docUpsert).forEach((d) => expect(d.status).toBe('draft'));
  });

  it('FABRICATES NOTHING — every draft doc has an empty decomposition', async () => {
    await backfillUnassessedContract(DP);
    for (const d of args(docUpsert)) {
      const j = d.doc_json;
      expect(j.processes).toEqual([]);
      expect(j.tasks).toEqual([]);
      expect(j.assignments).toEqual([]);
      expect(j.roles).toEqual([]);
      expect(j.transitions).toEqual([]);
    }
  });

  it('sets solution_student_project_id ONLY when a real source link exists', async () => {
    await backfillUnassessedContract(DP);
    expect(solutionTrack().solution_student_project_id).toBeNull(); // no link

    jest.clearAllMocks();
    linkFindOne.mockResolvedValue({ student_project_id: 'stud-9' });
    const res = await backfillUnassessedContract(DP);
    expect(res.solution_student_project_id).toBe('stud-9');
    expect(solutionTrack().solution_student_project_id).toBe('stud-9');
  });

  it('is idempotent: deterministic ids, so a re-run addresses the same rows', async () => {
    await backfillUnassessedContract(DP);
    const firstIds = [...args(trackUpsert), ...args(reqUpsert), ...args(docUpsert)].map((r) => r.id);
    jest.clearAllMocks(); linkFindOne.mockResolvedValue(null);
    await backfillUnassessedContract(DP);
    const secondIds = [...args(trackUpsert), ...args(reqUpsert), ...args(docUpsert)].map((r) => r.id);
    expect(secondIds).toEqual(firstIds);
    firstIds.forEach((id) => expect(typeof id).toBe('string'));
  });

  it('runs every write inside ONE transaction, and aborts writing nothing further on a failure', async () => {
    await backfillUnassessedContract(DP);
    expect(transaction).toHaveBeenCalledTimes(1);
    for (const call of [...trackUpsert.mock.calls, ...reqUpsert.mock.calls, ...docUpsert.mock.calls]) {
      expect(call[1]).toEqual({ transaction: 'TX' });
    }

    jest.clearAllMocks(); linkFindOne.mockResolvedValue(null);
    trackUpsert.mockRejectedValueOnce(new Error('constraint violated'));
    await expect(backfillUnassessedContract(DP)).rejects.toThrow(/constraint violated/);
    expect(docUpsert).not.toHaveBeenCalled();
  });
});
