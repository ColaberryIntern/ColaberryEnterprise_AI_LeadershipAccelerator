import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

/**
 * The two queue pages the needs-attention signals link to. Each proves: the URL filter the
 * signal carries reaches the API; rows link to the composer; empty and failed are distinct.
 */

const mockGet = jest.fn();
jest.mock('../../../../utils/api', () => ({ __esModule: true, default: { get: (...a: unknown[]) => mockGet(...a), post: jest.fn() } }));

import AdminContentQueuePage from '../AdminContentQueuePage';
import AdminPublishingQueuePage from '../AdminPublishingQueuePage';

let container: HTMLDivElement;
let root: Root;

async function renderAt(url: string, el: React.ReactElement): Promise<void> {
  await act(async () => { root.render(<MemoryRouter initialEntries={[url]}>{el}</MemoryRouter>); });
}

beforeEach(() => {
  mockGet.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

describe('content queue', () => {
  it('passes the status from the signal URL to the API and links rows to the composer', async () => {
    mockGet.mockResolvedValue({ data: { items: [{ id: 'ci-1', title: 'Free AI class', status: 'ready_for_review', revision: 2, scheduled_for: null, updated_at: '2026-09-11T10:00:00.000Z' }] } });
    await renderAt('/admin/marketing/content?status=ready_for_review', <AdminContentQueuePage />);
    const [url, opts] = mockGet.mock.calls.at(-1) as [string, { params: Record<string, unknown> }];
    expect(url).toBe('/api/admin/content');
    expect(opts.params.status).toBe('ready_for_review');
    const row = container.querySelector('[data-testid="item-ci-1"]')!;
    expect(row.textContent).toContain('Free AI class');
    expect(row.querySelector('a')?.getAttribute('href')).toBe('/admin/marketing/composer/ci-1');
  });

  it('an unknown status in the URL falls back to all, never to a silent error', async () => {
    mockGet.mockResolvedValue({ data: { items: [] } });
    await renderAt('/admin/marketing/content?status=bogus', <AdminContentQueuePage />);
    const [, opts] = mockGet.mock.calls.at(-1) as [string, { params: Record<string, unknown> }];
    expect(opts.params.status).toBeUndefined();
  });

  it('empty says which status is empty', async () => {
    mockGet.mockResolvedValue({ data: { items: [] } });
    await renderAt('/admin/marketing/content?status=approved', <AdminContentQueuePage />);
    expect(container.querySelector('[data-testid="queue-empty"]')?.textContent).toBe('Nothing in approved.');
    expect(container.querySelector('[data-testid="queue-error"]')).toBeNull();
  });

  it('a failed request says it failed, and never reads as empty', async () => {
    mockGet.mockRejectedValue(new Error('boom'));
    await renderAt('/admin/marketing/content', <AdminContentQueuePage />);
    expect(container.querySelector('[data-testid="queue-error"]')?.textContent).toContain('failed request');
    expect(container.querySelector('[data-testid="queue-empty"]')).toBeNull();
  });
});

describe('publishing queue', () => {
  const JOB = { id: 'job-1', content_item_id: 'ci-1', provider: 'x', state: 'dead_lettered', publish_at: '2026-11-03T15:00:00.000Z', attempts: 3, max_attempts: 3, next_retry_at: null, last_error: 'timeout', last_error_class: 'Error', dead_lettered_at: '2026-11-03T15:00:30.000Z', dead_letter_reason: 'exhausted 3 attempts: Error' };

  it('the failed-jobs signal opens the dead-letter filter and the API receives it', async () => {
    mockGet.mockResolvedValue({ data: { jobs: [JOB] } });
    await renderAt('/admin/marketing/publishing?dead_lettered=true', <AdminPublishingQueuePage />);
    const [url, opts] = mockGet.mock.calls.at(-1) as [string, { params: Record<string, unknown> }];
    expect(url).toBe('/api/admin/publishing/jobs');
    expect(opts.params.dead_lettered).toBe('true');
    const row = container.querySelector('[data-testid="job-job-1"]')!;
    expect(row.textContent).toContain('exhausted 3 attempts');
    expect(Array.from(row.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Retry', 'Cancel']);
    expect(row.querySelector('a')?.getAttribute('href')).toBe('/admin/marketing/composer/ci-1');
  });

  it('the late-jobs signal opens the pending filter', async () => {
    mockGet.mockResolvedValue({ data: { jobs: [] } });
    await renderAt('/admin/marketing/publishing?state=pending', <AdminPublishingQueuePage />);
    const [, opts] = mockGet.mock.calls.at(-1) as [string, { params: Record<string, unknown> }];
    expect(opts.params.state).toBe('pending');
    expect(opts.params.dead_lettered).toBeUndefined();
    expect(container.querySelector('[data-testid="queue-empty"]')?.textContent).toContain('jobs in pending is empty');
  });
});
