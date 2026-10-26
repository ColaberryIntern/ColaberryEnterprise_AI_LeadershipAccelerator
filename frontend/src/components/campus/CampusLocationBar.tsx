import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import CampusMiniMap from './CampusMiniMap';
import WhereTo from './WhereTo';
import { useCampus } from './CampusContext';
import { useCampusView } from './useCampusView';
import { trailFor } from './campusTrail';
import { shouldStepOutside } from './campusEsc';
import { useMyPhoto } from './home/useMyPhoto';
import { readParticipant } from '../../pages/portal/today/shellUtils';
import type { BuildingId } from './campusMap';
import './campusLocbar.css';

/**
 * The location bar on every campus page (Campus round 3 §2.4, the prototype's .locbar), in place of the dark banner's top row:
 * ONE light bar, 56 px, the full width of the page under the portal header, on the page's own columns.
 *  - left: "Campus map" (the round mini map + label) opens the map at this building;
 *  - middle: ⌂ Campus › ■ <Building> (steps back into the room) › <room>, an ellipsis when it does not fit;
 *  - right: ← Step outside, 🔍 Where to? /, and you (the Me panel, WP-7).
 * Every control is 36 px, 13.5 px, and never wraps (labels sit in an ellipsis span). No "Next" button: Up next is in the rail.
 * It sticks to the top once the header scrolls away (a soft shadow when scrolled). Esc steps outside (campusEsc guards it).
 * A coach mark, once per browser session, 800 ms after the first page, explains Step outside and Campus map; it hides after 4.2 s.
 *
 * `next` (Ali, 2026-10-24): the page's own sticky "next task" (the condensedSlot a page hands PortalShell, shown once you scroll
 * past its hero) used to ride in the portal header; the campus hid it when the bar arrived. It now rides IN the bar, in the middle
 * column to the right of the left navigation, in place of the trail while you are scrolled down; back at the top, the trail returns.
 * Campus map, Step outside and Where to? never move.
 */
export const COACH_KEY = 'colaberry.campus.coach';
export const COACH_DELAY_MS = 800;
export const COACH_SHOW_MS = 4200;

function useCoachMark(): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let seen = true;
    try { seen = window.sessionStorage.getItem(COACH_KEY) === '1'; window.sessionStorage.setItem(COACH_KEY, '1'); } catch { /* no storage: no coach */ }
    if (seen) return undefined;
    const on = window.setTimeout(() => setShow(true), COACH_DELAY_MS);
    const off = window.setTimeout(() => setShow(false), COACH_DELAY_MS + COACH_SHOW_MS);
    return () => { window.clearTimeout(on); window.clearTimeout(off); };
  }, []);
  return show;
}

function useScrolled(): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return scrolled;
}

export default function CampusLocationBar({ next = null }: { next?: React.ReactNode } = {}): React.ReactElement | null {
  const { active, settings, layer, openMap, stepOutside, openMe } = useCampus();
  const { buildings } = useCampusView();
  const { pathname } = useLocation();
  const photo = useMyPhoto(active, false); // PortalShell already reads it once
  const coach = useCoachMark();
  const scrolled = useScrolled();
  const crumbs = trailFor(pathname, buildings, settings.workplaceNames);
  const here = (crumbs[1]?.buildingId ?? null) as BuildingId | null;
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e: KeyboardEvent) => { if (shouldStepOutside(e, layer !== 'none')) stepOutside(here); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, layer, here, stepOutside]);
  if (!active) return null;
  const building = crumbs[1];
  // the prototype drops the room when it carries the building's own name ("Classroom › Classroom")
  const room = crumbs[2] && crumbs[2].label !== building?.label ? crumbs[2] : undefined;
  return (
    <nav className={`cm-locbar${scrolled ? ' is-scrolled' : ''}`} aria-label="Where you are on campus" data-testid="cm-locbar">
      <button type="button" className="cm-lb-map" onClick={() => openMap(here ?? undefined)} title="Back to the campus map" data-testid="cm-locbar-map">
        <span className="cm-lb-mm" aria-hidden="true">
          <CampusMiniMap variant="tile" buildings={buildings} here={here} workplaceNames={settings.workplaceNames} reduceMotion={settings.reduceMotion} />
        </span>
        <span className="cm-lb-t">Campus map</span>
      </button>
      {next ? <div className="cm-lb-next" role="region" aria-label="Your next step" data-testid="cm-lb-next">{next}</div> : (
      <ol className="cm-lb-crumbs" data-testid="cm-trail">
        <li className="cm-crumb-home"><button type="button" onClick={() => openMap()} data-testid="cm-crumb-campus"><span className="cm-lb-t">Campus</span></button></li>
        {building && (
          <li className={`cm-crumb-b cm-b-${building.buildingId}`}>
            {room
              ? <button type="button" onClick={() => stepOutside(here)} data-testid="cm-crumb-building"><span className="sq" aria-hidden="true" /><span className="cm-lb-t">{building.label}</span></button>
              : <span className="cur" aria-current="page"><span className="sq" aria-hidden="true" /><span className="cm-lb-t">{building.label}</span></span>}
          </li>
        )}
        {room && <li><span className="cur" aria-current="page"><span className="cm-lb-t">{room.label}</span></span></li>}
      </ol>)}
      <div className="cm-lb-acts">
        <button type="button" className="cm-lb-btn" onClick={() => stepOutside(here)} data-testid="cm-step-out"><span aria-hidden="true" className="cm-lb-ic">←</span><span className="cm-lb-t">Step outside</span></button>
        <div className="cm-lb-where"><WhereTo placeholder="Where to?" /></div>
        <button type="button" className="cm-lb-me" onClick={openMe} aria-label="You: your look, photo and campus settings" data-testid="cm-banner-me">
          {photo ? <img src={photo} alt="" /> : readParticipant().initials}
        </button>
      </div>
      {coach && (
        <div className="cm-coach" role="status" data-testid="cm-coach">
          You&rsquo;re still on campus. <b>Step outside</b> goes back into the room; <b>Campus map</b> takes you to the map.
        </div>
      )}
    </nav>
  );
}
