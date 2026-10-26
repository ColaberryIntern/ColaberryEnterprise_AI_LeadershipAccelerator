/**
 * C54 (v13 T6): Today as the Explorer's home base. Only an Explorer on the campus gets the additions; the pass lists come from the
 * campus's own access table (never hard-coded); Ask Maya shows while her desk is on duty; Take the tour opens the campus and starts
 * the Explorer tour.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

let mockActive = true;
let mockAudience = 'explorer';
let mockDesks: { id: string; on_duty: boolean }[] = [{ id: 'maya', on_duty: true }];
const mockStartTour = jest.fn();
jest.mock('../../../../components/campus/CampusContext', () => ({
  useCampus: () => ({ active: mockActive, settings: { workplaceNames: false }, staffDesks: mockDesks, startTour: mockStartTour }),
}));
jest.mock('../../../../components/campus/useCampusView', () => {
  const actual = jest.requireActual('../../../../components/campus/useCampusView');
  return { ...actual, useCampusView: () => actual.campusViewFor(mockAudience, actual.PREVIEW_SIGNALS[mockAudience]) };
});
jest.mock('../../../../components/campus/AskMaya', () => ({ __esModule: true, default: () => <button type="button" data-testid="cm-ask-maya">Ask Maya about enrolling</button> }));
// eslint-disable-next-line import/first
import { ExplorerRailCards, passLists, useExplorerHomeBase } from '../ExplorerHomeBase';
// eslint-disable-next-line import/first
import { campusViewFor, PREVIEW_SIGNALS } from '../../../../components/campus/useCampusView';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
let path = '';
function Where(): null { const l = useLocation(); path = l.pathname; return null; }
function Probe(): React.ReactElement { return <span data-testid="probe">{String(useExplorerHomeBase())}</span>; }
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); mockStartTour.mockReset(); });
afterEach(() => { act(() => root.unmount()); container.remove(); mockActive = true; mockAudience = 'explorer'; mockDesks = [{ id: 'maya', on_duty: true }]; });
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

it('the pass card: both lists and Ask Maya while she is on duty', () => {
  show(<ExplorerRailCards />);
  expect(q('[data-testid="te-explorer-pass"]')!.textContent).toContain('Your explorer pass');
  expect(q('[data-testid="te-pass-open"]')!.textContent).toContain('Library');
  expect(q('[data-testid="te-pass-peek"]')!.textContent).toContain('Classroom');
  expect(q('[data-testid="cm-ask-maya"]')).not.toBeNull();
  mockDesks = [{ id: 'maya', on_duty: false }];
  show(<ExplorerRailCards />);
  expect(q('[data-testid="cm-ask-maya"]')).toBeNull();
});

it('Take the tour opens the campus and starts the Explorer tour', () => {
  show(<ExplorerRailCards />);
  act(() => { q('[data-testid="te-take-tour"]')!.click(); });
  expect(path).toBe('/portal/campus');
  expect(mockStartTour).toHaveBeenCalledTimes(1);
});
