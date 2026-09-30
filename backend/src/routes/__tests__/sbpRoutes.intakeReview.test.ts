/**
 * GET /api/portal/sbp/intake/:projectId/review — the stored truth, read back
 * after a build exists. Feeds the Story 000 handoff and any later
 * review-and-correct screen.
 *
 * Two halves, same words as the pre-Confirm preview and the Story 000
 * section: what was heard (grouped), and what is still unanswered (plain
 * language). Plus the revision, so a caller can tell whether a correction has
 * moved the truth on from what a plan was built against.
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
    if (req.headers['x-test-participant'] !== 'yes') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.participant = { sub: ENROLLMENT, email: 's@test.com', role: 'participant' };
    next();
  },
}));

const mockFindByPk = jest.fn();
jest.mock('../../models/Project', () => ({ __esModule: true, default: { findByPk: (...a: any[]) => mockFindByPk(...a) } }));
jest.mock('../../services/sbp/planStore', () => ({ __esModule: true, getPlan: jest.fn() }));
jest.mock('../../services/sbp/workspaceRepo', () => ({ __esModule: true, repoForProject: jest.fn() }));
jest.mock('../../services/sbp/scheduleForEnrollment', () => ({ __esModule: true, scheduleForEnrollment: jest.fn() }));
jest.mock('../../services/sbp/projectDiscoveryCallRequest', () => ({
  __esModule: true,
  callAvailability: () => ({ available: false, consentText: 'w', consentVersion: 'v' }),
  requestProjectDiscoveryCall: jest.fn(),
}));

const mockLoadAtRevision = jest.fn();
jest.mock('../../services/sbp/intakeTruthStore', () => ({
  __esModule: true,
  loadIntakeTruthAtRevision: (...a: any[]) => mockLoadAtRevision(...a),
  loadIntakeTruth: jest.fn(),
  saveIntakeTruth: jest.fn(),
  saveCorrectedTruth: jest.fn(),
}));

import sbpRoutes from '../sbpRoutes';

const app = express();
app.use(express.json());
app.use(sbpRoutes);

const fact = (dimension: string, value: string, provenance = 'source_message') => ({
  dimension, value, classification: 'FACT', provenance, source_quote: value,
});

const get = (participant = true) => {
  const req = request(app).get(`/api/portal/sbp/intake/${PROJECT}/review`);
  return participant ? req.set('x-test-participant', 'yes') : req;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockEnv.sbpPipelineEnabled = true;
  mockFindByPk.mockResolvedValue({ id: PROJECT, enrollment_id: ENROLLMENT });
  mockLoadAtRevision.mockResolvedValue({
    revision: 2,
    items: [
      fact('problem', 'A tool that checks invoices against purchase orders.'),
      fact('approval_points', 'Priya signs off anything over 5k.', 'client_confirmed'),
    ],
  });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('the boundary', () => {
  it('refuses an unauthenticated caller', async () => {
    expect((await get(false)).status).toBe(401);
  });

  it('is 404 on a project that is not theirs', async () => {
    mockFindByPk.mockResolvedValue({ id: PROJECT, enrollment_id: OTHER });
    expect((await get()).status).toBe(404);
    expect(mockLoadAtRevision).not.toHaveBeenCalled();
  });

  it('is 404, not an empty review, when the intake never ran', async () => {
    mockLoadAtRevision.mockResolvedValue(null);
    const res = await get();
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/No intake/);
  });
});

describe('the read-back', () => {
  it('returns the grouped review, the revision, and the still-unanswered angles in plain words', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body.project_id).toBe(PROJECT);
    expect(res.body.revision).toBe(2);

    expect(res.body.counts).toMatchObject({ confirmed: 1, needsConfirmation: 1 });
    expect(res.body.items.find((i: any) => i.dimension === 'approval_points')).toMatchObject({
      group: 'confirmed', label: 'What a person checks before it acts',
    });

    // Neither the problem nor the guardrail is unanswered; the rest are.
    expect(res.body.unanswered).toContain('there is no baseline, so nothing can be measured against it later');
    expect(res.body.unanswered).not.toContain('nobody has said what a person should check before this acts');
    expect(res.body.unanswered).not.toContain('the one-sentence purpose is not written down');
    expect(res.body.blocksPlanning).toBe(false);
  });

  it('an intake that ran and found nothing is an empty review, not a 404', async () => {
    mockLoadAtRevision.mockResolvedValue({ revision: 1, items: [] });
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.unanswered).toHaveLength(10);
  });
});
