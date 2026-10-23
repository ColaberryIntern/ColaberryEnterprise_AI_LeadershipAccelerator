import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import ShowcaseReviewQueue from '../ShowcaseReviewQueue';
import api from '../../../../../utils/api';

/**
 * THE SCREEN THAT ENDS THE DEAD END.
 *
 * A learner could ask to share a demo since the showcase lifecycle shipped, and
 * no staff member could see that they had asked. These tests are mostly about
 * the two ways this screen could quietly recreate that: showing nothing when
 * there is something, and letting a reviewer act without having watched.
 */

jest.mock('../../../../../utils/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
const mockApi = api as unknown as { get: jest.Mock; post: jest.Mock };

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const ID = 'cafe0000-0000-4000-8000-000000000001';
const ID2 = 'cafe0000-0000-4000-8000-000000000002';

const row = (over: Record<string, unknown> = {}) => ({
  showcaseId: ID,
  recordingId: 'rec-1',
  summary: 'I show the booking email turning into a load record.',
  requestedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  learnerName: 'Paul Sane',
  learnerEmail: 'paulsane@yahoo.com',
  cohortName: 'Cohort 12',
  storyId: 'PREP-4',
  typeLabel: 'Working-system demo',
  recordingCount: 3,
  durationSeconds: 94,
  playbackUrl: '/api/admin/presentation/recordings/rec-1/file?t=abc',
  thumbnailUrl: '/api/admin/presentation/recordings/rec-1/thumbnail?t=abc',
  stale: false,
  ...over,
});

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.get.mockResolvedValue({ data: { pending: [row()] } });
  mockApi.post.mockResolvedValue({ data: {} });
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => { act(() => root?.unmount()); root = null; container.remove(); });

const render = async () => {
  await act(async () => {
    const r = createRoot(container);
    root = r;
    r.render(<ShowcaseReviewQueue />);
  });
  await act(async () => { await Promise.resolve(); });
};

const q = (t: string) => container.querySelector(`[data-testid="${t}"]`);
const click = async (t: string) => {
  await act(async () => {
    (q(t) as HTMLElement)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

it('asks the queue endpoint on mount', async () => {
  await render();
  expect(mockApi.get).toHaveBeenCalledWith('/api/admin/presentation/showcases/pending');
});

it('shows the learner, the type and how long they have waited', async () => {
  await render();
  const text = container.textContent || '';
  expect(text).toContain('Paul Sane');
  expect(text).toContain('Working-system demo');
  expect(text).toContain('waiting 2 days');
});

it('puts a real player on the row, because approving unwatched is the failure', async () => {
  await render();
  const v = q(`ps-review-player-${ID}`) as HTMLVideoElement;
  expect(v).not.toBeNull();
  expect(v.getAttribute('src')).toContain('/api/admin/presentation/recordings/rec-1/file');
  expect(v.getAttribute('poster')).toContain('/thumbnail');
});

it('shows the summary, which goes out with the post', async () => {
  await render();
  expect(q(`ps-review-summary-${ID}`)?.textContent).toContain('booking email');
});

it('says so when nothing is waiting', async () => {
  mockApi.get.mockResolvedValue({ data: { pending: [] } });
  await render();
  expect(q('ps-review-empty')).not.toBeNull();
  expect(q(`ps-review-row-${ID}`)).toBeNull();
});

it('surfaces a failed load instead of looking empty', async () => {
  mockApi.get.mockRejectedValue({ response: { data: { error: 'Presentation Studio not enabled' } } });
  await render();
  expect(q('ps-review-error')?.textContent).toBe('Presentation Studio not enabled');
  // The distinction that matters: a broken queue must not read as an empty one.
  expect(q('ps-review-empty')).toBeNull();
});

it('approves to the cohort and reloads', async () => {
  await render();
  await click(`ps-review-approve-${ID}`);
  expect(mockApi.post).toHaveBeenCalledWith(
    `/api/admin/presentation/showcases/${ID}/approve`,
    { audience: 'cohort' },
  );
  expect(mockApi.get).toHaveBeenCalledTimes(2);
});

it('refuses to approve a request with no recording attached', async () => {
  mockApi.get.mockResolvedValue({ data: { pending: [row({ recordingId: null, playbackUrl: null, thumbnailUrl: null })] } });
  await render();
  expect((q(`ps-review-approve-${ID}`) as HTMLButtonElement).disabled).toBe(true);
  expect(q(`ps-review-novideo-${ID}`)).not.toBeNull();
});

it('will not send a decline without a reason', async () => {
  await render();
  await click(`ps-review-decline-open-${ID}`);
  const confirm = q(`ps-review-decline-confirm-${ID}`) as HTMLButtonElement;
  expect(confirm.disabled).toBe(true);

  await click(`ps-review-decline-confirm-${ID}`);
  expect(mockApi.post).not.toHaveBeenCalled();
});

it('sends the decline once a reason is typed', async () => {
  await render();
  await click(`ps-review-decline-open-${ID}`);

  const box = q(`ps-review-reason-${ID}`) as HTMLTextAreaElement;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(box, 'The cost figure is unsourced — label it or cut it.');
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });

  expect((q(`ps-review-decline-confirm-${ID}`) as HTMLButtonElement).disabled).toBe(false);
  await click(`ps-review-decline-confirm-${ID}`);

  expect(mockApi.post).toHaveBeenCalledWith(
    `/api/admin/presentation/showcases/${ID}/decline`,
    { reason: 'The cost figure is unsourced — label it or cut it.' },
  );
});

it('warns when the take changed after the learner asked', async () => {
  mockApi.get.mockResolvedValue({ data: { pending: [row({ stale: true })] } });
  await render();
  expect(q(`ps-review-stale-${ID}`)?.textContent).toContain('changed after this was requested');
});

it('renders every pending row, not just the first', async () => {
  mockApi.get.mockResolvedValue({
    data: { pending: [row(), row({ showcaseId: ID2, learnerName: 'Ada L' })] },
  });
  await render();
  expect(q(`ps-review-row-${ID}`)).not.toBeNull();
  expect(q(`ps-review-row-${ID2}`)).not.toBeNull();
  expect(container.textContent).toContain('(2)');
});

it('falls back to the email when a learner has no name on file', async () => {
  mockApi.get.mockResolvedValue({ data: { pending: [row({ learnerName: null })] } });
  await render();
  expect(container.textContent).toContain('paulsane@yahoo.com');
});

it('says a summary is missing rather than rendering an empty quote', async () => {
  mockApi.get.mockResolvedValue({ data: { pending: [row({ summary: null })] } });
  await render();
  expect(q(`ps-review-summary-${ID}`)?.textContent).toContain('No summary written');
});
