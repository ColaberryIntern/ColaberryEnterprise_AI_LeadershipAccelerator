import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route, Outlet, useNavigate } from 'react-router-dom';
import LiveMiniPlayer from '../LiveMiniPlayer';
import { BroadcastPlayerProvider, useBroadcastPlayer } from '../../../contexts/BroadcastPlayerContext';
import { ParticipantAuthProvider, useParticipantAuth } from '../../../contexts/ParticipantAuthContext';
import { PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';
import type { GrantResponse } from '../../../services/broadcastPlaybackAdapter';

/**
 * The one property that makes this player "persistent": the `<video>` is the SAME DOM NODE
 * across portal navigations.
 *
 * BOTH ARRANGEMENTS ARE BUILT, because the positive case proves nothing alone. A test that
 * only renders the player as a sibling of `<Outlet/>` and finds the node intact has not shown
 * it could notice a remount. So the second block puts the identical player INSIDE the routed
 * page — the mistake `PortalShell` invites, since 29 page components render it — and asserts
 * the node is destroyed. The first assertion is only meaningful because the second fails the
 * other way.
 *
 * Harness is createRoot + act from react-dom/test-utils, the idiom 112 suites in this repo
 * already use. There is no @testing-library in this project (StatCard.test.tsx records the
 * same finding), so nothing here depends on one being added.
 */

// Tells React 18 that act() is being used deliberately, same as the sibling suites.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OCC = '11111111-2222-4333-8444-555555555555';

const grant = (): GrantResponse => ({
  url: `/bm/broadcast/${OCC}/replay.mp4?e=${Date.now() + 120_000}&s=sig`,
  expires_at: Date.now() + 120_000,
  ttl_seconds: 120,
  grant: 'full',
  preview_seconds_remaining: null,
});

// NO implementation here on purpose: react-scripts sets `resetMocks: true`
// (createJestConfig.js:68), which wipes anything passed to jest.fn() before every test.
// It is set in beforeEach instead, the same way every sibling suite in this repo does it.
const fetchGrant = jest.fn<Promise<GrantResponse>, [string, string]>();

beforeAll(() => {
  // jsdom implements neither. play() throws "Not implemented", and currentTime is a read-only
  // 0 — replacing it with a plain writable value is also what lets this suite use currentTime
  // as the evidence that playback was never restarted.
  window.HTMLMediaElement.prototype.play = jest.fn(() => Promise.resolve());
  Object.defineProperty(window.HTMLMediaElement.prototype, 'currentTime', {
    writable: true, configurable: true, value: 0,
  });
});

let container: HTMLDivElement;
let root: Root;

async function mount(ui: React.ReactElement): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(ui); });
}

beforeEach(() => {
  fetchGrant.mockResolvedValue(grant());
  localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'a.test.token');
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  localStorage.clear();
});

const find = (testid: string): HTMLElement | null =>
  container.querySelector(`[data-testid="${testid}"]`);
const video = (): HTMLVideoElement | null =>
  container.querySelector('[data-testid="live-mini-player-video"]');

async function click(testid: string): Promise<void> {
  const el = find(testid);
  if (!el) throw new Error(`nothing to click: ${testid}`);
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

function Controls() {
  const { open } = useBroadcastPlayer();
  const { logout } = useParticipantAuth();
  const navigate = useNavigate();
  return (
    <div>
      <button
        type="button"
        data-testid="open"
        onClick={() => open({ occurrenceId: OCC, asset: 'replay.mp4', title: 'Week 9 class' })}
      />
      <button type="button" data-testid="go-community" onClick={() => navigate('/portal/community')} />
      <button type="button" data-testid="go-schedule" onClick={() => navigate('/portal/schedule')} />
      <button type="button" data-testid="go-today" onClick={() => navigate('/portal/today')} />
      <button type="button" data-testid="logout" onClick={logout} />
    </div>
  );
}

/** The real arrangement: the player is a SIBLING of <Outlet/> in the layout route. */
function SiblingOfOutlet() {
  return (
    <MemoryRouter initialEntries={['/portal/today']}>
      <ParticipantAuthProvider>
        <BroadcastPlayerProvider>
          <Controls />
          <Routes>
            <Route
              element={(
                <>
                  <Outlet />
                  <LiveMiniPlayer fetchGrant={fetchGrant} />
                </>
              )}
            >
              <Route path="/portal/today" element={<p data-testid="page">today</p>} />
              <Route path="/portal/community" element={<p data-testid="page">community</p>} />
              <Route path="/portal/schedule" element={<p data-testid="page">schedule</p>} />
            </Route>
          </Routes>
        </BroadcastPlayerProvider>
      </ParticipantAuthProvider>
    </MemoryRouter>
  );
}

/**
 * The mistake: the player lives inside the routed page.
 *
 * THE THREE PAGES ARE DISTINCT COMPONENT TYPES, and that detail is the whole mechanism. The
 * first version of this control rendered one shared `page(name)` helper for all three routes,
 * so React saw the same element type in the same position, reused the fiber, and kept the
 * video node alive — the control passed when it should have failed, and it took the two
 * failing assertions to notice.
 *
 * The real portal is the distinct-types case: `PortalShell` is rendered by 29 separate page
 * components, so navigating swaps one component type for another, React unmounts the whole
 * subtree, and anything inside it — a player included — is destroyed and rebuilt. That is
 * what this models.
 */
function TodayPage() {
  return (
    <>
      <p data-testid="page">today</p>
      <LiveMiniPlayer fetchGrant={fetchGrant} />
    </>
  );
}

function CommunityPage() {
  return (
    <>
      <p data-testid="page">community</p>
      <LiveMiniPlayer fetchGrant={fetchGrant} />
    </>
  );
}

function SchedulePage() {
  return (
    <>
      <p data-testid="page">schedule</p>
      <LiveMiniPlayer fetchGrant={fetchGrant} />
    </>
  );
}

function InsideThePage() {
  return (
    <MemoryRouter initialEntries={['/portal/today']}>
      <ParticipantAuthProvider>
        <BroadcastPlayerProvider>
          <Controls />
          <Routes>
            <Route element={<Outlet />}>
              <Route path="/portal/today" element={<TodayPage />} />
              <Route path="/portal/community" element={<CommunityPage />} />
              <Route path="/portal/schedule" element={<SchedulePage />} />
            </Route>
          </Routes>
        </BroadcastPlayerProvider>
      </ParticipantAuthProvider>
    </MemoryRouter>
  );
}

describe('mounted as a sibling of <Outlet/> — the real arrangement', () => {
  it('keeps the SAME video node across three portal routes, with its position intact', async () => {
    await mount(<SiblingOfOutlet />);
    await click('open');

    const first = video();
    expect(first).not.toBeNull();
    first!.currentTime = 42;
    (first as unknown as Record<string, unknown>).__marker = 'the original node';

    await click('go-community');
    expect(find('page')!.textContent).toBe('community');
    const second = video();

    await click('go-schedule');
    expect(find('page')!.textContent).toBe('schedule');
    const third = video();

    // Identity, not mere presence: a remounted player would also be "present".
    expect(Object.is(first, second)).toBe(true);
    expect(Object.is(first, third)).toBe(true);
    expect((third as unknown as Record<string, unknown>).__marker).toBe('the original node');
    // And playback was never restarted — a fresh element reports 0.
    expect(third!.currentTime).toBe(42);
  });

  it('acquires exactly ONE credential for the whole journey, not one per route', async () => {
    await mount(<SiblingOfOutlet />);
    await click('open');
    await click('go-community');
    await click('go-schedule');
    await click('go-today');

    expect(fetchGrant).toHaveBeenCalledTimes(1);
  });

  it('has exactly one audio source on the page at any time', async () => {
    await mount(<SiblingOfOutlet />);
    await click('open');
    await click('go-community');

    expect(container.querySelectorAll('[data-testid="live-mini-player-video"]')).toHaveLength(1);
    expect(container.querySelectorAll('video')).toHaveLength(1);
  });

  it('renders nothing until a session is opened — which is also what the flag being off looks like', async () => {
    await mount(<SiblingOfOutlet />);
    expect(find('live-mini-player')).toBeNull();
    expect(fetchGrant).not.toHaveBeenCalled();
  });

  it('tears down on logout rather than waiting for a navigation that may never come', async () => {
    await mount(<SiblingOfOutlet />);
    await click('open');
    expect(video()).not.toBeNull();

    await click('logout');

    expect(find('live-mini-player')).toBeNull();
    expect(container.querySelectorAll('video')).toHaveLength(0);
  });

  it('shows the title it was given, and closes on request', async () => {
    await mount(<SiblingOfOutlet />);
    await click('open');
    expect(container.textContent).toContain('Week 9 class');

    const closeButton = container.querySelector('.lmp-close') as HTMLElement;
    await act(async () => {
      closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(find('live-mini-player')).toBeNull();
  });

  it('exposes the signed url ONLY on the video src, never in the chrome around it', async () => {
    await mount(<SiblingOfOutlet />);
    await click('open');

    // The <video src> must hold the signature - that is how playback works, and asserting
    // its absence from innerHTML was simply wrong. What matters is that nothing ELSE carries
    // it: not the visible text, not a title attribute, not a data attribute. Those are what
    // end up in a screenshot or a copied bug report.
    const SIG = 's=sig';
    expect(container.textContent ?? '').not.toContain(SIG);

    const offenders = Array.from(container.querySelectorAll('*')).filter((el) =>
      Array.from(el.attributes).some(
        (attr) => attr.value.includes(SIG) && !(el.tagName === 'VIDEO' && attr.name === 'src'),
      ),
    );
    expect(offenders.map((el) => el.tagName)).toEqual([]);

    // Positive control: the sweep is looking in the right place, so a real leak would fail it.
    expect((video() as HTMLVideoElement).getAttribute('src')).toContain(SIG);
  });
});

describe('mounted inside the routed page — the mistake, as a control', () => {
  it('LOSES the video node on the first navigation', async () => {
    await mount(<InsideThePage />);
    await click('open');

    const first = video();
    expect(first).not.toBeNull();
    first!.currentTime = 42;
    (first as unknown as Record<string, unknown>).__marker = 'the original node';

    await click('go-community');
    const second = video();

    // The failure mode the real mount point avoids. If this ever starts passing, the test
    // above has stopped being able to tell the difference.
    expect(Object.is(first, second)).toBe(false);
    expect((second as unknown as Record<string, unknown>).__marker).toBeUndefined();
    expect(second!.currentTime).toBe(0);
  });

  it('re-acquires a credential on every route change', async () => {
    await mount(<InsideThePage />);
    await click('open');
    await click('go-community');

    expect(fetchGrant.mock.calls.length).toBeGreaterThan(1);
  });
});
