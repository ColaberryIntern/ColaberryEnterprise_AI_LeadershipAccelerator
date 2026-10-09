import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import LiveMiniPlayer from '../LiveMiniPlayer';
import { BroadcastPlayerProvider, useBroadcastPlayer, BroadcastSession } from '../../../contexts/BroadcastPlayerContext';
import { ParticipantAuthProvider } from '../../../contexts/ParticipantAuthContext';
import { PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';
import type { GrantResponse } from '../../../services/broadcastPlaybackAdapter';

/**
 * The player's half of denied autoplay: the labelled control, what the live region says, and
 * the states in which the control must NOT be offered.
 *
 * Split out of `liveMiniPlayer.presentation.test.tsx` when that file passed the 500-line
 * ceiling. A MOVE: no assertion here was changed. The mount lifecycle below is a copy of that
 * file's rather than a shared import — it is mutable module state driven by
 * `beforeEach`/`afterEach`, and lifting it would mean rewriting how every test in the other
 * file reaches it. The repo's rule puts the extract threshold at three occurrences; this is
 * the second.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OCC = '11111111-2222-4333-8444-555555555555';

const grant = (asset: string): GrantResponse => ({
  url: `/bm/broadcast/${OCC}/${asset}?e=${Date.now() + 120_000}&s=sig-${asset}`,
  expires_at: Date.now() + 120_000,
  ttl_seconds: 120,
  grant: 'full',
  preview_seconds_remaining: null,
});

// No implementation here: react-scripts sets `resetMocks: true`, which wipes anything passed
// to jest.fn() before every test. Set in beforeEach, like every sibling suite.
const fetchGrant = jest.fn<Promise<GrantResponse>, [string, string]>();

let container: HTMLDivElement;
let root: Root;

function Opener({ session }: { session: BroadcastSession }) {
  const { open } = useBroadcastPlayer();
  return <button type="button" data-testid="open" onClick={() => open(session)} />;
}

function App({ session }: { session: BroadcastSession }) {
  return (
    <ParticipantAuthProvider>
      <BroadcastPlayerProvider>
        <Opener session={session} />
        <LiveMiniPlayer fetchGrant={fetchGrant} />
      </BroadcastPlayerProvider>
    </ParticipantAuthProvider>
  );
}

const BASE: BroadcastSession = { occurrenceId: OCC, asset: 'replay.mp4', title: 'Week 9 class' };

async function mount(session: BroadcastSession = BASE): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<App session={session} />); });
  await click('open');
}

const find = (testid: string): HTMLElement | null =>
  container.querySelector(`[data-testid="${testid}"]`);

async function click(testid: string): Promise<void> {
  const el = find(testid);
  if (!el) throw new Error(`nothing to click: ${testid}`);
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  fetchGrant.mockImplementation((_occ: string, asset: string) => Promise.resolve(grant(asset)));
  localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'a.test.token');
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  localStorage.clear();
});

describe('denied autoplay offers a labelled control, not a dead player', () => {
  /**
   * The counterpart to the adapter's `autoplayBlocked`. Chrome and Safari refuse unmuted
   * autoplay without a user gesture, and the gesture has to come from a real click handler —
   * which is why the adapter is held in a ref and `resume()` is called straight from onClick
   * rather than from a timer or an effect.
   *
   * NOTE ON THE DOUBLE: `resetMocks: true` wipes the `beforeAll` play stub before every test,
   * so a mock installed there would be a no-op returning undefined. The rejecting stub is
   * installed inside each test below, after the reset has run.
   */
  function refusePlay(): jest.Mock {
    const play = jest.fn(() => Promise.reject(
      Object.assign(new Error('gesture required'), { name: 'NotAllowedError' }),
    ));
    window.HTMLMediaElement.prototype.play = play as unknown as () => Promise<void>;
    return play;
  }

  it('renders no Play control when playback starts normally — the positive control', async () => {
    // Without this, every assertion below could pass against a button that is simply always
    // rendered. jsdom's own play() returns undefined, which the adapter reads as "started".
    window.HTMLMediaElement.prototype.play = jest.fn(() => Promise.resolve()) as unknown as () => Promise<void>;
    await mount();

    expect(find('lmp-resume')).toBeNull();
    expect(find('lmp-status')?.textContent ?? '').not.toMatch(/press Play/i);
  });

  it('renders a labelled Play button when the browser refuses', async () => {
    refusePlay();
    await mount();

    const button = find('lmp-resume');
    expect(button).not.toBeNull();
    // A LABEL, not an icon and not an aria-label on a bare glyph: this is the one action the
    // viewer must take, and it has to be readable by everyone including a screen reader.
    expect(button?.textContent?.trim()).toBe('Play');
    expect(button?.tagName).toBe('BUTTON');
    expect(button?.getAttribute('type')).toBe('button');
  });

  it('says what happened in the live region, for a viewer who is not looking at the button', async () => {
    refusePlay();
    await mount();

    const status = find('lmp-status');
    expect(status?.getAttribute('role')).toBe('status');
    expect(status?.getAttribute('aria-live')).toBe('polite');
    expect(status?.textContent).toMatch(/press Play/i);
    expect(status?.textContent).toMatch(/blocked playback/i);
  });

  it('the Play button is the FIRST control, so the next action is the first one reached', async () => {
    refusePlay();
    await mount({ ...BASE, captionsAsset: 'replay.vtt' });

    const ids = [...container.querySelectorAll('.lmp-controls [data-testid]')]
      .map((el) => el.getAttribute('data-testid'));
    expect(ids[0]).toBe('lmp-resume');
    // and the rest of the established order is undisturbed
    expect(ids).toEqual(['lmp-resume', 'lmp-captions', 'lmp-theater', 'lmp-fullscreen-unavailable', 'lmp-close']);
  });

  it('clicking it calls play() again, from inside the click handler', async () => {
    const play = refusePlay();
    await mount();
    const before = play.mock.calls.length;

    await click('lmp-resume');

    // The retry MUST originate in the click. A deferred retry is refused for the same reason
    // the first attempt was, so this assertion is about where the call comes from, not just
    // that one happens.
    expect(play.mock.calls.length).toBe(before + 1);
  });

  it('the control disappears once playback actually starts', async () => {
    const play = refusePlay();
    await mount();
    expect(find('lmp-resume')).not.toBeNull();

    play.mockImplementation(() => Promise.resolve());
    await click('lmp-resume');

    expect(find('lmp-resume')).toBeNull();
    expect(find('lmp-status')?.textContent ?? '').not.toMatch(/press Play/i);
  });

  it('stays on screen when the retry is refused again', async () => {
    refusePlay();
    await mount();

    await click('lmp-resume');

    expect(find('lmp-resume')).not.toBeNull();
  });

  it('withdraws the control when the viewer uses the VIDEO\'s own play button', async () => {
    // The element renders native `controls`, so this is the gesture a viewer actually makes.
    // It never reaches `resume()`. Before the adapter listened for `play`, the custom button
    // and the "blocked playback" message stayed up for the entire replay.
    refusePlay();
    await mount();
    const video = container.querySelector('video')!;
    expect(video.getAttribute('controls')).not.toBeNull();
    expect(find('lmp-resume')).not.toBeNull();

    await act(async () => { video.dispatchEvent(new Event('play')); });

    expect(find('lmp-resume')).toBeNull();
    expect(find('lmp-status')?.textContent ?? '').not.toMatch(/blocked playback/i);
  });

  it('lets `Finished.` through when the replay ends after a refusal', async () => {
    // A stale flag outranks `statusLine` in the live region, so a finished replay would still
    // be telling the viewer to press Play.
    refusePlay();
    await mount();
    expect(find('lmp-status')?.textContent).toMatch(/press Play/i);

    await act(async () => {
      container.querySelector('video')!.dispatchEvent(new Event('ended'));
    });

    expect(find('lmp-resume')).toBeNull();
    expect(find('lmp-status')?.textContent).toMatch(/Finished/i);
  });

  it('withdraws the control when the broadcast is denied AFTER the refusal', async () => {
    // The case the previous test could not reach, and a surviving mutation proved it: there,
    // the denial arrives before any play() call, so the flag is never raised and the button
    // is absent whatever the guard does. Here the refusal comes FIRST — the viewer has a Play
    // button on screen — and only then is the replay unpublished. Without the phase guard the
    // button stays, inviting a press that can do nothing, beside a denial message.
    const play = refusePlay();
    await mount();
    expect(find('lmp-resume')).not.toBeNull();

    play.mockImplementation(() => Promise.resolve());
    fetchGrant.mockRejectedValue({ response: { status: 403, data: { reason: 'not_watchable' } } });

    // The element's `error` does not deny immediately — it schedules a retry on a backoff,
    // through a REAL setTimeout, because the component injects no timer. Asserting straight
    // after the dispatch passed for the wrong reason: the denial had not arrived yet. The
    // clock is driven here instead of waited on, so the test is deterministic.
    jest.useFakeTimers();
    try {
      await act(async () => {
        container.querySelector('video')!.dispatchEvent(new Event('error'));
      });
      await act(async () => { jest.advanceTimersByTime(10_000); });
      await act(async () => { await Promise.resolve(); });
    } finally {
      jest.useRealTimers();
    }

    expect(find('lmp-resume')).toBeNull();
    expect(find('lmp-status')?.textContent).toMatch(/Nothing is airing/i);
  });

  it('is not offered when the server denied access — there is nothing to play', async () => {
    refusePlay();
    fetchGrant.mockRejectedValue({ response: { status: 403, data: { reason: 'not_entitled' } } });
    await mount();

    expect(find('lmp-resume')).toBeNull();
    // The denial is what the viewer needs to read, not an invitation to press Play.
    expect(find('lmp-status')?.textContent).toMatch(/do not have access/i);
  });
});
