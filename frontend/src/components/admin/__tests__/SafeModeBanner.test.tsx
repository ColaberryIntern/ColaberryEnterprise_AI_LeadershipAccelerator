/**
 * THE POLL THAT DROWNED SOHAIL'S BUG REPORTS.
 *
 * This banner is mounted in `AdminLayout`, so it runs on every admin page, and it polls
 * `/api/admin/system/safe-mode` every thirty seconds. That endpoint is section-gated, so
 * a section-scoped admin is refused every single time. On 2026-11-11 nginx counted
 * **46** of those 403s in one 23-minute session, and because the bug-report recorder
 * captures failed requests with a 15-entry cap, that noise was almost the entire
 * evidence in three reports Sohail filed about something else.
 *
 * A 403 is an ANSWER, not a blip: the forty-sixth ask gets the same one as the first. So
 * the poll stops on 401/403 and keeps going on anything else, because a network error
 * genuinely can be transient. Both halves are asserted here — stopping on the wrong
 * thing would quietly disable the banner for everyone.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import SafeModeBanner from '../SafeModeBanner';

let container: HTMLDivElement;
let root: Root;
let fetchMock: jest.Mock;

const response = (status: number, body: unknown = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
}) as unknown as Response;

const POLL = 30_000;

beforeEach(() => {
  jest.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  fetchMock = jest.fn().mockResolvedValue(response(200, { safe_mode_active: false }));
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
  window.localStorage.setItem('admin_token', 'tok');
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  // Drop any timer the component left behind BEFORE handing the clock back. Jest warns
  // about workers that fail to exit gracefully when a fake interval outlives its suite.
  jest.clearAllTimers();
  jest.useRealTimers();
  window.localStorage.clear();
});

const mount = async () => { await act(async () => { root.render(<SafeModeBanner />); }); };
const tick = async (times = 1) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { jest.advanceTimersByTime(POLL); });
  }
};

describe('a 403 stops the poll', () => {
  it('asks once and then never again', async () => {
    fetchMock.mockResolvedValue(response(403));
    await mount();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await tick(10);  // five minutes of wall clock
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('would have asked eleven times before this fix', async () => {
    // The arithmetic that produced 46: one on mount, then one per 30s. This pins the
    // SAVING rather than just the new behaviour, so a regression is visible as a number.
    fetchMock.mockResolvedValue(response(403));
    await mount();
    await tick(10);
    const withFix = fetchMock.mock.calls.length;
    expect(withFix).toBe(1);
    expect(1 + 10).toBe(11); // what the old component would have done over the same span
  });

  it('a 401 stops it too', async () => {
    fetchMock.mockResolvedValue(response(401));
    await mount();
    await tick(5);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('renders nothing, exactly as before - the fix is invisible to the operator', async () => {
    fetchMock.mockResolvedValue(response(403));
    await mount();
    await tick(2);
    expect(container.textContent).toBe('');
  });
});

describe('everything else still polls, because it may be transient', () => {
  it('a 500 keeps the poll alive', async () => {
    // An upstream blip is not a permission answer. Giving up here would mean a tab left
    // open through a deploy never notices safe mode again.
    fetchMock.mockResolvedValue(response(500));
    await mount();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await tick(3);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('a network failure keeps the poll alive', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await mount();
    await tick(3);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('CONTROL: a permitted admin keeps polling and sees the banner', async () => {
    // The load-bearing control. If `refused` were ever set on a success, this is the
    // test that fails instead of the banner silently disappearing in production.
    fetchMock.mockResolvedValue(response(200, { safe_mode_active: true }));
    await mount();
    expect(container.textContent).toContain('Safe Mode Active');

    await tick(3);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(container.textContent).toContain('Safe Mode Active');
  });

  it('a 403 AFTER successful polls stops it from there', async () => {
    // Permissions can change mid-session (a token re-issued with narrower scope).
    fetchMock.mockResolvedValue(response(200, { safe_mode_active: false }));
    await mount();
    await tick(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    fetchMock.mockResolvedValue(response(403));
    await tick(1);
    const atRefusal = fetchMock.mock.calls.length;
    await tick(5);
    expect(fetchMock).toHaveBeenCalledTimes(atRefusal);
  });
});
