// C120: the My Progress celebration: the pure mapping (myProgressView), the answer check (asMyProgress), and the screen in both
// states (before and after an upload), with the privacy rule that nothing outside the answer is ever drawn.
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import MyProgressScreen from '../progress/MyProgressScreen';
import { asMyProgress, type MyProgress } from '../progress/myProgressApi';
import {
  backgroundChips, backgroundLine, cheerLine, resumeFileProblem, ringPct, shortDate, statusLine, storyState, winLine, yearsLabel,
} from '../progress/myProgressView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
function render(el: React.ReactElement): { container: HTMLDivElement } { act(() => root.render(el)); return { container: host }; }
const byId = (id: string): HTMLElement => { const el = host.querySelector<HTMLElement>(`[data-testid="${id}"]`); if (!el) throw new Error(`no ${id}`); return el; };
const screen = {
  getByTestId: byId,
  queryByTestId: (id: string): HTMLElement | null => host.querySelector<HTMLElement>(`[data-testid="${id}"]`),
  getByText: (t: string): HTMLElement => { const el = Array.from(host.querySelectorAll<HTMLElement>('*')).find((e) => e.textContent === t && e.children.length === 0); if (!el) throw new Error(`no ${t}`); return el; },
};

const BASE: MyProgress = {
  firstName: 'Ali',
  week: { current: 1, total: 12, cohortName: 'Cohort 12', cardsDoneThisWeek: 2, cardsThisWeek: 6 },
  points: { total: 1379, level: 4, levelName: 'AI Enabled II', builder: 93, learning: 130, community: 35 },
  latestWin: { title: 'Prompt patterns lab', date: '2026-11-04T18:00:00.000Z' },
  milestones: { earned: [], next: { key: 'project_complete', label: 'First build complete', detail: 'Every story of a published build verified' } },
  background: null, goal: null, hasResume: false,
};
const AFTER: MyProgress = { ...BASE, hasResume: true, goal: 'Lead an AI program',
  background: { title: 'Director of Operations', company: 'Acme', industry: 'Logistics', years: '14', skills: ['SQL', 'Lean'], education: 'MBA · Rice University' } };

describe('myProgressView', () => {
  it('the hero lines', () => {
    expect(cheerLine('Ali')).toBe('Ali, this is your progress.');
    expect(cheerLine(null)).toBe('This is your progress.');
    expect(statusLine(BASE)).toBe('Lv 4 · AI Enabled II · 1,379 pts · 2 of 6 cards done this week');
    expect(statusLine({ ...BASE, week: null, points: { ...BASE.points, level: null, levelName: null } })).toBe('1,379 pts');
    expect(statusLine({ ...BASE, week: { ...BASE.week!, cardsThisWeek: 0 } })).toBe('Lv 4 · AI Enabled II · 1,379 pts');
  });
  it('the ring: share of the weeks, clamped; no week is 0', () => {
    expect([ringPct(BASE.week), ringPct({ ...BASE.week!, current: 12 }), ringPct({ ...BASE.week!, current: 20 }), ringPct(null)]).toEqual([8, 100, 100, 0]);
  });
  it('the win and its date (Central), or the invitation', () => {
    expect(winLine(BASE.latestWin)).toBe('Prompt patterns lab · Nov 4');
    expect(winLine(null)).toBe('Your first finished card shows up here.');
    expect(shortDate('nope')).toBeNull();
  });
  it('the background line and chips use only what the resume gave', () => {
    expect(backgroundLine(AFTER.background!)).toBe('Director of Operations at Acme · Logistics · 14 years');
    expect(backgroundLine({ title: null, company: null, industry: null, years: null, skills: [], education: null })).toBeNull();
    expect(backgroundLine({ title: null, company: 'Acme', industry: null, years: '1', skills: [], education: null })).toBe('Acme · 1 year');
    expect(backgroundChips(AFTER.background!)).toEqual(['SQL', 'Lean', 'MBA · Rice University']);
    expect([yearsLabel('10+'), yearsLabel('about ten'), yearsLabel(null)]).toEqual(['10+ years', 'about ten', null]);
  });
  it('the story card follows hasResume', () => {
    expect([storyState(BASE), storyState(AFTER)]).toEqual(['upload', 'background']);
  });
  it('the upload refuses what Settings refuses', () => {
    expect(resumeFileProblem({ name: 'cv.PDF', size: 1000 })).toBeNull();
    expect(resumeFileProblem({ name: 'cv.exe', size: 10 })).toMatch(/Accepted/);
    expect(resumeFileProblem({ name: 'cv', size: 10 })).toMatch(/Accepted/);
    expect(resumeFileProblem({ name: 'cv.pdf', size: 3 * 1024 * 1024 + 1 })).toMatch(/3 MB/);
  });
});

describe('asMyProgress', () => {
  it('accepts the answer and refuses a malformed one', () => {
    expect(asMyProgress(BASE)).toEqual(BASE);
    expect(() => asMyProgress(null)).toThrow();
    expect(() => asMyProgress({ points: {} })).toThrow();
  });
});

describe('MyProgressScreen', () => {
  it('before an upload: the hero, XP, win, next milestone and "Tell us your story"', () => {
    render(<MyProgressScreen p={BASE} />);
    expect(screen.getByTestId('cm-board-title').textContent).toBe('Ali, this is your progress.');
    expect(screen.getByTestId('cm-mp-week').textContent).toBe('Week 1 · Cohort 12');
    expect(screen.getByTestId('cm-mp-ring').getAttribute('aria-label')).toBe('Week 1 of 12');
    expect(screen.getByText('Learning XP').previousSibling?.textContent).toBe('130');
    expect(screen.getByTestId('cm-mp-milestones').textContent).toContain('Next: First build complete');
    expect(screen.getByTestId('cm-mp-story-upload').textContent).toContain('+25 pts');
    expect(screen.getByTestId('cm-mp-upload').textContent).toBe('Upload resume or LinkedIn PDF');
    expect(screen.queryByTestId('cm-mp-story-background')).toBeNull();
  });
  it('after an upload: where you came from and where you are going', () => {
    render(<MyProgressScreen p={{ ...AFTER, milestones: { earned: [{ key: 'curriculum_complete:curriculum', label: 'Curriculum complete', date: null }], next: null } }} />);
    expect(screen.getByTestId('cm-mp-background').textContent).toBe('Director of Operations at Acme · Logistics · 14 years');
    expect(screen.getByTestId('cm-mp-goal').textContent).toBe('Where you are going: Lead an AI program');
    expect(screen.getByTestId('cm-mp-milestones').textContent).toContain('Curriculum complete');
    expect(screen.queryByTestId('cm-mp-upload')).toBeNull();
  });
  it('no cohort: no ring, still a celebration', () => {
    render(<MyProgressScreen p={{ ...BASE, week: null, firstName: null }} />);
    expect(screen.queryByTestId('cm-mp-ring')).toBeNull();
    expect(screen.getByTestId('cm-mp-week').textContent).toBe('Your progress');
  });
  it('never says "free", and every tile and chip is a fit box (C117)', () => {
    const { container } = render(<MyProgressScreen p={AFTER} />);
    expect(container.textContent?.toLowerCase()).not.toMatch(/\bfree\b/);
    container.querySelectorAll('.tile, .c').forEach((el: Element) => expect(el.hasAttribute('data-fit-box')).toBe(true));
  });
});
