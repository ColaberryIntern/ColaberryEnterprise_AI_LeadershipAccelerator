import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import CampusWorldMap from './CampusWorldMap';
import WhereTo from './WhereTo';
import { useCampus } from './CampusContext';
import { useCampusView } from './useCampusView';
import { trailFor } from './campusTrail';
import { shouldStepOutside } from './campusEsc';
import type { BuildingId } from './campusMap';
import './campus.css';
import './campusBanner.css';

/**
 * The campus banner on every campus page (Colaberry Campus C3): a mini-map (opens the full map at
 * this building), the trail "Campus > Building > Room", "Step outside" (zooms back out to this
 * building's door) and "Where to?". Esc on the page also steps outside, guarded by campusEsc so it
 * never steals a key press from a drawer, a modal, a text field or fullscreen.
 *
 * Stateless: everything it shows comes from CampusContext, which lives beside <Outlet/> and survives
 * navigation. Rendered by both page chromes (PortalShell and the legacy PortalLayout) and by the
 * Showcase page, only while the campus is active. "Next" arrives with C8 (today's plan route).
 */
export default function CampusBanner(): React.ReactElement {
  const { settings, presence, presenceError, layer, openMap, stepOutside } = useCampus();
  const { buildings, accessOf, isExplorer } = useCampusView();
  const { pathname } = useLocation();
  const crumbs = trailFor(pathname, buildings, settings.workplaceNames);
  const here = (crumbs[1]?.buildingId ?? null) as BuildingId | null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (shouldStepOutside(e, layer !== 'none')) stepOutside(here); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [layer, here, stepOutside]);

  const counts: Record<string, number> = {};
  if (presence && !presenceError) for (const [id, a] of Object.entries(presence)) counts[id] = a.count;

  return (
    <div className="cm-banner" data-testid="cm-banner">
      <button type="button" className="cm-banner-mini" onClick={() => openMap(here ?? undefined)} aria-label="Open the campus map">
        <span aria-hidden="true" className="cm-banner-mini-map">
          <CampusWorldMap buildings={buildings} accessOf={accessOf} workplaceNames={settings.workplaceNames}
            reduceMotion compact onArrive={() => undefined} counts={counts} />
        </span>
      </button>
      <nav className="cm-trail" aria-label="Where you are on campus">
        <ol data-testid="cm-trail">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <li key={i}>
                {last
                  ? <span aria-current="page">{c.label}</span>
                  : <button type="button" className="cm-link" onClick={() => openMap((c.buildingId ?? undefined) as BuildingId | undefined)}>{c.label}</button>}
              </li>
            );
          })}
        </ol>
      </nav>
      <WhereTo />
      {/* C6: Explorers get a direct way to their path to enrolling (it lives in the Main Gate card). */}
      {/* Only where the path exists: an Explorer whose campus has the Main Gate (an org manager on an Explorer account gets the
          Partner Office campus, which has no gate and so no path). */}
      {isExplorer && buildings.some((b) => b.id === 'gate') && <button type="button" className="cm-link" data-testid="cm-your-path" onClick={() => openMap('gate')}>Your path</button>}
      <button type="button" className="cm-btn is-secondary cm-step-out" onClick={() => stepOutside(here)} data-testid="cm-step-out">
        Step outside
      </button>
    </div>
  );
}
