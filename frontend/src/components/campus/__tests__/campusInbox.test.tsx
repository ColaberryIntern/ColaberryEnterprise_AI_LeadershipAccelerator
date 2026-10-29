/**
 * C23 phase 3 (Q6, WP-10): the campus inbox (its three sections from real data, the badge, opening a row, closing), the top bar's
 * 💬 button, and the map's notification pins (unread per building, DMs left out, a press opens the bell).
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { DmConversation } from '../../../services/dmApi';
import type { StaffDesk } from '../campusPeopleApi';
import type { CommunityNotification } from '../../../services/communityApi';

let mockCampus: Record<string, unknown> = {};
jest.mock('../CampusContext', () => ({ useCampus: () => mockCampus }));
const mockMarkRead = jest.fn();
jest.mock('../../../services/dmApi', () => ({ markDmRead: (...a: unknown[]) => { mockMarkRead(...a); return Promise.resolve(); }, myEnrollmentId: () => 'me-1' }));
jest.mock('../../../pages/portal/community/NotificationBell', () => ({ __esModule: true, default: () => <span data-testid="bell" /> }));

// eslint-disable-next-line import/first
import { inboxSections, unreadConversations, badgeText, HERE_MAX } from '../home/inboxModel';
// eslint-disable-next-line import/first
import CampusInbox from '../home/CampusInbox';
// eslint-disable-next-line import/first
import CampusTopBar from '../home/CampusTopBar';
// eslint-disable-next-line import/first
import { registerDmHost } from '../dmHost';
// eslint-disable-next-line import/first
import { pinsFrom } from '../home/useNotifPins';
// eslint-disable-next-line import/first
import { NotifPin, OPEN_BELL_EVENT } from '../art/BuildingBadges';
// eslint-disable-next-line import/first
import { CAMPUS_BUILDINGS } from '../campusMap';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const convo = (roomId: string, peerId: string, peerName: string, unread: boolean, lastMessage = 'hi'): DmConversation =>
  ({ roomId, peerId, peerName, peerAvatar: null, lastMessage, lastAt: '2026-10-29T10:00:00Z', unread });
const desk = (id: 'reese' | 'dara' | 'maya', enrollment: string | null, onDuty = true): StaffDesk =>
  ({ id, name: id[0].toUpperCase() + id.slice(1), title: `${id} desk`, building: 'lecture', ai: true, on_duty: onDuty, enrollment_id: enrollment, opens: null, prompts: [] });
const person = (id: string, name: string, can = true) => ({ enrollment_id: id, display_name: name, avatar_url: null, can_message: can });

describe('inboxSections', () => {
  const desks = [desk('reese', 'reese-1'), desk('dara', 'dara-1', false), desk('maya', null)];
  it('Staff: on-duty desks that take messages (never Maya, never an off-duty desk), with the last message or "<role> · always on"', () => {
    const s = inboxSections({ conversations: [convo('r1', 'reese-1', 'Reese', true, 'Try the lab hint')], desks, presence: null, here: null, me: 'me-1', workplace: false });
    expect(s.staff.map((r) => [r.name, r.preview, r.unread, r.roomId])).toEqual([['Reese', 'Try the lab hint', true, 'r1']]);
    const empty = inboxSections({ conversations: [], desks, presence: null, here: null, me: 'me-1', workplace: false });
    expect(empty.staff[0].preview).toMatch(/· always on$/);
    expect(empty.staff[0].unread).toBe(false);
  });
  it('Recent: every other conversation, in the server order; a desk conversation is not repeated there', () => {
    const s = inboxSections({ conversations: [convo('r2', 'p2', 'Pat', false), convo('r1', 'reese-1', 'Reese', true), convo('r3', 'p3', 'Sam', true)], desks, presence: null, here: null, me: 'me-1', workplace: false });
    expect(s.recent.map((r) => r.name)).toEqual(['Pat', 'Sam']);
  });
  it('In <building> with you: people here you may message, not me, not already talked to, at most four', () => {
    const presence = { lecture: { count: 8, people: [person('me-1', 'Me'), person('p2', 'Pat'), person('n1', 'No', false), { anonymous: true as const },
      person('a', 'A'), person('b', 'B'), person('c', 'C'), person('d', 'D'), person('e', 'E')] } };
    const s = inboxSections({ conversations: [convo('r2', 'p2', 'Pat', false)], desks, presence, here: 'lecture', me: 'me-1', workplace: false });
    expect(s.here.map((r) => r.name)).toEqual(['A', 'B', 'C', 'D']);
    expect(s.here.length).toBe(HERE_MAX);
    expect(inboxSections({ conversations: [], desks, presence, here: null, me: 'me-1', workplace: false }).here).toEqual([]);
  });
  it('the badge counts conversations with unread (the server has no message count), "9+" past nine, nothing at zero', () => {
    expect(unreadConversations([convo('a', 'p', 'P', true), convo('b', 'q', 'Q', false), convo('c', 'r', 'R', true)])).toBe(2);
    expect(unreadConversations(null)).toBe(0);
    expect([badgeText(0), badgeText(3), badgeText(12)]).toEqual([null, '3', '9+']);
  });
});

describe('the inbox popover', () => {
  let container: HTMLDivElement; let root: Root; let unhost: () => void;
  beforeEach(() => {
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    mockMarkRead.mockClear();
    mockCampus = { dmConversations: [convo('r1', 'reese-1', 'Reese', true), convo('r2', 'p2', 'Pat Lee', false)], staffDesks: [desk('reese', 'reese-1')],
      presence: { commons: { count: 1, people: [person('p9', 'Ana Ruiz')] } }, here: 'commons', refreshDms: jest.fn() };
    unhost = registerDmHost();
  });
  afterEach(() => { unhost(); act(() => root.unmount()); container.remove(); });
  const q = (s: string) => container.querySelector(s) as HTMLElement | null;

  it('shows the three sections; the building names the third; nothing renders while closed', () => {
    act(() => { root.render(<CampusInbox open={false} onClose={() => undefined} workplace={false} />); });
    expect(q('[data-testid="cm-inbox"]')).toBeNull();
    act(() => { root.render(<CampusInbox open onClose={() => undefined} workplace={false} />); });
    expect(q('[data-testid="cm-inbox-staff"] h4')!.textContent).toBe('Staff · always on');
    expect(q('[data-testid="cm-inbox-recent"]')!.textContent).toContain('Pat Lee');
    const commons = CAMPUS_BUILDINGS.find((b) => b.id === 'commons')!;
    expect(q('[data-testid="cm-inbox-here"] h4')!.textContent).toBe(`In the ${commons.name} with you`);
    expect(q('[data-testid="cm-inbox-row-reese-1"] .cm-ib-dot')).not.toBeNull();
  });

  it('a row opens the chat through the campus DM host, marks an unread conversation read, and closes', async () => {
    const closed = jest.fn();
    const seen: unknown[] = [];
    const on = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener('te-open-dm', on);
    act(() => { root.render(<CampusInbox open onClose={closed} workplace={false} />); });
    await act(async () => { q('[data-testid="cm-inbox-row-reese-1"]')!.click(); });
    window.removeEventListener('te-open-dm', on);
    expect(seen).toEqual([{ enrollmentId: 'reese-1', name: 'Reese' }]);
    expect(mockMarkRead).toHaveBeenCalledWith('r1');
    expect(closed).toHaveBeenCalled();
  });

  it('a read conversation is not marked again; Esc and a press outside close it, a press on the 💬 button does not', () => {
    const closed = jest.fn();
    act(() => { root.render(<><button type="button" data-testid="cm-stats-messages">x</button><button type="button" data-testid="elsewhere">y</button>
      <CampusInbox open onClose={closed} workplace={false} /></>); });
    act(() => { q('[data-testid="cm-inbox-row-p2"]')!.click(); });
    expect(mockMarkRead).not.toHaveBeenCalled();
    closed.mockClear();
    act(() => { q('[data-testid="cm-stats-messages"]')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(closed).not.toHaveBeenCalled();
    act(() => { q('[data-testid="elsewhere"]')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(closed).toHaveBeenCalledTimes(1);
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(closed).toHaveBeenCalledTimes(2);
  });

  it('nothing to show says so', () => {
    mockCampus = { ...mockCampus, dmConversations: [], staffDesks: [], presence: null };
    act(() => { root.render(<CampusInbox open onClose={() => undefined} workplace={false} />); });
    expect(q('[data-testid="cm-inbox-empty"]')).not.toBeNull();
  });
});

describe('the top bar 💬 button', () => {
  const bar = (audience: 'member' | 'business', unread: number) => renderToStaticMarkup(<MemoryRouter><CampusTopBar audience={audience} online={null} points={null} rung={null} streak={null}
    initials="AM" onList={() => undefined} onFind={() => undefined} onMe={() => undefined} messages={{ unread, open: false, onToggle: () => undefined }} /></MemoryRouter>);
  it('shows the count of conversations with unread; none at zero; never for a business account', () => {
    expect(bar('member', 3)).toContain('data-testid="cm-stats-messages-badge">3<');
    expect(bar('member', 0)).toContain('data-testid="cm-stats-messages"');
    expect(bar('member', 0)).not.toContain('cm-stats-messages-badge');
    expect(bar('business', 3)).not.toContain('cm-stats-messages');
  });
});

describe('notification pins', () => {
  const n = (id: string, type: CommunityNotification['notification_type'], read = false) =>
    ({ id, notification_type: type, source_type: 'post', read, created_at: '2026-10-29T10:00:00Z', actor: null } as unknown as CommunityNotification);
  it('count unread per building from notificationPlace; read ones and DMs (new_message) are left out', () => {
    expect(pinsFrom([n('1', 'mention'), n('2', 'like'), n('3', 'reply', true), n('4', 'new_message'), n('5', 'friend_request')])).toEqual({ commons: 3 });
    expect(pinsFrom([])).toEqual({});
  });
  it('a pin shows the count ("9+" past nine) and a press opens the bell without also opening the building', () => {
    const b = CAMPUS_BUILDINGS.find((x) => x.id === 'commons')!;
    const div = document.createElement('div'); document.body.appendChild(div);
    const r = createRoot(div);
    const building = jest.fn(); const bell = jest.fn();
    window.addEventListener(OPEN_BELL_EVENT, bell);
    act(() => { r.render(<svg><g onClick={building}><NotifPin b={b} n={12} /></g></svg>); });
    const pin = div.querySelector('[data-testid="cm-notif-pin-commons"]')!;
    expect(pin.textContent).toBe('9+');
    expect(pin.getAttribute('aria-hidden')).toBe('true');
    act(() => { pin.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(bell).toHaveBeenCalledTimes(1);
    expect(building).not.toHaveBeenCalled();
    window.removeEventListener(OPEN_BELL_EVENT, bell);
    act(() => r.unmount()); div.remove();
  });
});
