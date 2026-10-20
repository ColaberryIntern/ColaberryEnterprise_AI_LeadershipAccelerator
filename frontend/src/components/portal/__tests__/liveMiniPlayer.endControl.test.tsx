import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import LiveMiniPlayer from '../LiveMiniPlayer';
import { BroadcastPlayerProvider, useBroadcastPlayer, BroadcastSession } from '../../../contexts/BroadcastPlayerContext';
import { ParticipantAuthProvider } from '../../../contexts/ParticipantAuthContext';
import { PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';
import type { GrantResponse } from '../../../services/broadcastPlaybackAdapter';
import type { EndResult } from '../../../services/broadcastProducer';

/**
 * The producer's End control (L7.4).
 *
 * Ali, during Test 2: "Can we just end it once the stream is done? I won't have you there
 * every time." Until this, ending a broadcast required an engineer running a command, and the
 * occurrence sat `live` for five minutes after the stream stopped, advertising a broadcast
 * over dead air.
 *
 * The heaviest tests here are the ones that assert the control is NOT offered. Ending is
 * terminal — there is no un-end command — so a control shown to the wrong person, or on a
 * stale picture, is worse than no control at all.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OCC = '11111111-2222-4333-8444-555555555555';

/** A grant with producer rights unless told otherwise. */
const grant = (over: Partial<GrantResponse> = {}): GrantResponse => ({
  url: `/bm/broadcast/${OCC}/live.m3u8?e=${Date.now() + 120_000}&s=sig`,
  expires_at: Date.now() + 120_000,
  ttl_seconds: 120,
  grant: 'full',
  preview_seconds_remaining: null,
  is_live: true,
  is_producer: true,
  version: 7,
  ...over,
});

const fetchGrant = jest.fn<Promise<GrantResponse>, [string, string]>();
const endBroadcast = jest.fn<Promise<EndResult>, [string, number]>();

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
        <LiveMiniPlayer fetchGrant={fetchGrant} endBroadcast={endBroadcast} />
      </BroadcastPlayerProvider>
    </ParticipantAuthProvider>
  );
}

const BASE: BroadcastSession = { occurrenceId: OCC, asset: 'live.m3u8', title: 'Week 9 class' };

async function mount(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<App session={BASE} />); });
  await click('open');
}

const find = (t: string): HTMLElement | null => container.querySelector(`[data-testid="${t}"]`);

async function click(t: string): Promise<void> {
  const el = find(t);
  if (!el) throw new Error(`nothing to click: ${t}`);
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
}

beforeEach(() => {
  fetchGrant.mockImplementation(() => Promise.resolve(grant()));
  endBroadcast.mockResolvedValue({ outcome: 'ended' });
  localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'a.test.token');
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  localStorage.clear();
});

describe('the End control is only offered when the server grants it', () => {
  it('is offered to a producer watching a live broadcast', async () => {
    await mount();
    expect(find('lmp-end')).not.toBeNull();
  });

  it('is NOT offered when the server did not say is_producer', async () => {
    fetchGrant.mockImplementation(() => Promise.resolve(grant({ is_producer: false })));
    await mount();
    expect(find('lmp-end')).toBeNull();
  });

  it('is NOT offered when the server omits is_producer entirely', async () => {
    // An older server that does not know about the field must not be read as granting an
    // irreversible capability. Absent means no.
    fetchGrant.mockImplementation(() => Promise.resolve(grant({ is_producer: undefined })));
    await mount();
    expect(find('lmp-end')).toBeNull();
  });

  it('is NOT offered on a replay, which has no broadcast left to end', async () => {
    fetchGrant.mockImplementation(() => Promise.resolve(grant({ is_live: false })));
    await mount();
    expect(find('lmp-end')).toBeNull();
  });
});

describe('ending takes two deliberate clicks', () => {
  it('does not end on the first click', async () => {
    await mount();
    await click('lmp-end');
    expect(endBroadcast).not.toHaveBeenCalled();
    expect(find('lmp-end-confirm')).not.toBeNull();
  });

  it('ends on the confirm, with the version the server gave', async () => {
    await mount();
    await click('lmp-end');
    await click('lmp-end-confirm');

    expect(endBroadcast).toHaveBeenCalledTimes(1);
    expect(endBroadcast).toHaveBeenCalledWith(OCC, 7);
  });

  it('can be backed out of without ending anything', async () => {
    await mount();
    await click('lmp-end');
    await click('lmp-end-cancel');

    expect(endBroadcast).not.toHaveBeenCalled();
    expect(find('lmp-end')).not.toBeNull();
  });
});

describe('what happens when the command does not succeed', () => {
  it('reports a version conflict and leaves the broadcast alone', async () => {
    // A 409 means the occurrence moved under us, so the producer is looking at a stale
    // picture. Retrying blindly would act on a state they have not seen.
    endBroadcast.mockResolvedValue({ outcome: 'conflict', currentVersion: 9 });
    await mount();
    await click('lmp-end');
    await click('lmp-end-confirm');

    expect(find('lmp-status')?.textContent ?? '').toMatch(/changed while you were looking/i);
    expect(find('live-mini-player')).not.toBeNull();
  });

  it('reports a refusal without pretending it worked', async () => {
    endBroadcast.mockResolvedValue({ outcome: 'forbidden' });
    await mount();
    await click('lmp-end');
    await click('lmp-end-confirm');

    expect(find('lmp-status')?.textContent ?? '').toMatch(/do not have permission/i);
  });

  it('says the broadcast is still live when the command fails', async () => {
    endBroadcast.mockResolvedValue({ outcome: 'failed' });
    await mount();
    await click('lmp-end');
    await click('lmp-end-confirm');

    expect(find('lmp-status')?.textContent ?? '').toMatch(/still live/i);
  });

  it('refuses to act at all when the server gave no version', async () => {
    // Guessing a version would either be refused or, worse, act on a state the producer has
    // not seen. Not acting is the only safe answer.
    fetchGrant.mockImplementation(() => Promise.resolve(grant({ version: undefined })));
    await mount();
    expect(find('lmp-end')).not.toBeNull();

    await click('lmp-end');
    await click('lmp-end-confirm');

    expect(endBroadcast).not.toHaveBeenCalled();
    expect(find('lmp-status')?.textContent ?? '').toMatch(/no version/i);
  });
});
