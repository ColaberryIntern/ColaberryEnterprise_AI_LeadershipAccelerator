import './campusBanner.css'; // the door panel's styles travel with the component
import React, { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCampus } from './CampusContext';

/**
 * Plays the campus door transitions (Colaberry Campus C3).
 *
 *  - IN: a page-colored panel grows from the building's door rect to the full screen, then the real
 *    page is opened (navigate) and the map closes.
 *  - OUT ("Step outside"): the campus home opens with you standing inside the building (WP-1: one map; the page asks for
 *    /portal/campus and the home's own transition plays the rest), and a page-colored panel shrinks from full screen into that
 *    building on the map, so it reads as zooming back out through the same door.
 *
 * Reduce motion (setting or OS): no panel, no animation, no timer - the navigation / map happens at
 * once. Otherwise element.animate is used when the browser has it.
 *
 * SAFETY: the follow-up action runs on the animation's `finished` OR a hard 800 ms fallback, whichever
 * comes first, and only once - a cancelled animation, a hidden tab or a promise that never settles
 * cannot strand the learner between the map and the page.
 */
export const DOOR_MS = 450;
export const DOOR_FALLBACK_MS = 800;

type Rect = { left: number; top: number; width: number; height: number };
const insetOf = (r: Rect): string => {
  const w = window.innerWidth, h = window.innerHeight;
  return `inset(${Math.max(0, r.top)}px ${Math.max(0, w - r.left - r.width)}px ${Math.max(0, h - r.top - r.height)}px ${Math.max(0, r.left)}px round 12px)`;
};
const FULL = 'inset(0px 0px 0px 0px round 0px)';
const centerRect = (): Rect => ({ left: window.innerWidth / 2 - 40, top: window.innerHeight / 2 - 30, width: 80, height: 60 });

export default function CampusDoorTransition(): React.ReactElement | null {
  const { door, clearDoor, settings, openMap, closeLayer } = useCampus();
  const navigate = useNavigate();
  const onHome = useLocation().pathname === '/portal/campus';
  const panel = useRef<HTMLDivElement | null>(null);
  const reduce = settings.reduceMotion;

  useEffect(() => {
    if (!door) return undefined;
    let done = false;
    let timer: number | undefined;
    const once = (fn: () => void) => () => { if (done) return; done = true; if (timer !== undefined) window.clearTimeout(timer); fn(); clearDoor(); };

    if (door.phase === 'in') {
      const finish = once(() => { closeLayer(); navigate(door.route); });
      const el = panel.current;
      if (reduce || !el || typeof el.animate !== 'function') { finish(); return undefined; }
      timer = window.setTimeout(finish, DOOR_FALLBACK_MS);
      const anim = el.animate([{ clipPath: insetOf(door.from ?? centerRect()) }, { clipPath: FULL }], { duration: DOOR_MS, easing: 'cubic-bezier(.65,0,.25,1)', fill: 'forwards' });
      anim.finished.then(finish, finish);
      return () => { done = true; if (timer !== undefined) window.clearTimeout(timer); };
    }

    // OUT from a page: ask the home to stand you inside the building; the home's own transition (this component, mounted there)
    // finishes the animation and clears the request.
    if (!onHome) { openMap(door.buildingId ?? undefined, 'inside'); return undefined; }
    // OUT on the home: shrink the panel into the building's spot on the map.
    const finish = once(() => undefined);
    const el = panel.current;
    if (reduce || !el || typeof el.animate !== 'function') { finish(); return undefined; }
    timer = window.setTimeout(finish, DOOR_FALLBACK_MS);
    const target = door.buildingId ? document.querySelector(`.cm-home .cm-bld[data-building="${door.buildingId}"]`)?.getBoundingClientRect() : null;
    const anim = el.animate([{ clipPath: FULL }, { clipPath: insetOf(target ?? centerRect()) }], { duration: DOOR_MS, easing: 'cubic-bezier(.65,0,.25,1)', fill: 'forwards' });
    anim.finished.then(finish, finish);
    return () => { done = true; if (timer !== undefined) window.clearTimeout(timer); };
    // door.id changes per request; the other deps are stable callbacks / settings.
  }, [door, reduce, clearDoor, closeLayer, navigate, openMap, onHome]);

  if (!door || reduce) return null;
  return <div ref={panel} className="cm-door-panel" data-testid="cm-door" aria-hidden="true" />;
}
