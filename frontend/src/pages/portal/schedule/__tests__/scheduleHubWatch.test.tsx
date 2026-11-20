import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const mockOpen = jest.fn();
let mockPlayingId: string | null = null;
jest.mock('../../../../contexts/BroadcastPlayerContext', () => ({
  useBroadcastPlayer: () => ({ open: mockOpen, close: jest.fn(), session: mockPlayingId ? { occurrenceId: mockPlayingId, asset: 'master.m3u8', title: 'x' } : null }),
}));
// The real Sign up needs campus state; here it only has to be recognisable.
jest.mock('../../../../components/campus/events/EventSignup', () => ({ EventSignup: () => <span data-testid="signup">Sign up</span> }));
jest.mock('../../today/PortalShell', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

import { renderItem } from '../SchedulePage';
import type { OpenHouseView } from '../../../../services/onboardingApi';

/** CH5.3: the Schedule calendar shows the member event feed; a hub event streaming now offers Watch live there too. */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
const ev = (o: Partial<OpenHouseView> = {}): OpenHouseView => ({
  id: 'hub:e1:now', title: 'Demo Tuesday', description: null, starts_at: '2026-12-02T00:00:00.000Z', ends_at: null, timezone: 'America/Chicago',
  registration_url: 'https://www.eventbrite.com/e/1992498063344', meeting_link: null, image_url: null, signup_count: null, is_registered: false, source: 'hub', ...o,
});
function show(event: OpenHouseView): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const item = { id: event.id, title: event.title, event } as never;
  act(() => { root.render(<>{renderItem(item, 'sch-item', <span>Demo Tuesday</span>)}</>); });
}
afterEach(() => { act(() => { root.unmount(); }); container.remove(); mockOpen.mockReset(); mockPlayingId = null; });

it('a hub event on air: Watch live replaces Sign up and opens the occurrence in the portal player', () => {
  show(ev({ is_live: true, live_occurrence_id: 'occ-77' }));
  expect(container.querySelector('[data-testid="signup"]')).toBeNull();
  const btn = container.querySelector('[data-testid="evt-watch-hub:e1:now"]') as HTMLButtonElement;
  expect(btn.textContent!.trim()).toBe('Watch live');
  act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  expect(mockOpen).toHaveBeenCalledWith({ occurrenceId: 'occ-77', asset: 'master.m3u8', title: 'Demo Tuesday' });
});

it('already playing it: "Playing now", no second button', () => {
  mockPlayingId = 'occ-77';
  show(ev({ is_live: true, live_occurrence_id: 'occ-77' }));
  expect(container.querySelector('[data-testid^="evt-watch-"]')).toBeNull();
  expect(container.textContent).toContain('Playing now');
});

it('not on air, or any other event: Sign up as before', () => {
  show(ev({ is_live: false, live_occurrence_id: null }));
  expect(container.querySelector('[data-testid="signup"]')).not.toBeNull();
  expect(container.querySelector('[data-testid^="evt-watch-"]')).toBeNull();
});
