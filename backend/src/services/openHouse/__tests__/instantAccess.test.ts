/**
 * C121: the Open House sign-up signs a brand-new account in on the spot, and never an account that already existed.
 * The form is public, so a session for an existing account would hand a stranger someone else's account.
 */
jest.mock('../../participantService', () => ({ signParticipantJwt: jest.fn(() => 'signed.jwt.value') }));
jest.mock('../../welcome/sendPortalWelcome', () => ({ FIRST_ASSIGNMENT_PATH: '/portal/runtime/b0c844c0-01b0-439e-bc28-6a1b76b09afb' }));
jest.mock('../../reese/reeseWelcomeService', () => ({ maybeSendWelcomes: jest.fn() }));

import { instantAccessFor, greetInBackground } from '../instantAccess';
import { signParticipantJwt } from '../../participantService';
import { maybeSendWelcomes } from '../../reese/reeseWelcomeService';

const sign = signParticipantJwt as unknown as jest.Mock;
const greet = maybeSendWelcomes as unknown as jest.Mock;
const ENR = { id: 'enr-1', email: 'ada@example.com', cohort_id: 'cohort-1' };

beforeEach(() => jest.clearAllMocks());

describe('instantAccessFor', () => {
  it('signs a brand-new account in and lands it on the welcome video', () => {
    expect(instantAccessFor(ENR, true)).toEqual({ jwt: 'signed.jwt.value', next: '/portal/runtime/b0c844c0-01b0-439e-bc28-6a1b76b09afb' });
    expect(sign).toHaveBeenCalledWith({ id: 'enr-1', email: 'ada@example.com', cohort_id: 'cohort-1' });
  });

  it('never signs in an account that already existed', () => {
    expect(instantAccessFor(ENR, false)).toBeNull();
    expect(sign).not.toHaveBeenCalled();
  });

  it('issues nothing when the enrollment is missing or incomplete', () => {
    expect(instantAccessFor(null, true)).toBeNull();
    expect(instantAccessFor(undefined, true)).toBeNull();
    expect(instantAccessFor({ ...ENR, id: '' }, true)).toBeNull();
    expect(instantAccessFor({ ...ENR, email: '' }, true)).toBeNull();
    expect(sign).not.toHaveBeenCalled();
  });

  it('passes a missing cohort through as null', () => {
    instantAccessFor({ id: 'enr-2', email: 'b@example.com', cohort_id: null }, true);
    expect(sign).toHaveBeenCalledWith({ id: 'enr-2', email: 'b@example.com', cohort_id: null });
  });
});

describe('greetInBackground', () => {
  it("sends Reese's intro, as a link sign-in does", async () => {
    await greetInBackground('enr-1', jest.fn());
    expect(greet).toHaveBeenCalledWith('enr-1');
  });

  it('reports a failure to the caller and never throws', async () => {
    greet.mockRejectedValueOnce(new Error('dm down'));
    const onError = jest.fn();
    await expect(greetInBackground('enr-1', onError)).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'dm down' }));
  });
});
