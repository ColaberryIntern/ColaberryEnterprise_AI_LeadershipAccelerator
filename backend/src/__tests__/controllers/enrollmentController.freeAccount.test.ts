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
});
