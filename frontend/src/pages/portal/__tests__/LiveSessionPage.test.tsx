import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

/**
 * The live link's landing page (L7.2).
 *
 * WHY THIS TEST EXISTS. This URL is promoted, printed and scanned before the class exists, so
 * the state it shows to someone who arrives EARLY is the whole point of the page. The backend
 * already has the moment resolution pinned; what is untested is whether the page renders each
 * moment honestly - and the failure mode is silent, because every state renders a perfectly
 * convincing card.
 *
 * The title lookup is deliberately best-effort. A transient edge failure on `checkin-info`
 * (one was observed on production the day this shipped) must not take the page down with it:
 * the moment is what matters and the class name is a courtesy.
 *
 * Mocks are created inside the factories and read back through the typed import, because babel
 * hoists `jest.mock` above const declarations.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../../utils/portalApi', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('react-router-dom', () => ({ useParams: () => ({ sessionId: 'sess-1' }) }));

// The contexts the companion surface reads. Mocked at the module seam so the page test does
// not have to stand up the whole portal layout to ask one question about rendering.
jest.mock('../../../contexts/ParticipantAuthContext', () => ({ useParticipantAuth: jest.fn() }));
jest.mock('../../../contexts/BroadcastPlayerContext', () => ({ useBroadcastPlayer: jest.fn() }));
// Stubbed so this file tests the PAGE's composition. The deck has its own suite, and the
// watch button already has one.
jest.mock('../../../components/portal/CompanionDeck', () => ({
  __esModule: true,
  default: ({ sessionId }: { sessionId: string }) => <div data-testid="deck-stub">{sessionId}</div>,
}));
jest.mock('../../../components/portal/BroadcastWatchButton', () => ({
  __esModule: true,
  default: ({ roomId }: { roomId: string | null }) => <div data-testid="watch-stub">{String(roomId)}</div>,
}));
// Stubbed for the same reason, and for one more: the real strip polls its own endpoint, which
// `wire()` below deliberately rejects as an unexpected URL. Whether a producer may see it is
// the strip's own suite; what this file asks is WHERE the page puts it.
jest.mock('../../../components/portal/ProducerStrip', () => ({
  __esModule: true,
  default: ({ sessionId }: { sessionId: string }) => <div data-testid="producer-stub">{sessionId}</div>,
}));
// The desktop rail. Same deal: it polls the companion state and the chat, and its own suite
// covers what it contains. This file asks when the page mounts it and with what.
jest.mock('../../../components/portal/LiveWorkspace', () => ({
  __esModule: true,
  default: ({ sessionId, roomId, isAuthenticated }: {
    sessionId: string; roomId: string | null; isAuthenticated: boolean;
  }) => (
    <div
      data-testid="workspace-stub"
      data-room={String(roomId)}
      data-authed={String(isAuthenticated)}
    >
      {sessionId}
    </div>
  ),
}));

import portalApi from '../../../utils/portalApi';
import { useParticipantAuth } from '../../../contexts/ParticipantAuthContext';
import { useBroadcastPlayer } from '../../../contexts/BroadcastPlayerContext';
import LiveSessionPage from '../LiveSessionPage';

const mockAuth = useParticipantAuth as unknown as jest.Mock;
const mockPlayer = useBroadcastPlayer as unknown as jest.Mock;

const mockGet = (portalApi as unknown as { get: jest.Mock }).get;

const INFO = {
  title: 'Week 12 - Build Day',
  session_date: '2026-10-15',
  start_time: '18:30:00',
  cohort_name: 'Cohort - July 2026',
};

/** Route the two endpoints the page calls; `moment` drives live-moment, `info` the title. */
beforeEach(() => {
  mockAuth.mockReturnValue({ isAuthenticated: true });
  mockPlayer.mockReturnValue({ session: null, open: jest.fn(), close: jest.fn() });
});

function wire(moment: string, watchUrl: string | null = null, info: unknown = INFO) {
  mockGet.mockImplementation((url: string) => {
    if (url.includes('live-moment')) return Promise.resolve({ data: { moment, watch_url: watchUrl } });
    if (url.includes('checkin-info')) {
      return info === null ? Promise.reject(new Error('edge blip')) : Promise.resolve({ data: info });
    }
    return Promise.reject(new Error('unexpected url ' + url));
  });
}

let container: HTMLDivElement;
let root: Root;

async function render(companion = false) {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<LiveSessionPage companion={companion} />);
  });
}

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  jest.clearAllMocks();
  jest.useRealTimers();
});

const text = () => container.textContent || '';
const titleOf = () => container.querySelector('[data-testid="live-session-title"]')?.textContent || '';
const workspace = () => container.querySelector('[data-testid="workspace-stub"]') as HTMLElement | null;
const card = () => container.querySelector('[data-testid="live-session-page"]') as HTMLElement;

describe('what someone who clicks the link actually sees', () => {
  it('tells an early arrival the class has not started, and does not look like an error', async () => {
    wire('not_started');
    await render();

    expect(titleOf()).toContain('has not started yet');
    // The reassurance matters as much as the state: this link is clicked days early by design.
    expect(text()).toContain('It will update on its own');
    expect(text()).toContain('The link stays the same for this class');
    expect(workspace()).toBeNull();
  });

  it('becomes the workspace once the class is on air', async () => {
    wire('live', 'https://enterprise.colaberry.ai/portal/live/sess-1');
    await render();

    expect(titleOf()).toContain('is live now');
    expect(workspace()).not.toBeNull();
  });

  it('NEVER renders a link to the page it is already on', async () => {
    // `watch_url` for this session resolves to this exact route, so the primary watch button
    // was a self-link from the day it shipped (spec §8 finding 1). The page no longer reads
    // the field at all; the workspace's own watch control opens the in-app player instead.
    wire('live', 'https://enterprise.colaberry.ai/portal/live/sess-1');
    await render();

    const selfLinks = Array.from(container.querySelectorAll('a'))
      .filter((a) => (a.getAttribute('href') || '').includes('/portal/live/sess-1'));
    expect(selfLinks).toHaveLength(0);
  });

  it('says ended without offering a dead button', async () => {
    wire('ended');
    await render();

    expect(titleOf()).toContain('has ended');
    expect(workspace()).toBeNull();
  });

  it('does not tell someone their link is broken when the check simply failed', async () => {
    // "Something went wrong" would be a lie about the LINK, and people stop trusting a link
    // they have been told is broken.
    mockGet.mockRejectedValue(new Error('network'));
    await render();

    expect(titleOf()).toContain('cannot check this class right now');
    expect(text()).not.toMatch(/went wrong|error|broken/i);
  });

  it('names the class when it can', async () => {
    wire('not_started');
    await render();

    expect(text()).toContain('Week 12 - Build Day');
    expect(text()).toContain('Cohort - July 2026');
    expect(text()).toContain('6:30 PM');
  });

  it('still renders the moment when the title lookup fails', async () => {
    // Observed on production: checkin-info returned a transient edge 520 while the origin was
    // answering 200. The page must not inherit that failure.
    wire('live', 'https://example.test/watch', null);
    await render();

    expect(titleOf()).toContain('is live now');
    expect(workspace()).not.toBeNull();
    // The room id rides on the same failed request, and the workspace is built to be handed
    // a null rather than withheld — the watch control decides for itself.
    expect(workspace()!.getAttribute('data-room')).toBe('null');
    expect(text()).not.toContain('Week 12');
  });
});

describe('it keeps checking', () => {
  it('polls, so a page left open updates itself when the class starts', async () => {
    jest.useFakeTimers();
    wire('not_started');
    await render();
    expect(titleOf()).toContain('has not started yet');

    wire('live', 'https://example.test/watch');
    await act(async () => { jest.advanceTimersByTime(30_000); });

    expect(titleOf()).toContain('is live now');
  });

  it('CONTROL: without the poll firing, the page would still say not started', async () => {
    // Without this, the test above could pass because of a re-render rather than the interval.
    jest.useFakeTimers();
    wire('not_started');
    await render();

    wire('live', 'https://example.test/watch');
    await act(async () => { jest.advanceTimersByTime(29_000); });

    expect(titleOf()).toContain('has not started yet');
  });
});

describe('it looks like Colaberry', () => {
  it('carries the brand lockup, because this URL appears in marketing', async () => {
    wire('not_started');
    await render();

    expect(container.querySelector('.clv-wordmark')).not.toBeNull();
    const logo = container.querySelector('.clv-brand img') as HTMLImageElement | null;
    expect(logo).not.toBeNull();
    expect(logo!.getAttribute('src')).toBe('/colaberry-icon.png');
  });

  it('uses semantic tokens rather than hardcoded colors, so dark mode holds', async () => {
    wire('not_started');
    await render();

    const css = container.querySelector('style')?.textContent || '';
    expect(css).toContain('var(--surface-card)');
    // A hex literal here is what silently breaks one of the two themes.
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe('the phone companion (L4.7)', () => {
  it('gets the one-thumb deck, not the two-column workspace', async () => {
    wire('live', 'https://enterprise.colaberry.ai/portal/live/sess-1');
    await render(true);

    expect(container.querySelector('[data-testid="companion-surface"]')).not.toBeNull();
    expect(workspace()).toBeNull();
  });

  it('CONTROL: the laptop surface gets the workspace and not the companion deck', async () => {
    wire('live', 'https://enterprise.colaberry.ai/portal/live/sess-1');
    await render(false);

    expect(workspace()).not.toBeNull();
    expect(container.querySelector('[data-testid="companion-surface"]')).toBeNull();
  });

  it('hands the watch button the room id, which is the only key that finds the broadcast', async () => {
    wire('live', null, { ...INFO, room_id: 'room-9' });
    await render(true);

    expect(container.querySelector('[data-testid="watch-stub"]')!.textContent).toBe('room-9');
  });

  it('shows the deck to someone signed in', async () => {
    wire('live');
    await render(true);

    expect(container.querySelector('[data-testid="deck-stub"]')!.textContent).toBe('sess-1');
  });

  it('asks a signed-out viewer to sign in rather than showing a deck that cannot save', async () => {
    mockAuth.mockReturnValue({ isAuthenticated: false });
    wire('live');
    await render(true);

    expect(container.querySelector('[data-testid="deck-stub"]')).toBeNull();
    expect(container.querySelector('[data-testid="companion-signed-out"]')).not.toBeNull();
  });

  it('shows nothing companion-shaped before the class is on air', async () => {
    wire('not_started');
    await render(true);

    expect(container.querySelector('[data-testid="companion-surface"]')).toBeNull();
  });
});

describe('the desktop workspace (DOC 04)', () => {
  it('is handed the session, the room and whether the viewer is signed in', async () => {
    wire('live', null, { ...INFO, room_id: 'room-9' });
    await render();

    expect(workspace()!.textContent).toBe('sess-1');
    expect(workspace()!.getAttribute('data-room')).toBe('room-9');
    expect(workspace()!.getAttribute('data-authed')).toBe('true');
  });

  it('mounts for a signed-out visitor too, and tells IT who the viewer is', async () => {
    // The rail is gated inside the workspace rather than here, because a public marketed URL
    // should still explain itself to someone who has not signed in.
    mockAuth.mockReturnValue({ isAuthenticated: false });
    wire('live');
    await render();

    expect(workspace()).not.toBeNull();
    expect(workspace()!.getAttribute('data-authed')).toBe('false');
  });

  it('widens the card for it', async () => {
    // 440px is right for a one-line status card and far too narrow for two columns.
    wire('live');
    await render();

    expect(card().className).toContain('is-wide');
  });

  it('CONTROL: leaves the card narrow when there is no workspace in it', async () => {
    wire('not_started');
    await render();

    expect(card().className).not.toContain('is-wide');
  });

  it('is not mounted before the class is on air', async () => {
    // Unlike the producer strip, which is needed precisely while nothing is airing, there is
    // nothing for a VIEWER to do on a class that has not started.
    wire('not_started');
    await render();

    expect(workspace()).toBeNull();
  });
});

describe('the producer strip (P4-02)', () => {
  const strip = () => container.querySelector('[data-testid="producer-stub"]');

  it('is placed on the laptop surface BEFORE anything is airing, which is when it is needed', async () => {
    // `not_started` is exactly when Go Backstage has to be pressed. A control that appeared
    // only once the class was live would be useless for starting one.
    wire('not_started');
    await render();

    expect(strip()).not.toBeNull();
  });

  it('is still there once the class is on air, for End', async () => {
    wire('live', 'https://enterprise.colaberry.ai/portal/live/sess-1');
    await render();

    expect(strip()).not.toBeNull();
  });

  it('is NOT on the phone companion — a one-way End button does not belong under a thumb', async () => {
    wire('live');
    await render(true);

    expect(strip()).toBeNull();
  });

  it('is not mounted for a signed-out viewer, so a public page makes no producer call', async () => {
    mockAuth.mockReturnValue({ isAuthenticated: false });
    wire('not_started');
    await render();

    expect(strip()).toBeNull();
  });

  it('is handed the session id, which is the key the producer read is on', async () => {
    wire('not_started');
    await render();

    expect(strip()!.textContent).toBe('sess-1');
  });
});

describe('the body flag that places the player', () => {
  it('marks the page idle while nothing is playing', async () => {
    wire('live');
    await render(true);

    expect(document.body.dataset.liveCompanion).toBe('idle');
  });

  it('marks it playing once the player is open, so the page clears the pinned video', async () => {
    mockPlayer.mockReturnValue({ session: { occurrenceId: 'occ-1' }, open: jest.fn(), close: jest.fn() });
    wire('live');
    await render(true);

    expect(document.body.dataset.liveCompanion).toBe('playing');
  });

  it('never sets it on the laptop surface', async () => {
    wire('live');
    await render(false);

    expect(document.body.dataset.liveCompanion).toBeUndefined();
  });

  it('cleans up on unmount, so the rest of the portal is not left padded', async () => {
    wire('live');
    await render(true);
    expect(document.body.dataset.liveCompanion).toBe('idle');

    await act(async () => { root.unmount(); });
    expect(document.body.dataset.liveCompanion).toBeUndefined();

    // The shared afterEach unmounts again; make that a no-op rather than a double unmount.
    root = { unmount: () => undefined } as unknown as Root;
  });
});

/**
 * THE STATE MATRIX, as tests. P1-07's deliverable, and the hole DOC 18 named:
 * "no test asserts what a viewer actually sees end to end".
 *
 * One row per editorial state the broadcast state machine can be in, asserting what a
 * NON-STAFF viewer gets. The staff view is deliberately not the subject here - the question
 * these answer is what the room, and anyone who scanned the code, is told.
 *
 * `moment` is what the server resolves each editorial state to
 * (`backend/src/services/broadcast/broadcastSessionLinks.ts`), so these assert the two halves
 * together: the mapping is covered by the backend's own suite, and this covers what each
 * resolved moment renders.
 */
describe('the state matrix: what a NON-STAFF viewer sees in every state', () => {
  beforeEach(() => {
    // Not staff. The producer strip is already asserted absent elsewhere; this is the audience.
    mockAuth.mockReturnValue({ isAuthenticated: false });
  });

  /**
   * BACKSTAGE MUST BE INDISTINGUISHABLE FROM SCHEDULED.
   *
   * This is the one row that is a security property rather than a copy choice. Backstage is the
   * staff rehearsal state: the producer can see the program feed. If a viewer could tell
   * backstage from scheduled - by a different word, a badge, anything - they would know when
   * staff were in the room, which is exactly the leak the state was designed to avoid.
   *
   * THE FIRST VERSION OF THIS TEST WAS VACUOUS, and a mutation found it. It rendered
   * `not_started` twice and asserted the two were byte-identical - which compares the state to
   * itself and proves nothing. Adding "(staff are in the room)" to the waiting copy passed it.
   *
   * The two halves of the property live in different places, so they are asserted separately
   * rather than faked into one test here:
   *
   *  - That backstage and scheduled resolve to the SAME moment is a backend fact, covered by the
   *    sweep in `broadcastSessionLinks.test.ts` over every editorial state.
   *  - What is left for this surface is that the waiting copy carries no staff vocabulary. By the
   *    time the page sees it, backstage and scheduled are the same value, so the only way this
   *    screen can leak is by saying something it should not.
   */
  it('leaks no staff vocabulary while a viewer is waiting', async () => {
    wire('not_started');
    await render();
    const waiting = text();
    for (const word of ['backstage', 'staff', 'rehearsal', 'producer', 'preview', 'program feed']) {
      expect(waiting.toLowerCase()).not.toContain(word);
    }
  });

  it('SCHEDULED: says it has not started and that the page updates itself', async () => {
    wire('not_started');
    await render();
    expect(text()).toContain('This class has not started yet');
    expect(text()).toContain('It will update on its own');
    expect(workspace()).toBeNull();
  });

  it.each(['live', 'reconnecting'])('%s: resolves to live, and the class is on this page', async () => {
    wire('live', 'https://portal.example/watch');
    await render();
    expect(text()).toContain('This class is live now');
    expect(text()).toContain('Everything for this class is on this page');
  });

  it.each(['ended', 'processing', 'replay_ready'])(
    '%s: says the class ended and does not promise a replay that may not exist',
    async () => {
      wire('ended');
      await render();
      expect(text()).toContain('This class has ended');
      // "if one is published" - processing can fail back to ended, so a replay is conditional.
      expect(text()).toContain('if one is published');
      expect(workspace()).toBeNull();
    },
  );

  /**
   * CANCELLED was the bug this matrix found.
   *
   * It used to resolve to `not_started`, so a cancelled class told everyone who scanned the code
   * "Leave this page open. It will update on its own when the class goes live." Every clause was
   * false: `cancelled` is terminal and no second occurrence can be minted for the session, so
   * the page would never update and the class could never go live.
   *
   * Both wrong answers are asserted against, not just the right one. Folding it into `ended`
   * would be the other easy mistake, and that promises a replay that was never recorded.
   */
  it('CANCELLED: says so, and promises neither a start nor a replay', async () => {
    wire('cancelled');
    await render();
    expect(text()).toContain('This class was cancelled');
    expect(text()).toContain('no replay');
    expect(text()).not.toContain('has not started yet');
    expect(text()).not.toContain('It will update on its own');
    expect(text()).not.toContain('This class has ended');
    expect(workspace()).toBeNull();
  });

  it('UNKNOWN: blames the check rather than the link', async () => {
    // A viewer who meets an error page concludes the link is broken and does not come back.
    wire('unknown');
    await render();
    expect(text()).toContain('We cannot check this class right now');
    expect(text()).toContain('usually temporary');
    expect(text()).not.toMatch(/error|failed|broken/i);
  });
});
