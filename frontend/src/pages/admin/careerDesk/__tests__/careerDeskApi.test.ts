import api from '../../../../utils/api';
import { deskPost, loadQueue, queueAction, loadErrorText } from '../careerDeskApi';
import { lowItem, noContact } from '../deskTestKit';

/**
 * CP11.1b: the desk client. Every answer the server gives (400 to 409, 502) comes back as its words; a 5xx or a network
 * failure is a plain "try again"; a body without its list is a failed load (ContractViolation), never an empty desk; an item
 * action goes to /review-items, an interview action to /interviews, with only the fields that action needs.
 */
jest.mock('../../../../utils/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const post = api.post as jest.Mock;
const get = api.get as jest.Mock;
beforeEach(() => { post.mockReset(); get.mockReset(); });

describe('deskPost', () => {
  it('200: the outcome and message (and the link and code when sent)', async () => {
    post.mockResolvedValue({ status: 200, data: { outcome: 'opened', message: 'Open the link.', link: 'https://mail.google.com/x', code: '1' } });
    expect(await deskPost('/inboxes/e/forwarding', { action: 'open' })).toEqual({ ok: true, outcome: 'opened', message: 'Open the link.', link: 'https://mail.google.com/x', code: '1' });
    expect(post.mock.calls[0][0]).toBe('/api/admin/placement/desk/inboxes/e/forwarding');
  });

  it.each([[409, 'Inbox tests are switched off'], [404, 'No such interview.'], [502, 'The nudge could not be sent. Try again in a few minutes.'], [400, 'Invalid request.']])(
    '%s: the server words', async (status, error) => {
      post.mockResolvedValue({ status, data: { error } });
      expect(await deskPost('/x', {})).toEqual({ ok: false, message: error });
    });

  it('403: no Placement access; 5xx or network: try again; a 200 without a message is not a success', async () => {
    post.mockResolvedValueOnce({ status: 403, data: { error: 'Forbidden' } });
    expect(await deskPost('/x', {})).toEqual({ ok: false, message: 'You do not have access to Placement.' });
    post.mockRejectedValueOnce({ response: { status: 500 } });
    expect(await deskPost('/x', {})).toEqual({ ok: false, message: 'That did not go through. Try again.' });
    post.mockResolvedValueOnce({ status: 200, data: '<html>proxy</html>' });
    expect((await deskPost('/x', {})).ok).toBe(false);
  });

  it('accepts only 2xx and the answered statuses as values (5xx and 401 still go through the app handler)', async () => {
    post.mockResolvedValue({ status: 200, data: { outcome: 'x', message: 'y' } });
    await deskPost('/x', {});
    const accept = post.mock.calls[0][2].validateStatus as (s: number) => boolean;
    expect([200, 400, 403, 404, 409, 502].every(accept)).toBe(true);
    expect([401, 500, 503].some(accept)).toBe(false);
  });
});

describe('routing and loads', () => {
  it('an item action goes to review-items, an interview action to interviews, with only the needed fields', async () => {
    post.mockResolvedValue({ status: 200, data: { outcome: 'x', message: 'y' } });
    await queueAction(lowItem, 'match', { enrollmentId: 'e1', contactEmail: 'ignored@x.example' });
    await queueAction(noContact, 'send_link', { contactEmail: 'pat@harbor.example' });
    expect(post.mock.calls[0].slice(0, 2)).toEqual(['/api/admin/placement/desk/review-items/41/actions', { action: 'match', enrollmentId: 'e1' }]);
    expect(post.mock.calls[1].slice(0, 2)).toEqual([`/api/admin/placement/desk/interviews/${noContact.id}/actions`, { action: 'send_link', contactEmail: 'pat@harbor.example' }]);
  });

  it('a body without the list is a ContractViolation, never an empty queue', async () => {
    get.mockResolvedValue({ data: '<html>login</html>' });
    await expect(loadQueue()).rejects.toThrow('ContractViolation');
    expect(loadErrorText({ response: { status: 403 } }, 'x')).toBe('You do not have access to Placement.');
    expect(loadErrorText(new Error('boom'), 'the review queue')).toBe('Could not load the review queue. Try again.');
  });
});
