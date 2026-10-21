import React, { useEffect, useRef } from 'react';
import CampusWorld from './CampusWorld';
import CampusDoorTransition from './CampusDoorTransition';
import CampusDmToast from './CampusDmToast';
import CampusMapBarActions from './CampusMapBarActions';
import { trapTab } from './focusTrap';
import { useReturnFocus } from './useReturnFocus';
import CampusListView from './CampusListView';
import './campusLook.css';
import './campusTour.css';
import './campusPeople.css';
import './campusAudiences.css';
import './campus.css';
import './campusLive.css';
import { useCampus } from './CampusContext';
import { useCampusWorldProps } from './useCampusWorldProps';

/**
 * The full-screen campus layers (Campus C2): the walkable map and the list view. Rendered once
 * by PortalShell when the campus is active, opened from the side nav, the phone tab bar or the
 * list view. Both are dialogs: focus moves in on open and returns to the opener on close. The list view lives in
 * CampusListView.tsx (C11), re-exported here for existing callers.
 */
export { CampusListView };
export function CampusMapOverlay(): React.ReactElement | null {
  const { layer, mapFocus, closeLayer, openList, presenceError, tourIndex, startTour, lockerOpen, openLocker } = useCampus();
  const { props, tour, touring } = useCampusWorldProps(closeLayer, closeLayer, mapFocus);
  const open = layer === 'map';
  const dialog = useRef<HTMLDivElement | null>(null);
  useReturnFocus(open);
  // C7: opening straight into a tour leaves focus on the tour card's heading (CampusTour focuses it; this parent effect runs after).
  const touringRef = useRef(false);
  touringRef.current = tourIndex !== null || lockerOpen; // C9: the locker focuses its own heading too
  useEffect(() => { if (open && !touringRef.current) dialog.current?.focus(); }, [open]);
  if (!open) return null;
  return (
    <div className="cm-layer" role="dialog" aria-modal="true" aria-label="Campus map" tabIndex={-1} ref={dialog} data-testid="cm-overlay"
      onKeyDown={(e) => { if (e.key === 'Escape') closeLayer(); else trapTab(e); }}>
      <div className="cm-layer-bar">
        <strong>Colaberry Campus</strong>
        <span className="cm-layer-hint">Pick a building, or press Tab to move between them.</span>
        {presenceError && <span className="cm-layer-warn" role="status" data-testid="cm-presence-broken">We can't load who's online right now.</span>}
        <CampusMapBarActions showTour={!!tour && touring === null} showLook={!lockerOpen && touring === null}
          onTour={startTour} onLook={openLocker} onList={openList} />
        <button type="button" className="cm-btn is-secondary" onClick={closeLayer} aria-label="Close campus map">Close</button>
      </div>
      <CampusWorld {...props} />
    </div>
  );
}

export default function CampusLayers(): React.ReactElement {
  return <><CampusMapOverlay /><CampusListView /><CampusDoorTransition /><CampusDmToast /></>;
}
