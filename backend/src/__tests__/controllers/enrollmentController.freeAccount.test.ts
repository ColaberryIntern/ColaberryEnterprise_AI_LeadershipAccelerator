/**
 * POST /api/create-free-account — the /enroll page's free-signup path.
 * Public (no service token, unlike /api/v1/open-house/register), validates
 * via createFreeAccountSchema, delegates to createExplorerEnrollment.
 */

jest.mock('../../services/enrollmentService', () => ({
  createExplorerEnrollment: jest.fn(),
}));

import { createExplorerEnrollment } from '../../services/enrollmentService';
import { handleCreateFreeAccount } from '../../controllers/enrollmentController';

const mockCreateExplorer = createExplorerEnrollment as jest.Mock;

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('handleCreateFreeAccount', () => {
  it('creates a free account and returns 201 with a sign-in-link message', async () => {
    mockCreateExplorer.mockResolvedValue({
      enrollment: { id: 'enr-1' },
      created: true,
      cohort_id: 'explorer-cohort-1',
    });

    const req: any = {
      body: { full_name: 'Jane Doe', email: 'jane@example.com', company: 'Acme' },
    };
    const res = mockRes();
    const next = jest.fn();

    await handleCreateFreeAccount(req, res, next);

    expect(mockCreateExplorer).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Jane Doe', email: 'jane@example.com', company: 'Acme', source: 'Free signup (/enroll)' }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ enrollmentId: 'enr-1', created: true, message: expect.stringContaining('sign-in link') }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 200 (not 201) when the account already existed — idempotent resubmission', async () => {
    mockCreateExplorer.mockResolvedValue({
      enrollment: { id: 'enr-1' },
      created: false,
      cohort_id: 'explorer-cohort-1',
    });

    const req: any = { body: { full_name: 'Jane Doe', email: 'jane@example.com' } };
    const res = mockRes();
    await handleCreateFreeAccount(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('rejects with 400 + field details on invalid input, without calling the service', async () => {
    const req: any = { body: { full_name: '', email: 'not-an-email' } };
    const res = mockRes();
    const next = jest.fn();

    await handleCreateFreeAccount(req, res, next);

    expect(mockCreateExplorer).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    const payload = res.json.mock.calls[0][0];
    expect(payload.error).toBe('Validation failed');
    expect(payload.details.some((d: any) => d.field === 'full_name')).toBe(true);
    expect(payload.details.some((d: any) => d.field === 'email')).toBe(true);
  });

  it('passes non-Zod errors to next() rather than swallowing them', async () => {
    mockCreateExplorer.mockRejectedValue(new Error('db unavailable'));
    const req: any = { body: { full_name: 'Jane', email: 'jane@example.com' } };
    const res = mockRes();
    const next = jest.fn();

    await handleCreateFreeAccount(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.status).not.toHaveBeenCalled();
  });

  /**
   * 40 TAC 807.172(d) (Texas Workforce Commission): training must not be advertised as
   * "free". Until 2026-10-12 BOTH branches of this response said "your free account" and
   * returned it straight to the person who had just signed up — the shortest path from the
   * rule to a real breach anywhere in the repo.
   *
   * WHY THIS LIVES HERE AND NOT ONLY IN THE RATCHET. `bannedWordOutboundCopy.test.ts` had
   * this file frozen at 4 occurrences with the reason "two signup-response messages say
   * 'your free account'" — so the breach was recorded, counted, and green. A shrink-only
   * baseline cannot distinguish a response body from a seed file, and nothing asserted
   * anything about what this endpoint actually hands back. The ratchet stops the count
   * rising; this stops the two strings returning to the one surface a person reads.
   *
   * Both branches are driven, because `created: false` is a real production path (an
   * idempotent resubmission) and it carried the same breach.
   */
  it('never returns the banned word to the person, in either branch', async () => {
    for (const created of [true, false]) {
      jest.clearAllMocks();
      mockCreateExplorer.mockResolvedValue({
        enrollment: { id: 'enr-1' },
        created,
        cohort_id: 'explorer-cohort-1',
      });
      const res = mockRes();

      await handleCreateFreeAccount(
        { body: { full_name: 'Jane Doe', email: 'jane@example.com' } } as any,
        res,
        jest.fn(),
      );

      const { message } = res.json.mock.calls[0][0];
      // Control: proves we captured the real copy and are not asserting about undefined.
      expect(message).toContain('sign-in link');
      expect(message.toLowerCase()).not.toMatch(/\bfree\b/);
    }
  });

  /**
   * The same line logged the raw email address. `[Enrollment] Free account created for
   * jane@example.com` puts a person's address in container stdout, which this repo treats
   * as a structured event stream, not a private file.
   *
   * Asserts on `@` rather than on the literal address, because the next leak will be a
   * different person. The `enr-1` assertion is the control: without it a run that captured
   * no log line at all would pass both negatives.
   */
  it('logs an enrollment id, never the email address', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      mockCreateExplorer.mockResolvedValue({
        enrollment: { id: 'enr-1' },
        created: true,
        cohort_id: 'explorer-cohort-1',
      });

      await handleCreateFreeAccount(
        { body: { full_name: 'Jane Doe', email: 'jane@example.com' } } as any,
        mockRes(),
        jest.fn(),
      );

      const logged = spy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(logged).toContain('enr-1');
      expect(logged).not.toContain('@');
    } finally {
      spy.mockRestore();
    }
  });
});
