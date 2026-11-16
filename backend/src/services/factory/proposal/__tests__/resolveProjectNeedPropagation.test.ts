/**
 * resolveProjectNeed — answer-once across the tenant's contracts (spec §B, decision #1). Answering a need closes its
 * open twin (same need_key) on every SIBLING delivery project of the same tenant, so the question drops off every
 * bid's "Needs you" list at once. Siblings are marked answered + rebuild_pending; they are NOT resumed here (only the
 * current project eager-rebuilds, from the route). collectProjectNeeds, the DB, the qualification and the library are
 * mocked; routeNeedResolution and tenantProjects run for real.
 */
const collectProjectNeeds = jest.fn();
const queryMock = jest.fn();
const qualFindOne = jest.fn();
const qualFindAll = jest.fn();
const addCompanyFact = jest.fn();

jest.mock('../collectProjectNeeds', () => ({ collectProjectNeeds: (...a: any[]) => collectProjectNeeds(...a) }));
jest.mock('../../../../config/database', () => ({ sequelize: { query: (...a: any[]) => queryMock(...a) } }));
jest.mock('../../../../models/GovQualification', () => ({
  __esModule: true,
  default: { findOne: (...a: any[]) => qualFindOne(...a), findAll: (...a: any[]) => qualFindAll(...a) },
}));
jest.mock('../govCompanyLibrary', () => ({ addCompanyFact: (...a: any[]) => addCompanyFact(...a) }));

import { resolveProjectNeed } from '../resolveProjectNeed';
import type { HumanNeed } from '../proposalReviewTypes';

const factNeed: HumanNeed = { key: 'fact:project_name_1', kind: 'fact', ask: 'Project name 1', why: 'w', format: 'text', blocking: 'score', usedIn: [{ docKey: 'past_performance' }] };

/** The propagation UPDATE is the one whose SQL carries an IN list; the current-project UPDATE matches by equality. */
const propagationCall = () => queryMock.mock.calls.find((c) => String(c[0]).includes('delivery_project_id IN ('));

beforeEach(() => {
  jest.clearAllMocks();
  collectProjectNeeds.mockResolvedValue([factNeed]);
  queryMock.mockResolvedValue([[], 1]);
  qualFindOne.mockResolvedValue({ tenant_id: 't1' });
  qualFindAll.mockResolvedValue([
    { delivery_project_id: 'dp-1' }, // the current project — must be excluded
    { delivery_project_id: 'dp-2' },
    { delivery_project_id: 'dp-3' },
  ]);
});

describe('answer-once cross-project propagation', () => {
  it('closes the same need_key on every sibling project, excluding the current one', async () => {
    const r = await resolveProjectNeed('dp-1', 'fact:project_name_1', { value: 'Saratoga Springs asset system' }, { email: 'ali@colaberry.com', canApprove: true });
    expect(r.status).toBe(200);
    const call = propagationCall();
    expect(call).toBeDefined();
    const [sql, opts] = call as [string, { bind: unknown[] }];
    // generated positional placeholders for exactly the two siblings
    expect(sql).toContain('delivery_project_id IN ($4, $5)');
    // never an array ANY bind (that has crash-looped prod)
    expect(sql).not.toMatch(/ANY\s*\(/);
    expect(opts.bind).toEqual(['fact:project_name_1', 'Saratoga Springs asset system', expect.any(String), 'dp-2', 'dp-3']);
    const payload = JSON.parse(String(opts.bind[2]));
    expect(payload).toMatchObject({ propagated: true, rebuild_pending: true, source_project: 'dp-1' });
  });

  it('does not propagate when the tenant has no other projects', async () => {
    qualFindAll.mockResolvedValue([{ delivery_project_id: 'dp-1' }]);
    const r = await resolveProjectNeed('dp-1', 'fact:project_name_1', { value: 'x' }, { email: 'ali@colaberry.com', canApprove: true });
    expect(r.status).toBe(200);
    expect(propagationCall()).toBeUndefined();
  });

  it('still returns 200 when propagation fails (best-effort, the answer is already recorded)', async () => {
    // First query (the current-project UPDATE) succeeds; the propagation UPDATE rejects.
    queryMock.mockImplementation((sql: string) => (String(sql).includes('delivery_project_id IN (') ? Promise.reject(new Error('db blip')) : Promise.resolve([[], 1])));
    const r = await resolveProjectNeed('dp-1', 'fact:project_name_1', { value: 'x' }, { email: 'ali@colaberry.com', canApprove: true });
    expect(r.status).toBe(200);
  });
});
