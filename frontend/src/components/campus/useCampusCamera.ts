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
 * An svg with no size (jsdom, a hidden layer) is left on its static viewBox: nothing here runs until it has a width.
 */
export interface CameraApi {
  base: () => void;
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
}

const EASE = 0.06;
const EASE_FOCUS = 0.13;
const DRAG_PX = 6;
const KEY_PAN_PX = 80;

export function useCampusCamera(svgRef: RefObject<SVGSVGElement>, opts: CameraOptions): CameraApi {
  const o = useRef(opts);
  o.current = opts;
  const cam = useRef<Cam | null>(null);
  const target = useRef<Cam | null>(null);
  const mode = useRef<'free' | 'base' | 'follow'>('base');
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
    base: () => { const v = vp(); if (!v) return; mode.current = 'base'; go(baseView(v, resolve(o.current.insets, v))); },
    focus: (b) => { const v = vp(); if (!v) return; mode.current = 'free'; go(focusView(v, b, resolve(o.current.focusInsets ?? o.current.insets, v)), EASE_FOCUS); },
    follow: () => { if (!vp()) return; mode.current = 'follow'; go(target.current ?? cam.current!, EASE); },
    zoom: (f) => { const v = vp(); if (!v || !cam.current) return; mode.current = 'free'; go(zoomBy(target.current ?? cam.current, f)); },
  }), [go]);
  if (opts.apiRef) opts.apiRef.current = api;

  useEffect(() => {
    const el = svgRef.current;
    if (!el || !o.current.enabled) return undefined;
    // First frame: the whole campus, at once.
    const v0 = vp();
    if (v0) { cam.current = baseView(v0, resolve(o.current.insets, v0)); target.current = cam.current; write(v0); }

    let drag: { x: number; y: number; moved: boolean } | null = null;
    const down = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY, moved: false }; };
    const move = (e: PointerEvent) => {
      const v = vp();
      if (!drag || !v || !cam.current) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_PX) return;
      drag.moved = true; mode.current = 'free';
      cam.current = panBy(cam.current, v, dx, dy); target.current = cam.current;
      drag.x = e.clientX; drag.y = e.clientY;
      write(v);
    };
    const up = () => { window.setTimeout(() => { drag = null; }, 0); };
    const click = (e: MouseEvent) => { if (drag?.moved) { e.stopPropagation(); e.preventDefault(); } };
    const wheel = (e: WheelEvent) => { e.preventDefault(); api.zoom(Math.exp(e.deltaY * 0.0015)); };
    const key = (e: KeyboardEvent) => {
      const d: Record<string, [number, number]> = { ArrowLeft: [KEY_PAN_PX, 0], ArrowRight: [-KEY_PAN_PX, 0], ArrowUp: [0, KEY_PAN_PX], ArrowDown: [0, -KEY_PAN_PX] };
      const v = vp();
      if (!d[e.key] || !v || !cam.current) return;
      e.preventDefault(); mode.current = 'free';
      go(panBy(target.current ?? cam.current, v, d[e.key][0], d[e.key][1]));
    };
    const focusIn = (e: FocusEvent) => {
      const v = vp();
      const id = (e.target as Element | null)?.closest?.('[data-building]')?.getAttribute('data-building');
      const p = id ? o.current.locate(id) : null;
      if (!v || !p || !cam.current || inView(target.current ?? cam.current, v, p)) return;
      mode.current = 'free';
      go({ ...(target.current ?? cam.current), cx: p.x, cy: p.y - 40 });
    };
    const resize = () => { const v = vp(); if (v && mode.current === 'base') { cam.current = baseView(v, resolve(o.current.insets, v)); target.current = cam.current; write(v); } else if (v) write(v); };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    el.addEventListener('click', click, true);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('keydown', key);
    el.addEventListener('focusin', focusIn);
    window.addEventListener('resize', resize);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      el.removeEventListener('click', click, true);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('keydown', key);
      el.removeEventListener('focusin', focusIn);
      window.removeEventListener('resize', resize);
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, [api, go]);

  return api;
}
