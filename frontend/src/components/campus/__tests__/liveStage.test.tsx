/**
 * C31 (v7 R4): Colaberry Live is the Events Hall's stage. The room's screen becomes the broadcast (state chip with its clock,
 * "COLABERRY LIVE · ON STAGE NOW", the title, the real hall count, Join the audience, 👏 React that sends nothing); the arrival card's
 * tile reads COLABERRY LIVE; the side panel's live card says "Happening now" and "Walk in →"; the hall lists every event.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import type { DiscoveryBroadcast } from '../../../hooks/useBroadcastDiscovery';

let mockBroadcasts: DiscoveryBroadcast[] = [];
jest.mock('../../../contexts/BroadcastDiscoveryContext', () => ({
  ...jest.requireActual('../../../contexts/BroadcastDiscoveryContext'),
  useDiscoveryState: () => ({ broadcasts: mockBroadcasts, disabled: false, unavailable: false, states: ['live'] }),
}));
jest.mock('../../../contexts/BroadcastPlayerContext', () => ({ useBroadcastPlayer: () => ({ open: jest.fn(), close: jest.fn(), session: null }) }));
jest.mock('../../portal/broadcastLaunchCue', () => ({ playChime: () => Promise.resolve('played'), readSoundOptIn: () => false, writeSoundOptIn: () => undefined }));

// eslint-disable-next-line import/first
import { LiveScreen, LiveTile } from '../events/LiveScreen';
// eslint-disable-next-line import/first
import LiveCard from '../home/LiveCard';
// eslint-disable-next-line import/first
import type { CampusLiveNow } from '../campusOnAir';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const T0 = 1_000_000_000_000;
const bc = (o: Partial<DiscoveryBroadcast> = {}): DiscoveryBroadcast => ({
  id: 'occ-1', title: 'Agents in production', access_mode: 'free', editorial_state: 'live', room_id: 'room-7', content_started_at: T0 - 252_000,
  scheduled_start_at: T0 - 300_000, can_watch: true, reason: 'ok', offer_upgrade: false, preview_seconds_remaining: null, ...o,
});
const live = (o: Partial<DiscoveryBroadcast> = {}, state: CampusLiveNow['state'] = 'live'): CampusLiveNow => ({ b: bc(o), state, now: T0, polledAt: T0, building: 'amphi' });

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const q = (s: string) => container.querySelector(s);
const render = (el: React.ReactElement) => act(() => { root.render(el); });

it('the screen is the broadcast: chip with the clock, ON STAGE NOW, the title, the real hall count, Join the audience', () => {
  const joined: string[] = [];
  render(<LiveScreen live={live()} hereCount={3} onJoin={(r) => joined.push(r)} />);
  expect(q('[data-testid="cm-board-onair"]')!.textContent).toContain('ON AIR');
  expect(q('[data-testid="cm-board-onair"]')!.textContent).toContain('4:12');
  expect(container.textContent).toContain('Colaberry Live · On stage now');
  expect(q('[data-testid="cm-board-title"]')!.textContent).toBe('Agents in production');
  expect(container.textContent).toContain('3 people in the hall');
  act(() => { (q('[data-testid="cm-board-join-audience"]') as HTMLButtonElement).click(); });
  expect(joined).toEqual(['/portal/rooms/room-7']);
});

it('👏 React counts locally and sends nothing; no hall count when nobody is here; no Join without a room', () => {
  render(<LiveScreen live={live({ room_id: null })} hereCount={0} onJoin={() => { throw new Error('no join'); }} />);
  expect(q('[data-testid="cm-board-join-audience"]')).toBeNull();
  expect(container.textContent).not.toContain('in the hall');
  act(() => { (q('[data-testid="cm-board-react"]') as HTMLButtonElement).click(); });
  act(() => { (q('[data-testid="cm-board-react"]') as HTMLButtonElement).click(); });
  expect(q('[data-testid="cm-board-react"]')!.textContent).toBe('👏 2');
});

it('the arrival tile reads COLABERRY LIVE with the title and Join the audience', () => {
  const joined: string[] = [];
  render(<LiveTile live={live()} onJoin={(r) => joined.push(r)} />);
  expect(q('[data-testid="cm-arrive-live-tile"]')!.textContent).toContain('COLABERRY LIVE');
  expect(q('[data-testid="cm-arrive-live-tile"]')!.textContent).toContain('this hall’s stage');
  act(() => { (q('[data-testid="cm-arrive-live-tile"] button') as HTMLButtonElement).click(); });
  expect(joined).toEqual(['/portal/rooms/room-7']);
});

it('the side panel card says Happening now and Walk in →', () => {
  mockBroadcasts = [bc()];
  render(<LiveCard title="Agents in production" buildingId="amphi" place="Events Hall" onWalk={() => undefined} />);
  expect(q('[data-testid="cm-cc-live-kicker"]')!.textContent).toBe('Happening now');
  expect(q('[data-testid="cm-cc-live-walk"]')!.textContent).toBe('Walk in →');
});

it('the live card is the first thing in the side panel while on air; the hall lists every event', () => {
  const cc = fs.readFileSync(path.join(__dirname, '../home/CampusConcierge.tsx'), 'utf8');
  const body = cc.indexOf('<div className="cm-cc-body">');
  expect(cc.indexOf('<LiveCard', body)).toBeLessThan(cc.indexOf('data-testid="cm-cc-where"', body));
  expect(cc.split('<LiveCard').length - 1).toBe(1);
  const ap = fs.readFileSync(path.join(__dirname, '../ArrivalPanel.tsx'), 'utf8');
  expect(ap).toContain('Every event happens here · one tap to sign up');
});
