jest.mock('jsonwebtoken', () => ({ sign: jest.fn(() => 'signed-token') }));
jest.mock('../../config/env', () => ({ env: { jwtSecret: 'test-secret', jwtExpiresIn: '7d' } }));
jest.mock('../../models', () => ({
  Enrollment: { findOne: jest.fn() },
  Cohort: { findByPk: jest.fn() },
  LiveSession: {},
  AttendanceRecord: {},
  AssignmentSubmission: {},
}));
jest.mock('../emailService', () => ({ sendPortalMagicLink: jest.fn() }));
jest.mock('../access/mgmtBridgeService', () => ({ loadStaffPortalLinkByEmail: jest.fn() }));

import { Enrollment, Cohort } from '../../models';
import { sendPortalMagicLink } from '../emailService';
import { loadStaffPortalLinkByEmail } from '../access/mgmtBridgeService';
import { requestMagicLink } from '../participantService';

const findOne = Enrollment.findOne as jest.Mock;
const findByPk = Cohort.findByPk as jest.Mock;
const sendLink = sendPortalMagicLink as jest.Mock;
const loadStaffLink = loadStaffPortalLinkByEmail as jest.Mock;

/** A staff member's real shape: an OLD staff enrollment plus a NEWER stale one. */
const STAFF = { id: 'staff-enrollment', email: 'ali@colaberry.com', full_name: 'Ali', cohort_id: 'c1', update: jest.fn() };
const NEWER = { id: 'newer-enrollment', email: 'ali@colaberry.com', full_name: 'Ali', cohort_id: 'c2', update: jest.fn() };

/**
 * Route findOne by the shape of its where clause: a lookup by `id` is the
 * staff-link path, a lookup by `email` is the recency fallback.
 */
function mockLookup({ byId, byEmail }: { byId?: unknown; byEmail?: unknown }) {
  findOne.mockImplementation(({ where }: any) =>
    Promise.resolve(where.id !== undefined ? (byId ?? null) : (byEmail ?? null))
  );
}

describe('requestMagicLink enrollment resolution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findByPk.mockResolvedValue({ name: 'Accelerator' });
  });

  it('prefers the staff-linked enrollment over a more recent one', async () => {
    // The regression this guards: recency ordering sent staff into NEWER,
    // which carries no mgmt role, so the Management Portal link never rendered.
    loadStaffLink.mockResolvedValue({ enrollmentId: 'staff-enrollment', mgmtRole: 'owner' });
    mockLookup({ byId: STAFF, byEmail: NEWER });

    const res = await requestMagicLink('ali@colaberry.com');

    expect(res.success).toBe(true);
    expect(STAFF.update).toHaveBeenCalledTimes(1);
    expect(NEWER.update).not.toHaveBeenCalled();
    expect(sendLink).toHaveBeenCalledWith(expect.objectContaining({ to: 'ali@colaberry.com' }));
  });

  it('falls back to the most recent enrollment when there is no staff link', async () => {
    loadStaffLink.mockResolvedValue(null);
    mockLookup({ byEmail: NEWER });

    await requestMagicLink('student@colaberry.com');

    expect(NEWER.update).toHaveBeenCalledTimes(1);
    expect(findOne.mock.calls[0][0].order).toEqual([['created_at', 'DESC']]);
  });

  it('falls back when the staff-linked enrollment is inactive or portal-disabled', async () => {
    loadStaffLink.mockResolvedValue({ enrollmentId: 'staff-enrollment', mgmtRole: 'owner' });
    mockLookup({ byId: null, byEmail: NEWER }); // id lookup filters on status/portal_enabled

    await requestMagicLink('ali@colaberry.com');

    expect(NEWER.update).toHaveBeenCalledTimes(1);
  });

  it('normalizes the email before lookup', async () => {
    loadStaffLink.mockResolvedValue(null);
    mockLookup({ byEmail: NEWER });

    await requestMagicLink('  ALI@Colaberry.com  ');

    expect(loadStaffLink).toHaveBeenCalledWith('ali@colaberry.com');
    expect(findOne.mock.calls[0][0].where.email).toBe('ali@colaberry.com');
  });

  it('reports a pending enrollment without sending a link', async () => {
    loadStaffLink.mockResolvedValue(null);
    findOne
      .mockResolvedValueOnce(null)                    // no active + portal_enabled
      .mockResolvedValueOnce({ id: 'pending' });      // but a portal-disabled one exists

    const res = await requestMagicLink('pending@colaberry.com');

    expect(res.success).toBe(false);
    expect(res.message).toMatch(/pending admin approval/);
    expect(sendLink).not.toHaveBeenCalled();
  });

  it('returns the generic message for an unknown email and sends nothing', async () => {
    loadStaffLink.mockResolvedValue(null);
    findOne.mockResolvedValue(null);

    const res = await requestMagicLink('nobody@colaberry.com');

    expect(res.success).toBe(true);
    expect(res.message).toMatch(/If an active enrollment exists/);
    expect(sendLink).not.toHaveBeenCalled();
  });
});
