import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import SafeModeBanner from '../SafeModeBanner';

/**
 * Regression guard for the 2026-09-01 false reliability page.
 *
 * This banner used to poll /api/admin/system/safe-mode forever, ignoring 401s and
 * swallowing every error. Two admin tabs left open past token expiry re-sent an
 * expired JWT once a minute for days, writing 1,393 `admin_auth_failed` rows in 24
 * hours and pushing the reliability alerter to "94% AI event failure rate" while
 * real model calls were failing at 0%.
 *
 * The behaviour these tests lock in is simple: a poll that cannot succeed must stop.
 */

const POLL_INTERVAL_MS = 30_000;

let container: HTMLDivElement;
let root: Root;
let warnSpy: jest.SpyInstance;

beforeEach(() => {
  (global as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  warnSpy.mockRestore();
  jest.useRealTimers();
  delete (global as any).fetch;
});

async function mount() {
  await act(async () => {
    root.render(<SafeModeBanner />);
  });
}

/** Advance past one poll interval and flush the resulting promises. */
async function advanceOneInterval() {
  await act(async () => {
    jest.advanceTimersByTime(POLL_INTERVAL_MS);
    await Promise.resolve();
    await Promise.resolve();
  });
}

function mockFetch(impl: () => Promise<any>) {
  const fn = jest.fn(impl);
  (global as any).fetch = fn;
  return fn;
}

const okResponse = (safeModeActive: boolean) => ({
  ok: true,
  status: 200,
  json: async () => ({ safe_mode_active: safeModeActive }),
});

const unauthorizedResponse = { ok: false, status: 401, json: async () => ({ error: 'Invalid or expired token' }) };

describe('SafeModeBanner polling', () => {
  it('stops polling permanently after a 401 instead of retrying every interval', async () => {
    localStorage.setItem('admin_token', 'expired.jwt.token');
    const fetchMock = mockFetch(async () => unauthorizedResponse);

    await mount();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The old component issued one request per interval, forever. Three intervals
    // later there must still be exactly the one original request.
    await advanceOneInterval();
    await advanceOneInterval();
    await advanceOneInterval();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('clears the stale admin token on 401 so nothing else replays it', async () => {
    localStorage.setItem('admin_token', 'expired.jwt.token');
    mockFetch(async () => unauthorizedResponse);

    await mount();

    expect(localStorage.getItem('admin_token')).toBeNull();
  });

  it('stops polling on 403 as well (role revoked, also terminal)', async () => {
    localStorage.setItem('admin_token', 'valid.but.not.admin');
    const fetchMock = mockFetch(async () => ({ ok: false, status: 403, json: async () => ({}) }));

    await mount();
    await advanceOneInterval();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never issues a request when there is no token (a guaranteed 401)', async () => {
    const fetchMock = mockFetch(async () => okResponse(false));

    await mount();
    await advanceOneInterval();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps polling while the session is valid', async () => {
    localStorage.setItem('admin_token', 'good.jwt.token');
    const fetchMock = mockFetch(async () => okResponse(false));

    await mount();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await advanceOneInterval();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await advanceOneInterval();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(localStorage.getItem('admin_token')).toBe('good.jwt.token');
  });

  it('retries transient network errors but gives up after a bounded number', async () => {
    localStorage.setItem('admin_token', 'good.jwt.token');
    const fetchMock = mockFetch(async () => { throw new TypeError('Failed to fetch'); });

    await mount();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Retries are bounded at 5 consecutive failures, so calls 2..5 happen and then
    // polling stops. Advancing well past that must not add any more.
    for (let i = 0; i < 10; i += 1) {
      await advanceOneInterval();
    }

    expect(fetchMock).toHaveBeenCalledTimes(5);
    // A network give-up must NOT clear the token: the session may still be fine.
    expect(localStorage.getItem('admin_token')).toBe('good.jwt.token');
  });

  it('renders the banner when safe mode is active and nothing when it is not', async () => {
    localStorage.setItem('admin_token', 'good.jwt.token');
    mockFetch(async () => okResponse(true));

    await mount();

    expect(container.textContent).toContain('Safe Mode Active');
  });
});
