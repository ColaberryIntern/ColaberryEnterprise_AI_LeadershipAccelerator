/**
 * artifactStore.saveRunArtifacts: idempotent on the run, refuses a run that is not building,
 * and writes a new active version (superseding the old one) inside one transaction.
 */
jest.mock('../../../../config/database', () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn({ tx: 1 })) },
}));
jest.mock('../runStore', () => ({ getRun: jest.fn(), transitionRun: jest.fn(async () => true) }));

/* eslint-disable @typescript-eslint/no-var-requires */
const { sequelize } = require('../../../../config/database') as { sequelize: { query: jest.Mock } };
const runStore = require('../runStore') as { getRun: jest.Mock; transitionRun: jest.Mock };
import { saveRunArtifacts, RunNotAcceptingUpload } from '../artifactStore';

const upload = {
  commandCenter: { 'index.html': '<html></html>' },
  commandCenterBytes: 13,
  demoSpec: { schema_version: 2 },
  demoBytes: 20,
  demoProblems: [],
};

beforeEach(() => {
  sequelize.query.mockReset().mockImplementation(async (sql: string) => (sql.includes('RETURNING version') ? [{ version: 4 }] : [[]]));
  runStore.getRun.mockReset();
  runStore.transitionRun.mockClear();
});

describe('saveRunArtifacts', () => {
  it('writes nothing for a run that already uploaded (a retried upload)', async () => {
    runStore.getRun.mockResolvedValue({ id: 'r', project_id: 'p', status: 'uploaded', plan_version: 1 });
    const out = await saveRunArtifacts('r', upload, 1);
    expect(out.duplicate).toBe(true);
    expect(sequelize.query).not.toHaveBeenCalled();
    expect(runStore.getRun).toHaveBeenCalledWith('r', { tx: 1 }, true);
  });

  it('refuses a run that failed or never started', async () => {
    runStore.getRun.mockResolvedValue({ id: 'r', project_id: 'p', status: 'failed', plan_version: 1 });
    await expect(saveRunArtifacts('r', upload, 1)).rejects.toBeInstanceOf(RunNotAcceptingUpload);
    runStore.getRun.mockResolvedValue(null);
    await expect(saveRunArtifacts('r', upload, 1)).rejects.toBeInstanceOf(RunNotAcceptingUpload);
  });

  it('supersedes the active version before inserting the next, for both kinds, then marks the run uploaded', async () => {
    runStore.getRun.mockResolvedValue({ id: 'r', project_id: 'p', status: 'building', plan_version: 3 });
    const out = await saveRunArtifacts('r', upload, 2.5);
    expect(out).toEqual({ duplicate: false, commandCenterVersion: 4, demoVersion: 4 });
    const sql = sequelize.query.mock.calls.map((c) => String(c[0]));
    expect(sql[0]).toMatch(/SET status = 'superseded'/);
    expect(sql[1]).toMatch(/INSERT INTO platform_build_artifacts/);
    expect(sql[2]).toMatch(/SET status = 'superseded'/);
    expect(sql[3]).toMatch(/INSERT INTO platform_build_artifacts/);
    for (const call of sequelize.query.mock.calls) expect(call[1].transaction).toEqual({ tx: 1 });
    expect(runStore.transitionRun).toHaveBeenCalledWith('r', ['building', 'dispatched'], 'uploaded', expect.objectContaining({ costUsd: 2.5 }), { tx: 1 });
  });

  it('stores only the Command Center when the demo was refused, and records why', async () => {
    runStore.getRun.mockResolvedValue({ id: 'r', project_id: 'p', status: 'building', plan_version: 3 });
    const out = await saveRunArtifacts('r', { ...upload, demoSpec: null, demoProblems: [{ path: 'demo/demo-spec.json', problem: 'bad' }] }, null);
    expect(out.demoVersion).toBeNull();
    expect(sequelize.query).toHaveBeenCalledTimes(2);
    expect(runStore.transitionRun).toHaveBeenCalledWith('r', expect.anything(), 'uploaded', expect.objectContaining({ errorClass: 'DemoSpecInvalid' }), { tx: 1 });
  });
});
