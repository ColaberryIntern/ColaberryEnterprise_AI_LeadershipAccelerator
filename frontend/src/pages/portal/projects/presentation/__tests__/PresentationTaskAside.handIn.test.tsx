import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import PresentationTaskAside from '../PresentationTaskAside';

/**
 * THE POINTS ARE ADVERTISED EVERYWHERE AND EARNED IN ONE PLACE.
 *
 * "Pays +40 pts" renders in this sidebar on every step of the Studio. The
 * control that actually earns it — the evidence panel — mounts on exactly one
 * step, the one the task opens on. A learner who clicks to another step is left
 * reading about a reward with no visible door to it.
 *
 * Ali, 2026-10-24, standing on Practice on a PREP-1 whose hand-in is on
 * Prepare: "I don't see how to collect the pts."
 */

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => { act(() => root?.unmount()); root = null; container.remove(); });

type Props = React.ComponentProps<typeof PresentationTaskAside>;

const render = (over: Partial<Props> = {}) => {
  const props: Props = {
    storyId: 'PREP-1',
    isDemoDay: false,
    handedIn: false,
    points: 40,
    stage: 'practice',
    handInStage: 'prepare',
    handInStageLabel: 'Prepare',
    onGoToHandIn: jest.fn(),
    ...over,
  };
  act(() => {
    const r = createRoot(container);
    root = r;
    r.render(<PresentationTaskAside {...props} />);
  });
  return props;
};

const q = (t: string) => container.querySelector(`[data-testid="${t}"]`);

it('points the learner at the step that actually takes the hand-in', () => {
  render();
  const link = q('ps-aside-handin-route');
  expect(link).not.toBeNull();
  expect(link!.textContent).toBe('Hand in on Prepare →');
});

it('goes there when clicked', () => {
  const props = render();
  act(() => {
    (q('ps-aside-handin-route') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  expect(props.onGoToHandIn).toHaveBeenCalledTimes(1);
});

it('says nothing when the learner is already on that step', () => {
  render({ stage: 'prepare' });
  expect(q('ps-aside-handin-route')).toBeNull();
});

it('says nothing once the task is handed in', () => {
  render({ handedIn: true });
  expect(q('ps-aside-handin-route')).toBeNull();
});

it('never tells a student to hand in Demo Day — staff mark that one', () => {
  // "Go and hand in" is a lie on PREP-6, and a worse one than silence.
  render({ storyId: 'PREP-6', isDemoDay: true });
  expect(q('ps-aside-handin-route')).toBeNull();
});

it('says nothing when the caller gave nowhere to go', () => {
  render({ onGoToHandIn: undefined });
  expect(q('ps-aside-handin-route')).toBeNull();
});

it('still shows the points themselves, route or no route', () => {
  render({ stage: 'prepare' });
  expect(container.textContent).toContain('+40 pts');
});

it('shows no pays row at all when the task is unpriced', () => {
  // An unpriced task shows no badge rather than "+0 pts" — the rule prepPoints
  // states and the reason a missing config row is safe.
  render({ points: 0 });
  expect(container.textContent).not.toContain('pts');
  expect(q('ps-aside-handin-route')).toBeNull();
});
