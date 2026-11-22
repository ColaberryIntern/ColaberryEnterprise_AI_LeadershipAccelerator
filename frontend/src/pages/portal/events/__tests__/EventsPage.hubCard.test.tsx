import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import EventsPage from '../EventsPage';
import * as onboardingApi from '../../../../services/onboardingApi';
import type { OpenHouseView } from '../../../../services/onboardingApi';

// The portal chrome has its own tests; here it only has to pass the page's children through.
jest.mock('../../today/PortalShell', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
jest.mock('../../today/CondensedHeaderCard', () => ({ __esModule: true, default: () => <div /> }));
const mockOpen = jest.fn();
let mockPlayingId: string | null = null;
jest.mock('../../../../contexts/BroadcastPlayerContext', () => ({
  useBroadcastPlayer: () => ({ open: mockOpen, close: jest.fn(), session: mockPlayingId ? { occurrenceId: mockPlayingId, asset: 'master.m3u8', title: 'x' } : null }),
}));
jest.mock('../../../../services/onboardingApi', () => ({ ...jest.requireActual('../../../../services/onboardingApi'), fetchPublicEvents: jest.fn() }));

/**
 * CH2.3 at the render level: a Communications Hub card on the member Events page. No picture yet
 * (CH4) means the existing first-letter fallback; no registration link means no Sign up; a live hub
 * event shows Watch live INSTEAD of Sign up.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;

const hubCard = (o: Partial<OpenHouseView> = {}): OpenHouseView => ({
  id: 'hub:44444444-4444-4444-8444-444444444444:2026-12-02T00:00:00.000Z', title: 'Demo Tuesday', description: 'Builders demo.',
  starts_at: '2099-12-02T00:00:00.000Z', ends_at: '2099-12-02T01:00:00.000Z', timezone: 'America/Chicago',
  registration_url: null, meeting_link: 'https://zoom.us/j/9', image_url: null, signup_count: null, is_registered: false,
  source: 'hub', is_live: false, watch_url: null, ...o,
});

async function renderWith(events: OpenHouseView[]): Promise<void> {
  (onboardingApi.fetchPublicEvents as jest.Mock).mockResolvedValue(events);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<MemoryRouter><EventsPage /></MemoryRouter>); });
  for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); });
}
afterEach(() => { act(() => { root.unmount(); }); container.remove(); jest.clearAllMocks(); mockPlayingId = null; });

const links = (): string[] => Array.from(container.querySelectorAll('a')).map((a) => (a.textContent ?? '').trim());

describe('CH2.3 a hub card on the member Events page', () => {
  it('no picture: the first-letter fallback; no registration link: no Sign up', async () => {
    await renderWith([hubCard()]);
    expect(container.textContent).toContain('Demo Tuesday');
    const fallback = container.querySelector('.evt-thumb-fallback');
    expect(fallback?.textContent).toBe('D');
    expect(container.querySelector('.evt-thumb img')).toBeNull();
    expect(links().some((t) => t.startsWith('Sign up'))).toBe(false);
  });

  it('CH4.4 a chosen thumbnail: the card shows it from the public thumbnail route', async () => {
    await renderWith([hubCard({ image_url: '/api/comms-hub/thumbnails/44444444-4444-4444-8444-444444444444/16x9.png?v=t7' })]);
    const img = container.querySelector('.evt-thumb img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/api/comms-hub/thumbnails/44444444-4444-4444-8444-444444444444/16x9.png?v=t7');
    expect(container.querySelector('.evt-thumb-fallback')).toBeNull();
  });

  it('with a registration link and not live: Sign up opens the Eventbrite page', async () => {
    await renderWith([hubCard({ registration_url: 'https://www.eventbrite.com/e/1992498063344' })]);
    const signUp = Array.from(container.querySelectorAll('a')).find((a) => (a.textContent ?? '').trim().startsWith('Sign up'));
    expect(signUp?.getAttribute('href')).toBe('https://www.eventbrite.com/e/1992498063344');
  });

  it('live with a watch path: Watch live replaces Sign up', async () => {
    await renderWith([hubCard({ registration_url: 'https://www.eventbrite.com/e/1992498063344', is_live: true, watch_url: '/portal/live/event/abc' })]);
    const watch = container.querySelector('[data-testid^="evt-watch-"]');
    expect(watch?.getAttribute('href')).toBe('/portal/live/event/abc');
    expect(links().some((t) => t.startsWith('Sign up'))).toBe(false);
  });
});

describe('CH5.3 Watch live opens the stream in the portal player', () => {
  it('a hub card on air: Watch live replaces Sign up and opens that occurrence in the player', async () => {
    await renderWith([hubCard({ registration_url: 'https://www.eventbrite.com/e/1992498063344', is_live: true, live_occurrence_id: 'occ-77' })]);
    const watch = container.querySelector('[data-testid^="evt-watch-"]') as HTMLButtonElement;
    expect(watch.tagName).toBe('BUTTON');
    expect(links().some((t) => t.startsWith('Sign up'))).toBe(false);
    await act(async () => { watch.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(mockOpen).toHaveBeenCalledWith({ occurrenceId: 'occ-77', asset: 'master.m3u8', title: 'Demo Tuesday' });
  });

  it('already playing that stream: says so instead of a second button that would restart it', async () => {
    mockPlayingId = 'occ-77';
    await renderWith([hubCard({ is_live: true, live_occurrence_id: 'occ-77' })]);
    expect(container.querySelector('[data-testid^="evt-watch-"]')).toBeNull();
    expect(container.querySelector('[data-testid^="evt-watching-"]')!.textContent).toBe('Playing now');
  });

  it('not on air (no occurrence id): no Watch live, Sign up stays', async () => {
    await renderWith([hubCard({ registration_url: 'https://www.eventbrite.com/e/1992498063344', is_live: false, live_occurrence_id: null })]);
    expect(container.querySelector('[data-testid^="evt-watch-"]')).toBeNull();
    expect(links().some((t) => t.startsWith('Sign up'))).toBe(true);
  });
});

describe('CH9.5 an Eventbrite event managed in the hub, for a member who already registered', () => {
  // The backend's mergeCards hands the hub card the registration and count of the Eventbrite card it replaced.
  const managed = (o: Partial<OpenHouseView> = {}) => hubCard({
    title: 'AI Open House', registration_url: 'https://www.eventbrite.com/e/ai-open-house-1992498063344',
    image_url: 'https://img.evbuc.com/open-house.jpg', signup_count: 14, ...o,
  });

  it('a registered member sees "You are registered" and "You\'re going", and no Sign up', async () => {
    await renderWith([managed({ is_registered: true })]);
    expect(container.textContent).toContain('You are registered');
    expect(container.querySelector('[data-testid^="evt-going-"]')).not.toBeNull();
    expect(links().some((t) => t.startsWith('Sign up'))).toBe(false);
    expect(container.textContent).toContain('14 signed up');
  });

  it('a member who has not registered still sees Sign up, to the Eventbrite page', async () => {
    await renderWith([managed({ is_registered: false })]);
    const signUp = Array.from(container.querySelectorAll('a')).find((a) => (a.textContent ?? '').trim().startsWith('Sign up'))!;
    expect(signUp.getAttribute('href')).toBe('https://www.eventbrite.com/e/ai-open-house-1992498063344');
    expect(container.textContent).not.toContain('You are registered');
  });
});
