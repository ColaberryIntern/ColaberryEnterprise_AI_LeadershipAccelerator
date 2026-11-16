import React from 'react';
import fs from 'fs';
import path from 'path';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { PlanView, dayLabel } from '../PlanView';
import type { PrepPlan, PrepSegment } from '../careerPrepApi';
import { daysUntil, planCards } from '../logic/planCards';

const seg = (kind: PrepSegment['kind'], title: string, minutes: number, targetSkill?: string): PrepSegment => ({ kind, title, minutes, ...(targetSkill ? { targetSkill } : {}) });
const twenty = [seg('warmup', 'Warm up', 2), seg('learn', 'Learn: Pace and clarity', 4, 'pace_clarity'), seg('try', 'Try it on camera', 8, 'pace_clarity'), seg('pressure', 'Pressure round', 5, 'pace_clarity'), seg('cooldown', 'Cool down', 1)];
const rehearsal = [seg('warmup', 'Warm up', 2), seg('rehearsal', 'Full rehearsal with Cora as the hiring manager', 25), seg('cooldown', 'Cool down and critique', 3)];
const plan: PrepPlan = { kind: 'days', minutes: 20, days: [{ date: '2026-11-16', segments: twenty }, { date: '2026-11-17', segments: rehearsal }] };
const MON = new Date('2026-11-16T18:00:00Z');
const TUE = new Date('2026-11-17T18:00:00Z');
const labels = { pace_clarity: 'Pace and clarity' };

let host: HTMLDivElement | null = null;
let root: Root | null = null;
function mount(el: React.ReactElement): HTMLDivElement {
  const h = document.createElement('div');
  document.body.appendChild(h);
  const r = createRoot(h);
  host = h; root = r;
  act(() => { r.render(el); });
  return h;
}
afterEach(() => { if (root) { const r = root; act(() => r.unmount()); } host?.remove(); host = null; root = null; });
const rows = (h: HTMLElement) => Array.from(h.querySelectorAll('.cp-day')).map((d) => d.querySelector('.cp-day-head b')?.textContent);

describe('Your plan (CP4.2)', () => {
  it('says what to do when there is no plan yet', () => {
    expect(mount(<PlanView plan={null} onStart={jest.fn()} />).textContent).toContain('Pick a plan with Cora');
  });

  it('decides Today from the date: opened on Monday, Monday has Start and Tuesday reads Upcoming', () => {
    const h = mount(<PlanView plan={plan} company="Acme" skillLabels={labels} onStart={jest.fn()} now={MON} />);
    expect(h.querySelector('h3')?.textContent).toBe('Your plan · for Acme');
    expect(rows(h)).toEqual(['Today', 'Tomorrow']);
    expect(h.querySelector('[data-testid="cp-day-0"] button')?.textContent).toBe('Start');
    expect(h.querySelector('[data-testid="cp-day-1"]')?.textContent).toContain('Upcoming');
    expect(h.textContent).toContain('Built from your weakest skills: Pace and clarity.');
  });

  it('opened the next day: yesterday is gone and Start sits on the row that is really today', () => {
    const h = mount(<PlanView plan={plan} skillLabels={labels} onStart={jest.fn()} now={TUE} />);
    expect(rows(h)).toEqual(['Today']);
    expect(h.querySelector('[data-testid="cp-day-0"]')?.textContent).toContain('30 min');
    expect(h.querySelector('[data-testid="cp-day-0"] button')?.textContent).toBe('Start');
  });

  it('a plan whose days are all over says so, with no Start', () => {
    const h = mount(<PlanView plan={plan} onStart={jest.fn()} now={new Date('2026-11-20T18:00:00Z')} />);
    expect(h.textContent).toContain('This plan is finished');
    expect(h.querySelector('[data-testid="cp-start-today"]')).toBeNull();
  });

  it.each([
    ['tonight', { kind: 'tonight', minutes: 15, days: [{ date: '2026-11-16', segments: twenty.slice(0, 3) }] }, 1],
    ['full', { kind: 'full', minutes: 30, days: [{ date: '2026-11-16', segments: rehearsal }] }, 1],
    ['custom', { kind: 'custom', minutes: 20, days: [{ date: '2026-11-16', segments: twenty }] }, 1],
    ['days', plan, 2],
  ] as Array<[string, PrepPlan, number]>)('renders a %s plan', (_n, p, count) => {
    const h = mount(<PlanView plan={p} onStart={jest.fn()} now={MON} />);
    expect(h.querySelectorAll('.cp-day')).toHaveLength(count);
  });

  it('block widths follow the minutes, weak-skill blocks are marked, and each block names its skill in a tooltip shown on focus', () => {
    const h = mount(<PlanView plan={plan} skillLabels={labels} onStart={jest.fn()} now={MON} />);
    const blocks = Array.from(h.querySelectorAll('[data-testid="cp-day-0"] .cp-seg')) as HTMLElement[];
    expect(blocks.map((b) => b.style.flexGrow)).toEqual(['2', '4', '8', '5', '1']);
    expect(blocks.filter((b) => b.classList.contains('is-target'))).toHaveLength(3);
    expect(blocks.every((b) => b.tabIndex === 0)).toBe(true);
    expect(blocks[2].querySelector('.cp-seg-tip')?.textContent).toBe('Try it on camera, 8 min, works on Pace and clarity');
    const css = fs.readFileSync(path.join(__dirname, '..', 'careerPrepRoom.css'), 'utf8');
    expect(css).toContain('.cp-seg:focus .cp-seg-tip{display:block}');
  });

  it("Start today's session starts it", () => {
    const onStart = jest.fn();
    const h = mount(<PlanView plan={plan} onStart={onStart} now={MON} />);
    act(() => (h.querySelector('[data-testid="cp-start-today"]') as HTMLButtonElement).click());
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});

describe('dayLabel and plan cards', () => {
  it('labels days against the Central date', () => {
    expect([dayLabel('2026-11-16', '2026-11-16'), dayLabel('2026-11-17', '2026-11-16'), dayLabel('2026-11-18', '2026-11-16')]).toEqual(['Today', 'Tomorrow', 'Wednesday, Nov 18']);
  });
  const iv = { id: 'i1', source: 'real' as const, company: 'Acme', role: 'R', type: 'technical' as const, target: 75 };
  it('counts Central days to the interview', () => {
    expect(daysUntil('2026-11-19T20:00:00Z', MON)).toBe(3);
    expect(daysUntil('2026-11-17T05:30:00Z', MON)).toBe(0); // 23:30 Monday Central = today
  });
  it('recommends the days plan first, then tonight, full rehearsal and build my own', () => {
    const c = planCards({ ...iv, startsAt: '2026-11-19T20:00:00Z' }, MON);
    expect(c.map((x) => x.id)).toEqual(['plan:days', 'plan:tonight', 'plan:full', 'plan:custom']);
    expect(c[0]).toMatchObject({ title: '3 days to the interview', badge: 'Recommended' });
  });
  it('recommends one focused session when the interview is today, and a 4-day plan for practice', () => {
    expect(planCards({ ...iv, startsAt: '2026-11-16T22:00:00Z' }, MON)[0].id).toBe('plan:tonight');
    expect(planCards({ ...iv, source: 'practice' }, MON)[0].title).toBe('A 4-day practice plan');
  });
});
