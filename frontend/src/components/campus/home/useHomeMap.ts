import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { useCampus } from '../CampusContext';
import type { BuildingId } from '../campusMap';
import type { Cam, Insets, Viewport } from '../campusCamera';
import type { CameraApi } from '../useCampusCamera';

/**
 * The campus home's map choreography (WP-1), kept out of the page so it stays readable:
 *  - the panels' insets, measured from the side panel as it is rendered (never hard-coded: the panel is always there now);
 *  - map requests from anywhere in the campus (CampusMapRoute sends them here): walk to a building, stand inside it at once (Step
 *    outside from a page), or, with no building (the phone tab bar's Map), close every card and show the whole campus;
 *  - the entry: the camera starts on the gate close-up and, 900 ms into the doors opening, eases out to the whole campus (.035);
 *  - leaving the home pauses a tour and closes the locker, so neither pops up again on the next page.
 */
export const GATE_CLOSE_UP: Cam = { cx: 500, cy: 600, w: 300 };
const GATE_FLY_OUT_MS = 900;
const GATE_FLY_OUT_EASE = 0.035;

/** Screen px the home's panels cover: the side panel's rendered right edge (desktop) or its sheet / peek strip (phone). */
export function homeInsets(v: Viewport): Insets {
  const el = typeof document !== 'undefined' ? document.querySelector('.cm-home [data-testid="cm-concierge"]') : null;
  const r = el?.getBoundingClientRect();
  const ok = !!r && r.width > 0 && r.height > 0;
  if (v.W <= 760) {
    if (ok && r!.top > v.H / 2) return { left: 0, top: 118, right: 0, bottom: v.H - r!.top + 10 };
    return { left: 0, top: ok ? Math.max(118, r!.bottom + 8) : 118, right: 0, bottom: ok ? 66 : v.H * 0.4 + 66 };
  }
  return { left: ok ? r!.right + 16 : 420, top: 70, right: 0, bottom: 0 };
}

export interface HomeMap {
  camRef: MutableRefObject<CameraApi | null>;
  startCam: Cam | undefined;
  walk: { id: BuildingId; seq: number; instant?: boolean } | null;
  recenter: number;
  goTo: (id: BuildingId) => void;
  /** Close every card and ease back to the whole campus (R7, R10). */
  backToCampus: () => void;
  /** The gate's doors started opening. */
  onGateOpening: () => void;
}

export function useHomeMap(gateShown: boolean): HomeMap {
  const campus = useCampus();
  const camRef = useRef<CameraApi | null>(null);
  const [startCam] = useState<Cam | undefined>(() => (gateShown ? GATE_CLOSE_UP : undefined));
  const [walk, setWalk] = useState<HomeMap['walk']>(null);
  const [recenter, setRecenter] = useState(0);
  const { setHere, layer, mapFocus, mapHow, ackMap, tourIndex, lockerOpen, closeLayer } = campus;

  const goTo = useCallback((id: BuildingId) => { setHere(id); setWalk((w) => ({ id, seq: (w?.seq ?? 0) + 1 })); }, [setHere]);
  const backToCampus = useCallback(() => setRecenter((n) => n + 1), []);

  // A map request: walk there, stand inside it, or (nothing named, no tour or locker opening) the whole campus. Then acknowledge.
  const busy = useRef({ tourIndex, lockerOpen });
  busy.current = { tourIndex, lockerOpen };
  useEffect(() => {
    if (layer !== 'map') return;
    if (mapFocus) { setHere(mapFocus); setWalk((w) => ({ id: mapFocus, seq: (w?.seq ?? 0) + 1, instant: mapHow === 'inside' })); }
    else if (busy.current.tourIndex === null && !busy.current.lockerOpen) setRecenter((n) => n + 1);
    ackMap();
  }, [layer, mapFocus, mapHow, ackMap, setHere]);

  // The list closing is a return to the campus too (R10).
  const prevLayer = useRef(layer);
  useEffect(() => { if (prevLayer.current === 'list' && layer === 'none') camRef.current?.recenter(); prevLayer.current = layer; }, [layer]);

  // Leaving the home: pause a running tour, close the locker. Deferred one tick, so React's development double-mount does not
  // end a tour that is just starting.
  const mounted = useRef(true);
  const closeRef = useRef(closeLayer);
  closeRef.current = closeLayer;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; window.setTimeout(() => { if (!mounted.current) closeRef.current(); }, 0); };
  }, []);

  // The side panel changing size (its data arriving, the phone sheet growing) re-fits the whole-campus view to the space it leaves.
  useEffect(() => {
    const el = document.querySelector('.cm-home [data-testid="cm-concierge"]');
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => camRef.current?.refit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [campus.ready, campus.active]); // the panel exists once the campus is ready and on

  const flyTimer = useRef<number | null>(null);
  useEffect(() => () => { if (flyTimer.current !== null) window.clearTimeout(flyTimer.current); }, []);
  const onGateOpening = useCallback(() => {
    flyTimer.current = window.setTimeout(() => { flyTimer.current = null; camRef.current?.base(GATE_FLY_OUT_EASE); }, GATE_FLY_OUT_MS);
  }, []);

  return { camRef, startCam, walk, recenter, goTo, backToCampus, onGateOpening };
}
