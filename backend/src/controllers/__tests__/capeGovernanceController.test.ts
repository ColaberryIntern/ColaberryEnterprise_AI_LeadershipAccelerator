/**
 * Controller unit tests for capeGovernanceController.ts — CAPE Phase 6's
 * governance board admin routes. Mirrors trustController.registryHealth.test.ts's
 * mock-res pattern (this repo's established convention for controller-level
 * tests: mock service dependencies, real handler function, a minimal Express
 * res double). Covers happy path + validation-failure path per every mutating
 * handler (CLAUDE.md's mandatory failure-path test requirement).
 */
jest.mock('../../services/cape/capeGovernancePolicyService', () => ({
  getCurrentGovernancePolicyRow: jest.fn(),
  getGovernancePolicyHistory: jest.fn(),
  updateGovernancePolicy: jest.fn(),
}));
jest.mock('../../services/cape/capeLifecycleModePolicyService', () => ({
  listCurrentLifecycleModePolicies: jest.fn(),
  getLifecycleModePolicyHistory: jest.fn(),
  updateLifecycleModeMix: jest.fn(),
  ALL_LIFECYCLE_MODES: ['foundation', 'experienced_cold_start', 'active_builder', 'architect_track', 'returning_after_absence'],
}));
jest.mock('../../services/cape/capeSkillCoverageHeatmapService', () => ({ getSkillCoverageHeatmap: jest.fn() }));
jest.mock('../../services/cape/capeGovernancePersonaService', () => ({ listPersonas: jest.fn(), lookupEnrollment: jest.fn() }));

import {
  getCurrentGovernancePolicyRow, getGovernancePolicyHistory, updateGovernancePolicy,
} from '../../services/cape/capeGovernancePolicyService';
import {
  listCurrentLifecycleModePolicies, getLifecycleModePolicyHistory, updateLifecycleModeMix,
} from '../../services/cape/capeLifecycleModePolicyService';
import { getSkillCoverageHeatmap } from '../../services/cape/capeSkillCoverageHeatmapService';
import { listPersonas, lookupEnrollment } from '../../services/cape/capeGovernancePersonaService';
import {
  handleGetGovernancePolicy, handleGetGovernancePolicyHistory, handleUpdateGovernancePolicy,
  handleListLifecycleModePolicies, handleGetLifecycleModePolicyHistory, handleUpdateLifecycleModePolicy,
  handleGetSkillCoverageHeatmap, handleListPersonas, handleLookupEnrollment,
} from '../capeGovernanceController';

const mockGetPolicy = getCurrentGovernancePolicyRow as jest.Mock;
const mockGetPolicyHistory = getGovernancePolicyHistory as jest.Mock;
const mockUpdatePolicy = updateGovernancePolicy as jest.Mock;
const mockListModes = listCurrentLifecycleModePolicies as jest.Mock;
const mockGetModeHistory = getLifecycleModePolicyHistory as jest.Mock;
const mockUpdateMode = updateLifecycleModeMix as jest.Mock;
const mockHeatmap = getSkillCoverageHeatmap as jest.Mock;
const mockPersonas = listPersonas as jest.Mock;
const mockLookup = lookupEnrollment as jest.Mock;

function mockRes() {
  const res: any = { statusCode: 200, jsonBody: undefined };
  res.status = jest.fn((code: number) => { res.statusCode = code; return res; });
  res.json = jest.fn((body: any) => { res.jsonBody = body; return res; });
  return res;
}
const mockNext = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
});

describe('handleGetGovernancePolicy', () => {
  it('happy path: returns the current policy as JSON', async () => {
    mockGetPolicy.mockResolvedValue({ version: 1, same_type_max_streak: 2 });
    const res = mockRes();
    await handleGetGovernancePolicy({} as any, res, mockNext);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, policy: { version: 1, same_type_max_streak: 2 } }));
  });

  it('failure path: a service error is caught, not thrown, results in a non-2xx-by-default response via next()', async () => {
    mockGetPolicy.mockRejectedValue(new Error('db down'));
    const res = mockRes();
    await expect(handleGetGovernancePolicy({} as any, res, mockNext)).resolves.not.toThrow();
    expect(mockNext).toHaveBeenCalled();
  });
});

describe('handleGetGovernancePolicyHistory', () => {
  it('happy path: returns history array', async () => {
    mockGetPolicyHistory.mockResolvedValue([{ version: 1 }, { version: 2 }]);
    const res = mockRes();
    await handleGetGovernancePolicyHistory({} as any, res, mockNext);
    expect(res.json).toHaveBeenCalledWith({ ok: true, history: [{ version: 1 }, { version: 2 }] });
  });
});

describe('handleUpdateGovernancePolicy', () => {
  it('happy path: valid body calls the service and returns its result', async () => {
    mockUpdatePolicy.mockResolvedValue({ policy: { version: 2 }, versioned: true });
    const req: any = { body: { same_type_max_streak: 3 }, admin: { sub: 'admin-1' } };
    const res = mockRes();
    await handleUpdateGovernancePolicy(req, res, mockNext);
    expect(mockUpdatePolicy).toHaveBeenCalledWith({ same_type_max_streak: 3 }, 'admin-1');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, versioned: true }));
  });

  it('failure path: an empty body fails Zod validation with 400, never reaches the service', async () => {
    const req: any = { body: {}, admin: { sub: 'admin-1' } };
    const res = mockRes();
    await handleUpdateGovernancePolicy(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockUpdatePolicy).not.toHaveBeenCalled();
  });

  it('failure path: an out-of-bounds value (e.g. crowd_out_window: 999) fails Zod validation with 400', async () => {
    const req: any = { body: { crowd_out_window: 999 }, admin: { sub: 'admin-1' } };
    const res = mockRes();
    await handleUpdateGovernancePolicy(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockUpdatePolicy).not.toHaveBeenCalled();
  });
});

describe('handleListLifecycleModePolicies', () => {
  it('happy path: returns all modes', async () => {
    mockListModes.mockResolvedValue([{ mode: 'foundation' }]);
    const res = mockRes();
    await handleListLifecycleModePolicies({} as any, res, mockNext);
    expect(res.json).toHaveBeenCalledWith({ ok: true, modes: [{ mode: 'foundation' }] });
  });
});

describe('handleGetLifecycleModePolicyHistory', () => {
  it('happy path: valid mode returns history', async () => {
    mockGetModeHistory.mockResolvedValue([{ version: 1 }]);
    const req: any = { params: { mode: 'foundation' } };
    const res = mockRes();
    await handleGetLifecycleModePolicyHistory(req, res, mockNext);
    expect(mockGetModeHistory).toHaveBeenCalledWith('foundation');
    expect(res.json).toHaveBeenCalledWith({ ok: true, history: [{ version: 1 }] });
  });

  it('failure path: an unknown mode returns 404 (missing URL resource, not a malformed body) before calling the service', async () => {
    const req: any = { params: { mode: 'not_a_real_mode' } };
    const res = mockRes();
    await handleGetLifecycleModePolicyHistory(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockGetModeHistory).not.toHaveBeenCalled();
  });
});

describe('handleUpdateLifecycleModePolicy', () => {
  it('happy path: valid mode + valid mix calls the service', async () => {
    mockUpdateMode.mockResolvedValue({ policy: { version: 2 }, versioned: true });
    const req: any = { params: { mode: 'foundation' }, body: { mix: { foundation: 1 } }, admin: { sub: 'admin-1' } };
    const res = mockRes();
    await handleUpdateLifecycleModePolicy(req, res, mockNext);
    expect(mockUpdateMode).toHaveBeenCalledWith('foundation', { mix: { foundation: 1 } }, 'admin-1');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, versioned: true }));
  });

  it('failure path: an unknown mode returns 404 before Zod validation or the service', async () => {
    const req: any = { params: { mode: 'nope' }, body: { mix: { a: 1 } } };
    const res = mockRes();
    await handleUpdateLifecycleModePolicy(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockUpdateMode).not.toHaveBeenCalled();
  });

  it('failure path: a mix that does not sum to 1.0 returns 400, never reaches the service', async () => {
    const req: any = { params: { mode: 'foundation' }, body: { mix: { foundation: 0.5 } } };
    const res = mockRes();
    await handleUpdateLifecycleModePolicy(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockUpdateMode).not.toHaveBeenCalled();
  });
});

describe('handleGetSkillCoverageHeatmap', () => {
  it('happy path: returns the heatmap payload spread into the response', async () => {
    mockHeatmap.mockResolvedValue({ types: [], skills: [], cells: [], gaps: [] });
    const res = mockRes();
    await handleGetSkillCoverageHeatmap({} as any, res, mockNext);
    expect(res.json).toHaveBeenCalledWith({ ok: true, types: [], skills: [], cells: [], gaps: [] });
  });
});

describe('handleListPersonas', () => {
  it('happy path: returns the persona list', async () => {
    mockPersonas.mockResolvedValue([{ persona: 'new_no_resume', enrollment_id: null, note: 'x' }]);
    const res = mockRes();
    await handleListPersonas({} as any, res, mockNext);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });
});

describe('handleLookupEnrollment', () => {
  it('happy path: a real match returns 200 with the result', async () => {
    mockLookup.mockResolvedValue({ enrollment_id: 'e-1', email: 'a@x.com' });
    const req: any = { query: { query: 'a@x.com' } };
    const res = mockRes();
    await handleLookupEnrollment(req, res, mockNext);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, enrollment_id: 'e-1' }));
  });

  it('failure path: no match returns 404, not a throw', async () => {
    mockLookup.mockResolvedValue(null);
    const req: any = { query: { query: 'nobody@x.com' } };
    const res = mockRes();
    await handleLookupEnrollment(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('failure path: an empty query returns 400 before calling the service', async () => {
    const req: any = { query: { query: '' } };
    const res = mockRes();
    await handleLookupEnrollment(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockLookup).not.toHaveBeenCalled();
  });
});
