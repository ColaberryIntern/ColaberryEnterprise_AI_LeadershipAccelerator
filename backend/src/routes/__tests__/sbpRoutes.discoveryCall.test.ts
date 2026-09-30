/**
 * POST /api/portal/sbp/intake/:projectId/call, and the call offer on the
 * preview.
 *
 * The service is tested on its own; here the questions are about the edge.
 * Who may ask, what a malformed ask gets, whether the project has to be
 * theirs, and that the route reports the service's decision in the service's
 * own words instead of paraphrasing a refusal into a success.
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

const mockRequestCall = jest.fn();
const mockAvailability = jest.fn();
jest.mock('../../services/sbp/projectDiscoveryCallRequest', () => ({
  __esModule: true,
  requestProjectDiscoveryCall: (...a: any[]) => mockRequestCall(...a),
  callAvailability: (...a: any[]) => mockAvailability(...a),
}));

import sbpRoutes from '../sbpRoutes';

const app = express();
app.use(express.json());
app.use(sbpRoutes);

const BODY = { phone: '(214) 555-0143', consent: true, consent_version: '2026-09-11', name: 'Sam' };

const post = (body: unknown, participant = true, project = PROJECT) => {
  const req = request(app).post(`/api/portal/sbp/intake/${project}/call`).send(body as object);
  return participant ? req.set('x-test-participant', 'yes') : req;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockEnv.sbpPipelineEnabled = true;
  mockFindByPk.mockResolvedValue({ id: PROJECT, enrollment_id: ENROLLMENT });
  mockRequestCall.mockResolvedValue({ placed: false, reason: 'no_agent_configured', requestId: 'req-1' });
  mockAvailability.mockReturnValue({ available: false, consentText: 'words', consentVersion: '2026-09-11' });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('the boundary', () => {
  it('refuses an unauthenticated caller', async () => {
    expect((await post(BODY, false)).status).toBe(401);
    expect(mockRequestCall).not.toHaveBeenCalled();
  });

  it('is behind the pipeline gate', async () => {
    mockEnv.sbpPipelineEnabled = false;
    expect((await post(BODY)).status).toBe(404);
    expect(mockRequestCall).not.toHaveBeenCalled();
  });

  it('is 404 on a project that is not theirs, indistinguishable from one that does not exist', async () => {
    mockFindByPk.mockResolvedValue({ id: PROJECT, enrollment_id: OTHER });
    expect((await post(BODY)).status).toBe(404);
    expect(mockRequestCall).not.toHaveBeenCalled();
  });

  it('refuses consent:false at the edge; the box has to be ticked, not merely present', async () => {
    const res = await post({ ...BODY, consent: false });
    expect(res.status).toBe(400);
    expect(mockRequestCall).not.toHaveBeenCalled();
  });

  it('refuses a missing phone and a missing consent version with 400', async () => {
    expect((await post({ consent: true, consent_version: '2026-09-11' })).status).toBe(400);
    expect((await post({ phone: '2145550143', consent: true })).status).toBe(400);
    expect(mockRequestCall).not.toHaveBeenCalled();
  });
});

describe('what the student is told', () => {
  it('passes the request through with the participant as the enrollment, and reports the refusal verbatim', async () => {
    const res = await post(BODY);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ project_id: PROJECT, placed: false, reason: 'no_agent_configured', requestId: 'req-1' });

    const [input] = mockRequestCall.mock.calls[0];
    expect(input).toMatchObject({
      projectId: PROJECT,
      enrollmentId: ENROLLMENT,
      phone: '(214) 555-0143',
      consent: true,
      consentVersion: '2026-09-11',
      name: 'Sam',
    });
  });

  it('reports a placed call as placed, with the angles it will cover', async () => {
    mockRequestCall.mockResolvedValue({ placed: true, requestId: 'req-2', angles: ['THE MEASURE'], callId: 'sf-1' });
    const res = await post(BODY);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ placed: true, angles: ['THE MEASURE'], callId: 'sf-1' });
  });

  it('is 422 when the consent words the client showed are stale', async () => {
    mockRequestCall.mockResolvedValue({ placed: false, reason: 'consent_text_stale', requestId: null });
    const res = await post({ ...BODY, consent_version: '2020-01-01' });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('consent_text_stale');
  });
});

describe('the offer on the preview', () => {
  it('rides on the preview response so the wizard learns whether to show the option', async () => {
    mockAvailability.mockReturnValue({ available: true, consentText: 'the words', consentVersion: '2026-09-11' });
    const res = await request(app)
      .post('/api/portal/sbp/intake/preview')
      .set('x-test-participant', 'yes')
      .send({ idea: 'A robot that sorts pallets by weight.', answers: [], covered: [] });
    expect(res.status).toBe(200);
    expect(res.body.callOffer).toEqual({ available: true, consentText: 'the words', consentVersion: '2026-09-11' });
    // and the preview itself is still there
    expect(res.body.review.items.length).toBeGreaterThan(0);
  });
});
