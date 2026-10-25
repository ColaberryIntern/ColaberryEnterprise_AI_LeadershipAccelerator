/**
 * C21 (v6 D3): the Admissions building, rendered.
 *  - the room's board: four plan tiles priced from the claims registry for the campus route ($149, $1,200, Scoped on a call; the
 *    Explorer tile "No card needed"), never $199; Compare plans opens the plans page, Talk to a person opens the booking sheet;
 *  - the meeting table (your spot) opens the booking sheet;
 *  - /portal/plans: four cards with their one action, "Your account" from Settings' sources, "Talk to a person";
 *  - the arrival card's service rows for a member, with Maya always here and the tour with her;
 *  - the walk: from the gate straight to its door, and from its door out through the gate.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

let mockSubscription: unknown = { plans: [], needs_subscription: true, class_start: null, available_credit_cents: 0, subscription: null };
jest.mock('../../../services/portalEnrollmentApi', () => ({
  fetchEnrollment: () => Promise.resolve({ status: 'enrolled', enrolled_cohort: { id: 'c1', name: 'July 2026', start_date: '2026-07-14', core_day: null, core_time: null, seats_left: null }, cohorts: [], default_cohort_id: null, paid: true }),
}));
jest.mock('../../../services/subscriptionApi', () => ({ fetchSubscription: () => Promise.resolve(mockSubscription) }));
const mockStartTour = jest.fn();
jest.mock('../CampusContext', () => ({ ...jest.requireActual('../CampusContext'), useCampus: () => ({ ...jest.requireActual('../CampusContext').useCampus(), startTour: () => mockStartTour() }) }));
jest.mock('../useCampusView', () => ({ ...jest.requireActual('../useCampusView'), useCampusView: () => ({ audience: 'member', buildings: [], accessOf: () => 'open', ready: true }) }));
jest.mock('../../../pages/portal/today/PortalShell', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div> }));

import PlansBoard from '../admissions/PlansBoard';
import AdmissionsServices from '../admissions/AdmissionsServices';
import PlansPage from '../../../pages/portal/plans/PlansPage';
import Room3D from '../interior/room3d/Room3D';
import { spotOf } from '../interior/roomSpots';
import { BOOK_CALL_EVENT } from '../admissions/admissionsCallApi';
import { routeTo, doorOf, START } from '../walkPath';
import { campusGraph } from '../walkGraph';
import { CAMPUS_BUILDINGS } from '../campusMap';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
const t = (s: string) => container.querySelector(`[data-testid="${s}"]`) as HTMLElement | null;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); mockStartTour.mockReset(); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const booked = () => { const fn = jest.fn(); window.addEventListener(BOOK_CALL_EVENT, fn); return () => { window.removeEventListener(BOOK_CALL_EVENT, fn); return fn.mock.calls.length; }; };

it('the board: four tiles priced from the claims registry, never $199; Compare plans and Talk to a person', async () => {
  const section = jest.fn();
  act(() => { root.render(<PlansBoard onSection={section} />); });
  expect(t('cm-board-plan-explorer')!.textContent).toContain('No card needed');
  expect(t('cm-board-plan-individual')!.textContent).toContain('$149');
  expect(t('cm-board-plan-team')!.textContent).toContain('$1,200');
  expect(t('cm-board-plan-services')!.textContent).toContain('Scoped on a call');
  expect(container.textContent).not.toContain('$199');
  expect(container.textContent).not.toMatch(/\bfree\b/i);
  t('cm-board-primary')!.click();
  expect(section).toHaveBeenCalledTimes(1);
  const done = booked();
  t('cm-board-talk')!.click();
  expect(done()).toBe(1);
});

it('the room: Admissions draws the plans board, and the meeting table opens the booking sheet', () => {
  const done = booked();
  const you = { key: 'you', name: 'You', initials: 'YO', photo: null, you: true, tone: 'red' };
  act(() => { root.render(<Room3D id="admissions" name="Admissions" people={[]} you={you} summary={null} spot={spotOf('admissions')} firstName="ADA" sectionRoute="/portal/plans" onOpen={() => undefined} reduceMotion />); });
  expect(t('cm-board-plans')).not.toBeNull();
  (container.querySelector('.cm-r3-spot') as HTMLElement).click();
  expect(done()).toBe(1);
});

it('/portal/plans: four cards with one action each, Your account, Talk to a person', async () => {
  await act(async () => { root.render(<MemoryRouter><PlansPage /></MemoryRouter>); });
  await flush();
  for (const id of ['explorer', 'individual', 'team', 'services']) expect(t(`cm-plan-${id}`)).not.toBeNull();
  expect(t('cm-plan-action-explorer')).toBeNull(); // a member is past the Explorer tier: no button
  expect(t('cm-plan-action-individual')!.textContent).toBe('Activate');
  expect(t('cm-plan-action-services')!.textContent).toBe('📅 Book a call');
  expect(container.textContent).not.toContain('$199');
  expect(t('cm-plans-account')!.textContent).toContain('Enrolled · July 2026');
  expect(t('cm-plans-account')!.textContent).toContain('PlanNone yet');
});

it('/portal/plans with an active annual plan: "Your current tier" on One license', async () => {
  mockSubscription = { plans: [], needs_subscription: false, class_start: null, available_credit_cents: 0,
    subscription: { plan: 'annual', status: 'active', amount_cents: 178800, started_at: null, current_period_end: null, canceled: false, cancel_reason: null, access_until: null, next_payment: null } };
  await act(async () => { root.render(<MemoryRouter><PlansPage /></MemoryRouter>); });
  await flush();
  expect(t('cm-plan-action-individual')!.textContent).toBe('Your current tier');
  expect(t('cm-plans-account')!.textContent).toContain('Annual membership');
  mockSubscription = { plans: [], needs_subscription: true, class_start: null, available_credit_cents: 0, subscription: null };
});

it('the arrival card: a member\'s service rows, Maya always here, and the tour with her', async () => {
  const go = jest.fn();
  await act(async () => { root.render(<AdmissionsServices audience="member" onNavigate={go} />); });
  await flush();
  expect(Array.from(container.querySelectorAll('[data-testid^="cm-adm-row-"]')).map((e) => e.getAttribute('data-testid'))).toEqual(
    ['cm-adm-row-individual', 'cm-adm-row-redeem', 'cm-adm-row-billing', 'cm-adm-row-services']);
  (t('cm-adm-row-billing')!.querySelector('button') as HTMLElement).click();
  expect(go).toHaveBeenCalledWith('/portal/settings?tab=subscription');
  expect(t('cm-adm-maya')!.textContent).toContain('always here');
  t('cm-adm-tour')!.click();
  expect(mockStartTour).toHaveBeenCalledTimes(1);
});

it('the walk: from the gate to its door, and from its door out through the gate; the graph joins it at the gate', () => {
  const adm = CAMPUS_BUILDINGS.find((b) => b.id === 'admissions')!;
  const lib = CAMPUS_BUILDINGS.find((b) => b.id === 'library')!;
  expect(doorOf(adm)).toEqual({ x: 614, y: 674 });
  expect(routeTo(START, adm)).toEqual([{ x: 614, y: 674 }]);
  const atDoor = { ...doorOf(adm), zone: 'gate' as const };
  expect(routeTo(atDoor, lib)[0]).toEqual({ x: 500, y: 640 }); // out through the gate first, never across the grass
  expect(campusGraph([...CAMPUS_BUILDINGS]).edges).toContainEqual(['gate', 'door_admissions']);
});
