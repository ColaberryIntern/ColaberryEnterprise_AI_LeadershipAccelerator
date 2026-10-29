/**
 * C8 notifications: every notification type has a campus place (exhaustive), and the bell uses it ONLY while the campus is
 * active. With the campus off the classic bell is unchanged: posts go to /portal/community, friendship and DM do nothing.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import type { CommunityNotification } from '../../../services/communityApi';

let mockActive = false;
const mockDoor: Array<string> = [];
let mockItems: CommunityNotification[] = [];
jest.mock('../CampusContext', () => ({
  useCampus: () => ({ active: mockActive, enterThroughDoor: (route: string) => { mockDoor.push(route); } }),
}));
jest.mock('../../../services/communityApi', () => ({
  fetchNotifications: () => Promise.resolve(mockItems),
  fetchUnreadNotificationCount: () => Promise.resolve(0),
  markNotificationRead: () => Promise.resolve(),
  markAllNotificationsRead: () => Promise.resolve(),
}));

// eslint-disable-next-line import/first
import NotificationBell from '../../../pages/portal/community/NotificationBell';
// eslint-disable-next-line import/first
import { notificationPlace, FEED_PLACE, PEOPLE_PLACE } from '../campusNotify';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type NType = CommunityNotification['notification_type'];
const TYPES: Array<[NType, 'post' | 'comment' | 'friendship' | 'dm', string]> = [
  ['mention', 'post', '/portal/community'],
  ['reply', 'comment', '/portal/community'],
  ['like', 'post', '/portal/community'],
  ['friend_request', 'friendship', '/portal/community/people'],
  ['friend_accepted', 'friendship', '/portal/community/people'],
  ['new_message', 'dm', '/portal/community/people'],
];
const notif = (t: NType, source: string): CommunityNotification => ({
  id: 'n-' + t, notification_type: t, source_type: source, read: true, created_at: new Date().toISOString(),
  actor: { display_name: 'Sam', avatar_url: null },
} as unknown as CommunityNotification);

describe('notificationPlace', () => {
  it.each(TYPES)('%s goes to the commons, %s -> %s', (t, _s, route) => {
    expect(notificationPlace(t)).toEqual({ buildingId: 'commons', route });
  });
  it('a type this build does not know yet still lands on the feed', () => {
    expect(notificationPlace('something_new' as NType)).toBe(FEED_PLACE);
    expect(PEOPLE_PLACE.route).toBe('/portal/community/people');
  });
});

let container: HTMLDivElement;
let root: Root;
let assigned: string[] = [];
const realLocation = window.location;
beforeEach(() => {
  mockDoor.length = 0; assigned = [];
  Object.defineProperty(window, 'location', { configurable: true, value: { ...realLocation, assign: (u: string) => { assigned.push(u); } } });
});
afterEach(() => {
  if (root) act(() => root.unmount()); container?.remove();
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
});

async function clickItem(t: NType, source: string): Promise<void> {
  mockItems = [notif(t, source)];
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { root = createRoot(container); root.render(<NotificationBell />); });
  await act(async () => { (container.querySelector('.cm-bell-btn') as HTMLButtonElement).click(); });
  for (let i = 0; i < 3; i++) await act(async () => { await Promise.resolve(); });
  await act(async () => { (container.querySelector('.cm-notif') as HTMLButtonElement).click(); });
}

describe('the bell, campus off (classic, unchanged)', () => {
  it.each(TYPES)('%s', async (t, source) => {
    mockActive = false;
    await clickItem(t, source);
    expect(mockDoor).toEqual([]);
    expect(assigned).toEqual(source === 'friendship' || source === 'dm' ? [] : ['/portal/community']);
  });
});

describe('the bell, campus on: through the door to the place', () => {
  it.each(TYPES)('%s -> %s', async (t, source, route) => {
    mockActive = true;
    await clickItem(t, source);
    expect(mockDoor).toEqual([route]);
    expect(assigned).toEqual([]);
  });
});

describe("C23 (rule R10): the bell closing without a pick", () => {
  it("tells the campus home to recenter, from the bell again or a press outside; a pick does not", async () => {
    mockActive = true;
    mockItems = [notif("mention", "post")];
    const dismissed: number[] = [];
    container = document.createElement("div");
    document.body.appendChild(container);
    await act(async () => { root = createRoot(container); root.render(<NotificationBell onDismissed={() => dismissed.push(1)} />); });
    const bell = () => container.querySelector(".cm-bell-btn") as HTMLButtonElement;
    await act(async () => { bell().click(); });
    await act(async () => { bell().click(); });
    expect(dismissed).toEqual([1]);
    await act(async () => { bell().click(); });
    await act(async () => { document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); });
    expect(dismissed).toEqual([1, 1]);
    await act(async () => { bell().click(); });
    for (let i = 0; i < 3; i++) await act(async () => { await Promise.resolve(); });
    await act(async () => { (container.querySelector(".cm-notif") as HTMLButtonElement).click(); });
    expect(dismissed).toEqual([1, 1]);
  });
});
