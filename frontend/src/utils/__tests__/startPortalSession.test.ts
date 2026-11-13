/**
 * C121: the "Access your account" button stores the session the way ParticipantAuthContext.login() does, then opens
 * the welcome video with a full page load. It must never navigate off-site, and when the browser refuses storage it must
 * say so (return false) instead of dropping the person on a sign-in wall.
 */
import { startPortalSession } from '../startPortalSession';
import { PARTICIPANT_TOKEN_KEY } from '../participantToken';

const VIDEO = '/portal/runtime/b0c844c0-01b0-439e-bc28-6a1b76b09afb';

beforeEach(() => { localStorage.clear(); jest.restoreAllMocks(); });

it('stores the session under the portal key and opens the welcome video', () => {
  const go = jest.fn();
  expect(startPortalSession('jwt-new', VIDEO, go)).toBe(true);
  expect(localStorage.getItem(PARTICIPANT_TOKEN_KEY)).toBe('jwt-new');
  expect(go).toHaveBeenCalledWith(VIDEO);
});

it("drops a previous person's cached avatar, as login() does", () => {
  localStorage.setItem('te_avatar', 'data:image/png;base64,old');
  startPortalSession('jwt-new', VIDEO, jest.fn());
  expect(localStorage.getItem('te_avatar')).toBeNull();
});

it.each(['https://evil.example/portal/x', '//evil.example/portal', '/admin', 'javascript:alert(1)', '/portal/../admin'])(
  'never navigates to a non-portal destination: %s',
  (next) => {
    const go = jest.fn();
    startPortalSession('jwt-new', next, go);
    expect(go).toHaveBeenCalledWith('/portal/today');
  },
);

it('returns false and goes nowhere when storage is blocked', () => {
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('SecurityError'); });
  const go = jest.fn();
  expect(startPortalSession('jwt-new', VIDEO, go)).toBe(false);
  expect(go).not.toHaveBeenCalled();
});

it('returns false and goes nowhere without a session', () => {
  const go = jest.fn();
  expect(startPortalSession('', VIDEO, go)).toBe(false);
  expect(go).not.toHaveBeenCalled();
});
