/**
 * C5 people on the campus: tokens beside buildings, Who's here chips, the person card (Message / Wave / Walk over)
 * and the dm host. createRoot + act, as the other campus suites (no @testing-library in this repo).
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

let mockWave: (to: string) => Promise<{ sent: boolean; reason: string }> = async () => ({ sent: true, reason: 'sent' });
let mockWaveCalls: string[] = [];
jest.mock('../campusPeopleApi', () => ({
  postWave: (to: string) => { mockWaveCalls.push(to); return mockWave(to); },
  fetchStaffDesks: () => Promise.resolve([]), fetchConversationsQuiet: () => Promise.resolve([]),
}));

// eslint-disable-next-line import/first
import PersonCard from '../PersonCard';
// eslint-disable-next-line import/first
import PeekCard from '../PeekCard';
// eslint-disable-next-line import/first
import WhoIsHere from '../WhoIsHere';
// eslint-disable-next-line import/first
import CampusWorld from '../CampusWorld';
// eslint-disable-next-line import/first
import { registerDmHost, hasDmHost } from '../dmHost';
// eslint-disable-next-line import/first
import { tokensFor, desksForBuilding, TOKENS_PER_BUILDING } from '../campusPeople';
// eslint-disable-next-line import/first
import { campusBuildingsFor } from '../useCampusView';
// eslint-disable-next-line import/first
import type { CampusPerson } from '../campusApi';
// eslint-disable-next-line import/first
import type { PersonCardTarget } from '../CampusContext';
// eslint-disable-next-line import/first
import type { StaffDesk } from '../campusPeopleApi';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mia: CampusPerson = { enrollment_id: 'e-mia', display_name: 'Mia Lopez', avatar_url: null, can_message: true };
const ana: CampusPerson = { enrollment_id: 'e-ana', display_name: 'Ana Reyes', avatar_url: 'data:image/png;base64,AAAA', can_message: false };

let container: HTMLDivElement;
let root: Root;
async function render(ui: React.ReactElement): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { root = createRoot(container); root.render(<MemoryRouter>{ui}</MemoryRouter>); });
}
let unhost: (() => void) | null = null;
beforeEach(() => { mockWave = async () => ({ sent: true, reason: 'sent' }); mockWaveCalls = []; });
afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); root = undefined as unknown as Root; unhost?.(); unhost = null; });
const q = (sel: string) => container.querySelector(sel);
const click = async (sel: string) => { await act(async () => { q(sel)!.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); }; // an SVG chip has no .click()

describe('pure helpers', () => {
  it('tokensFor lists named people only, capped at 3, with the rest as +N', () => {
    const people = [mia, ana, { anonymous: true as const }, { ...mia, enrollment_id: 'c' }, { ...mia, enrollment_id: 'd' }, { ...mia, enrollment_id: 'e' }];
    const t = tokensFor({ count: 6, people });
    expect(t.shown.map((p) => p.enrollment_id)).toEqual(['e-mia', 'e-ana', 'c']);
    expect(t.more).toBe(2);
    expect(TOKENS_PER_BUILDING).toBe(3);
    expect(tokensFor(undefined)).toEqual({ shown: [], more: 0 });
  });

  it('desksForBuilding keeps a building\'s desks and drops Maya for members and business viewers', () => {
    const desks = [{ id: 'reese', building: 'commons' }, { id: 'maya', building: 'gate' }] as StaffDesk[];
    expect(desksForBuilding(desks, 'commons', 'member').map((d) => d.id)).toEqual(['reese']);
    expect(desksForBuilding(desks, 'gate', 'member')).toEqual([]);
    expect(desksForBuilding(desks, 'gate', 'business')).toEqual([]);
    expect(desksForBuilding(desks, 'gate', 'explorer').map((d) => d.id)).toEqual(['maya']);
    expect(desksForBuilding(desks, 'gate', 'staff').map((d) => d.id)).toEqual(['maya']);
  });
});

describe('dm host', () => {
  it('counts registrations, and a double unregister cannot go below zero', () => {
    expect(hasDmHost()).toBe(false);
    const a = registerDmHost(); const b = registerDmHost();
    a(); a();
    expect(hasDmHost()).toBe(true);
    b();
    expect(hasDmHost()).toBe(false);
  });
});

describe('the peek (WP-3, in place of the person tokens; no generated faces)', () => {
  it('initials when there is no photo, the uploaded photo otherwise, private people as Learner; a press picks that person', async () => {
    const picked: string[] = [];
    await render(<PeekCard buildingName="Library" count={3} people={[mia, ana, { anonymous: true }]} x={100} y={100} desks={[]} word="classmates"
      onPerson={(p) => picked.push(p.enrollment_id)} onWalk={() => undefined} onClose={() => undefined} />);
    const rows = container.querySelectorAll('[data-testid="cm-peek-person"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('.av')?.textContent).toBe('ML');
    expect(rows[0].querySelector('img')).toBeNull();
    expect(rows[1].querySelector('img')?.getAttribute('src')).toBe(ana.avatar_url);
    expect(container.querySelectorAll('[data-testid="cm-peek-anon"]')).toHaveLength(1);
    await act(async () => { (rows[1] as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(picked).toEqual(['e-ana']);
  });
});

describe('Who\'s here chips', () => {
  it('open the person card when onPick is given; stay plain without it (C4)', async () => {
    const picked: string[] = [];
    await render(<WhoIsHere presence={{ count: 2, people: [mia, { anonymous: true }] }} error={false} onPick={(p) => picked.push(p.display_name)} />);
    await click('.cm-person-btn');
    expect(picked).toEqual(['Mia Lopez']);
    act(() => root.unmount()); container.remove();
    await render(<WhoIsHere presence={{ count: 1, people: [mia] }} error={false} />);
    expect(q('.cm-person-btn')).toBeNull();
  });
});

describe('PersonCard', () => {
  const card = (p: CampusPerson, extra: Partial<React.ComponentProps<typeof PersonCard>> = {}) =>
    <PersonCard person={p} buildingLabel="Library" onClose={() => undefined} onWalkOver={() => undefined} {...extra} />;

  it('cannot message: Message and Wave are disabled with the reason, never hidden', async () => {
    await render(card(ana));
    expect(q('[data-testid="cm-message-blocked"]')).not.toBeNull();
    expect(q('[data-testid="cm-message"]')).toBeNull();
    expect((q('[data-testid="cm-wave"]') as HTMLButtonElement).disabled).toBe(true);
    expect(q('[data-testid="cm-message-note"]')?.textContent).toBe('Messages are open to people in your cohort.');
    await click('[data-testid="cm-wave"]');
    expect(mockWaveCalls).toEqual([]);
  });

  it('an older server without can_message reads as "cannot"', async () => {
    const { can_message: _c, ...old } = mia; // eslint-disable-line @typescript-eslint/no-unused-vars
    await render(card(old as CampusPerson));
    expect(q('[data-testid="cm-message-blocked"]')).not.toBeNull();
  });

  it('with a DM host, Message dispatches te-open-dm (the single DM entry point)', async () => {
    unhost = registerDmHost();
    const seen: unknown[] = [];
    const on = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener('te-open-dm', on);
    await render(card(mia));
    await click('[data-testid="cm-message"]');
    window.removeEventListener('te-open-dm', on);
    expect(seen).toEqual([{ enrollmentId: 'e-mia', name: 'Mia Lopez' }]);
  });

  it('without a DM host (legacy layout), Message is a link to Today, not a dead button', async () => {
    await render(card(mia));
    expect(q('[data-testid="cm-message"]')).toBeNull();
    expect(q('[data-testid="cm-message-today"]')?.getAttribute('href')).toBe('/portal/today');
  });

  it('Wave is single flight: two clicks in the same tick (before the button can disable) send one request', async () => {
    let release: () => void = () => undefined;
    mockWave = () => new Promise((res) => { release = () => res({ sent: true, reason: 'sent' }); });
    await render(card(mia));
    const btn = q('[data-testid="cm-wave"]') as HTMLButtonElement;
    await act(async () => { btn.click(); btn.click(); }); // one act: no re-render between the clicks
    expect(mockWaveCalls).toEqual(['e-mia']);
    await act(async () => { release(); });
    expect(q('[data-testid="cm-wave-status"]')?.textContent).toBe('You waved at Mia Lopez.');
  });

  it('already waved (server dedup) says so; a refusal shows the server message', async () => {
    mockWave = async () => ({ sent: false, reason: 'already_waved' });
    await render(card(mia));
    await click('[data-testid="cm-wave"]');
    expect(q('[data-testid="cm-wave-status"]')?.textContent).toBe('You waved a moment ago.');
    mockWave = async () => { throw new Error('You can only message people in your cohort'); };
    await click('[data-testid="cm-wave"]');
    expect(q('[data-testid="cm-wave-status"]')?.textContent).toBe('You can only message people in your cohort');
  });

  it('initials when no photo', async () => {
    await render(card(mia));
    expect(q('[data-testid="cm-person-initials"]')?.textContent).toBe('ML');
  });
});

describe('on the map: chip -> peek -> card -> Walk over', () => {
  function Harness(): React.ReactElement {
    const [pc, setPc] = React.useState<PersonCardTarget | null>(null);
    return (
      <CampusWorld buildings={campusBuildingsFor('member')} audience="member" hasFullAccess workplaceNames={false} reduceMotion
        onExit={() => undefined} onNavigate={() => undefined}
        presence={{ library: { count: 3, people: [mia, { anonymous: true }] } }} presenceError={false}
        staffDesks={[]} personCard={pc} onOpenPerson={setPc} onClosePerson={() => setPc(null)} />
    );
  }
  it('a name in the peek opens that person\'s card; Walk over closes it and walks to their building, whose card opens', async () => {
    await render(<Harness />);
    await click('[data-testid="cm-count-library"]');
    await click('[data-testid="cm-peek-person"]');
    expect(q('[data-testid="cm-person-card"]')?.getAttribute('data-enrollment')).toBe('e-mia');
    expect(q('[data-testid="cm-card"]')).toBeNull();
    await click('[data-testid="cm-walk-over"]');
    expect(q('[data-testid="cm-person-card"]')).toBeNull();
    expect(q('[data-testid="cm-card"]')?.getAttribute('data-building')).toBe('library');
  });

  it('the viewer is never listed (the server never lists them) and anonymous people stay unnamed', async () => {
    await render(<Harness />);
    await click('[data-testid="cm-count-library"]');
    expect(container.querySelectorAll('[data-testid="cm-peek-person"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid="cm-peek-anon"]')).toHaveLength(1);
  });
});

describe('the avatar never takes a click', () => {
  it('campus.css makes the decorative avatar ignore the pointer (it starts on the Main Gate)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const css: string = require('fs').readFileSync(require('path').join(__dirname, '..', 'campus.css'), 'utf8');
    expect(css.replace(/\s+/g, '')).toContain('.cm-avatar{pointer-events:none}');
  });
});
