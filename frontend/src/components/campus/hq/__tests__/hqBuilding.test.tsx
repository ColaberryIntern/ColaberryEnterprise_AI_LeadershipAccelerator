/**
 * Campus HQ scenes (H5, H6, H8) and who-is-where. Driven through the real useHq state with reduce motion on, so a ride is
 * instant: the outside, the lobby, the elevator (lit and locked buttons), a floor (rooms open a new tab through the bridge),
 * Esc stepping back, the learner's ground-floor-only view, a Where-to pick riding straight there, and employees on floors.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import type { CampusAudience } from '../../campusMap';
import type { CampusPerson } from '../../campusApi';

const MARKETING = ['dashboard', 'campaigns', 'brands'];
let mockSections: string[] = MARKETING;
let mockGovProjects: { projectId: string; name: string; status: string }[] = [];
jest.mock('../../campusMgmt', () => ({
  useCampusMgmt: () => ({ isMgmt: mockSections.length > 0, label: mockSections.length ? 'Marketing' : null, sections: mockSections, canSection: (s: string) => mockSections.includes(s) }),
}));
jest.mock('../../home/useHomeFacts', () => ({ useHomeFacts: () => ({ firstName: 'Sarbjit', fullName: 'Sarbjit Kaur', initials: 'SK' }) }));
// A member's office floor is fed by their assigned gov projects (membership-scoped). Default none, so the member/explorer
// cases below stay ground-floor-only; one test sets it to prove the office floor lights up.
jest.mock('../../../../services/govProjectPortalApi', () => ({ listMyGovProjects: () => Promise.resolve(mockGovProjects) }));

// eslint-disable-next-line import/first
import { useHq } from '../useHq';
// eslint-disable-next-line import/first
import HqBuilding, { HqArrivalSide } from '../HqBuilding';
// eslint-disable-next-line import/first
import { buildHq, openFloors } from '../hqModel';
// eslint-disable-next-line import/first
import { setHqIntent } from '../hqIntent';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | undefined;
function Harness({ audience, named = [] }: { audience: CampusAudience; named?: CampusPerson[] }) {
  const s = useHq(audience, true);
  return (<>
    <HqBuilding s={s} audience={audience} face="Staff Office" firstName="Sarbjit" desk={{ name: 'Reese', initials: 'RE' }} named={named} onGround={() => undefined} reduceMotion />
    <HqArrivalSide s={s} audience={audience} face="Staff Office" named={named} />
  </>);
}
async function render(audience: CampusAudience, named: CampusPerson[] = []): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { root = createRoot(container); root.render(<Harness audience={audience} named={named} />); });
}
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; container?.remove(); mockSections = MARKETING; mockGovProjects = []; });

const $ = (sel: string) => container.querySelector(sel) as HTMLElement;
const $$ = (sel: string) => Array.from(container.querySelectorAll(sel)) as HTMLElement[];
const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };
const esc = async () => {
  const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  await act(async () => { window.dispatchEvent(e); });
  return e.defaultPrevented;
};
const scene = () => $('[data-testid="cm-hq"]').getAttribute('data-scene');
const marketingHq = () => buildHq((s) => MARKETING.includes(s), true, 'staff');
const numOf = (label: string) => marketingHq().floors.find((f) => f.label === label)!.num;

describe('staff (Marketing): the badge, the ride, the rooms', () => {
  it('outside: the lit bands are exactly the floors the badge opens, and the badge says so', async () => {
    await render('staff');
    expect(scene()).toBe('ext');
    expect($$('[data-lit="1"]')).toHaveLength(openFloors(marketingHq()).length);
    expect($('[data-testid="cm-hq-badge-level"]').textContent).toBe(`OPENS ${openFloors(marketingHq()).length} OF ${marketingHq().floors.length} FLOORS`);
    expect($('[data-testid="cm-hq-badge"]').textContent).toContain('Sarbjit Kaur');
  });

  it('the lobby: concierge, directory, badge reader', async () => {
    await render('staff');
    await click($('[data-testid="cm-hq-walk-in"]'));
    expect(scene()).toBe('lobby');
    expect($('[data-testid="cm-hq-concierge"]').textContent).toMatch(/^CONCIERGE · REESEGood (morning|afternoon|evening), Sarbjit\. Your badge opens 5 floors: Executive Floor, Marketing, Brands…/);
    expect($('[data-testid="cm-hq-reader"]').textContent).toContain('Tap your badge · 5 floors');
    expect($('[data-testid="cm-hq-directory"]').textContent).toContain('Revenue🔒'); // upper case is CSS; the lock is the state
  });

  it('a locked button says why and does not move the cab', async () => {
    await render('staff');
    await click($('[data-testid="cm-hq-walk-in"]'));
    await click($('[data-testid="cm-hq-call"]'));
    const revenue = $(`[data-testid="cm-hq-fb-${numOf('Revenue')}"]`);
    expect(revenue.getAttribute('aria-disabled')).toBe('true');
    await click(revenue);
    expect($('[data-testid="cm-hq-toast"]').textContent).toBe('Your badge doesn’t open Revenue. Ask an admin to add it to your role.');
    expect($('[data-testid="cm-hq-indicator"]').textContent).toBe('G');
    expect(scene()).toBe('cab');
  });

  it('an open button rides to the floor; a room is a new-tab link through the bridge', async () => {
    await render('staff');
    await click($('[data-testid="cm-hq-walk-in"]'));
    await click($('[data-testid="cm-hq-call"]'));
    await click($(`[data-testid="cm-hq-fb-${numOf('Campaigns')}"]`));
    expect(scene()).toBe('floor');
    const offices = $$('[data-testid="cm-hq-office"]') as HTMLAnchorElement[];
    expect(offices.map((a) => a.getAttribute('href'))).toEqual(['/admin/campaigns', '/admin/communications', '/admin/visitors', '/admin/explorer-growth', '/admin/growth-journey']
      .map((p) => `/portal/mgmt-enter?next=${encodeURIComponent(p)}`));
    expect(offices.every((a) => a.target === '_blank' && a.rel === 'noopener noreferrer')).toBe(true);
    // C103: the door carries the room's name, never its /admin address
    expect(offices.every((a) => a.querySelector('code') === null && !(a.textContent ?? '').includes('/admin'))).toBe(true);
    expect($('[data-testid="cm-hq-panel-floor"]').textContent).toContain(`FLOOR ${numOf('Campaigns')}`);
  });

  it('a partial floor shows its locked rooms, aria-disabled, with the reason on click', async () => {
    await render('staff');
    await click($('[data-testid="cm-hq-walk-in"]'));
    await click($('[data-testid="cm-hq-call"]'));
    await click($('[data-testid="cm-hq-fb-PH"]'));
    expect($$('[data-testid="cm-hq-office"]')).toHaveLength(1); // Dashboard
    const locked = $$('[data-testid="cm-hq-office-locked"]');
    expect(locked.length).toBeGreaterThan(0);
    expect(locked.every((b) => b.getAttribute('aria-disabled') === 'true')).toBe(true);
    await click(locked[0]);
    expect($('[data-testid="cm-hq-toast"]').textContent).toContain('is on this floor, but your badge doesn’t open it.');
  });

  it('Esc steps back floor -> elevator -> lobby -> outside, then leaves Esc to the campus', async () => {
    await render('staff');
    await click($('[data-testid="cm-hq-walk-in"]'));
    await click($('[data-testid="cm-hq-call"]'));
    await click($(`[data-testid="cm-hq-fb-${numOf('Brands')}"]`));
    expect(scene()).toBe('floor');
    expect(await esc()).toBe(true); expect(scene()).toBe('cab');
    expect(await esc()).toBe(true); expect(scene()).toBe('lobby');
    expect(await esc()).toBe(true); expect(scene()).toBe('ext');
    expect(await esc()).toBe(false); // outside: the campus closes the building
  });

  it('a Where-to pick rides straight to its floor as the HQ opens', async () => {
    setHqIntent(numOf('Marketing'));
    await render('staff');
    expect(scene()).toBe('floor');
    expect($('[data-testid="cm-hq-panel-floor"]').textContent).toContain('Marketing');
  });
});

describe('members and explorers: the ground floor only', () => {
  it.each(['member', 'explorer'] as const)('%s: every staff button is locked with "Staff only", the guide never names a room', async (aud) => {
    mockSections = [];
    await render(aud);
    expect($('[data-testid="cm-hq-badge-level"]').textContent).toBe('GROUND FLOOR ONLY');
    await click($('[data-testid="cm-hq-walk-in"]'));
    await click($('[data-testid="cm-hq-call"]'));
    const fbs = $$('.fb');
    expect(fbs.filter((b) => b.getAttribute('aria-disabled') !== 'true').map((b) => b.getAttribute('data-testid'))).toEqual(['cm-hq-fb-G']);
    const revenue = $(`[data-testid="cm-hq-fb-${numOf('Revenue')}"]`);
    expect(revenue.textContent).toContain('Staff only');
    await act(async () => { revenue.dispatchEvent(new FocusEvent('focus', { bubbles: false })); revenue.focus(); });
    const guide = $('[data-testid="cm-hq-guide"]').textContent || '';
    expect(guide).toContain('Staff room');
    expect(guide).not.toContain('Leads');
    await click(revenue);
    expect($('[data-testid="cm-hq-toast"]').textContent).toBe('The floors above the lobby are for Colaberry staff.');
  });
});

describe('a gov intern’s own office floor (H4)', () => {
  const flush = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

  it('a member on a gov project gets ONE open floor — their project — linking to the cockpit', async () => {
    mockSections = [];
    mockGovProjects = [{ projectId: 'proj-123', name: 'Saratoga Springs RFP', status: 'building' }];
    await render('member');
    await flush(); // let the membership fetch resolve and the office floor render in

    expect($('[data-testid="cm-hq-badge-level"]').textContent).toMatch(/^OPENS 1 OF \d+ FLOORS$/);
    await click($('[data-testid="cm-hq-walk-in"]'));
    await click($('[data-testid="cm-hq-call"]'));
    const office = $('[data-testid="cm-hq-fb-1"]');
    expect(office.getAttribute('aria-disabled')).toBeNull(); // open, not a locked staff floor
    expect(office.textContent).toContain('Gov Contracts');
    await click(office);
    expect(scene()).toBe('floor');
    const rooms = $$('[data-testid="cm-hq-office"]') as HTMLAnchorElement[];
    expect(rooms.map((a) => a.getAttribute('href'))).toEqual(['/portal/gov-projects/proj-123']); // the cockpit, not the admin bridge
    expect(rooms[0].textContent).toContain('Saratoga Springs RFP');
    // own office rooms open SAME-TAB: a new tab would drop the "view as" session token (sessionStorage is
    // per-tab) and the cockpit would 404. Staff admin rooms keep target=_blank (asserted elsewhere).
    expect(rooms.every((a) => a.getAttribute('target') === null && a.getAttribute('rel') === null)).toBe(true);
  });

  it('a member with no assigned project is unchanged: ground floor only, no office', async () => {
    mockSections = [];
    mockGovProjects = [];
    await render('member');
    await flush();
    expect($('[data-testid="cm-hq-badge-level"]').textContent).toBe('GROUND FLOOR ONLY');
    expect($('[data-testid="cm-hq-fb-1"]')).toBeNull();
  });
});

describe('who is where (employees in the building)', () => {
  const kes: CampusPerson = { enrollment_id: 'kes', display_name: 'Kes Smith', avatar_url: null, hq_path: '/admin/marketing' };
  const sam: CampusPerson = { enrollment_id: 'sam', display_name: 'Sam Lee', avatar_url: null };

  it('staff see each employee on their floor (tower, directory, floors list, door) and the rest in the lobby', async () => {
    await render('staff', [kes, sam]);
    const mk = numOf('Marketing');
    expect($(`[data-testid="cm-hq-band-${mk}"]`).textContent).toContain('👤1');
    expect($(`[data-testid="cm-hq-frow-${mk}"]`).querySelector('[data-testid="cm-hq-people"]')?.getAttribute('aria-label')).toBe('On Marketing: Kes Smith');
    expect($('[data-testid="cm-hq-frow-G"]').querySelector('[data-testid="cm-hq-people"]')?.getAttribute('aria-label')).toBe('In the lobby: Sam Lee');
    await click($('[data-testid="cm-hq-walk-in"]'));
    expect($('[data-testid="cm-hq-lobby-people"]').textContent).toContain('SL');
    await click($('[data-testid="cm-hq-call"]'));
    await click($(`[data-testid="cm-hq-fb-${mk}"]`));
    expect($('[data-testid="cm-hq-office"]').querySelector('[data-testid="cm-hq-people"]')?.getAttribute('aria-label')).toBe('At Marketing: Kes Smith');
  });

  it('a member sees the people in the building, never on a staff floor', async () => {
    mockSections = [];
    await render('member', [kes, sam]);
    expect(container.textContent).not.toContain('👤');
    expect($$('[data-testid="cm-hq-frow-G"] [data-testid="cm-hq-people"]')).toHaveLength(0);
    await click($('[data-testid="cm-hq-walk-in"]'));
    expect($('[data-testid="cm-hq-lobby-people"]').textContent).toContain('KS');
  });
});
