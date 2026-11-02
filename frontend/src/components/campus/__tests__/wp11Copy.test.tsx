/**
 * C23 WP-11 (CAMPUS_DESIGN_PARITY_PROMPT.md: "match the design's strings except where they state invented facts"): the copy pass's
 * changes that carry behaviour, not just words. A failed presence read on a page's rail says so (it used to read as an empty room),
 * Workplace names reach the quad label and a member's map badge, a partner's lead names their real company, and the HQ gate line.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { CAMPUS_BUILDINGS } from '../campusMap';
import type { CampusBuilding } from '../campusMap';
import { leadFor, wd } from '../home/conciergeCopy';
import type { LeadInput } from '../home/conciergeCopy';
import { QuadAndPaths } from '../art/grounds';
import CampusGate from '../home/CampusGate';
import CampusRail from '../CampusRail';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const B = CAMPUS_BUILDINGS as CampusBuilding[];
let mockCampusState: Record<string, unknown> = {};
jest.mock('../CampusContext', () => ({ ...jest.requireActual('../CampusContext'), useCampus: () => mockCampusState }));
jest.mock('../useCampusView', () => ({
  useCampusView: () => ({ buildings: jest.requireActual('../campusMap').CAMPUS_BUILDINGS, audience: 'member', accessOf: () => 'open' }),
}));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const render = (el: React.ReactElement) => act(() => { root.render(el); });
const q = (s: string) => container.querySelector(s);

describe('Workplace words', () => {
  it('a member\'s "Class in" badge reads "Session in" with Workplace names on, and is untouched with them off', () => {
    expect(wd('Class in 1d 3h', true)).toBe('Session in 1d 3h');
    expect(wd('Class in 1d 3h', false)).toBe('Class in 1d 3h');
    expect(wd('First class in a while', true)).toBe('First class in a while'); // only the badge's capitalized "Class in"
  });

  it('the quad is the Plaza with Workplace names on', () => {
    render(<svg><QuadAndPaths doors={[]} workplace /></svg>);
    expect(q('[data-testid="cm-quad-label"]')!.textContent).toBe('THE PLAZA');
    render(<svg><QuadAndPaths doors={[]} /></svg>);
    expect(q('[data-testid="cm-quad-label"]')!.textContent).toBe('THE QUAD');
  });
});

describe('a partner\'s lead', () => {
  const base: LeadInput = { audience: 'business', moment: 'now', firstName: 'Elaine', workplace: false, buildings: B, liveAt: null, next: null, dutyNames: [], tourStops: 6, onCampus: 2 };
  it('names the real company when the server has one, and stays plain without it (never an invented name)', () => {
    expect(leadFor({ ...base, company: 'Acme Logistics' })).toBe('Here is where your Acme Logistics team learns and builds. Take the six-stop tour, or explore on your own.');
    expect(leadFor({ ...base, company: null })).toBe('Here is where your team learns and builds. Take the six-stop tour, or explore on your own.');
    expect(leadFor(base)).toBe('Here is where your team learns and builds. Take the six-stop tour, or explore on your own.');
  });
});

describe('the HQ gate line (Workplace names, member)', () => {
  const gate = (online: number | null) => render(<CampusGate audience="member" firstName="Ali" fullName="Ali M" initials="AM" rung={null} points={null}
    streak={null} streakPoints={null} online={online} workplace hasTour reduceMotion now={new Date()} onEnter={() => undefined} />);
  it('counts real colleagues in right now, and says only that HQ is open when nobody is', () => {
    gate(3);
    expect(q('[data-testid="cm-gate-sub"]')!.textContent).toBe('HQ is open. 3 colleagues are in right now.');
    gate(1);
    expect(q('[data-testid="cm-gate-sub"]')!.textContent).toBe('HQ is open. 1 colleague is in right now.');
    gate(0);
    expect(q('[data-testid="cm-gate-sub"]')!.textContent).toBe('HQ is open.');
  });
});

describe('the page rail\'s Here now', () => {
  const rail = (presence: unknown, presenceError: boolean) => {
    mockCampusState = { active: true, settings: { workplaceNames: false }, presence, presenceError, staffDesks: [], planStops: [], openPersonCard: jest.fn(), openMap: jest.fn(),
      enterThroughDoor: jest.fn(), tourProgress: { paused: null, toured: true }, resumeTour: jest.fn(), dismissTour: jest.fn() };
    render(<MemoryRouter initialEntries={['/portal/library']}><CampusRail /></MemoryRouter>);
  };
  it('says it cannot load who is here when presence failed, instead of an empty room', () => {
    rail(null, true);
    expect(q('[data-testid="cm-rail-down"]')!.textContent).toBe('Can’t load who’s here right now.');
    expect(container.textContent).not.toContain('Just you in here.');
  });
  it('says it is just you when presence loaded and nobody else is there', () => {
    rail({ library: { count: 0, people: [] } }, false);
    expect(container.textContent).toContain('Just you in here.');
    expect(q('[data-testid="cm-rail-down"]')).toBeNull();
  });
});
