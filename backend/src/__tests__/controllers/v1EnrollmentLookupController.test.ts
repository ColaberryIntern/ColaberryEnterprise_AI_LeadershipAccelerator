import { Request, Response, NextFunction } from 'express';

jest.mock('../../models', () => ({
  Enrollment: { findAll: jest.fn() },
  Cohort: {},
}));

import { Enrollment } from '../../models';
import { lookupEnrollment, isEnrolledMember } from '../../controllers/v1EnrollmentLookupController';

const findAll = Enrollment.findAll as jest.Mock;

function mockRes(): Response & { body?: unknown; statusCode?: number } {
  const res: Partial<Response> & { body?: unknown; statusCode?: number } = {};
  res.status = jest.fn((code: number) => { res.statusCode = code; return res as Response; }) as unknown as Response['status'];
  res.json = jest.fn((b: unknown) => { res.body = b; return res as Response; }) as unknown as Response['json'];
  return res as Response & { body?: unknown; statusCode?: number };
}

function run(query: Record<string, unknown>) {
  const req = { query } as unknown as Request;
  const res = mockRes();
  const next = jest.fn() as unknown as NextFunction;
  return lookupEnrollment(req, res, next).then(() => ({ res, next }));
}

const row = (status: string, tier: string, cohort: string | null) => ({ status, tier, cohort: cohort ? { name: cohort } : null });

describe('isEnrolledMember', () => {
  it('is true for an active or completed member', () => {
    expect(isEnrolledMember([{ cohort: 'Cohort - July 2026', status: 'active', tier: 'member' }])).toBe(true);
    expect(isEnrolledMember([{ cohort: 'Cohort - April 2026', status: 'completed', tier: 'member' }])).toBe(true);
  });

  it('is false for guests and for withdrawn or suspended members', () => {
    expect(isEnrolledMember([{ cohort: 'Explorer', status: 'active', tier: 'guest' }])).toBe(false);
    expect(isEnrolledMember([{ cohort: 'Cohort - July 2026', status: 'withdrawn', tier: 'member' }])).toBe(false);
    expect(isEnrolledMember([{ cohort: 'Cohort - July 2026', status: 'suspended', tier: 'member' }])).toBe(false);
    expect(isEnrolledMember([])).toBe(false);
  });
});

describe('GET /api/v1/enrollments/lookup', () => {
  beforeEach(() => { findAll.mockReset(); process.stdout.write = jest.fn() as unknown as typeof process.stdout.write; });

  it('returns enrolled=true with the cohort rows for a launch student', async () => {
    findAll.mockResolvedValue([row('active', 'member', 'Cohort - July 2026')]);
    const { res } = await run({ email: 'Student@Example.com' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      email: 'student@example.com',
      enrolled: true,
      enrollments: [{ cohort: 'Cohort - July 2026', status: 'active', tier: 'member' }],
    });
    // Looked up lower-cased, exactly once.
    expect(findAll).toHaveBeenCalledTimes(1);
    expect(findAll.mock.calls[0][0].where).toEqual({ email: 'student@example.com' });
  });

  it('returns enrolled=false for an unknown email and for a guest-only account', async () => {
    findAll.mockResolvedValue([]);
    const { res: r1 } = await run({ email: 'nobody@example.com' });
    expect(r1.statusCode).toBe(200);
    expect(r1.body).toEqual({ email: 'nobody@example.com', enrolled: false, enrollments: [] });

    findAll.mockResolvedValue([row('active', 'guest', 'Explorer — Prospects')]);
    const { res: r2 } = await run({ email: 'guest@example.com' });
    expect((r2.body as { enrolled: boolean }).enrolled).toBe(false);
  });

  it('rejects a malformed or missing email with 400 and never touches the database', async () => {
    const { res: r1, next: n1 } = await run({ email: 'not-an-email' });
    expect(r1.statusCode).toBe(400);
    expect(n1).not.toHaveBeenCalled();
    const { res: r2 } = await run({});
    expect(r2.statusCode).toBe(400);
    expect(findAll).not.toHaveBeenCalled();
  });

  it('hands a database failure to the error middleware', async () => {
    findAll.mockRejectedValue(new Error('connection reset'));
    const { res, next } = await run({ email: 'student@example.com' });
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.statusCode).toBeUndefined();
  });

  it('is idempotent: the same lookup twice returns the same body and writes nothing', async () => {
    findAll.mockResolvedValue([row('completed', 'member', 'Cohort — April 2026')]);
    const a = await run({ email: 'grad@example.com' });
    const b = await run({ email: 'grad@example.com' });
    expect(a.res.body).toEqual(b.res.body);
    expect(findAll).toHaveBeenCalledTimes(2);
  });
});
