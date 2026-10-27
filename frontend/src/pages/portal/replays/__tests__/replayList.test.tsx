import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockOpen = jest.fn();
let mockPlayingId: string | null = null;
// The player is mocked rather than provided: `BroadcastPlayerProvider` reads participant auth
// and owns a real <video>, neither of which this suite is about. What matters here is WHAT this
// surface asks the player for.
jest.mock('../../../../contexts/BroadcastPlayerContext', () => ({
  useBroadcastPlayer: () => ({
    open: mockOpen,
    close: jest.fn(),
    session: mockPlayingId ? { occurrenceId: mockPlayingId, asset: 'master.m3u8', title: 'x' } : null,
  }),
}));

import ReplayList from '../ReplayList';
import type { ReplayBroadcast } from '../../../../hooks/useReplayDiscovery';

/**
 * L8.3's portal surface.
 *
 * The three states this pins hardest are the ones that are easy to collapse into each other
 * and expensive to get wrong:
 *
 *   - the feature being OFF must render neither a list nor an outage;
 *   - an OUTAGE must not read as "you have no recordings", because that turns a passing
 *     failure into a settled belief that the class was never recorded; and
 *   - an entry the viewer cannot play must offer NO play button, rather than one that answers
 *     402 after they click it.
 *
 * It does not test who may see what. That is the server's answer, pinned in
 * `broadcastController.test.ts` and `broadcastDiscovery.test.ts`; a client-side copy of it
 * would be a second, weaker rule.
 */

let container: HTMLDivElement;
let root: Root;

const replay = (over: Partial<ReplayBroadcast> = {}): ReplayBroadcast => ({
  id: 'occ-week-9',
  title: 'Week 9 Build Day',
  access_mode: 'free',
  editorial_state: 'replay_ready',
  room_id: 'room-1',
  content_started_at: null,
  scheduled_start_at: null,
  can_watch: true,
  reason: 'entitled',
  offer_upgrade: false,
  preview_seconds_remaining: null,
  session_id: 'sess-9',
  ended_at: Date.UTC(2026, 9, 13, 19, 40),
  ...over,
});

const STATE = { replays: [] as ReplayBroadcast[], disabled: false, unavailable: false, loading: false };

function mount(over: Partial<typeof STATE> = {}): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(<ReplayList {...STATE} {...over} />); });
}

afterEach(() => {
  act(() => { root?.unmount(); });
  container?.remove();
  mockOpen.mockReset();
  mockPlayingId = null;
});

describe('the three ways to have nothing to show', () => {
  it('renders the OFF state when broadcasting is not switched on — not an outage', () => {
    mount({ disabled: true });
    expect(container.querySelector('[data-testid="replays-off"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="replays-unavailable"]')).toBeNull();
    expect(container.querySelector('[data-testid="replays-empty"]')).toBeNull();
  });

  it('renders an OUTAGE as an outage, never as an empty shelf', () => {
    mount({ unavailable: true });
    const warn = container.querySelector('[data-testid="replays-unavailable"]');
    expect(warn).not.toBeNull();
    // The sentence that does the work: this is our fault, not evidence the class is lost.
    expect(warn!.textContent).toContain('not a sign that the class was not recorded');
    expect(container.querySelector('[data-testid="replays-empty"]')).toBeNull();
  });

  it('renders EMPTY only when the server actually said empty', () => {
    mount({ replays: [] });
    expect(container.querySelector('[data-testid="replays-empty"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="replays-unavailable"]')).toBeNull();
    expect(container.querySelector('[data-testid="replays-off"]')).toBeNull();
  });

  it('does not render the list at all while unavailable, even holding stale rows', () => {
    // Otherwise a refresh that fails leaves a list on screen beside an error about it.
    mount({ replays: [replay()], unavailable: true });
    expect(container.querySelector('[data-testid="replays-list"]')).toBeNull();
  });
});

describe('an entry the viewer cannot play', () => {
  it('offers NO watch button', () => {
    mount({ replays: [replay({ can_watch: false, access_mode: 'paid', offer_upgrade: true })] });
    expect(container.querySelector('[data-testid="replay-watch-occ-week-9"]')).toBeNull();
    expect(container.querySelector('[data-testid="replay-locked-occ-week-9"]')!.textContent)
      .toBe('Upgrade to watch');
  });

  it('CONTROL: the same entry DOES get a button once it is watchable', () => {
    // Without this, the assertion above would pass against a card that never draws a button.
    mount({ replays: [replay({ can_watch: true })] });
    expect(container.querySelector('[data-testid="replay-watch-occ-week-9"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="replay-locked-occ-week-9"]')).toBeNull();
  });

  it('names a spent preview as a preview rather than as an upgrade', () => {
    mount({ replays: [replay({ can_watch: false, access_mode: 'preview' })] });
    expect(container.querySelector('[data-testid="replay-locked-occ-week-9"]')!.textContent)
      .toBe('Preview only');
  });
});

describe('playing one back', () => {
  it('asks the EXISTING player for this occurrence, with the shared asset slug', () => {
    mount({ replays: [replay()] });
    const btn = container.querySelector('[data-testid="replay-watch-occ-week-9"]') as HTMLButtonElement;
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(mockOpen).toHaveBeenCalledWith({
      occurrenceId: 'occ-week-9', asset: 'master.m3u8', title: 'Week 9 Build Day',
    });
  });

  it('will not re-open the one already playing', () => {
    // A second open restarts the stream the viewer is watching.
    mockPlayingId = 'occ-week-9';
    mount({ replays: [replay()] });
    const btn = container.querySelector('[data-testid="replay-watch-occ-week-9"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('Playing');
  });
});

describe('when it aired', () => {
  it('dates a replay in CENTRAL, because program times are canonical Central', () => {
    mount({ replays: [replay()] });
    // 13 Oct 2026 19:40 UTC is 2:40 PM CDT. A viewer in another timezone must still read the
    // time the class was taught.
    expect(container.querySelector('.rp-when')!.textContent).toBe('Ended Oct 13, 2:40 PM CDT');
  });

  it('says so plainly when the end time was never recorded', () => {
    // `ended_at` was a declared-but-unwritten column until L7.4, so rows predating it exist.
    mount({ replays: [replay({ ended_at: null })] });
    expect(container.querySelector('.rp-when')!.textContent).toBe('Date not recorded');
    expect(container.querySelector('.rp-when')!.textContent).not.toContain('1970');
  });

  it('renders every row the server sent, in the order it sent them', () => {
    // The server orders by ended_at DESC and omits what the viewer may not know about. Both
    // decisions are undone by a surface that re-sorts or re-filters, so it does neither.
    mount({ replays: [
      replay({ id: 'a', title: 'Newest', ended_at: Date.UTC(2026, 9, 20) }),
      replay({ id: 'b', title: 'Older', ended_at: Date.UTC(2026, 9, 13) }),
    ] });
    const titles = Array.from(container.querySelectorAll('.rp-title')).map((n) => n.textContent);
    expect(titles).toEqual(['Newest', 'Older']);
  });
});
