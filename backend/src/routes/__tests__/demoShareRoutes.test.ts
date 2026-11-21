/**
 * The publish control at the HTTP boundary.
 *
 * The service suite proves who may publish what. This one proves the route in front of it does
 * not give that away: that an unauthenticated POST is refused with a 401 ASSERTED rather than
 * inferred from a lint pass, and that each refusal the service raises becomes the right status
 * instead of a uniform 500 a client cannot act on.
 *
 * `scripts/lint-route-auth.js` scans only `backend/src/routes/admin/`, so it would never have
 * looked at this file. A route's auth being untested because the linter does not cover its
 * directory is exactly the gap this suite exists to close.
 */
jest.mock('../../middlewares/authFailureLog', () => ({
  logAuthFailure: jest.fn(),
  describeCaller: () => ({ forwarded_for: null, user_agent: null }),
}));

const getShare = jest.fn();
const setShare = jest.fn();
jest.mock('../../services/connectedDemoShareService', () => {
  // The real schema, so the route's 400s are the real ones rather than a stub's.
  const actual = jest.requireActual('../../services/connectedDemoShareService');
  return {
    __esModule: true,
    SetConnectedDemoShareSchema: actual.SetConnectedDemoShareSchema,
    GetConnectedDemoShareSchema: actual.GetConnectedDemoShareSchema,
    ConnectedDemoShareError: actual.ConnectedDemoShareError,
    getConnectedDemoShare: (...a: unknown[]) => getShare(...a),
    setConnectedDemoShare: (...a: unknown[]) => setShare(...a),
  };
});

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const SECRET = ['demo', 'share', 'route'].join('-');
process.env.JWT_SECRET = SECRET;

const URL = '/api/portal/project/demo/share';
const PROJECT = '11111111-1111-4111-8111-111111111111';
const ENROLLMENT = 'enr-owner-1';

const token = (sub = ENROLLMENT) =>
  `Bearer ${jwt.sign({ sub, cohort_id: 'coh-1', role: 'participant' }, SECRET)}`;

function app(): express.Express {
  const a = express();
  a.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  a.use(require('../projectRoutes').default);
  return a;
}

const OK = {
  project_id: PROJECT, enabled: true, url: `/api/public/demo/tok`, has_spec: true, event_count: 3,
};

beforeEach(() => {
  getShare.mockReset();
  setShare.mockReset();
});

describe('authentication is required, and asserted', () => {
  it('401s an unauthenticated POST', async () => {
    const res = await request(app()).post(URL).send({ project_id: PROJECT, enabled: true });
    expect(res.status).toBe(401);
    // And nothing was attempted behind it.
    expect(setShare).not.toHaveBeenCalled();
  });

  it('401s an unauthenticated GET', async () => {
    const res = await request(app()).get(`${URL}?project_id=${PROJECT}`);
    expect(res.status).toBe(401);
    expect(getShare).not.toHaveBeenCalled();
  });

  it('401s a malformed bearer token', async () => {
    const res = await request(app()).post(URL)
      .set('Authorization', 'Bearer not-a-real-token')
      .send({ project_id: PROJECT, enabled: true });
    expect(res.status).toBe(401);
    expect(setShare).not.toHaveBeenCalled();
  });

  it('401s a token signed with the wrong secret', async () => {
    const forged = `Bearer ${jwt.sign({ sub: ENROLLMENT, role: 'participant' }, 'wrong-secret')}`;
    const res = await request(app()).post(URL).set('Authorization', forged)
      .send({ project_id: PROJECT, enabled: true });
    expect(res.status).toBe(401);
  });

  it('lets a valid participant through, so the refusals above are not refusing everyone', async () => {
    setShare.mockResolvedValue(OK);
    const res = await request(app()).post(URL).set('Authorization', token())
      .send({ project_id: PROJECT, enabled: true });
    expect(res.status).toBe(200);
  });
});

describe('the caller is taken from the SESSION, never from the body', () => {
  it('passes the token subject, ignoring an enrollment_id in the payload', async () => {
    setShare.mockResolvedValue(OK);
    await request(app()).post(URL).set('Authorization', token('enr-real'))
      .send({ project_id: PROJECT, enabled: true, enrollment_id: 'enr-someone-else' });
    expect(setShare).toHaveBeenCalledWith('enr-real', expect.objectContaining({ project_id: PROJECT }));
  });

  it('strips unknown body fields rather than forwarding them', async () => {
    setShare.mockResolvedValue(OK);
    await request(app()).post(URL).set('Authorization', token())
      .send({ project_id: PROJECT, enabled: true, demo_share_enabled: true, admin: true });
    const forwarded = setShare.mock.calls[0][1] as Record<string, unknown>;
    expect(forwarded.admin).toBeUndefined();
    expect(forwarded.demo_share_enabled).toBeUndefined();
  });
});

describe('each refusal becomes a status a client can act on', () => {
  it.each([
    ['NotFoundError', 404],
    ['ForbiddenError', 403],
    ['DataModelRequired', 400],
    ['ConnectedDemoContentRefused', 422],
    ['ConnectedDemoDataModelMissing', 422],
  ])('%s becomes %i', async (error_class, status) => {
    setShare.mockRejectedValue(Object.assign(new Error('refused'), { error_class }));
    const res = await request(app()).post(URL).set('Authorization', token())
      .send({ project_id: PROJECT, enabled: true });
    expect(res.status).toBe(status);
    expect(res.body.error_class).toBe(error_class);
  });

  it('an unrecognized failure is a 500, not a plausible-looking 4xx', async () => {
    // A 4xx says "you did something wrong". For a failure we cannot classify, that is a guess,
    // and it sends the caller looking at their own request for a bug that is ours.
    setShare.mockRejectedValue(new Error('the database fell over'));
    const res = await request(app()).post(URL).set('Authorization', token())
      .send({ project_id: PROJECT, enabled: true });
    expect(res.status).toBe(500);
  });

  it('400s a body the schema rejects, before the service is called', async () => {
    for (const body of [
      {},
      { project_id: 'not-a-uuid', enabled: true },
      { project_id: PROJECT },
      { project_id: PROJECT, enabled: 'yes' },
    ]) {
      setShare.mockReset();
      const res = await request(app()).post(URL).set('Authorization', token()).send(body);
      expect(res.status).toBe(400);
      expect(setShare).not.toHaveBeenCalled();
    }
  });

  it('400s a GET with no project_id, rather than guessing which project is meant', async () => {
    const res = await request(app()).get(URL).set('Authorization', token());
    expect(res.status).toBe(400);
    expect(getShare).not.toHaveBeenCalled();
  });

  /**
   * The READ side validates as strictly as the write side.
   *
   * It used to be `String(req.query.project_id || '')` plus a presence check. `projects.id` is a
   * Postgres `UUID`, so `?project_id=abc` reached `findByPk` and came back as a 500 carrying the
   * driver's message, where the POST answered 400 for the same input. A repeated parameter was
   * worse: `String(['a','b'])` becomes the string `'a,b'` with no complaint from anything.
   */
  it('400s a GET whose project_id is not a uuid, before the service is called', async () => {
    for (const q of [
      'project_id=abc',
      'project_id=',
      `project_id=${PROJECT}x`,
      // Repeated, which Express parses as an array. Silent coercion was the bug.
      `project_id=${PROJECT}&project_id=${PROJECT}`,
      // Object-shaped, the other thing Express's query parser can hand over.
      'project_id[a]=1',
    ]) {
      getShare.mockReset();
      const res = await request(app()).get(`${URL}?${q}`).set('Authorization', token());
      expect(res.status).toBe(400);
      expect(getShare).not.toHaveBeenCalled();
    }
  });

  /**
   * The caller is the SESSION, never the request, on the path that discloses a share token.
   *
   * The POST has this assertion; the GET did not, and a verifier's mutation that read the caller
   * from `req.query.enrollment_id` survived the whole suite. One parameter away from a route that
   * hands anybody any project's public link.
   */
  it('ignores an enrollment_id in the query and uses the token subject', async () => {
    getShare.mockResolvedValue(OK);
    await request(app())
      .get(`${URL}?project_id=${PROJECT}&enrollment_id=enr-somebody-else`)
      .set('Authorization', token());
    expect(getShare).toHaveBeenCalledWith(ENROLLMENT, PROJECT);
    expect(getShare.mock.calls[0][0]).not.toBe('enr-somebody-else');
  });
});

describe('the happy path', () => {
  it('returns the share state', async () => {
    setShare.mockResolvedValue(OK);
    const res = await request(app()).post(URL).set('Authorization', token())
      .send({ project_id: PROJECT, enabled: true });
    expect(res.body).toEqual(OK);
  });

  it('forwards the data model when one is sent', async () => {
    setShare.mockResolvedValue(OK);
    const data_model = { app_name: 'Dispatch console', tables: [{ name: 'shift' }] };
    await request(app()).post(URL).set('Authorization', token())
      .send({ project_id: PROJECT, enabled: true, data_model });
    expect((setShare.mock.calls[0][1] as Record<string, unknown>).data_model).toEqual(data_model);
  });

  it('reads state for the project named in the query', async () => {
    getShare.mockResolvedValue({ ...OK, enabled: false, url: null });
    const res = await request(app()).get(`${URL}?project_id=${PROJECT}`).set('Authorization', token());
    expect(res.status).toBe(200);
    expect(getShare).toHaveBeenCalledWith(ENROLLMENT, PROJECT);
    expect(res.body.url).toBeNull();
  });
});
