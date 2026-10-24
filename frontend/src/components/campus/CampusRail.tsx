import React from 'react';
import { useLocation } from 'react-router-dom';
import { useCampus } from './CampusContext';
import { useCampusView } from './useCampusView';
import { buildingForPath, buildingName } from './campusMap';
import type { BuildingId, CampusBuilding } from './campusMap';
import type { CampusPerson } from './campusApi';
import { initialsOf } from './WhoIsHere';
import { desksForBuilding } from './campusPeople';
import { rungTone } from '../../services/bandLadder';
import { tourFor } from './tourSteps';
import { UpNext, TourOffer } from './home/NextSteps';
import { displayFirstName } from '../../utils/personName';
import './campusPageChrome.css';

/**
 * The campus sections at the top of the right rail on a building's page (C11b, the prototype's page rail): who is in this building
 * now (named people, photo or initials; staff desks), today's plan, and the help desk. Rendered by the cohort contacts rail only
 * while the campus is active; every name and number comes from campus presence, the desks list and the plan.
 *
 * WP-1 (owner rule: always a panel with your next steps and the tours): the rail also carries Up next and the tour card (offer,
 * Resume, taken), the same pieces as the campus home's side panel. It is drawn in the contacts column on wide screens (even with the
 * contacts collapsed), beside the page on the legacy layout, and in the banner's "Next steps" drawer on narrow screens.
 */
export default function CampusRail(): React.ReactElement | null {
  const { active, settings, presence, presenceError, staffDesks, planStops, openPersonCard, openMap, enterThroughDoor, tourProgress, resumeTour, dismissTour } = useCampus();
  const { buildings, audience, accessOf } = useCampusView();
  const { pathname } = useLocation();
  if (!active) return null;
  const here = buildingForPath(pathname);
  const b = here ? buildings.find((x) => x.id === here.id) as CampusBuilding | undefined : undefined;
  const named = (b && presence && !presenceError ? presence[b.id]?.people ?? [] : []).filter((p): p is CampusPerson => 'enrollment_id' in p);
  const deskHere = b ? desksForBuilding(staffDesks, b.id, audience).filter((d) => d.on_duty) : [];
  const allDesks = staffDesks.filter((d) => d.on_duty && (d.id !== 'maya' || audience === 'explorer' || audience === 'staff'));
  const nameOf = (id: BuildingId | null) => { const x = id ? buildings.find((y) => y.id === id) : undefined; return x ? buildingName(x, settings.workplaceNames) : null; };
  const tour = tourFor(audience, buildings, accessOf, settings.workplaceNames);
  return (
    <div className="cm-rail" data-testid="cm-page-rail">
      <UpNext stops={planStops} buildings={buildings} workplaceNames={settings.workplaceNames} hereId={b ? b.id : null}
        onWalk={(id) => openMap(id)} onOpen={(r) => enterThroughDoor(r, null)} />
      <TourOffer audience={audience} stops={tour ? tour.stops : null} buildings={buildings} workplaceNames={settings.workplaceNames}
        running={null} paused={tourProgress.paused} toured={tourProgress.toured} onStart={resumeTour} onDismiss={dismissTour} />
      {b && (
        <section aria-label={`In ${buildingName(b, settings.workplaceNames)}`}>
          <h3 className="cm-rail-h">In {buildingName(b, settings.workplaceNames)}{presence && !presenceError ? ` · ${presence[b.id]?.count ?? 0}` : ''}{deskHere.length ? ' + staff' : ''}</h3>
          <ul className="cm-rail-people">
            {deskHere.map((d) => <li key={d.id}><span className="cm-rail-av is-staff" aria-hidden="true">{initialsOf(d.name)}</span>{d.name} <span className="cm-rail-tag">STAFF</span></li>)}
            {named.slice(0, 6).map((p) => (
              <li key={p.enrollment_id}>
                <button type="button" onClick={() => openPersonCard({ person: p, buildingId: b.id })} aria-label={`${p.display_name}, open their card`}>
                  <span className="cm-rail-av" aria-hidden="true">{p.avatar_url ? <img src={p.avatar_url} alt="" /> : initialsOf(p.display_name)}</span>
                  {displayFirstName(p.display_name)}
                  {p.rung_name && <span className={`cm-rail-lv rung-${rungTone(p.rung_name)}`}>{p.rung_name}</span>}
                </button>
              </li>
            ))}
            {!named.length && !deskHere.length && <li className="cm-rail-quiet">Nobody else here right now.</li>}
          </ul>
        </section>
      )}
      {planStops && planStops.length > 0 && (
        <section aria-label="Today's plan">
          <h3 className="cm-rail-h">Today&rsquo;s plan</h3>
          <ol className="cm-rail-plan">
            {planStops.map((s, i) => (
              <li key={s.key} className={s.done ? 'is-done' : ''}>
                <button type="button" onClick={() => enterThroughDoor(s.route, null)}>
                  <span className="cm-pl-n" aria-hidden="true">{s.done ? '✓' : i + 1}</span>
                  <span><b>{s.title}</b>{nameOf(s.buildingId) && <small>{nameOf(s.buildingId)}</small>}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
      {allDesks.length > 0 && (
        <section aria-label="Help desk">
          <h3 className="cm-rail-h">Help desk &middot; 24/7</h3>
          <div className="cm-rail-desks">
            {allDesks.map((d) => (
              <button key={d.id} type="button" className="cm-sbtn" onClick={() => openMap(d.building as BuildingId)} aria-label={`${d.name}, ${d.title}, walk to their desk`}>
                <span className="cm-sav" aria-hidden="true">{initialsOf(d.name)}</span>{d.name}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
