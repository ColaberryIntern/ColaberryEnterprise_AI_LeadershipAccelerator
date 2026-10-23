import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import CampusMiniMap from './CampusMiniMap';
import WhereTo from './WhereTo';
import { useCampus } from './CampusContext';
import { useCampusView } from './useCampusView';
import { trailFor } from './campusTrail';
import { shouldStepOutside } from './campusEsc';
import CampusLive from './CampusLive';
import CampusRail from './CampusRail';
import { nextStop } from './campusPlan';
import type { BuildingId } from './campusMap';
import CampusMeHost from './home/CampusMeHost';
import { useMyPhoto } from './home/useMyPhoto';
import { readParticipant } from '../../pages/portal/today/shellUtils';
import './campus.css';
import './campusBanner.css';
import './campusPageChrome.css';
import './campusLive.css';
import './campusPanels.css'; // WP-7: the page bar's 'you' button and the Me panel

/**
 * The campus banner on every campus page (Colaberry Campus C3): a mini-map (opens the full map at
 * this building), the trail "Campus > Building > Room", "Step outside" (zooms back out to this
 * building's door) and "Where to?". Esc on the page also steps outside, guarded by campusEsc so it
 * never steals a key press from a drawer, a modal, a text field or fullscreen.
 *
 * Stateless: everything it shows comes from CampusContext, which lives beside <Outlet/> and survives
 * navigation. Rendered by both page chromes (PortalShell and the legacy PortalLayout) and by the
 * Showcase page, only while the campus is active. "Next" (C8) is the first unfinished step of today's plan outside this building.
 */
/** C11b: the prototype's first-visit hint under the page bar, until you dismiss it once (per browser). */
export const PAGE_HINT_KEY = 'colaberry.campus.hint.page';
function PageHint(): React.ReactElement | null {
  const [show, setShow] = useState(() => { try { return window.localStorage.getItem(PAGE_HINT_KEY) !== '1'; } catch { return false; } });
  if (!show) return null;
  const close = () => { setShow(false); try { window.localStorage.setItem(PAGE_HINT_KEY, '1'); } catch { /* no storage */ } };
  return (
    <div className="cm-page-hint" role="note" data-testid="cm-page-hint">
      <span>You&rsquo;re still on campus. <b>Step outside</b>, tap a building on the map, or press Esc to go back out.</span>
      <button type="button" className="cm-page-hint-x" onClick={close} aria-label="Dismiss the campus hint">×</button>
    </div>
  );
}

/**
 * WP-1: on screens too narrow for the rail column (and on pages with no rail of their own), the banner's "Next steps" button opens
 * the same rail as a drawer, so your next steps and the tour are never more than one tap away. Esc or the close button shuts it.
 */
function NextStepsDrawer(): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="cm-btn is-secondary cm-steps-btn" onClick={() => setOpen(true)} aria-expanded={open} data-testid="cm-steps-open">Next steps</button>
      {open && (
        <div className="cm-steps-drawer" role="dialog" aria-modal="true" aria-label="Your next steps" data-testid="cm-steps-drawer"
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } }}>
          <button type="button" className="cm-steps-x" onClick={() => setOpen(false)} aria-label="Close your next steps" autoFocus>×</button>
          <CampusRail />
        </div>
      )}
    </>
  );
}

export default function CampusBanner({ alwaysSteps = false }: { alwaysSteps?: boolean }): React.ReactElement {
  const { settings, layer, openMap, stepOutside, enterThroughDoor, planStops, openMe, active } = useCampus();
  const photo = useMyPhoto(active, false); // WP-7 (PortalShell already reads it once): you, on the page bar (the prototype's .pg-head .me), opens the Me panel
  const { buildings, isExplorer } = useCampusView();
  const { pathname } = useLocation();
  const crumbs = trailFor(pathname, buildings, settings.workplaceNames);
  const here = (crumbs[1]?.buildingId ?? null) as BuildingId | null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (shouldStepOutside(e, layer !== 'none')) stepOutside(here); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [layer, here, stepOutside]);

  // C8: Next = the first unfinished plan step not in this building (campusPlan). Absent when there is no plan.
  const next = planStops ? nextStop(planStops, here) : null;


  return (
    <div className={`cm-banner cm-pagebar${alwaysSteps ? ' has-steps' : ''}`} data-testid="cm-banner">
      <button type="button" className="cm-banner-mini" onClick={() => openMap(here ?? undefined)} aria-label="Open the campus map">
        <span aria-hidden="true" className="cm-banner-mini-map">
          {/* WP-3: the prototype's schematic tile (miniMapSVG): grey blocks, this building in its colour, a red pin */}
          <CampusMiniMap variant="tile" buildings={buildings} here={here} workplaceNames={settings.workplaceNames} reduceMotion={settings.reduceMotion} />
        </span>
      </button>
      <nav className="cm-trail" aria-label="Where you are on campus">
        <ol data-testid="cm-trail">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <li key={i} className={c.buildingId ? `cm-crumb-b cm-b-${c.buildingId}` : i === 0 ? 'cm-crumb-home' : undefined}>
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
      {next && (
        <button type="button" className="cm-btn cm-next" data-testid="cm-next" onClick={() => enterThroughDoor(next.route, null)}
          title={next.title}>Next: {next.title}</button>
      )}
      <button type="button" className="cm-btn is-secondary cm-step-out" onClick={() => stepOutside(here)} data-testid="cm-step-out">
        Step outside
      </button>
      <NextStepsDrawer />
      <button type="button" className="cm-me cm-banner-me" onClick={openMe} aria-label="You: your look, photo and campus settings" data-testid="cm-banner-me">
        {photo ? <img src={photo} alt="" /> : readParticipant().initials}
      </button>
      <CampusMeHost />
      {/* C8: what is on air now (renders nothing when nothing is) */}
      <CampusLive />
      <PageHint />
    </div>
  );
}
