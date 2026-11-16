import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { PlanView } from '../PlanView';
import type { PrepPlan } from '../careerPrepApi';
import { daysUntil, planCards } from '../logic/planCards';

const seg = (kind: PrepPlan['days'][number]['segments'][number]['kind'], title: string, minutes: number, targetSkill?: string) => ({ kind, title, minutes, ...(targetSkill ? { targetSkill } : {}) });
const plan: PrepPlan = {
  kind: 'days', minutes: 20,
  days: [
    { date: '2026-11-16', label: 'Today', segments: [seg('warmup', 'Warm up', 2), seg('learn', 'Learn: Pace and clarity', 4, 'pace_clarity'), seg('try', 'Try it on camera', 8, 'pace_clarity'), seg('pressure', 'Pressure round', 5, 'pace_clarity'), seg('cooldown', 'Cool down', 1)] },
    { date: '2026-11-17', label: 'Tomorrow', segments: [seg('warmup', 'Warm up', 2), seg('rehearsal', 'Full rehearsal with Cora as the hiring manager', 25), seg('cooldown', 'Cool down and critique', 3)] },
  ],
};

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

describe('Your plan (CP4.2)', () => {
  it('says what to do when there is no plan yet', () => {
    expect(mount(<PlanView plan={null} onStart={jest.fn()} />).textContent).toContain('Pick a plan with Cora');
  });

  it('one row per day, today has Start and later days read Upcoming, with the minutes per day', () => {
    const h = mount(<PlanView plan={plan} company="Acme" onStart={jest.fn()} />);
    expect(h.querySelector('h3')?.textContent).toBe('Your plan · for Acme');
    expect(h.querySelector('[data-testid="cp-day-0"]')?.textContent).toContain('Today');
    expect(h.querySelector('[data-testid="cp-day-0"]')?.textContent).toContain('20 min');
    expect(h.querySelector('[data-testid="cp-day-0"] button')?.textContent).toBe('Start');
    expect(h.querySelector('[data-testid="cp-day-1"]')?.textContent).toContain('Upcoming');
    expect(h.textContent).toContain('Built from your weakest skills: Pace and clarity.');
  });

  it('block widths follow the minutes, weak-skill blocks are marked, and every block names itself for keyboard users', () => {
    const h = mount(<PlanView plan={plan} onStart={jest.fn()} />);
    const blocks = Array.from(h.querySelectorAll('[data-testid="cp-day-0"] .cp-seg')) as HTMLElement[];
    expect(blocks.map((b) => b.style.flexGrow)).toEqual(['2', '4', '8', '5', '1']);
    expect(blocks.filter((b) => b.classList.contains('is-target'))).toHaveLength(3);
    expect(blocks.every((b) => b.tabIndex === 0)).toBe(true);
    expect(blocks[1].getAttribute('aria-label')).toBe('Learn: Pace and clarity, 4 minutes, works on a weak skill');
  });

  it('Start today\'s session starts it', () => {
    const onStart = jest.fn();
    const h = mount(<PlanView plan={plan} onStart={onStart} />);
    act(() => (h.querySelector('[data-testid="cp-start-today"]') as HTMLButtonElement).click());
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});

describe('plan cards', () => {
  const iv = { id: 'i1', source: 'real' as const, company: 'Acme', role: 'R', type: 'technical' as const, target: 75 };
  const now = new Date('2026-11-16T18:00:00Z');
  it('counts Central days to the interview', () => {
    expect(daysUntil('2026-11-19T20:00:00Z', now)).toBe(3);
    expect(daysUntil('2026-11-17T05:30:00Z', now)).toBe(0); // 23:30 Monday Central = today
  });
  it('recommends the days plan first, then tonight, full rehearsal and build my own', () => {
    const c = planCards({ ...iv, startsAt: '2026-11-19T20:00:00Z' }, now);
    expect(c.map((x) => x.id)).toEqual(['plan:days', 'plan:tonight', 'plan:full', 'plan:custom']);
    expect(c[0]).toMatchObject({ title: '3 days to the interview', badge: 'Recommended' });
  });
  it('recommends one focused session when the interview is today, and a 4-day plan for practice', () => {
    expect(planCards({ ...iv, startsAt: '2026-11-16T22:00:00Z' }, now)[0].id).toBe('plan:tonight');
    expect(planCards({ ...iv, source: 'practice' }, now)[0].title).toBe('A 4-day practice plan');
  });
});
