/**
 * Characterization of TodayStreakCard - the Daily-streak card moved out of
 * TodayShell.tsx verbatim (Growth Journey OS Phase 5, T521 fix cycle 1): the
 * split the 500-line ceiling demands before a line is added to the shell.
 * Pins three things: the DOM the shell used to render for the six bindings,
 * that the shell no longer holds one line of the block (an absence pin, not a
 * line count - main grows), and that the shell mounts the card exactly once
 * with the six bindings by name.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import fs from 'fs';
import path from 'path';
import TodayStreakCard from '../TodayStreakCard';
import type { StreakView } from '../../../../services/onboardingApi';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const week: StreakView['week'] = [
  { date: '2026-09-15', label: 'Tu', hit: false, is_today: false },
  { date: '2026-09-16', label: 'We', hit: true, is_today: false },
  { date: '2026-09-17', label: 'Th', hit: false, is_today: false },
  { date: '2026-09-18', label: 'Fr', hit: true, is_today: false },
  { date: '2026-09-19', label: 'Sa', hit: false, is_today: false },
  { date: '2026-09-20', label: 'Su', hit: false, is_today: false },
  { date: '2026-09-21', label: 'Mo', hit: false, is_today: true },
];
const streak: StreakView = { count: 3, claimed_today: false, week, total_streak_points: 45, next_points: 15 };

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const SHELL = fs.readFileSync(path.join(__dirname, '..', 'TodayShell.tsx'), 'utf8');
const CARD = fs.readFileSync(path.join(__dirname, '..', 'TodayStreakCard.tsx'), 'utf8');
// Marks that appear ONLY in the block (the command band also reads streak.next_points, so that is not one).
const BLOCK_MARKS = ['te-streak accent-amber', 'te-streak-top', 'te-streak-week', "'Claimed today'"];

describe('the extraction', () => {
  it('the block is gone from TodayShell.tsx line for line, and lives in TodayStreakCard.tsx in the same order', () => {
    for (const mark of BLOCK_MARKS) expect(SHELL).not.toContain(mark);
    const positions = BLOCK_MARKS.map((m) => CARD.indexOf(m));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('TodayShell mounts the card exactly once, with the six bindings by name, below the Daily-streak comment', () => {
    expect(SHELL.match(/<TodayStreakCard\b/g)).toHaveLength(1);
    const mount = SHELL.slice(SHELL.indexOf('<TodayStreakCard'), SHELL.indexOf('/>', SHELL.indexOf('<TodayStreakCard')));
    for (const p of ['streak', 'streakCount', 'streakWeek', 'claimedToday', 'busy', 'doClaimStreak']) expect(mount).toContain(`${p}={${p}}`);
    expect(SHELL.indexOf('{/* Daily streak */}')).toBeLessThan(SHELL.indexOf('<TodayStreakCard'));
    expect(SHELL).toContain("import TodayStreakCard from './TodayStreakCard';");
  });
});

describe('the DOM the shell rendered', () => {
  it('count, plural, the seven days with hit/today classes, and the claim button with the points on offer', () => {
    const doClaimStreak = jest.fn();
    act(() => root.render(<TodayStreakCard streak={streak} streakCount={3} streakWeek={week} claimedToday={false} busy={false} doClaimStreak={doClaimStreak} />));
    expect(container.querySelector('.te-card.te-scard.te-streak.accent-amber')).not.toBeNull();
    expect(container.querySelector('h3')?.textContent).toBe(' Daily streak');
    expect(container.querySelector('.ct b')?.textContent).toBe('3');
    expect(container.querySelector('.ct span')?.textContent).toBe('days streak');
    const days = Array.from(container.querySelectorAll('.te-streak-week .sd'));
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.className)).toEqual(['sd', 'sd hit', 'sd', 'sd hit', 'sd', 'sd', 'sd today']);
    expect(days.map((d) => d.querySelector('.lbl')?.textContent)).toEqual(['Tu', 'We', 'Th', 'Fr', 'Sa', 'Su', 'Mo']);
    const button = container.querySelector('button') as HTMLButtonElement;
    expect(button.textContent).toBe('Claim today · +15 pts');
    expect(button.disabled).toBe(false);
    act(() => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(doClaimStreak).toHaveBeenCalledTimes(1);
  });

  it('one day is singular', () => {
    act(() => root.render(<TodayStreakCard streak={{ ...streak, count: 1 }} streakCount={1} streakWeek={week} claimedToday={false} busy={false} doClaimStreak={() => undefined} />));
    expect(container.querySelector('.ct span')?.textContent).toBe('day streak');
  });

  it('claimed today: the button says so and is disabled, and a click does nothing', () => {
    const doClaimStreak = jest.fn();
    act(() => root.render(<TodayStreakCard streak={{ ...streak, claimed_today: true, next_points: 0 }} streakCount={3} streakWeek={week} claimedToday={true} busy={false} doClaimStreak={doClaimStreak} />));
    const button = container.querySelector('button') as HTMLButtonElement;
    expect(button.textContent).toBe('Claimed today');
    expect(button.disabled).toBe(true);
    act(() => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(doClaimStreak).not.toHaveBeenCalled();
  });

  it('busy: disabled, the label unchanged', () => {
    act(() => root.render(<TodayStreakCard streak={streak} streakCount={3} streakWeek={week} claimedToday={false} busy={true} doClaimStreak={() => undefined} />));
    const button = container.querySelector('button') as HTMLButtonElement;
    expect(button.textContent).toBe('Claim today · +15 pts');
    expect(button.disabled).toBe(true);
  });

  it('no streak yet: zero days, an empty week, the plain "Claim today"', () => {
    act(() => root.render(<TodayStreakCard streak={null} streakCount={0} streakWeek={[]} claimedToday={false} busy={false} doClaimStreak={() => undefined} />));
    expect(container.querySelector('.ct b')?.textContent).toBe('0');
    expect(container.querySelector('.ct span')?.textContent).toBe('days streak');
    expect(container.querySelectorAll('.te-streak-week .sd')).toHaveLength(0);
    expect(container.querySelector('button')?.textContent).toBe('Claim today');
  });
});
