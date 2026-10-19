/**
 * C7 client call: POST /api/portal/campus/tour/complete with the participant token, its own timeout and no redirect interceptor;
 * a malformed answer throws (the UI then never shows success).
 */
import axios from 'axios';
import { postTourComplete, TOUR_COMPLETE_TIMEOUT_MS } from '../campusApi';
import { PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';

jest.mock('axios');
const post = axios.post as jest.Mock;

beforeEach(() => { window.localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'h.eyJlbWFpbCI6ImEifQ.s'); }); // gitleaks:allow (fake, unsigned)
afterEach(() => window.localStorage.clear());

it('posts {tour:"explorer"} with the token and a bounded timeout, and returns the answer', async () => {
  post.mockResolvedValue({ data: { handoff: true, reason: 'created' } });
  await expect(postTourComplete()).resolves.toEqual({ handoff: true, reason: 'created' });
  const [url, body, cfg] = post.mock.calls[0];
  expect(url).toMatch(/\/api\/portal\/campus\/tour\/complete$/);
  expect(body).toEqual({ tour: 'explorer' });
  expect(cfg.timeout).toBe(TOUR_COMPLETE_TIMEOUT_MS);
  expect(cfg.headers.Authorization).toMatch(/^Bearer /);
});

it.each([
  ['an empty body', ''],
  ['no reason', { handoff: true }],
  ['an unknown reason', { handoff: true, reason: 'maybe' }],
  ['a string handoff', { handoff: 'true', reason: 'created' }],
])('%s throws', async (_n, data) => {
  post.mockResolvedValue({ data });
  await expect(postTourComplete()).rejects.toThrow('Malformed tour answer');
});

it('a failed request throws', async () => {
  post.mockRejectedValue(new Error('Request failed with status code 403'));
  await expect(postTourComplete()).rejects.toThrow();
});
