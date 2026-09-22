/**
 * generateDecomposition must respect the gate: persist the task graph ONLY when the engine result is
 * accepted (gate-clean); on a not-accepted result surface the issues and persist NOTHING (no fake pass);
 * when the flag is off report 'disabled' without persisting. It calls the DARK switch factoryGenerateIfEnabled
 * (never factoryGenerate). The loader maps rows (canonical_req_id -> id). Everything mocked (no DB, no model).
 */
const transaction = jest.fn(async (cb: any) => cb('TX'));
jest.mock('../../../config/database', () => ({ sequelize: { transaction: (...a: any[]) => transaction(...a) } }));

const factoryGenerateIfEnabled = jest.fn();
jest.mock('../factoryGenerationEntry', () => {
  const actual = jest.requireActual('../factoryGenerationEntry');
  return { ...actual, factoryGenerateIfEnabled: (...a: any[]) => factoryGenerateIfEnabled(...a) };
});

const trackFindAll = jest.fn();
const reqFindAll = jest.fn();
const docUpsert = jest.fn().mockResolvedValue([{}, true]);
jest.mock('../../../models/ContractTrack', () => ({ __esModule: true, default: { findAll: (...a: any[]) => trackFindAll(...a) } }));
jest.mock('../../../models/ContractRequirement', () => ({ __esModule: true, default: { findAll: (...a: any[]) => reqFindAll(...a) } }));
jest.mock('../../../models/ContractProcessDocument', () => ({ __esModule: true, default: { upsert: (...a: any[]) => docUpsert(...a) } }));

import { generateDecomposition } from '../factoryDecomposeRun';

const project = {
  processes: [{ id: 'P1' }], roles: [], tasks: [{ id: 'T1' }], assignments: [], transitions: [],
  allocation: [], role_map: [], source_blocks: [{ id: 'blk-REQ-001', kind: 'requirement' }],
};

beforeEach(() => {
  jest.clearAllMocks();
  trackFindAll.mockResolvedValue([{ id: 't-s', delivery_project_id: 'dp-1', track_type: 'solution_build', status: 'in_progress' }]);
  reqFindAll.mockResolvedValue([{ canonical_req_id: 'REQ-001', statement: 'The vendor shall X.', kind: 'compliance', priority: 'must', tracks: ['solution_build'], extracted_text: 'The vendor shall X.', source_evidence: ['blk-REQ-001'], evidence_state: 'unassessed', human_confirmed: false }]);
});

describe('generateDecomposition', () => {
  it('loads + maps the rows into the generate input (canonical_req_id -> id, extracted_text)', async () => {
    factoryGenerateIfEnabled.mockResolvedValue({ project, issues: [], accepted: true });
    await generateDecomposition('dp-1');
    const input = factoryGenerateIfEnabled.mock.calls[0][0];
    expect(input.deliveryProjectId).toBe('dp-1');
    expect(input.requirements[0]).toMatchObject({ id: 'REQ-001', extracted_text: 'The vendor shall X.', evidence_state: 'unassessed' });
    expect(input.tracks[0]).toMatchObject({ track_type: 'solution_build' });
  });

  it('persists the task graph to the solution_build v1 draft ONLY when accepted', async () => {
    factoryGenerateIfEnabled.mockResolvedValue({ project, issues: [], accepted: true });
    const out = await generateDecomposition('dp-1');
    expect(out).toEqual({ status: 'generated', errorCount: 0 });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(docUpsert).toHaveBeenCalledTimes(1);
    const doc = docUpsert.mock.calls[0][0];
    expect(doc).toMatchObject({ track_type: 'solution_build', version: 1, status: 'draft' });
    expect(doc.doc_json.tasks).toEqual([{ id: 'T1' }]);
    expect(doc.doc_json.processes).toEqual([{ id: 'P1' }]);
    expect(docUpsert.mock.calls[0][1]).toEqual({ transaction: 'TX' });
  });

  it('surfaces issues and persists NOTHING when the result is not accepted (no fake pass)', async () => {
    factoryGenerateIfEnabled.mockResolvedValue({ project, accepted: false, issues: [{ code: 'START', message: 'x', severity: 'error' }, { code: 'END', message: 'y', severity: 'error' }] });
    const out = await generateDecomposition('dp-1');
    expect(out).toMatchObject({ status: 'rejected', errorCount: 2 });
    expect(docUpsert).not.toHaveBeenCalled();
  });

  it('reports disabled (no persist, no fake) when the generation flag is off', async () => {
    factoryGenerateIfEnabled.mockResolvedValue({ project, accepted: false, issues: [{ code: 'FACTORY_GENERATION_DISABLED', message: 'off', severity: 'error' }] });
    const out = await generateDecomposition('dp-1');
    expect(out).toEqual({ status: 'disabled' });
    expect(docUpsert).not.toHaveBeenCalled();
  });
});
