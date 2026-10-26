/**
 * Explorer Growth (2026-10-26): the campus reports tour steps so staff can count tours and how far people got. It sends with the
 * learner's own token, never while Viewing as, never without a token, and a failure is swallowed (the next step says the same).
 */
const mockPost = jest.fn();
jest.mock('axios', () => ({ __esModule: true, default: { post: (...a: unknown[]) => mockPost(...a) } }));
// eslint-disable-next-line import/first
import { postTourProgress, TOUR_PROGRESS_PATH } from '../campusTourProgress';
// eslint-disable-next-line import/first
import { VIEW_AS_TOKEN_KEY, PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';

beforeEach(() => { mockPost.mockReset(); mockPost.mockResolvedValue({ status: 204 }); window.localStorage.clear(); window.sessionStorage.clear(); });

it('sends the step with the learner\'s token', () => {
  window.localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'tok');
  postTourProgress({ tour: 'explorer', stop: 3, total: 8 });
  expect(mockPost).toHaveBeenCalledTimes(1);
  expect(String(mockPost.mock.calls[0][0])).toMatch(new RegExp(`${TOUR_PROGRESS_PATH}$`));
  expect(mockPost.mock.calls[0][1]).toEqual({ tour: 'explorer', stop: 3, total: 8 });
  expect(mockPost.mock.calls[0][2].headers).toEqual({ Authorization: 'Bearer tok' });
});

it('sends nothing while Viewing as, or without a token', () => {
  postTourProgress({ tour: 'explorer', stop: 1, total: 8 });
  window.localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'tok');
  window.sessionStorage.setItem(VIEW_AS_TOKEN_KEY, 'x.e30.y');
  postTourProgress({ tour: 'explorer', stop: 1, total: 8 });
  expect(mockPost).not.toHaveBeenCalled();
});

it('a failure is swallowed (never reaches the learner)', async () => {
  window.localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'tok');
  mockPost.mockRejectedValue(new Error('offline'));
  expect(() => postTourProgress({ tour: 'member', stop: 9, total: 9, finished: true })).not.toThrow();
  await Promise.resolve();
});
