/**
 * C19 (round 3 §2.3 desk tools): Focus 25:00 is a local timer (start, pause, it stops at 00:00 and says so, reset); Also here is the
 * building's real presence: named people drawn (four at most, then +N), anonymous people only counted, "Just you" when empty, and
 * nothing at all while presence is unknown.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import DeskTools, { FOCUS_S } from '../workstation/DeskTools';
import type { CampusAreaPresence } from '../campusApi';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); jest.useRealTimers(); });
const t = (s: string) => container.querySelector(`[data-testid="${s}"]`) as HTMLElement | null;
const btn = (label: string) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent === label) as HTMLButtonElement;
const person = (n: number) => ({ enrollment_id: `e${n}`, display_name: `Person ${n}`, avatar_url: null });

it('Focus counts down from 25:00, pauses, finishes at 00:00 with a status line, and resets', () => {
  jest.useFakeTimers();
  act(() => { root.render(<DeskTools here={null} />); });
  expect(t('cm-ws-focus')!.textContent).toBe('25:00');
  act(() => { btn('Start').click(); });
  act(() => { jest.advanceTimersByTime(61_000); });
  expect(t('cm-ws-focus')!.textContent).toBe('23:59');
  act(() => { btn('Pause').click(); });
  act(() => { jest.advanceTimersByTime(10_000); });
  expect(t('cm-ws-focus')!.textContent).toBe('23:59');
  act(() => { btn('Start').click(); });
  act(() => { jest.advanceTimersByTime((FOCUS_S - 61) * 1000 + 5000); });
  expect(t('cm-ws-focus')!.textContent).toBe('00:00');
  expect(container.textContent).toContain('Focus time is up');
  act(() => { (container.querySelector('[aria-label="Reset the focus timer"]') as HTMLButtonElement).click(); });
  expect(t('cm-ws-focus')!.textContent).toBe('25:00');
});

it('Also here: nothing while presence is unknown, "Just you" when empty, people drawn and the rest counted', () => {
  act(() => { root.render(<DeskTools here={null} />); });
  expect(t('cm-ws-alsohere')).toBeNull();
  act(() => { root.render(<DeskTools here={{ count: 0, people: [] }} />); });
  expect(t('cm-ws-alsohere')!.textContent).toContain('Just you');
  const crowd: CampusAreaPresence = { count: 8, people: [person(1), person(2), person(3), person(4), person(5), { anonymous: true }] };
  act(() => { root.render(<DeskTools here={crowd} />); });
  const avs = t('cm-ws-alsohere')!.querySelectorAll('.avs i');
  expect(avs).toHaveLength(4);
  expect(avs[0].getAttribute('aria-label')).toBe('Person 1');
  expect(t('cm-ws-alsohere')!.textContent).toContain('+4'); // 8 here, 4 drawn
});
