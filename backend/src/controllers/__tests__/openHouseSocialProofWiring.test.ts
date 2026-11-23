jest.mock('../../services/enrollmentService', () => ({ createExplorerEnrollment: jest.fn() }));
jest.mock('../../services/openHouseEventService', () => ({ getCurrentOpenHouseEvent: jest.fn() }));
jest.mock('../../services/openHouseRegistrationStore', () => ({ recordOpenHouseRegistration: jest.fn() }));
jest.mock('../../services/consent/capturePhoneConsent', () => ({ capturePhoneConsent: jest.fn() }));
// The SAME two-key factory the sibling test uses, kept deliberately: it is what broke this
// controller once already, and a test that quietly added `isAffirmative` here would stop
// reproducing the condition the production code now has to survive.
jest.mock('../../services/consent/captureSignupConsent', () => ({
  captureSignupConsent: jest.fn(),
  SIGNUP_CONSENT_TEXT: 'consent wording',
}));
jest.mock('../../services/openHouse/instantAccess', () => ({
  instantAccessFor: jest.fn(() => null),
  greetInBackground: jest.fn(() => Promise.resolve()),
}));

import { Request, Response } from 'express';
import { handlePublicOpenHouseSignup } from '../openHouseController';
import { createExplorerEnrollment } from '../../services/enrollmentService';
import { getCurrentOpenHouseEvent } from '../../services/openHouseEventService';
import { recordOpenHouseRegistration } from '../../services/openHouseRegistrationStore';

const mkEnrollment = createExplorerEnrollment as unknown as jest.Mock;
const mkEvent = getCurrentOpenHouseEvent as unknown as jest.Mock;
const mkRecord = recordOpenHouseRegistration as unknown as jest.Mock;

const req = (body: unknown): Request =>
  ({ body, ip: '203.0.113.7', get: (h: string) => (h.toLowerCase() === 'user-agent' ? 'TestAgent/1.0' : undefined) } as unknown as Request);

const res = () => {
  const r: any = {};
  r.status = jest.fn(() => r);
  r.json = jest.fn(() => r);
  return r as Response & { status: jest.Mock; json: jest.Mock };
};

const body = (over: Record<string, unknown> = {}) =>
  ({ name: 'Ada L', email: 'ada@example.com', phone: '(512) 555-0142', ...over });

/**
 * SNACK-2: does the naming tick actually reach the column?
 *
 * The schema test proves the key is accepted and the page test proves it is sent. This is the
 * join between them, and it is the piece that was silently broken: the controller imported
 * `isAffirmative` from a module its own tests replace wholesale, so it threw on every request
 * before answering. The symptom was "status never called" in 22 unrelated assertions, which
 * pointed nowhere near the cause.
 */
describe('the Open House naming consent reaches createExplorerEnrollment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    mkEnrollment.mockResolvedValue({ enrollment: { id: 'enr-1' }, created: true, cohort_id: 'c1' });
    mkEvent.mockResolvedValue({ announced: true, event_id: 'e1', date_label: 'd', time_label: 't', format_label: 'f', seats_remaining: 1 });
    mkRecord.mockResolvedValue({ created: true, registration_id: 'reg-1' });
  });
  afterEach(() => (process.stdout.write as unknown as jest.Mock).mockRestore());

  it('passes socialProofOptIn: true when the box was ticked', async () => {
    const r = res();
    await handlePublicOpenHouseSignup(req(body({ social_proof_opt_in: true })), r, jest.fn());
    // CONTROL FIRST: the request was actually answered. Without this, the assertion below
    // could pass on a handler that threw - which is exactly how the original break looked.
    expect(r.status).toHaveBeenCalledWith(201);
    expect(mkEnrollment).toHaveBeenCalledWith(expect.objectContaining({ socialProofOptIn: true }));
  });

  it('accepts the string "on", because that is how a plain HTML checkbox arrives', async () => {
    const r = res();
    await handlePublicOpenHouseSignup(req(body({ social_proof_opt_in: 'on' })), r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(201);
    expect(mkEnrollment).toHaveBeenCalledWith(expect.objectContaining({ socialProofOptIn: true }));
  });

  it('passes false when the box was left alone', async () => {
    const r = res();
    await handlePublicOpenHouseSignup(req(body()), r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(201);
    expect(mkEnrollment).toHaveBeenCalledWith(expect.objectContaining({ socialProofOptIn: false }));
  });

  it('never infers the naming grant from the email opt-in', async () => {
    const r = res();
    await handlePublicOpenHouseSignup(req(body({ marketing_opt_in: true })), r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(201);
    // Agreeing to be emailed is not agreeing to be named on a public page.
    expect(mkEnrollment).toHaveBeenCalledWith(expect.objectContaining({ socialProofOptIn: false }));
  });
});
