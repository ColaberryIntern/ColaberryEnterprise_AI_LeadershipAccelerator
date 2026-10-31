import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Each child has its own suite. What this file asks is what the WORKSPACE composes, and with
// what — the deck's `full` flag in particular, which is the whole difference between the
// laptop prompt card and the phone one.
jest.mock('../BroadcastWatchButton', () => ({
  __esModule: true,
  default: ({ roomId }: { roomId: string | null }) => (
    <div data-testid="watch-stub">{String(roomId)}</div>
  ),
}));
jest.mock('../CompanionDeck', () => ({
  __esModule: true,
  default: ({ sessionId, full }: { sessionId: string; full?: boolean }) => (
    <div data-testid="deck-stub" data-full={String(!!full)}>{sessionId}</div>
  ),
}));
jest.mock('../SessionChatPanel', () => ({
  __esModule: true,
  default: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="chat-stub">{sessionId}</div>
  ),
}));

import LiveWorkspace from '../LiveWorkspace';

/**
 * The desktop live workspace.
 *
 * WHY THIS SUITE IS MOSTLY ABOUT ABSENCES. Three of the four things that can go wrong here
 * are things that should NOT be on screen: a second `<video>` (which would break the one
 * desktop requirement that already worked, because the persistent player lives in the layout
 * route), an interactive rail offered to a signed-out visitor on a public marketed URL, and
 * the dead "Watch now" self-link this component replaced. The fourth is the deck arriving
 * without `full`, which would silently ship the phone card to the laptop and look fine.
 */

let container: HTMLDivElement;
let root: Root;

async function render(props: Partial<React.ComponentProps<typeof LiveWorkspace>> = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <LiveWorkspace sessionId="s1" roomId="room-1" isAuthenticated {...props} />,
    );
  });
}

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  jest.clearAllMocks();
});

const find = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const css = () => container.querySelector('style')?.textContent || '';

describe('what a signed-in viewer gets on a laptop', () => {
  it('gives them the rail the companion branch used to keep to itself', async () => {
    await render();

    expect(find('deck-stub')).not.toBeNull();
    expect(find('chat-stub')).not.toBeNull();
  });

  it('asks the deck for the FULL prompt card, not the one-thumb one', async () => {
    // Without this the laptop would render a phone card: no tool, no mode, no rescue line.
    await render();

    expect(find('deck-stub')!.getAttribute('data-full')).toBe('true');
  });

  it('passes the room to the watch control, which is the only key that finds the airing', async () => {
    await render();

    expect(find('watch-stub')!.textContent).toBe('room-1');
  });

  it('still renders the watch control before checkin-info has answered', async () => {
    // `room_id` arrives on a separate best-effort request. The control decides for itself
    // whether there is anything to offer; it must not be withheld on a null.
    await render({ roomId: null });

    expect(find('watch-stub')).not.toBeNull();
  });
});

describe('what it does NOT do', () => {
  it('renders no video of its own', async () => {
    // `LiveMiniPlayer` is a sibling of <Outlet/> in the layout route precisely so it survives
    // navigation. A second <video> here is how "no forced video interruption" gets broken.
    await render();

    expect(container.querySelector('video')).toBeNull();
  });

  it('offers no rail to a signed-out visitor, and says what signing in gets them', async () => {
    // This URL is public, promoted and printed. A signed-out arrival is expected traffic.
    await render({ isAuthenticated: false });

    expect(find('deck-stub')).toBeNull();
    expect(find('chat-stub')).toBeNull();
    expect(find('live-workspace-signed-out')).not.toBeNull();
  });
});

describe('the layout', () => {
  it('is two columns on a laptop and one on anything narrow', async () => {
    await render();

    expect(css()).toMatch(/\.lwork-cols\{[^}]*grid-template-columns:minmax\(0,1fr\) 340px/);
    expect(css()).toMatch(/@media \(max-width:900px\)/);
  });

  it('uses semantic tokens rather than hardcoded colors, so dark mode holds', async () => {
    await render();

    expect(css()).toContain('var(--action-bg)');
    expect(css()).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
