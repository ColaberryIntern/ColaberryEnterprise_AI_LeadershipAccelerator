/**
 * GET /api/portal/sbp/intake/:projectId/case-study-foundation — the four
 * sections and the computed rung, read-only. The questions here are about
 * the edge: who may read it, and that nothing on the wire says publishable.
 */
import express from 'express';
import request from 'supertest';

const ENROLLMENT = 'aced5b39-0000-4000-8000-000000000001';
const OTHER = 'aced5b39-0000-4000-8000-000000000002';
const PROJECT = 'cce94c20-a398-45b3-a6fb-b3fc87b6b1ef';

const mockEnv = { sbpPipelineEnabled: true };
jest.mock('../../config/env', () => ({ env: mockEnv }));

jest.mock('../../middlewares/participantAuth', () => ({
  requireParticipant: (req: any, res: any, next: any) => {
    if (req.headers['x-test-participant'] !== 'yes') return res.status(401).json({ error: 'Unauthorized' });
    req.participant = { sub: ENROLLMENT, email: 's@test.com', role: 'participant' };
    next();
  },
}));

const mockFindByPk = jest.fn();
jest.mock('../../models/Project', () => ({ __esModule: true, default: { findByPk: (...a: any[]) => mockFindByPk(...a) } }));
jest.mock('../../services/sbp/planStore', () => ({ __esModule: true, getPlan: jest.fn(), getPublishedPlan: jest.fn() }));
jest.mock('../../services/sbp/workspaceRepo', () => ({ __esModule: true, repoForProject: jest.fn() }));
jest.mock('../../services/sbp/scheduleForEnrollment', () => ({ __esModule: true, scheduleForEnrollment: jest.fn() }));
jest.mock('../../services/sbp/projectDiscoveryCallRequest', () => ({
  __esModule: true,
  callAvailability: () => ({ available: false, consentText: 'w', consentVersion: 'v' }),
  requestProjectDiscoveryCall: jest.fn(),
}));

const mockLoad = jest.fn();
jest.mock('../../services/sbp/caseStudyFoundationLoader', () => ({
  __esModule: true,
  loadCaseStudyFoundation: (...a: any[]) => mockLoad(...a),
  loadCaseStudyFoundationForGate: jest.fn(),
}));

import sbpRoutes from '../sbpRoutes';

const app = express();
app.use(express.json());
app.use(sbpRoutes);

const FOUNDATION = {
  maturity: 'build_record',
  ladder: ['story_hypothesis', 'build_record', 'capability_demonstration', 'operational_result', 'impact_case_study'],
  maturityReason: '1 verified story, no demonstration reference yet.',
  nextRungNeeds: 'A story that points at a demonstration.',
  truthRevision: 2,
  hypothesis: { maturity: 'story_hypothesis' },
  hypothesisCoverage: { filled: 3, total: 7 },
  buildEvidence: { facts: [], stories: [], verifiedStories: 1 },
  demonstrationEvidence: [],
  outcomeEvidence: { items: [], why: 'No approved measurement definitions exist.', heldMeasurementEvents: 0 },
  openQuestions: 0,
  publicationPreference: 'undecided',
  publishable: false,
  limitations: ['This is a hypothesis.'],
};

const get = (participant = true) => {
  const req = request(app).get(`/api/portal/sbp/intake/${PROJECT}/case-study-foundation`);
  return participant ? req.set('x-test-participant', 'yes') : req;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockEnv.sbpPipelineEnabled = true;
  mockFindByPk.mockResolvedValue({ id: PROJECT, enrollment_id: ENROLLMENT });
  mockLoad.mockResolvedValue(FOUNDATION);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('the boundary', () => {
  it('refuses an unauthenticated caller', async () => {
    expect((await get(false)).status).toBe(401);
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('is 404 on a project that is not theirs', async () => {
    mockFindByPk.mockResolvedValue({ id: PROJECT, enrollment_id: OTHER });
    expect((await get()).status).toBe(404);
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('is 404 when the intake never ran, so there is nothing to found', async () => {
    mockLoad.mockResolvedValue(null);
    const res = await get();
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/No intake/);
  });
});

describe('the read-back', () => {
  it('returns the four sections, the rung, and never says publishable', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.project_id).toBe(PROJECT);
    expect(res.body.maturity).toBe('build_record');
    expect(res.body.ladder).toHaveLength(5);
    expect(res.body).toHaveProperty('hypothesis');
    expect(res.body).toHaveProperty('buildEvidence');
    expect(res.body).toHaveProperty('demonstrationEvidence');
    expect(res.body).toHaveProperty('outcomeEvidence');
    expect(res.body.publishable).toBe(false);
    expect(mockLoad).toHaveBeenCalledWith(PROJECT);
  });

  it('is a read: the route file has no write for it', () => {
    // No POST/PUT/DELETE sibling. The foundation is a projection; the only
    // thing a caller can do with it is look.
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'sbpRoutes.ts'), 'utf8');
    expect(src.match(/case-study-foundation/g)).toHaveLength(1);
    expect(src).not.toMatch(/router\.(post|put|delete)\('[^']*case-study-foundation/);
  });
});
