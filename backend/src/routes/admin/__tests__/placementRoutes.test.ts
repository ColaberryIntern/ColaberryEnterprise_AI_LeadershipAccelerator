const mockLoad = jest.fn();
jest.mock('../../../services/careerPrep/prepData', () => ({ loadPrepData: (...a: unknown[]) => mockLoad(...a) }));
const mockQuery = jest.fn();
jest.mock('../../../services/careerPrep/prepStudents', () => ({ listPrepStudents: (...a: unknown[]) => mockQuery(...a) }));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../../config/env';

const STUDENT = '33333333-3333-4333-8333-333333333333';
const URL = `/api/admin/placement/students/${STUDENT}/prep`;
const sign = (p: Record<string, unknown>) => `Bearer ${jwt.sign({ sub: 'staff-1', email: 's@example.com', ...p }, env.jwtSecret)}`;

function app(): express.Express {
  const a = express();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  a.use(require('../placementRoutes').default);
  return a;
}

beforeEach(() => mockLoad.mockReset().mockResolvedValue({ enrollmentId: STUDENT, firstName: null, observations: [], sourceRefs: [], sessions: [], interviews: [], trend: [] }));

describe('GET /api/admin/placement/students/:id/prep', () => {
  it('401s without a token', async () => {
    expect((await request(app()).get(URL)).status).toBe(401);
  });

  it('403s a scoped staff role that does not hold placement', async () => {
    expect((await request(app()).get(URL).set('Authorization', sign({ role: 'admin', mgmt_role: 'support' }))).status).toBe(403);
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('lets the owner read it (owner holds every section)', async () => {
    const res = await request(app()).get(URL).set('Authorization', sign({ role: 'admin', mgmt_role: 'owner' }));
    expect(res.status).toBe(200);
    expect(res.body.enrollmentId).toBe(STUDENT);
    expect(mockLoad).toHaveBeenCalledWith(STUDENT, expect.any(Date));
  });

  it('lets scoped staff read it when placement is granted to them as an extra section', async () => {
    const res = await request(app()).get(URL).set('Authorization', sign({ role: 'admin', mgmt_role: 'support', mgmt_extra_sections: ['placement'] }));
    expect(res.status).toBe(200);
  });

  it('400s an id that is not a uuid', async () => {
    expect((await request(app()).get('/api/admin/placement/students/abc/prep').set('Authorization', sign({ role: 'admin', mgmt_role: 'owner' }))).status).toBe(400);
  });

  it('500s when the read fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockLoad.mockRejectedValue(new Error('db'));
    expect((await request(app()).get(URL).set('Authorization', sign({ role: 'admin', mgmt_role: 'owner' }))).status).toBe(500);
  });
});

describe('GET /api/admin/placement/students (the Student prep list)', () => {
  const LIST = '/api/admin/placement/students';
  const owner = () => sign({ role: 'admin', mgmt_role: 'owner' });

  it('401s without a token and never queries', async () => {
    mockQuery.mockReset();
    expect((await request(app()).get(LIST)).status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('lets scoped staff list students when placement is granted to them as an extra section', async () => {
    mockQuery.mockReset().mockResolvedValue([]);
    const res = await request(app()).get(LIST).set('Authorization', sign({ role: 'admin', mgmt_role: 'support', mgmt_extra_sections: ['placement'] }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ students: [] });
  });

  it('403s staff without placement and never queries', async () => {
    mockQuery.mockReset();
    expect((await request(app()).get(LIST).set('Authorization', sign({ role: 'admin', mgmt_role: 'support' }))).status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('lists students (readiness absent when there is none)', async () => {
    mockQuery.mockReset().mockResolvedValue([
      { enrollmentId: STUDENT, name: 'Ann Lee', lastObserved: '2026-11-15T10:00:00.000Z', observations: 12, readiness: 71.5 },
      { enrollmentId: '44444444-4444-4444-8444-444444444444', name: 'Bo Kim', lastObserved: '2026-11-14T10:00:00.000Z', observations: 2 },
    ]);
    const res = await request(app()).get(LIST).set('Authorization', owner());
    expect(res.status).toBe(200);
    expect(res.body.students[0]).toEqual({ enrollmentId: STUDENT, name: 'Ann Lee', lastObserved: '2026-11-15T10:00:00.000Z', observations: 12, readiness: 71.5 });
    expect(res.body.students[1].readiness).toBeUndefined();
  });

  it('500s when the query fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockQuery.mockReset().mockRejectedValue(new Error('db'));
    expect((await request(app()).get(LIST).set('Authorization', owner())).status).toBe(500);
  });
});

describe('mgmtSectionGate classifies the prefix (deny-by-default)', () => {
  it('maps /api/admin/placement to the placement section', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', '..', '..', 'middlewares', 'mgmtSectionGate.ts'), 'utf8') as string;
    expect(src).toContain("['/api/admin/placement', 'placement']");
  });
});
