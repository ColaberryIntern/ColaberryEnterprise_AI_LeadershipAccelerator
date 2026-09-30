/**
 * persistSampleContract must be: (1) overridable on the solution_build track's
 * solution_student_project_id — the sample fixture points it at a dev-only projects.id that does not
 * exist on a real/prod delivery project (FK-constrained), so a caller can null it; (2) atomic — every
 * write runs inside ONE transaction so a mid-loop FK failure leaves no partial rows. Everything mocked
 * (no DB). Regression guard for the prod demo-seed FK break (contract_tracks_solution_student_project_id_fkey).
 */
const transaction = jest.fn(async (cb: any) => cb('TX'));
jest.mock('../../config/database', () => ({ sequelize: { transaction: (...a: any[]) => transaction(...a) } }));

const trackUpsert = jest.fn().mockResolvedValue([{}, true]);
const reqUpsert = jest.fn().mockResolvedValue([{}, true]);
const docUpsert = jest.fn().mockResolvedValue([{}, true]);
jest.mock('../../models/ContractTrack', () => ({ __esModule: true, default: { upsert: (...a: any[]) => trackUpsert(...a) } }));
jest.mock('../../models/ContractRequirement', () => ({ __esModule: true, default: { upsert: (...a: any[]) => reqUpsert(...a) } }));
jest.mock('../../models/ContractProcessDocument', () => ({ __esModule: true, default: { upsert: (...a: any[]) => docUpsert(...a) } }));

import { persistSampleContract } from '../seedSampleContractProject';
import { SAMPLE_STUDENT_PROJECT_ID } from '../../services/factory/sample/sampleContractProject';

const solutionTrackArg = () => trackUpsert.mock.calls.map((c) => c[0]).find((t) => t.track_type === 'solution_build');

beforeEach(() => jest.clearAllMocks());

describe('persistSampleContract', () => {
  it('nulls the solution_build student-project link when the caller passes null (the prod-demo FK fix)', async () => {
    await persistSampleContract('dp-demo', { solutionStudentProjectId: null });
    expect(solutionTrackArg().solution_student_project_id).toBeNull();
  });

  it('keeps the sample fixture student-project link when no override is given', async () => {
    await persistSampleContract('dp-sample');
    expect(solutionTrackArg().solution_student_project_id).toBe(SAMPLE_STUDENT_PROJECT_ID);
  });

  it('runs every write inside one transaction (atomicity — no partial rows on failure)', async () => {
    await persistSampleContract('dp-demo', { solutionStudentProjectId: null });
    expect(transaction).toHaveBeenCalledTimes(1);
    // Every upsert carries the transaction handle.
    for (const call of [...trackUpsert.mock.calls, ...reqUpsert.mock.calls, ...docUpsert.mock.calls]) {
      expect(call[1]).toEqual({ transaction: 'TX' });
    }
  });

  it('aborts the whole persist (writes nothing further) when a track upsert violates a constraint', async () => {
    trackUpsert.mockRejectedValueOnce(new Error('insert or update on table "contract_tracks" violates foreign key constraint'));
    await expect(persistSampleContract('dp-demo', { solutionStudentProjectId: null })).rejects.toThrow(/foreign key constraint/);
    expect(docUpsert).not.toHaveBeenCalled();
  });
});
