jest.mock('../../middlewares/authFailureLog', () => ({
  logAuthFailure: jest.fn(),
  describeCaller: () => ({ forwarded_for: null, user_agent: null }),
}));
const mockEnabled = jest.fn();
jest.mock('../../services/careerPrep/careerPrepFlag', () => ({ careerPrepEnabled: (...a: unknown[]) => mockEnabled(...a) }));
let mockCampusOn = true;
jest.mock('../../services/campus/campusPilot', () => ({ campusOnFor: () => mockCampusOn }));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const SECRET = ['career', 'prep', 'secret'].join('-');
process.env.JWT_SECRET = SECRET;
const URL = '/api/portal/career-prep/flags';
const token = (sub = 'enr-ali') => jwt.sign({ sub, cohort_id: 'coh-1', role: 'participant' }, SECRET);

function app(): express.Express {
  const a = express();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  a.use(require('../careerPrepRoutes').default);
  return a;
}

beforeEach(() => { mockCampusOn = true; mockEnabled.mockReset(); });

describe('GET /api/portal/career-prep/flags', () => {
  it('401s without a token and never reveals the flag', async () => {
    const res = await request(app()).get(URL);
    expect(res.status).toBe(401);
    expect(res.body.careerPrep).toBeUndefined();
  });

  it('is true for an allow-listed enrollment with the campus on', async () => {
    mockEnabled.mockResolvedValue(true);
    const res = await request(app()).get(URL).set('Authorization', `Bearer ${token()}`);
    expect(res.body).toEqual({ careerPrep: true });
    expect(mockEnabled).toHaveBeenCalledWith('enr-ali');
  });

  it('is false for anyone not on the allow-list', async () => {
    mockEnabled.mockResolvedValue(false);
    expect((await request(app()).get(URL).set('Authorization', `Bearer ${token('enr-2')}`)).body).toEqual({ careerPrep: false });
  });

  it('is false when the campus is off, without reading the allow-list', async () => {
    mockCampusOn = false;
    mockEnabled.mockResolvedValue(true);
    expect((await request(app()).get(URL).set('Authorization', `Bearer ${token()}`)).body).toEqual({ careerPrep: false });
    expect(mockEnabled).not.toHaveBeenCalled();
  });

  it('fails closed when the flag read throws', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockEnabled.mockRejectedValue(new Error('boom'));
    const res = await request(app()).get(URL).set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ careerPrep: false });
  });
});
