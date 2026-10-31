/**
 * C91: the Explorer banner on Today asks for the first lesson before it asks anyone to enroll.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import ExplorerPreviewBanner from '../ExplorerPreviewBanner';
import type { TimelineFeedCard } from '../../../../components/timeline/TimelineCard';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const lesson = { id: 'c1', title: 'What an AI system is', status: 'available' } as unknown as TimelineFeedCard;
type Props = React.ComponentProps<typeof ExplorerPreviewBanner>;
const base: Props = {
  firstWinPending: true, firstLesson: lesson, onStartLesson: () => undefined, onSeeTimeline: () => undefined, fcCd: null, ohCd: null, ohTitle: null,
  showRsvp: true, rsvped: false, busy: false, onRsvp: () => undefined,
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const render = (p: Partial<Props>) => act(() => { root.render(<MemoryRouter><ExplorerPreviewBanner {...base} {...p} /></MemoryRouter>); });
const q = (s: string) => container.querySelector(s);

it('before the first win: the first lesson and the RSVP, and no enroll ask', () => {
  render({});
  expect(q('[data-testid="te-banner-first-lesson"]')!.textContent).toBe('Start your first lesson →');
  expect(container.textContent).toContain('What an AI system is');
  expect(q('[data-testid="te-banner-enroll"]')).toBeNull();
  expect(container.textContent).not.toContain('Enroll');
  expect(container.textContent).toContain('RSVP for the event');
  expect(q('[data-testid="te-explorer-banner"]')!.getAttribute('data-first-win')).toBe('pending');
});

it('the button opens that lesson', () => {
  const opened: string[] = [];
  render({ onStartLesson: (c) => opened.push(c.id) });
  act(() => { (q('[data-testid="te-banner-first-lesson"]') as HTMLButtonElement).click(); });
  expect(opened).toEqual(['c1']);
});

it('before the first win with nothing open to start: no dead button, and still no enroll ask', () => {
  render({ firstLesson: null });
  expect(q('[data-testid="te-banner-first-lesson"]')).toBeNull();
  expect(q('[data-testid="te-banner-enroll"]')).toBeNull();
});

it('after the first win (or unknown): the enroll ask is back, pointing at the subscription tab', () => {
  render({ firstWinPending: false, firstLesson: null });
  const a = q('[data-testid="te-banner-enroll"]') as HTMLAnchorElement;
  expect(a.textContent).toBe('Enroll to unlock →');
  expect(a.getAttribute('href')).toBe('/portal/settings?tab=subscription');
  expect(q('[data-testid="te-banner-first-lesson"]')).toBeNull();
});

it.each([true, false])('never says "free" (TWC), first win pending = %s', (pending) => {
  render({ firstWinPending: pending });
  expect(container.textContent!.toLowerCase()).not.toMatch(/\bfree\b/);
  expect(container.textContent).toContain('no card needed');
});

// C102: the timeline is below the fold, so the opening message says so in both versions and offers a way down.
it.each([true, false])('says the timeline is below and to scroll, first win pending = %s', (pending) => {
  render({ firstWinPending: pending });
  const hint = q('[data-testid="te-banner-scroll-hint"]')!.textContent!;
  expect(hint).toContain('Your timeline is right below this box.');
  expect(hint).toContain('Scroll down to watch, read and start your assignments.');
  expect(hint.toLowerCase()).not.toContain('unlimited');
  expect(q('[data-testid="te-banner-see-timeline"]')!.textContent).toBe('See your timeline ↓');
});

it('"See your timeline" scrolls, and does not replace the main ask', () => {
  let scrolled = 0;
  render({ firstWinPending: false, onSeeTimeline: () => { scrolled += 1; } });
  act(() => { (q('[data-testid="te-banner-see-timeline"]') as HTMLButtonElement).click(); });
  expect(scrolled).toBe(1);
  expect(q('[data-testid="te-banner-enroll"]')).not.toBeNull();
});

it('no Open House: no RSVP button; RSVP\'d: the button says so and is disabled', () => {
  render({ showRsvp: false });
  expect(container.textContent).not.toContain('RSVP');
  render({ rsvped: true });
  const b = Array.from(container.querySelectorAll('button')).find((x) => x.textContent!.includes('RSVP'))!;
  expect([b.textContent, b.disabled]).toEqual(["RSVP'd for the event", true]);
});
