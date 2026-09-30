/**
 * Who may be tracked in the signed-in portal, and who decides.
 *
 * Two properties are worth a test here, and they fail in opposite directions.
 *
 * COLLECTION LIMITS. Subscribers, staff and impersonated sessions are excluded by
 * product and privacy decision. A regression would not throw or fail a build — it would
 * quietly start recording people we said we would not record, and look like more data.
 *
 * IDENTITY PROVENANCE. The lead a session binds to comes from the TOKEN, never from the
 * request body. If that inverted, any signed-in user could name someone else's lead id
 * and bind their browser to that person's journey. That is the same class of hole the
 * `jx` token was designed to close, and it would be silent too.
 *
 * The failure model is the reverse of the entitlement middleware's on purpose: that one
 * fails OPEN so an infrastructure error never locks a paying customer out of content
 * they bought; this one fails CLOSED, because being wrong toward less data is
 * recoverable and being wrong the other way is not.
 */
import { Request, Response } from 'express';

jest.mock('../../models', () => ({
  Lead: { findOne: jest.fn() },
  Enrollment: { findByPk: jest.fn() },
}));
jest.mock('../../services/visitorTrackingService', () => ({
  findOrCreateVisitor: jest.fn(),
  resolveIdentity: jest.fn(),
}));
jest.mock('../../services/access/staffAccess', () => ({ isStaffEnrollment: jest.fn() }));

import { Lead, Enrollment } from '../../models';
import { findOrCreateVisitor, resolveIdentity } from '../../services/visitorTrackingService';
import { isStaffEnrollment } from '../../services/access/staffAccess';
import { handlePortalSession } from '../portalTrackingController';

const FP = 'a'.repeat(40);

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response & { json: jest.Mock };
}

function reqWith(participant: any, body: any = { fingerprint: FP }): Request {
  return { participant, body } as unknown as Request;
}

function bodyOf(res: Response & { json: jest.Mock }) {
  return res.json.mock.calls[res.json.mock.calls.length - 1][0];
}

const PARTICIPANT = { sub: 'enr-1', email: 'Student@Example.com', cohort_id: 'c1', role: 'participant' };

beforeEach(() => {
  jest.clearAllMocks();
  (isStaffEnrollment as jest.Mock).mockResolvedValue(false);
  (Enrollment.findByPk as jest.Mock).mockResolvedValue({ id: 'enr-1', payment_status: 'pending' });
  (Lead.findOne as jest.Mock).mockResolvedValue({ id: 4242 });
  (findOrCreateVisitor as jest.Mock).mockResolvedValue('visitor-1');
  (resolveIdentity as jest.Mock).mockResolvedValue(undefined);
});

describe('who is excluded from portal tracking', () => {
  it('an active subscriber is not tracked', async () => {
    (Enrollment.findByPk as jest.Mock).mockResolvedValue({ id: 'enr-1', payment_status: 'paid' });
    const res = mockRes();
    await handlePortalSession(reqWith(PARTICIPANT), res);
    expect(bodyOf(res)).toEqual({ track: false, reason: 'subscriber' });
    expect(findOrCreateVisitor).not.toHaveBeenCalled();
    expect(resolveIdentity).not.toHaveBeenCalled();
  });

  it('staff are not tracked', async () => {
    (isStaffEnrollment as jest.Mock).mockResolvedValue(true);
    const res = mockRes();
    await handlePortalSession(reqWith(PARTICIPANT), res);
    expect(bodyOf(res)).toEqual({ track: false, reason: 'staff' });
    expect(findOrCreateVisitor).not.toHaveBeenCalled();
  });

  it('an admin impersonating a member is not tracked as that member', async () => {
    // "View as member". Without this the ADMIN's browsing is recorded as the student's:
    // wrong data and a privacy problem wearing the same costume.
    const res = mockRes();
    await handlePortalSession(reqWith({ ...PARTICIPANT, read_only: true }), res);
    expect(bodyOf(res)).toEqual({ track: false, reason: 'impersonated' });
    expect(isStaffEnrollment).not.toHaveBeenCalled();
    expect(findOrCreateVisitor).not.toHaveBeenCalled();
  });

  it('an unknown enrollment fails CLOSED rather than open', async () => {
    (Enrollment.findByPk as jest.Mock).mockResolvedValue(null);
    const res = mockRes();
    await handlePortalSession(reqWith(PARTICIPANT), res);
    expect(bodyOf(res)).toEqual({ track: false, reason: 'unknown_enrollment' });
  });

  it('an infrastructure error fails CLOSED rather than open', async () => {
    (isStaffEnrollment as jest.Mock).mockRejectedValue(new Error('db down'));
    const res = mockRes();
    await handlePortalSession(reqWith(PARTICIPANT), res);
    expect(bodyOf(res)).toEqual({ track: false, reason: 'error' });
    expect(findOrCreateVisitor).not.toHaveBeenCalled();
  });
});

describe('identity comes from the token, never the request body', () => {
  it('binds the lead found from the token email', async () => {
    const res = mockRes();
    await handlePortalSession(reqWith(PARTICIPANT), res);
    // Lowercased and trimmed, because that is how leads are stored.
    expect(Lead.findOne).toHaveBeenCalledWith({ where: { email: 'student@example.com' } });
    expect(resolveIdentity).toHaveBeenCalledWith('visitor-1', 4242);
    expect(bodyOf(res)).toEqual({ track: true, identified: true });
  });

  it('ignores a lead id, email or participant claimed in the body', async () => {
    // The hole this closes: a signed-in user naming somebody else's lead and binding
    // their own browser to that person's journey.
    const res = mockRes();
    await handlePortalSession(
      reqWith(PARTICIPANT, {
        fingerprint: FP,
        lead_id: 999999,
        lid: 999999,
        email: 'victim@example.com',
        participant: { sub: 'someone-else', email: 'victim@example.com' },
      }),
      res,
    );
    expect(Lead.findOne).toHaveBeenCalledWith({ where: { email: 'student@example.com' } });
    expect(resolveIdentity).toHaveBeenCalledWith('visitor-1', 4242);
    expect(resolveIdentity).not.toHaveBeenCalledWith(expect.anything(), 999999);
  });

  it('tracks an eligible person with no lead row, without inventing one', async () => {
    (Lead.findOne as jest.Mock).mockResolvedValue(null);
    const res = mockRes();
    await handlePortalSession(reqWith(PARTICIPANT), res);
    expect(bodyOf(res)).toEqual({ track: true, identified: false });
    expect(resolveIdentity).not.toHaveBeenCalled();
  });
});

describe('no fingerprint is minted for someone we decline', () => {
  it('answers eligibility without a fingerprint, and binds nothing yet', async () => {
    const res = mockRes();
    await handlePortalSession(reqWith(PARTICIPANT, {}), res);
    expect(bodyOf(res)).toEqual({ track: true, identified: false, needsFingerprint: true });
    expect(findOrCreateVisitor).not.toHaveBeenCalled();
  });

  it('a declined person is answered before any visitor row is touched', async () => {
    // The ordering is the privacy property: eligibility is decided first, so a
    // subscriber asking without a fingerprint never causes one to exist.
    (Enrollment.findByPk as jest.Mock).mockResolvedValue({ id: 'enr-1', payment_status: 'paid' });
    const res = mockRes();
    await handlePortalSession(reqWith(PARTICIPANT, {}), res);
    expect(bodyOf(res)).toEqual({ track: false, reason: 'subscriber' });
    expect(findOrCreateVisitor).not.toHaveBeenCalled();
  });

  it('rejects a malformed fingerprint rather than storing it', async () => {
    const res = mockRes();
    await handlePortalSession(reqWith(PARTICIPANT, { fingerprint: 'x'.repeat(200) }), res);
    expect(bodyOf(res)).toEqual({ track: false, reason: 'invalid_fingerprint' });
    expect(findOrCreateVisitor).not.toHaveBeenCalled();
  });
});
