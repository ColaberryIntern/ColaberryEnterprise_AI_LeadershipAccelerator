/**
 * C64: the 5-minute alerts on screen. A member gets one cheer five minutes before an event, with Walk there (the map walks to the
 * Meeting Rooms); the next tick does not repeat it; an Explorer gets none; the toast host renders only where asked (`host`).
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import type { Cheer } from '../campusCheerBus';

const mockOpenMap = jest.fn();
let mockAudience = 'member';
let mockEvents: unknown[] = [];
jest.mock('../CampusContext', () => ({ useCampus: () => ({ active: true, settings: { workplaceNames: false, reduceMotion: true }, openMap: mockOpenMap }) }));
jest.mock('../useCampusAudience', () => ({ useCampusAudience: () => ({ audience: mockAudience, ready: true }) }));
jest.mock('../events/EventSignup', () => ({ useCampusEvents: (enabled: boolean) => (enabled ? mockEvents : null) }));
jest.mock('../events/weekdaySessions', () => ({ ...jest.requireActual('../events/weekdaySessions'), useWeekdaySessions: () => ({ intern: false, sessions: [] }) }));
jest.mock('../CampusCheer', () => ({ __esModule: true, default: () => <div data-testid="cheer-host" /> }));
// eslint-disable-next-line import/first
import CampusAlerts from '../events/CampusAlerts';
// eslint-disable-next-line import/first
import { onCheer } from '../campusCheerBus';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
let cheers: Cheer[] = [];
let off: () => void = () => undefined;
const NOW = Date.parse('2026-10-26T13:00:00Z');
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  window.localStorage.clear();
  cheers = []; off = onCheer((c) => cheers.push(c));
  mockOpenMap.mockReset(); mockAudience = 'member';
  mockEvents = [{ id: 'e1', title: 'Open House', starts_at: new Date(NOW + 4 * 60_000).toISOString(), is_registered: false }];
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); off(); jest.useRealTimers(); });

it('a member: one alert with Walk there, not repeated on the next tick', () => {
  act(() => { root.render(<CampusAlerts />); });
  expect(cheers).toHaveLength(1);
  expect(cheers[0]).toMatchObject({ title: 'Open House starts in 4 minutes', detail: 'Meeting Rooms', action: { label: 'Walk there' } });
  act(() => { cheers[0].action!.run(); });
  expect(mockOpenMap).toHaveBeenCalledWith('commons');
  act(() => { jest.advanceTimersByTime(15_000); });
  expect(cheers).toHaveLength(1);
  expect(container.querySelector('[data-testid="cheer-host"]')).toBeNull();
});

it('an event more than five minutes away waits for its moment', () => {
  mockEvents = [{ id: 'e2', title: 'Build Day', starts_at: new Date(NOW + 6 * 60_000).toISOString(), is_registered: true }];
  act(() => { root.render(<CampusAlerts />); });
  expect(cheers).toHaveLength(0);
  act(() => { jest.advanceTimersByTime(75_000); });
  expect(cheers.map((c) => c.title)).toEqual(['Build Day starts in 5 minutes']);
});

it('an Explorer gets no alerts', () => {
  mockAudience = 'explorer';
  act(() => { root.render(<CampusAlerts />); });
  act(() => { jest.advanceTimersByTime(15_000); });
  expect(cheers).toHaveLength(0);
});

it('a reload does not alert twice (remembered in this browser)', () => {
  act(() => { root.render(<CampusAlerts />); });
  act(() => root.unmount());
  root = createRoot(container);
  act(() => { root.render(<CampusAlerts />); });
  expect(cheers).toHaveLength(1);
});

it('with host, it also renders the toast (portal pages; the campus home has its own)', () => {
  act(() => { root.render(<CampusAlerts host />); });
  expect(container.querySelector('[data-testid="cheer-host"]')).not.toBeNull();
});
