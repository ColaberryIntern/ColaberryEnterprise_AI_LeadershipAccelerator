/**
 * C11b entry gate (D7): once per Central day, the prototype's opening screen per account (learner, visitor, staff, partner,
 * Workplace lobby), Enter / Esc / the tour link, reduce motion, and nothing written to the server.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import CampusGate, { centralDay, gateSeen, markGateSeen, GATE_SEEN_KEY } from '../home/CampusGate';
import type { GateProps } from '../home/CampusGate';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('once per Central day', () => {
  afterEach(() => window.localStorage.clear());
  it('the day turns over at midnight Central, not UTC', () => {
    expect(centralDay(new Date('2026-10-21T04:30:00Z'))).toBe('2026-10-20'); // 11:30 PM CDT on the 20th
    expect(centralDay(new Date('2026-10-21T05:30:00Z'))).toBe('2026-10-21');
  });
  it('seen today hides it; tomorrow shows it again; "always" (test harness) never shows it', () => {
    const today = new Date('2026-10-20T15:00:00Z');
    expect(gateSeen(today)).toBe(false);
    markGateSeen(today);
    expect(gateSeen(today)).toBe(true);
    expect(gateSeen(new Date('2026-10-21T15:00:00Z'))).toBe(false);
    window.localStorage.setItem(GATE_SEEN_KEY, 'always');
    markGateSeen(today);
    expect(window.localStorage.getItem(GATE_SEEN_KEY)).toBe('always');
    expect(gateSeen(new Date('2027-01-01T15:00:00Z'))).toBe(true);
  });
});

describe('the gate', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => { jest.useFakeTimers(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); jest.useRealTimers(); window.localStorage.clear(); });
  const base: GateProps = { audience: 'member', firstName: 'Ali', fullName: 'Ali Muwwakkil', initials: 'AM', rung: 'AI Enabled II', points: 1252, streak: 3, online: 10,
    workplace: false, hasTour: true, reduceMotion: false, now: new Date('2026-10-20T20:00:00Z'), onEnter: () => undefined };
  const render = (p: Partial<GateProps>) => act(() => { root.render(<CampusGate {...base} {...p} />); });
  const q = (s: string) => container.querySelector(s);

  it('a member: the accelerator arch, greeting by name, classmates inside, streak, ID card with level and points', () => {
    render({});
    for (const id of ['cm-gate', 'cm-gate-arch-text', 'cm-gate-logo', 'cm-gate-greeting', 'cm-gate-sub', 'cm-gate-id', 'cm-gate-enter', 'cm-gate-tour']) expect(q(`[data-testid="${id}"]`)).not.toBeNull();
    expect(q('[data-testid="cm-gate-arch-text"]')!.textContent).toBe('Colaberry · AI Systems Architect Accelerator');
    expect(q('[data-testid="cm-gate-greeting"]')!.textContent).toMatch(/, Ali\.$/);
    expect(q('[data-testid="cm-gate-sub"]')!.textContent).toBe('The campus is open. 10 classmates are already inside.');
    expect(q('[data-testid="cm-gate-streak"]')!.textContent).toContain('Day 3');
    expect(q('[data-testid="cm-gate-id"]')!.textContent).toContain('Ali Muwwakkil');
    expect(q('[data-testid="cm-gate-id"]')!.textContent).toContain('AI Enabled II · 1,252 pts');
    expect(document.activeElement).toBe(q('[data-testid="cm-gate-enter"]'));
  });

  it('an Explorer comes in by the visitor entrance with a green pass, never told "free"', () => {
    render({ audience: 'explorer', streak: null });
    expect(q('[data-testid="cm-gate-arch-text"]')!.textContent).toBe('Colaberry · Visitor entrance');
    expect(q('.cm-idcard')!.getAttribute('class')).toContain('is-explorer');
    expect(q('[data-testid="cm-gate-enter"]')!.textContent).toContain('Pick up your pass');
    expect(container.textContent!.toLowerCase()).not.toMatch(/\bfree\b/);
    expect(q('[data-testid="cm-gate-streak"]')).toBeNull();
  });

  it('staff and partners have their own entrance; Workplace names make it the HQ lobby', () => {
    render({ audience: 'staff' });
    expect(q('[data-testid="cm-gate-arch-text"]')!.textContent).toBe('Colaberry · Staff entrance');
    render({ audience: 'business', workplace: true });
    expect(q('[data-testid="cm-gate-arch-text"]')!.textContent).toBe('Colaberry Works · Partner entrance');
    render({ workplace: true });
    expect(q('.cm-gate')!.getAttribute('class')).toContain('is-work');
    expect(q('[data-testid="cm-gate-arch-text"]')!.textContent).toBe('Colaberry Works · HQ Lobby');
  });

  it('a fact we do not have stays off: no online count, no level', () => {
    render({ online: null, rung: null, points: null, streak: null });
    expect(q('[data-testid="cm-gate-sub"]')!.textContent).toBe('The campus is open.');
    expect(q('.tier')).toBeNull();
  });

  it('Enter swings the doors open, then lets you in and remembers today', () => {
    const entered: boolean[] = [];
    render({ onEnter: (t) => entered.push(t) });
    act(() => { (q('[data-testid="cm-gate-enter"]') as HTMLButtonElement).click(); });
    expect(q('.cm-gate')!.getAttribute('class')).toContain('is-opening');
    expect(entered).toEqual([]);
    act(() => { jest.advanceTimersByTime(1500); }); // WP-3: the prototype's timeline; fading from 1.3 s, still up at 1.5 s
    expect(q('.cm-gate')!.getAttribute('class')).toContain('is-done');
    expect(entered).toEqual([]);
    act(() => { jest.advanceTimersByTime(500); });
    expect(entered).toEqual([false]);
    expect(window.localStorage.getItem(GATE_SEEN_KEY)).toBe(centralDay(base.now));
  });

  it('the tour link enters with the tour; Esc enters too; reduce motion lets you in at once', () => {
    const entered: boolean[] = [];
    render({ reduceMotion: true, onEnter: (t) => entered.push(t) });
    act(() => { (q('[data-testid="cm-gate-tour"]') as HTMLButtonElement).click(); });
    act(() => { q('[data-testid="cm-gate"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(entered).toEqual([true, false]);
  });

  it('no tour for this viewer, no tour link', () => {
    render({ hasTour: false, audience: 'staff' });
    expect(q('[data-testid="cm-gate-tour"]')).toBeNull();
  });
});

describe('role entrances (C11b fix round)', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); window.localStorage.clear(); });
  const base: GateProps = { audience: 'staff', firstName: 'Sam', fullName: 'Sam Staff', initials: 'SS', rung: null, points: null, streak: null, online: 4,
    workplace: false, hasTour: false, reduceMotion: true, now: new Date('2026-10-20T20:00:00Z'), onEnter: () => undefined };
  const q = (s: string) => container.querySelector(s);

  it('staff badge in, see the real learner count, and carry no learner points or unproven claims', () => {
    act(() => { root.render(<CampusGate {...base} />); });
    expect(q('[data-testid="cm-gate-enter"]')!.textContent).toContain('Badge in');
    expect(q('[data-testid="cm-gate-sub"]')!.textContent).toBe('4 learners are on campus right now.');
    expect(q('.cm-idcard')!.getAttribute('class')).toContain('is-staff');
    expect(container.textContent).not.toMatch(/all-access|could use a hand|pts/);
  });

  it('a partner starts with the partner tour, or looks around alone; no company or seat facts we do not have', () => {
    const entered: boolean[] = [];
    act(() => { root.render(<CampusGate {...base} audience="business" hasTour onEnter={(t) => entered.push(t)} />); });
    expect(q('[data-testid="cm-gate-enter"]')!.textContent).toContain('Start the partner tour');
    expect(q('[data-testid="cm-gate-tour"]')!.textContent).toBe('Or just look around on your own');
    act(() => { (q('[data-testid="cm-gate-enter"]') as HTMLButtonElement).click(); });
    act(() => { (q('[data-testid="cm-gate-tour"]') as HTMLButtonElement).click(); });
    expect(entered).toEqual([true, false]);
    expect(container.textContent).not.toMatch(/seats/);
  });
});
