/**
 * C11b interiors: the prototype's rooms (layouts, perspective, spots, the back door sign), drawn with the people really here and
 * nothing invented; the inside layer's glass for members-only buildings, its tag, count, Step outside and person picks.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { P, ROOMS, spotsFor, youSpotFor, doorLabel } from '../interior/roomModel';
import BuildingInterior from '../interior/BuildingInterior';
import CampusInside from '../interior/CampusInside';
import CampusWorld from '../CampusWorld';
import { MemoryRouter } from 'react-router-dom';
import { CAMPUS_BUILDINGS } from '../campusMap';
import type { CampusPresence } from '../campusApi';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const b = (id: string) => CAMPUS_BUILDINGS.find((x) => x.id === id)!;

describe('roomModel: the prototype geometry', () => {
  it('P maps the back wall and the front of the floor', () => {
    expect(P(0, 0)).toEqual({ x: 170, y: 330, s: 0.62 });
    expect(P(1, 1)).toEqual({ x: 1000, y: 620, s: 1.17 });
  });

  it('every layout has its prototype spot count, and the fill order is fixed', () => {
    expect(spotsFor('rows').all).toHaveLength(24);
    expect(spotsFor('tables').all).toHaveLength(20);
    expect(spotsFor('desks').all).toHaveLength(12);
    expect(spotsFor('benches').all).toHaveLength(12);
    expect(spotsFor('circle').all).toHaveLength(11);
    expect(spotsFor('standing').all).toHaveLength(12);
    expect(spotsFor('rows').order).toEqual(spotsFor('rows').order);
  });

  it('you take the next free seat in a seated room, else front and center', () => {
    expect(youSpotFor('rows', 0)).toEqual(spotsFor('rows').order[0]);
    expect(youSpotFor('tables', 3)).toEqual({ u: 0.5, t: 0.92, pose: 'stand' });
  });

  it('every building but the gate has a room', () => {
    for (const x of CAMPUS_BUILDINGS) expect(!!ROOMS[x.id]).toBe(x.id !== 'gate');
  });

  it('the door sign says where it goes for this viewer', () => {
    expect(doorLabel('member', 'open')).toBe('YOUR PAGE →');
    expect(doorLabel('explorer', 'locked')).toBe('MEMBERS ONLY 🔒');
    expect(doorLabel('explorer', 'demo')).toBe('DEMO MODE →');
    expect(doorLabel('business', 'open')).toBe('TEAM VIEW →');
  });
});

describe('the rooms as drawn', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  const you = { key: 'you', name: 'You', initials: 'AM', photo: null, you: true, tone: 'red' };

  it('draws the people really here (initials or their photo), you in front, the desk, and the door sign', () => {
    const people = [
      { key: 'a', name: 'Avery Stone', initials: 'AS', photo: null, tone: 'x' },
      { key: 'b', name: 'Blake Rivers', initials: 'BR', photo: '/img/b.png', tone: 'x' },
    ];
    act(() => { root.render(<BuildingInterior id="commons" people={people} you={you} doorSign="YOUR PAGE →" name="Community Lounge" onAir={false} desk={{ name: 'Reese', initials: 'R', title: 'Mentor desk' }} />); });
    expect(container.querySelectorAll('[data-testid="cm-inside-person"]')).toHaveLength(2);
    expect(container.querySelector('[data-testid="cm-inside-you"]')!.textContent).toContain('You');
    expect(container.querySelector('[data-testid="cm-inside-person"] image')!.getAttribute('href')).toBe('/img/b.png');
    expect(container.querySelector('[data-testid="cm-inside-desk"]')!.textContent).toContain('Ask Reese anything');
    expect(container.querySelector('[data-testid="cm-inside-door"]')!.textContent).toBe('YOUR PAGE →');
  });

  it('never shows the prototype\'s invented facts (events, dates, client names, tickets)', () => {
    for (const id of Object.keys(ROOMS)) {
      act(() => { root.render(<BuildingInterior id={id as never} people={[]} you={you} doorSign="YOUR PAGE" name="Room" onAir={false} />); });
      const text = container.textContent ?? '';
      for (const fake of ['PropertyPulse', 'Medical Courier', 'PromiseGuard', 'STORY-0', 'OCT 29', 'Week 5', 'THURSDAY', 'Open House']) expect(text).not.toContain(fake);
      // WP-5: the arcade shows your best this week, or a dash when there is none; never an invented score
      if (id === 'arcade') expect(text.match(/BEST (—|[\d,]+)/g)).toEqual(['BEST —', 'BEST —', 'BEST —']);
    }
  });

  it('the Classroom screen says ON AIR only while it is on air, and names the room as this viewer sees it', () => {
    act(() => { root.render(<BuildingInterior id="lecture" people={[]} you={you} doorSign="" name="Training Room" onAir={false} />); });
    expect(container.textContent).toContain('Training Room');
    expect(container.textContent).not.toContain('ON AIR');
    act(() => { root.render(<BuildingInterior id="lecture" people={[]} you={you} doorSign="" name="Training Room" onAir />); });
    expect(container.textContent).toContain('ON AIR');
  });
});

describe('the inside layer', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  const presence: CampusPresence = { commons: { count: 3, people: [{ enrollment_id: 'e1', display_name: 'Avery Stone', avatar_url: null }, { anonymous: true }, { anonymous: true }] } };

  it('counts everyone, draws only the named, and a person opens their card; Step outside closes', () => {
    const picked: string[] = []; let out = 0;
    act(() => { root.render(<CampusInside building={b('commons')} buildingName="Community Lounge" audience="member" access="open" presence={presence} onAir={false}
      reduceMotion onStepOutside={() => { out += 1; }} onPickPerson={(p) => picked.push(p.display_name)} />); });
    expect(container.querySelector('[data-testid="cm-inside-count"]')!.textContent).toContain('3 here');
    expect(container.querySelectorAll('[data-testid="cm-inside-person"]')).toHaveLength(1);
    act(() => { container.querySelector('[data-testid="cm-inside-person"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(picked).toEqual(['Avery Stone']);
    act(() => { (container.querySelector('[data-testid="cm-inside-out"]') as HTMLButtonElement).click(); });
    expect(out).toBe(1);
    expect(container.querySelector('.cm-inside')!.getAttribute('class')).toContain('is-reduced');
  });

  it('an Explorer looks into a members-only building through the glass, and sees DEMO / PREVIEW tags', () => {
    act(() => { root.render(<CampusInside building={b('testing')} buildingName="Cert Prep Center" audience="explorer" access="locked" onAir={false} reduceMotion={false} onStepOutside={() => undefined} />); });
    expect(container.querySelector('.cm-inside')!.getAttribute('class')).toContain('is-locked');
    expect(container.textContent).toContain('looking in through the glass');
    act(() => { root.render(<CampusInside building={b('studio')} buildingName="Project Studio" audience="explorer" access="demo" onAir={false} reduceMotion={false} onStepOutside={() => undefined} />); });
    expect(container.querySelector('[data-testid="cm-inside-tag"]')!.textContent).toContain('DEMO MODE');
  });

  it('the Main Gate has no inside', () => {
    act(() => { root.render(<CampusInside building={b('gate')} buildingName="Main Gate" audience="explorer" access="open" onAir={false} reduceMotion onStepOutside={() => undefined} />); });
    expect(container.querySelector('[data-testid="cm-inside"]')).toBeNull();
  });
});

describe('the door reveal', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => { jest.useFakeTimers(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); jest.useRealTimers(); });

  const mountWorld = (reduceMotion: boolean, entered: string[]) => act(() => {
    root.render(<MemoryRouter><CampusWorld buildings={[...CAMPUS_BUILDINGS]} audience="member" hasFullAccess workplaceNames={false} reduceMotion={reduceMotion}
      onExit={() => undefined} onNavigate={() => undefined} onEnterRoom={(r) => entered.push(r)} /></MemoryRouter>);
  });
  const arriveAtCommons = () => {
    act(() => { container.querySelector('[data-testid="cm-bld-commons"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    act(() => { jest.advanceTimersByTime(5000); });
  };

  it('with motion on, the main action walks through the back door under "Opening..." before the page opens', () => {
    const entered: string[] = [];
    mountWorld(false, entered);
    arriveAtCommons();
    expect(container.querySelector('[data-testid="cm-inside"]')).not.toBeNull();
    act(() => { container.querySelector('[data-testid="cm-arrive-cta"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 })); });
    expect(container.querySelector('[data-testid="cm-inside"]')!.getAttribute('class')).toContain('is-going');
    expect(container.querySelector('[data-testid="cm-inside-going"]')!.textContent).toContain(b('commons').primary.route);
    expect(entered).toEqual([]);
    act(() => { jest.advanceTimersByTime(1499); }); // WP-5: first the walk to the back door (600 ms), then the zoom
    expect(entered).toEqual([]);
    act(() => { jest.advanceTimersByTime(1); });
    expect(entered).toEqual([b('commons').primary.route]);
  });

  it('with reduce motion, the page opens at once (no reveal)', () => {
    const entered: string[] = [];
    mountWorld(true, entered);
    arriveAtCommons();
    act(() => { container.querySelector('[data-testid="cm-arrive-cta"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 })); });
    expect(container.querySelector('[data-testid="cm-inside-going"]')).toBeNull();
    expect(entered).toEqual([b('commons').primary.route]);
  });
});

describe('the business district rooms (prototype INTERIOR_BIZ)', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  const you = { key: 'you', name: 'You', initials: 'AM', photo: null, you: true, tone: 'red' };
  it('the Career Center has the board table and the client wall; the Project Studio has desk pods and the sprint wall', () => {
    expect(ROOMS.career).toEqual({ layout: 'board', feature: 'clients', dark: false });
    expect(ROOMS.studio).toEqual({ layout: 'pods', feature: 'sprint', dark: false });
    expect(spotsFor('board').all).toHaveLength(10);
    expect(spotsFor('pods').all).toHaveLength(12);
    act(() => { root.render(<BuildingInterior id="career" people={[]} you={you} doorSign="TEAM VIEW" name="Partner Office" onAir={false} />); });
    expect(container.textContent).toContain('CLIENT ENGAGEMENTS');
    act(() => { root.render(<BuildingInterior id="studio" people={[]} you={you} doorSign="YOUR PAGE" name="Project Studio" onAir={false} />); });
    expect(container.textContent).toContain('SPRINT BOARD');
    expect(container.textContent).not.toMatch(/STORY-|TASK-|PropertyPulse|Lakeshore/);
  });
});
