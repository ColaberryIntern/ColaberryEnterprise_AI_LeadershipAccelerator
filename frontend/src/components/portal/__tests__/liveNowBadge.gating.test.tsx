import React, { Suspense } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes } from 'react-router-dom';
import portalRoutes from '../../../routes/portalRoutes';
import { isTerminalDiscoveryError } from '../../../hooks/useBroadcastDiscovery';
import { PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';
import portalApi from '../../../utils/portalApi';

/**
 * The badge must not poll on the pages where nobody is signed in.
 *
 * WHY THIS SUITE EXISTS. An independent check found the worst defect of Phase 3: the badge is
 * mounted in the portal LAYOUT route, which also wraps `/portal/login`, `/portal/signup` and
 * `/portal/verify`. It polled an authenticated endpoint unconditionally, so:
 *
 *   - with BROADCAST_ENABLED dark (the documented default) the route 404s, the hook called
 *     that an outage, and a permanent "Live status is unavailable" panel appeared on every
 *     portal page including the login screen; and
 *   - with the flag on, a signed-out visitor's 401 drove `portalApi`'s interceptor to set
 *     `window.location.href = loginHrefPreserving('/portal/login')`, which returns
 *     `/portal/login` — the login page redirecting to itself, forever.
 *
 * `utils/portalLoginHref.ts` documents two production incidents of that second class
 * (2026-08-03, 7 students; 2026-08-24, 18 students), so this is a repeat, not a hypothetical.
 *
 * It renders the REAL `portalRoutes` tree rather than a hand-built one, because the defect was
 * a property of where the badge is mounted and a bespoke tree is exactly what hid it.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let requested: string[];
let getSpy: jest.SpyInstance;

async function mountAt(path: string): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      // portalRoutes lazy-loads every page, so without a boundary the tree never commits —
      // and then "no request was made" is true because nothing mounted, not because the gate
      // works. The positive control below is what proves this harness exercises the badge.
      <Suspense fallback={<div data-testid="suspense" />}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>{portalRoutes}</Routes>
        </MemoryRouter>
      </Suspense>,
    );
    // Let the lazy chunk resolve and the effects run.
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  requested = [];
  getSpy = jest.spyOn(portalApi, 'get').mockImplementation((url: string) => {
    requested.push(url);
    // The flag-dark answer, which is what production serves by default.
    return Promise.reject({ response: { status: 404 } });
  });
});

afterEach(async () => {
  if (root) await act(async () => { root.unmount(); });
  if (container) container.remove();
  getSpy.mockRestore();
  localStorage.clear();
});

describe('a signed-out visitor on a public portal page', () => {
  it('issues NO discovery request at /portal/login', async () => {
    await mountAt('/portal/login');

    // The request is what triggers the interceptor's redirect; not making it is the fix.
    expect(requested.filter((u) => u.includes('/broadcasts/active'))).toEqual([]);
  });

  it('renders no badge at /portal/login', async () => {
    await mountAt('/portal/login');
    expect(container.querySelector('[data-testid="live-now-badge"]')).toBeNull();
  });

  it('is equally silent at /portal/signup and /portal/verify', async () => {
    for (const path of ['/portal/signup', '/portal/verify']) {
      await mountAt(path);
      expect(requested.filter((u) => u.includes('/broadcasts/active'))).toEqual([]);
      expect(container.querySelector('[data-testid="live-now-badge"]')).toBeNull();
      await act(async () => { root.unmount(); });
      container.remove();
    }
    // Remounted so the shared afterEach has something to tear down.
    await mountAt('/portal/login');
  });
});

describe('the harness really mounts the badge', () => {
  // Without this, every assertion in this file could be passing over a tree that never
  // committed. It is the positive control for the whole suite.
  it('renders the badge for a signed-in viewer when something is airing', async () => {
    localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'a.test.token');
    getSpy.mockImplementation((url: string) => {
      requested.push(url);
      return Promise.resolve({
        data: {
          states: ['live', 'reconnecting'],
          poll_after_ms: 45_000,
          broadcasts: [{
            id: 'occ-1', title: 'Monday cohort class', access_mode: 'paid',
            editorial_state: 'live', room_id: 'room-1', content_started_at: Date.now(),
            scheduled_start_at: Date.now(), can_watch: true, reason: 'entitled',
            offer_upgrade: false, preview_seconds_remaining: null,
          }],
        },
      } as never);
    });

    await mountAt('/portal/login');

    expect(requested.filter((u) => u.includes('/broadcasts/active'))).toHaveLength(1);
    expect(container.querySelector('[data-testid="live-now-badge"]')).not.toBeNull();
    expect(container.textContent).toContain('Monday cohort class');
  }, 30_000);
});

describe('a signed-in viewer with the feature switched off', () => {
  it('asks once, is told 404, and renders nothing rather than an outage', async () => {
    localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'a.test.token');

    await mountAt('/portal/login');

    expect(requested.filter((u) => u.includes('/broadcasts/active'))).toHaveLength(1);
    // A disabled feature is not an outage. Reporting it as one put a permanent fake panel on
    // every portal page.
    expect(container.querySelector('[data-testid="lnb-unavailable"]')).toBeNull();
    expect(container.querySelector('[data-testid="live-now-badge"]')).toBeNull();
  }, 30_000);

  it('stops asking after a 404 — a flag does not flip mid-session', async () => {
    localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'a.test.token');
    await mountAt('/portal/login');
    const afterFirst = requested.length;

    // Give any armed timer a generous window to fire; there should be none.
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(requested.length).toBe(afterFirst);
  }, 30_000);
});

describe('isTerminalDiscoveryError draws the line in the right place', () => {
  it('treats 404 and 401 as terminal', () => {
    expect(isTerminalDiscoveryError({ response: { status: 404 } })).toBe(true);
    expect(isTerminalDiscoveryError({ response: { status: 401 } })).toBe(true);
  });

  it('does NOT treat a real outage as terminal — 503 must keep polling and keep saying so', () => {
    // Collapsing these two back together is what produced the fake-outage panel; keeping them
    // apart is what the "unavailable" copy is for.
    for (const status of [500, 502, 503, 504, 429]) {
      expect(isTerminalDiscoveryError({ response: { status } })).toBe(false);
    }
    expect(isTerminalDiscoveryError(new Error('Network Error'))).toBe(false);
    expect(isTerminalDiscoveryError({})).toBe(false);
  });
});
