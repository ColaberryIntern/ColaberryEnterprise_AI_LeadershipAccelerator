/**
 * C5 AI staff desks: labelled as AI, initials in an AI ring (never a face), on duty vs "Back soon", Maya "opens soon",
 * a suggested question sent once. C21 (v6 D3): Maya sits in Admissions and is seen by every audience.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

let mockOpenCalls: string[] = [];
let mockSendCalls: Array<[string, string]> = [];
let mockOpen: (id: string) => Promise<string> = async () => 'room-1';
jest.mock('../../../services/dmApi', () => ({
  openDm: (id: string) => { mockOpenCalls.push(id); return mockOpen(id); },
  sendDmMessage: (roomId: string, content: string) => { mockSendCalls.push([roomId, content]); return Promise.resolve({}); },
  myEnrollmentId: () => 'me',
}));
jest.mock('../campusPeopleApi', () => ({ postWave: () => Promise.resolve({ sent: true, reason: 'sent' }), fetchStaffDesks: () => Promise.resolve([]), fetchConversationsQuiet: () => Promise.resolve([]) }));
// C21: the Admissions room reads "Your account" (Settings' sources); offline here, so its wall board simply does not draw
jest.mock('../../../services/portalEnrollmentApi', () => ({ fetchEnrollment: () => Promise.reject(new Error('offline')) }));
jest.mock('../../../services/subscriptionApi', () => ({ fetchSubscription: () => Promise.reject(new Error('offline')) }));

// eslint-disable-next-line import/first
import StaffDesk from '../StaffDesk';
// eslint-disable-next-line import/first
import CampusWorld from '../CampusWorld';
// eslint-disable-next-line import/first
import { registerDmHost } from '../dmHost';
// eslint-disable-next-line import/first
import { campusBuildingsFor } from '../useCampusView';
// eslint-disable-next-line import/first
import type { StaffDesk as Desk } from '../campusPeopleApi';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const reese: Desk = { id: 'reese', name: 'Reese', title: 'Mentor desk', building: 'commons', ai: true, on_duty: true, enrollment_id: 'r-1', opens: null, prompts: ['Q one', 'Q two', 'Q three'] };
const reeseOff: Desk = { ...reese, on_duty: false, enrollment_id: null, prompts: [] };
const maya: Desk = { id: 'maya', name: 'Maya', title: 'Welcome desk', building: 'gate', ai: true, on_duty: false, enrollment_id: null, opens: 'C6', prompts: [] };

let container: HTMLDivElement;
let root: Root | undefined;
let unhost: (() => void) | null = null;
async function render(ui: React.ReactElement): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { root = createRoot(container); root.render(<MemoryRouter>{ui}</MemoryRouter>); });
}
beforeEach(() => { mockOpenCalls = []; mockSendCalls = []; mockOpen = async () => 'room-1'; });
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; container?.remove(); unhost?.(); unhost = null; });
const q = (sel: string) => container.querySelector(sel);

describe('a desk', () => {
  it('on duty with a DM host: the AI STAFF tag, initials in the gold ring, Message and three quoted questions (WP-5)', async () => {
    unhost = registerDmHost();
    await render(<StaffDesk desk={reese} />);
    expect(q('.cm-pc-tag')?.textContent).toBe('AI STAFF');
    expect(q('.cm-pc-av.is-staff')?.textContent).toBe('R');
    expect(q('img')).toBeNull();
    expect(q('[data-testid="cm-desk-status-reese"]')?.textContent).toBe('On duty 24/7 · replies in seconds');
    expect(q('[data-testid="cm-desk-message-reese"]')).not.toBeNull();
    expect(Array.from(container.querySelectorAll('.cm-pc-q button')).map((b) => b.textContent)).toEqual(['“Q one”', '“Q two”', '“Q three”']);
  });

  it('a question opens the conversation and sends that question ONCE, then shows the dock via te-open-dm', async () => {
    unhost = registerDmHost();
    let release: (v: string) => void = () => undefined;
    mockOpen = () => new Promise((res) => { release = res; });
    const seen: unknown[] = [];
    const on = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener('te-open-dm', on);
    await render(<StaffDesk desk={reese} />);
    const btn = q('.cm-pc-q button') as HTMLButtonElement;
    await act(async () => { btn.click(); btn.click(); });
    await act(async () => { release('room-9'); });
    window.removeEventListener('te-open-dm', on);
    expect(mockOpenCalls).toEqual(['r-1']);
    expect(mockSendCalls).toEqual([['room-9', 'Q one']]);
    expect(seen).toEqual([{ enrollmentId: 'r-1', name: 'Reese' }]);
  });

  it('off duty: "Back soon", no Message, no questions', async () => {
    unhost = registerDmHost();
    await render(<StaffDesk desk={reeseOff} />);
    expect(q('[data-testid="cm-desk-status-reese"]')?.textContent).toBe('Back soon');
    expect(q('[data-testid="cm-desk-message-reese"]')).toBeNull();
    expect(q('.cm-desk-prompts')).toBeNull();
  });

  it('Maya: "opens soon", no actions', async () => {
    unhost = registerDmHost();
    await render(<StaffDesk desk={maya} />);
    expect(q('[data-testid="cm-desk-status-maya"]')?.textContent).toBe("Maya's desk opens soon");
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('on duty but no DM host on this page: no dead buttons, a pointer to Today', async () => {
    await render(<StaffDesk desk={reese} />);
    expect(q('[data-testid="cm-desk-message-reese"]')).toBeNull();
    expect(container.textContent).toContain('Open Today to message Reese.');
  });
});

describe('desks inside building cards', () => {
  const world = (audience: 'member' | 'business' | 'explorer', buildings = campusBuildingsFor(audience), at: 'gate' | 'admissions' = 'gate') => (
    <CampusWorld buildings={buildings} audience={audience} hasFullAccess workplaceNames={false} reduceMotion initialTarget={at}
      onExit={() => undefined} onNavigate={() => undefined} staffDesks={[reese, maya]} personCard={null} onOpenPerson={() => undefined} onClosePerson={() => undefined} />
  );

  it('C21: an Explorer finds Maya in Admissions (an older server\'s gate desk counts there): her chip in Who\'s here opens her card', async () => {
    await render(world('explorer', undefined, 'admissions'));
    expect(q('[data-testid="cm-card"]')?.getAttribute('data-building')).toBe('admissions');
    await act(async () => { (q('[data-testid="cm-who-staff-maya"]') as HTMLButtonElement).click(); });
    expect(q('[data-testid="cm-staff-card"] [data-testid="cm-desk-maya"]')).not.toBeNull();
  });

  it('C21 (v6 D3): a business viewer sees Maya in Admissions too, and nobody sees her at the gate', async () => {
    await render(world('business', undefined, 'admissions'));
    expect(q('[data-testid="cm-card"]')?.getAttribute('data-building')).toBe('admissions');
    expect(q('[data-testid="cm-who-staff-maya"]')).not.toBeNull();
    act(() => root!.unmount()); root = undefined; container.remove();
    await render(world('explorer'));
    expect(q('[data-testid="cm-card"]')?.getAttribute('data-building')).toBe('gate');
    expect(q('[data-testid="cm-who-staff-maya"]')).toBeNull();
  });

  it('a member never renders Maya either (same independent check)', async () => {
    const withGate = [...campusBuildingsFor('member'), campusBuildingsFor('explorer').find((b) => b.id === 'gate')!];
    await render(world('member', withGate));
    expect(q('[data-testid="cm-desk-maya"]')).toBeNull();
    expect(q('[data-testid="cm-who-staff-maya"]')).toBeNull();
  });
});
