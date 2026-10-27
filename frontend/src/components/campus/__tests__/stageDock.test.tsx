import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import {
  useStageDock, isUsableStage, isDockTarget, STAGE_DOCK_FLAG, MIN_STAGE_W, MIN_STAGE_H,
} from '../interior/useStageDock';
import { timeUntil } from '../events/EventRows';

/**
 * C28b — the Events Hall's cinema.
 *
 * Two things here are easy to build wrong in a way that still looks fine in a screenshot:
 *
 *   1. THE DOCK'S FAIL-SAFE. The room is revealed with a scaling transform and a ResizeObserver
 *      fires during it, so an early measurement is legitimately 0x0. Docking to that pins the
 *      player to an invisible sliver in a corner — which reads to a student as "the stream is
 *      broken", the worst possible outcome for a feature whose entire job is to show a class.
 *      Below the floor the hook must report NOT docked and leave the player where it was.
 *
 *   2. THE COUNTDOWN'S ARITHMETIC. Out by an hour, counting down past an event that has already
 *      started, or "0 minutes" for the twelve hours before the doors open — each is invisible
 *      until a student reads it and turns up at the wrong time.
 */

let container: HTMLDivElement;
let root: Root;
let seen: ReturnType<typeof useStageDock>;

function Probe({ active, rect }: { active: boolean; rect: Partial<DOMRect> | null }): React.ReactElement {
  seen = useStageDock(active, 'amphi');
  return (
    <div
      ref={(el) => {
        if (el && rect) {
          // jsdom reports 0 for everything, so the measurement is stubbed on the node itself —
          // which is the only honest way to test a geometry rule without a browser.
          (el as HTMLElement).getBoundingClientRect = () => ({
            top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0,
            toJSON: () => ({}), ...rect,
          }) as DOMRect;
        }
        seen.ref(el);
      }}
    />
  );
}

function mount(active: boolean, rect: Partial<DOMRect> | null): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(<Probe active={active} rect={rect} />); });
}

afterEach(() => {
  act(() => { root?.unmount(); });
  container?.remove();
  delete document.body.dataset[STAGE_DOCK_FLAG];
});

describe('isDockTarget — which of the two boards the player covers', () => {
  /**
   * C73 can mount the room's board twice at once: on the wall, and enlarged over the room. The
   * property that matters is that EXACTLY ONE is the dock target in either state — zero leaves
   * the video with nowhere to go, two leaves it measuring whichever rendered last.
   */
  it('covers the wall board when nothing is enlarged', () => {
    expect(isDockTarget(false, false)).toBe(true);
  });

  it('covers the ENLARGED copy once it is open, not the wall board behind it', () => {
    expect(isDockTarget(true, true)).toBe(true);
    expect(isDockTarget(false, true)).toBe(false);
  });

  it('never picks an enlarged board that is not open', () => {
    expect(isDockTarget(true, false)).toBe(false);
  });

  it('picks EXACTLY ONE in both states — the whole point', () => {
    // Written as the invariant rather than four separate truths, because "one of them" is the
    // property; which one is a detail that may change if a third board ever appears.
    for (const enlargedOpen of [false, true]) {
      const hits = [false, true].filter((isBig) => isDockTarget(isBig, enlargedOpen));
      expect(hits).toHaveLength(1);
    }
  });
});

describe('isUsableStage — the floor under a screen', () => {
  it('accepts a real wall', () => {
    expect(isUsableStage({ top: 100, left: 80, width: 640, height: 360 })).toBe(true);
  });

  it('refuses the zero rect a mid-reveal measurement returns', () => {
    expect(isUsableStage({ top: 0, left: 0, width: 0, height: 0 })).toBe(false);
  });

  it('refuses a sliver — too narrow, too short, or both', () => {
    expect(isUsableStage({ top: 0, left: 0, width: MIN_STAGE_W - 1, height: 400 })).toBe(false);
    expect(isUsableStage({ top: 0, left: 0, width: 800, height: MIN_STAGE_H - 1 })).toBe(false);
  });

  it('refuses nothing at all', () => {
    expect(isUsableStage(null)).toBe(false);
  });

  it('CONTROL: the floor is a floor, not a wall — exactly at it passes', () => {
    // Without this the rules above would hold against a hook that refused every rect.
    expect(isUsableStage({ top: 0, left: 0, width: MIN_STAGE_W, height: MIN_STAGE_H })).toBe(true);
  });
});

describe('the dock', () => {
  it('docks over a real screen and flags the body with the building', () => {
    mount(true, { top: 120, left: 64, width: 720, height: 405 });

    expect(seen.docked).toBe(true);
    expect(document.body.dataset[STAGE_DOCK_FLAG]).toBe('amphi');
    const s = document.documentElement.style;
    expect(s.getPropertyValue('--lmp-stage-top')).toBe('120px');
    expect(s.getPropertyValue('--lmp-stage-left')).toBe('64px');
    expect(s.getPropertyValue('--lmp-stage-width')).toBe('720px');
    expect(s.getPropertyValue('--lmp-stage-height')).toBe('405px');
  });

  it('FAILS VISIBLE on a mid-reveal zero rect rather than pinning the player to nothing', () => {
    mount(true, { top: 0, left: 0, width: 0, height: 0 });

    expect(seen.docked).toBe(false);
    // No flag at all: the stylesheet's dock rules never engage, so the player keeps whatever
    // placement it already had.
    expect(document.body.dataset[STAGE_DOCK_FLAG]).toBeUndefined();
  });

  it('does not dock when nothing is playing, however good the wall is', () => {
    mount(false, { top: 120, left: 64, width: 720, height: 405 });

    expect(seen.docked).toBe(false);
    expect(document.body.dataset[STAGE_DOCK_FLAG]).toBeUndefined();
  });

  it('RETRACTS on unmount, so walking out does not strand the player on a wall that is gone', () => {
    mount(true, { top: 120, left: 64, width: 720, height: 405 });
    expect(document.body.dataset[STAGE_DOCK_FLAG]).toBe('amphi');

    act(() => { root.unmount(); });

    expect(document.body.dataset[STAGE_DOCK_FLAG]).toBeUndefined();
    expect(document.documentElement.style.getPropertyValue('--lmp-stage-width')).toBe('');
  });
});

describe('timeUntil — the doors-open countdown', () => {
  const NOW = Date.UTC(2026, 9, 27, 12, 0, 0);
  const iso = (ms: number) => new Date(NOW + ms).toISOString();

  it('counts whole days out', () => {
    expect(timeUntil(iso(2 * 86_400_000 + 3 * 3_600_000), NOW)).toBe('in 2 days');
    expect(timeUntil(iso(86_400_000), NOW)).toBe('in 1 day');
  });

  it('counts hours inside a day', () => {
    expect(timeUntil(iso(5 * 3_600_000), NOW)).toBe('in 5 hours');
    expect(timeUntil(iso(3_600_000), NOW)).toBe('in 1 hour');
  });

  it('counts minutes inside the last hour — NOT "0 hours"', () => {
    // The failure this pins: integer hours would read "in 0 hours" for the whole final hour.
    expect(timeUntil(iso(40 * 60_000), NOW)).toBe('in 40 minutes');
    expect(timeUntil(iso(60_000), NOW)).toBe('in 1 minute');
  });

  it('says "starting now" in the last minute, never "in 0 minutes"', () => {
    expect(timeUntil(iso(30_000), NOW)).toBe('starting now');
  });

  it('returns null once it has started, so nothing counts backwards', () => {
    // The board falls back to printing the day and time; a negative countdown is worse than
    // no countdown.
    expect(timeUntil(iso(-1), NOW)).toBeNull();
    expect(timeUntil(iso(-86_400_000), NOW)).toBeNull();
  });

  it('returns null for a date it cannot read, rather than NaN', () => {
    expect(timeUntil('not a date', NOW)).toBeNull();
  });

  it('counts to the real Open House from a real instant', () => {
    // Thu 29 Oct 2026, 6:30 PM CDT = 23:30 UTC. Read at noon CDT the same day.
    const openHouse = '2026-10-29T23:30:00.000Z';
    const noonCdt = Date.UTC(2026, 9, 29, 17, 0, 0);
    expect(timeUntil(openHouse, noonCdt)).toBe('in 6 hours');
  });
});
