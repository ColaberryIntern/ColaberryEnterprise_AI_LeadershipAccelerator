import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import { baseView, focusView, followView, inView, NO_INSETS, panBy, settled, step, viewBoxOf, zoomBy } from './campusCamera';
import type { Cam, Insets, Pt, Viewport } from './campusCamera';

/**
 * Runs the campus camera on the full map's <svg> (C11b, prototype "CAMERA"). It writes the viewBox attribute directly, never
 * React state, so panning and easing do not re-render the map; and it animates only until the view settles (the prototype ran a
 * frame loop forever). Pointer drag pans past a 6 px threshold and swallows the click that ends a drag; the wheel zooms; arrow keys
 * pan; a keyboard-focused building outside the view is brought into it. Reduce motion jumps (ease 1).
 *
 * WP-1 (owner rule: the map recenters itself every time). `recenter` eases back to the whole campus unless the avatar is walking
 * (the walk's follow camera wins); the world calls it whenever a card closes. A resize, or the tab becoming visible again, re-frames
 * too: the open building when one is framed, otherwise the whole campus, whatever pan or zoom came before. While the avatar walks,
 * drag, wheel, arrow keys and the zoom buttons are ignored (the prototype ignores a drag while traveling), so a walk never loses
 * its camera.
 *
 * An svg with no size (jsdom, a hidden layer) is left on its static viewBox: nothing here runs until it has a width.
 */
export interface CameraApi {
  /** The whole campus, eased (`ease` overrides the rate: the gate fly-out uses the prototype's .035). */
  base: (ease?: number) => void;
  /** The whole campus, unless a walk is following the avatar. */
  recenter: () => void;
  /** Re-fit the whole campus to the panels as they are now, only while the view IS the whole campus (a panel changed size). */
  refit: () => void;
  focus: (b: { x: number; y: number; h: number }) => void;
  follow: () => void;
  zoom: (f: number) => void;
}
/** Insets in screen px, or computed from the viewport (a phone sheet covers a share of the height). */
export type InsetsOf = Insets | ((vp: Viewport) => Insets);
const resolve = (i: InsetsOf | undefined, v: Viewport): Insets => (typeof i === 'function' ? i(v) : i ?? NO_INSETS);

export interface CameraOptions {
  /** Off on the compact maps (pictures with a fixed whole-campus view). */
  enabled: boolean;
  /** Screen pixels covered by panels, for the whole-campus view and the walking view. */
  insets?: InsetsOf;
  /** Screen pixels covered when a building is framed (its arrival panel). */
  focusInsets?: InsetsOf;
  /** Where the avatar is now (read each frame while following). */
  avatarRef: MutableRefObject<Pt>;
  /** A building's world point (center, ground line), for bringing a focused building into view. */
  locate: (id: string) => Pt | null;
  reduceMotion: boolean;
  apiRef?: MutableRefObject<CameraApi | null>;
  /** The building framed now (an open card), or null: a resize re-frames it instead of the whole campus. */
  framed?: () => { x: number; y: number; h: number } | null;
  /** The first frame, when it is not the whole campus (the gate close-up the entry flies out of). */
  startCam?: Cam;
}

const EASE = 0.06;
const EASE_FOCUS = 0.13;
const DRAG_PX = 6;
const KEY_PAN_PX = 80;

/** addEventListener that hands back its own removal. */
function listen(t: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions): () => void {
  t.addEventListener(type, fn, opts);
  return () => t.removeEventListener(type, fn, opts);
}

/**
 * Drag to pan: past a 6 px threshold the pointer moves the world (onPan gets screen px), and the click that ends a drag is swallowed
 * so it never picks the building under the pointer. A smaller wobble stays a click.
 */
function bindDrag(el: Element, onPan: (dx: number, dy: number) => void): () => void {
  let drag: { x: number; y: number; moved: boolean } | null = null;
  const down = (e: Event) => { const p = e as PointerEvent; drag = { x: p.clientX, y: p.clientY, moved: false }; };
  const move = (e: Event) => {
    const p = e as PointerEvent;
    if (!drag) return;
    const dx = p.clientX - drag.x, dy = p.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_PX) return;
    drag.moved = true; drag.x = p.clientX; drag.y = p.clientY;
    onPan(dx, dy);
  };
  const up = () => { window.setTimeout(() => { drag = null; }, 0); };
  const click = (e: Event) => { if (drag?.moved) { e.stopPropagation(); e.preventDefault(); } };
  const off = [listen(el, 'pointerdown', down), listen(window, 'pointermove', move), listen(window, 'pointerup', up), listen(el, 'click', click, { capture: true })];
  return () => off.forEach((u) => u());
}

export function useCampusCamera(svgRef: RefObject<SVGSVGElement>, opts: CameraOptions): CameraApi {
  const o = useRef(opts);
  o.current = opts;
  const cam = useRef<Cam | null>(null);
  const target = useRef<Cam | null>(null);
  const mode = useRef<'manual' | 'base' | 'follow'>('base');
  const ease = useRef(EASE);
  const raf = useRef<number | null>(null);

  const vp = (): Viewport | null => {
    const el = o.current.enabled ? svgRef.current : null;
    return el && el.clientWidth > 0 && el.clientHeight > 0 ? { W: el.clientWidth, H: el.clientHeight } : null;
  };
  const write = (v: Viewport) => { if (cam.current) svgRef.current?.setAttribute('viewBox', viewBoxOf(cam.current, v)); };

  const tick = useCallback(() => {
    raf.current = null;
    const v = vp();
    if (!v || !cam.current || !target.current) return;
    if (mode.current === 'follow') target.current = followView(v, o.current.avatarRef.current, resolve(o.current.insets, v));
    const e = o.current.reduceMotion ? 1 : ease.current;
    cam.current = step(cam.current, target.current, e);
    write(v);
    if (mode.current === 'follow' || !settled(cam.current, target.current, v)) raf.current = requestAnimationFrame(tick);
  }, []); // reads everything through refs

  const go = useCallback((t: Cam, e = EASE) => {
    target.current = t;
    ease.current = e;
    if (!cam.current) cam.current = t;
    if (raf.current === null) raf.current = requestAnimationFrame(tick);
  }, [tick]);

  const api = useMemo<CameraApi>(() => ({
    base: (e = EASE) => { const v = vp(); if (!v) return; mode.current = 'base'; go(baseView(v, resolve(o.current.insets, v)), e); },
    recenter: () => { const v = vp(); if (!v || mode.current === 'follow') return; mode.current = 'base'; go(baseView(v, resolve(o.current.insets, v))); },
    refit: () => { const v = vp(); if (!v || mode.current !== 'base') return; go(baseView(v, resolve(o.current.insets, v))); },
    focus: (b) => { const v = vp(); if (!v) return; mode.current = 'manual'; go(focusView(v, b, resolve(o.current.focusInsets ?? o.current.insets, v)), EASE_FOCUS); },
    follow: () => { if (!vp()) return; mode.current = 'follow'; go(target.current ?? cam.current!, EASE); },
    zoom: (f) => { const v = vp(); if (!v || !cam.current || mode.current === 'follow') return; mode.current = 'manual'; go(zoomBy(target.current ?? cam.current, f)); },
  }), [go]);
  if (opts.apiRef) opts.apiRef.current = api;

  useEffect(() => {
    const el = svgRef.current;
    if (!el || !o.current.enabled) return undefined;
    // First frame: the whole campus at once (or the caller's start, the gate close-up).
    const v0 = vp();
    if (v0) { cam.current = o.current.startCam ?? baseView(v0, resolve(o.current.insets, v0)); target.current = cam.current; write(v0); }
    if (o.current.startCam) mode.current = 'manual';
    const walking = () => mode.current === 'follow';

    const pan = (dx: number, dy: number) => {
      const v = vp();
      if (!v || !cam.current || walking()) return;
      mode.current = 'manual';
      cam.current = panBy(cam.current, v, dx, dy); target.current = cam.current;
      write(v);
    };
    const wheel = (e: WheelEvent) => { e.preventDefault(); if (!walking()) api.zoom(Math.exp(e.deltaY * 0.0015)); };
    const key = (e: KeyboardEvent) => {
      const d: Record<string, [number, number]> = { ArrowLeft: [KEY_PAN_PX, 0], ArrowRight: [-KEY_PAN_PX, 0], ArrowUp: [0, KEY_PAN_PX], ArrowDown: [0, -KEY_PAN_PX] };
      const v = vp();
      if (!d[e.key] || !v || !cam.current || walking()) return;
      e.preventDefault(); mode.current = 'manual';
      go(panBy(target.current ?? cam.current, v, d[e.key][0], d[e.key][1]));
    };
    const focusIn = (e: FocusEvent) => {
      const v = vp();
      const id = (e.target as Element | null)?.closest?.('[data-building]')?.getAttribute('data-building');
      const p = id ? o.current.locate(id) : null;
      if (!v || !p || !cam.current || walking() || inView(target.current ?? cam.current, v, p)) return;
      mode.current = 'manual';
      go({ ...(target.current ?? cam.current), cx: p.x, cy: p.y - 40 });
    };
    // Every resize re-frames: the open building, else the whole campus (any earlier pan or zoom is dropped). A walk keeps following.
    const reframe = () => {
      const v = vp();
      if (!v) return;
      if (walking()) { write(v); return; }
      const f = o.current.framed?.() ?? null;
      if (f) { mode.current = 'manual'; cam.current = focusView(v, f, resolve(o.current.focusInsets ?? o.current.insets, v)); }
      else { mode.current = 'base'; cam.current = baseView(v, resolve(o.current.insets, v)); }
      target.current = cam.current;
      write(v);
    };
    // Back to a hidden tab: the whole campus again, unless a card is framed.
    const visible = () => { if (document.visibilityState === 'visible' && !o.current.framed?.()) api.recenter(); };
    const unbind = [bindDrag(el, pan), listen(el, 'wheel', wheel as EventListener, { passive: false }), listen(el, 'keydown', key as EventListener),
      listen(el, 'focusin', focusIn as EventListener), listen(window, 'resize', reframe), listen(document, 'visibilitychange', visible)];
    return () => {
      unbind.forEach((u) => u());
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, [api, go]);

  return api;
}
