import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Dock the portal's ONE broadcast player onto the Events Hall's back-wall screen.
 *
 * WHY NOT A SECOND PLAYER, which is the obvious way to put video in a room. There is exactly
 * one `<video>` in the portal, mounted beside `<Outlet/>` in the layout route, and
 * `BroadcastPlayerContext` holds a single session. A second element for the same occurrence
 * would mint a second signed grant, attach a second adapter, open a second heartbeat stream
 * and play a second audio track over the first. `portalRoutesPlayerMount.test.tsx` exists to
 * assert there is exactly one, and `LiveStage.tsx` already promises viewers the single-player
 * behaviour in as many words — "one player for the whole portal, it keeps playing while you
 * walk". So the room BORROWS the player rather than owning one.
 *
 * WHY NOT A PORTAL, which is the obvious way to move it. `createPortal` re-parents by
 * unmounting from the old container and mounting into the new one, which destroys and
 * recreates the `<video>` DOM node — and node identity is the entire point of that component
 * (its own comment: "hidden, never unmounted"). Playback would restart on every walk through
 * a door.
 *
 * SO IT IS PLACEMENT ONLY. The room measures its screen, publishes the rect as CSS custom
 * properties, and sets a flag on `<body>`; the player's stylesheet reads both and positions
 * the fixed panel over the wall. Nothing about the player's React tree changes, which is why
 * this needed no edit to `LiveMiniPlayer.tsx` at all. The precedent is already in that
 * stylesheet: `LiveSessionPage` drives companion placement the same way, through
 * `body[data-live-companion]`.
 */

/** `document.body.dataset.liveStage` — the building whose screen the player is docked to. */
export const STAGE_DOCK_FLAG = 'liveStage';

/**
 * Below this, a rect is not a screen.
 *
 * The reveal animation scales the room up from nothing, and a `ResizeObserver` fires during
 * it, so an early measurement can legitimately be 0x0 or a few pixels. Docking to that would
 * pin the player to an invisible sliver in the corner — which reads as "the stream broke",
 * the single worst outcome for a feature whose whole job is to show a class. Below the floor
 * the hook reports NOT docked, and the player stays wherever it already was. Fail visible.
 */
export const MIN_STAGE_W = 200;
export const MIN_STAGE_H = 110;

/**
 * Which of the two mounted boards the player should cover.
 *
 * Since C73 the room can show its board twice at once: the one on the wall and the enlarged
 * copy over the room. Both are real elements with real rects, so handing the dock ref to both
 * leaves it measuring whichever rendered last — a coin toss settled by React's ordering rather
 * than by what the viewer is looking at, and one that would flip silently if the render order
 * ever changed.
 *
 * The rule is simply "the one on screen": the enlarged copy while it is open, the wall board
 * otherwise. Pure and exported because an inline `===` is exactly the kind of thing that reads
 * as obviously right and is obviously wrong once someone adds a third board.
 */
export function isDockTarget(isBig: boolean, enlargedOpen: boolean): boolean {
  return isBig === enlargedOpen;
}

export interface StageRect { top: number; left: number; width: number; height: number }

/** Exported for the test, and because "is this big enough to be a screen" is the whole rule. */
export function isUsableStage(r: StageRect | null): boolean {
  if (!r) return false;
  return r.width >= MIN_STAGE_W && r.height >= MIN_STAGE_H;
}

function readRect(el: HTMLElement | null): StageRect | null {
  if (!el) return null;
  // getBoundingClientRect, NOT clientWidth/clientHeight. `Room3D` measures its own geometry
  // from the layout box precisely because the reveal transform makes the painted rect lie —
  // but here the painted rect is what we want, since the player is positioned in viewport
  // coordinates and has to land where the wall actually appears on screen.
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function publish(rect: StageRect, building: string): void {
  const s = document.documentElement.style;
  s.setProperty('--lmp-stage-top', `${Math.round(rect.top)}px`);
  s.setProperty('--lmp-stage-left', `${Math.round(rect.left)}px`);
  s.setProperty('--lmp-stage-width', `${Math.round(rect.width)}px`);
  s.setProperty('--lmp-stage-height', `${Math.round(rect.height)}px`);
  document.body.dataset[STAGE_DOCK_FLAG] = building;
}

function retract(): void {
  const s = document.documentElement.style;
  ['--lmp-stage-top', '--lmp-stage-left', '--lmp-stage-width', '--lmp-stage-height']
    .forEach((k) => s.removeProperty(k));
  delete document.body.dataset[STAGE_DOCK_FLAG];
}

export interface StageDock {
  /** Attach to the element the player should cover. */
  ref: (el: HTMLElement | null) => void;
  /** True only while the player is actually docked, so the room can dress accordingly. */
  docked: boolean;
}

/**
 * @param active  dock only when there is something to show AND the viewer is in the room
 * @param building  the building id, written to the body flag so CSS and tests can see which
 */
export function useStageDock(active: boolean, building: string): StageDock {
  const elRef = useRef<HTMLElement | null>(null);
  const [docked, setDocked] = useState(false);
  // Read inside the measure callback rather than captured, so a flag flip does not need a new
  // observer: the callback stays stable and the effect below does not thrash.
  const activeRef = useRef(active);
  activeRef.current = active;
  const buildingRef = useRef(building);
  buildingRef.current = building;

  const measure = useCallback(() => {
    if (!activeRef.current) { retract(); setDocked(false); return; }
    const rect = readRect(elRef.current);
    if (!isUsableStage(rect)) { retract(); setDocked(false); return; }
    publish(rect as StageRect, buildingRef.current);
    setDocked(true);
  }, []);

  const ref = useCallback((el: HTMLElement | null) => { elRef.current = el; measure(); }, [measure]);

  useEffect(() => {
    measure();
    if (!active) return undefined;

    // The room is revealed with a transform and resized with the window; both move the wall
    // without any React render, so neither can be caught by re-rendering alone.
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => measure()) : null;
    if (ro && elRef.current) ro.observe(elRef.current);
    window.addEventListener('resize', measure);
    // Passive: this only reads layout, and a scroll listener that can block is a jank source.
    window.addEventListener('scroll', measure, { passive: true });
    // The reveal is a CSS transition on an ancestor, so its end is the moment the rect is
    // finally true. Listened for on the document because the transition is not on our element.
    document.addEventListener('transitionend', measure);

    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure);
      document.removeEventListener('transitionend', measure);
    };
  }, [active, measure]);

  /**
   * NO SEPARATE UNMOUNT CLEANUP, and that is deliberate rather than an omission.
   *
   * One was written here first: `useEffect(() => () => retract(), [])`. A mutation removing it
   * SURVIVED, which is the useful kind of failure — it showed the retract already happens by a
   * path I had not credited. React calls a callback ref with `null` when the element unmounts,
   * `ref` then re-measures with no element, `readRect(null)` is null, and the unusable-rect
   * branch below retracts. The extra effect was belt on a belt.
   *
   * So the live mechanism is the retract inside `measure`, and that is what the mutation set
   * now targets. Leaving the redundant effect in would have meant shipping a line whose removal
   * no test could notice.
   */

  return { ref, docked };
}

export default useStageDock;
