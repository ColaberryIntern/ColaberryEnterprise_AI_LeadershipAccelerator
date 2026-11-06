/**
 * C54 (v13 T6): Today as the Explorer's home base. Only an Explorer on the campus gets the additions; the pass lists come from the
 * campus's own access table (never hard-coded); Message Maya (C121) shows while her desk is on duty; Take the tour opens the campus and starts
 * the Explorer tour.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

let mockActive = true;
let mockAudience = 'explorer';
const MAYA_ON = { id: 'maya', name: 'Maya', on_duty: true, enrollment_id: 'maya-1' };
let mockDesks: { id: string; name: string; on_duty: boolean; enrollment_id: string | null }[] = [MAYA_ON];
const mockStartTour = jest.fn();
jest.mock('../../../../components/campus/CampusContext', () => ({
  useCampus: () => ({ active: mockActive, settings: { workplaceNames: false }, staffDesks: mockDesks, startTour: mockStartTour }),
}));
jest.mock('../../../../components/campus/useCampusView', () => {
  const actual = jest.requireActual('../../../../components/campus/useCampusView');
  return { ...actual, useCampusView: () => actual.campusViewFor(mockAudience, actual.PREVIEW_SIGNALS[mockAudience]) };
});
// eslint-disable-next-line import/first
import { ExplorerRailCards, passLists, useExplorerHomeBase } from '../ExplorerHomeBase';
// eslint-disable-next-line import/first
import { registerDmHost } from '../../../../components/campus/dmHost';
// eslint-disable-next-line import/first
import { campusViewFor, PREVIEW_SIGNALS } from '../../../../components/campus/useCampusView';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
let path = '';
function Where(): null { const l = useLocation(); path = l.pathname; return null; }
function Probe(): React.ReactElement { return <span data-testid="probe">{String(useExplorerHomeBase())}</span>; }
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); mockStartTour.mockReset(); });
afterEach(() => { act(() => root.unmount()); container.remove(); mockActive = true; mockAudience = 'explorer'; mockDesks = [MAYA_ON]; });
const show = (el: React.ReactElement) => act(() => { root.render(<MemoryRouter initialEntries={['/portal/today']}><Where /><Routes><Route path="*" element={el} /></Routes></MemoryRouter>); });
const q = (s: string) => container.querySelector(s) as HTMLElement | null;

it('the pass lists follow the campus access table: open vs preview/demo, never the gate', () => {
  const v = campusViewFor('explorer', PREVIEW_SIGNALS.explorer);
  const { open, peek } = passLists(v.buildings, v.accessOf, false);
  const states = Object.fromEntries(v.buildings.map((b) => [b.name, v.accessOf(b)]));
  expect(open.length + peek.length).toBe(v.buildings.length - 1);
  expect(open.every((n) => states[n] === 'open')).toBe(true);
  expect(peek.every((n) => states[n] !== 'open')).toBe(true);
  expect(peek).toEqual(expect.arrayContaining(['Classroom', 'Project Studio']));
  expect([...open, ...peek]).not.toContain('Main Gate');
});

it('only an Explorer on the campus gets the additions', () => {
  show(<Probe />);
  expect(q('[data-testid="probe"]')!.textContent).toBe('true');
  mockAudience = 'member';
  show(<Probe />);
  expect(q('[data-testid="probe"]')!.textContent).toBe('false');
  mockAudience = 'explorer'; mockActive = false;
  show(<Probe />);
  expect(q('[data-testid="probe"]')!.textContent).toBe('false');
});

it('the pass card: both lists and (C121) Message Maya in the shared chat while she is on duty', () => {
  const unhost = registerDmHost();
  const opened: unknown[] = [];
  const on = (e: Event) => opened.push((e as CustomEvent).detail);
  window.addEventListener('te-open-dm', on);
  show(<ExplorerRailCards />);
  expect(q('[data-testid="te-explorer-pass"]')!.textContent).toContain('Your explorer pass');
  expect(q('[data-testid="te-pass-open"]')!.textContent).toContain('Library');
  expect(q('[data-testid="te-pass-peek"]')!.textContent).toContain('Classroom');
  expect(q('[data-testid="cm-ask-maya"]')).toBeNull(); // the website widget is gone from the portal
  act(() => { q('[data-testid="te-message-maya"]')!.click(); });
  expect(opened).toEqual([{ enrollmentId: 'maya-1', name: 'Maya' }]);
  mockDesks = [{ ...MAYA_ON, on_duty: false, enrollment_id: null }];
  show(<ExplorerRailCards />);
  expect(q('[data-testid="te-message-maya"]')).toBeNull();
  window.removeEventListener('te-open-dm', on);
  unhost();
  mockDesks = [MAYA_ON];
  show(<ExplorerRailCards />);
  expect(q('[data-testid="te-message-maya"]')).toBeNull(); // no DM host on the page: no dead button
});

it('Take the tour opens the campus and starts the Explorer tour', () => {
  show(<ExplorerRailCards />);
  act(() => { q('[data-testid="te-take-tour"]')!.click(); });
  expect(path).toBe('/portal/campus');
  expect(mockStartTour).toHaveBeenCalledTimes(1);
});
