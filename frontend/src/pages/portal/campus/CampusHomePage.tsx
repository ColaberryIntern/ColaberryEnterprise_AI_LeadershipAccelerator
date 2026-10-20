import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import CampusWorld from '../../../components/campus/CampusWorld';
import CampusTopBar from '../../../components/campus/home/CampusTopBar';
import CampusConcierge from '../../../components/campus/home/CampusConcierge';
import { pulseOf } from '../../../components/campus/home/CampusConcierge';
import { useHomeFacts } from '../../../components/campus/home/useHomeFacts';
import { useCampus } from '../../../components/campus/CampusContext';
import { useCampusView } from '../../../components/campus/useCampusView';
import { useCampusWorldProps } from '../../../components/campus/useCampusWorldProps';
import { useCampusOnAir, headlineBroadcast } from '../../../components/campus/campusOnAir';
import { buildingName } from '../../../components/campus/campusMap';
import type { BuildingId } from '../../../components/campus/campusMap';
import type { Viewport } from '../../../components/campus/campusCamera';
import CampusListView from '../../../components/campus/CampusListView';
import CampusDoorTransition from '../../../components/campus/CampusDoorTransition';
import CampusDmToast from '../../../components/campus/CampusDmToast';
import CampusTabBar from '../../../components/campus/CampusTabBar';
import { readParticipant } from '../today/shellUtils';
import '../../../components/campus/campus.css';
import '../../../components/campus/campusLive.css';
import '../../../components/campus/campusPeople.css';
import '../../../components/campus/campusTour.css';
import '../../../components/campus/campusLook.css';
import '../../../components/campus/campusAudiences.css';
import '../../../components/campus/campusBanner.css';
import '../../../components/campus/campusHome.css';

/**
 * The campus home, /portal/campus (C11b, decision D1): the prototype's main screen. The walkable campus fills the screen; the top
 * bar and the concierge float over it. It is full-bleed (no PortalShell), so it mounts what the shell would have: the list view,
 * the door transition (rooms open through it), the DM toast and, on phones, the campus tab bar.
 *
 * Every "open the map" in the campus (search, the tab bar's Map, a tour start) lands HERE as a walk on this map instead of opening
 * the overlay on top of it; leaving the page closes that layer so the overlay never pops up on the next page.
 *
 * With the campus off (flag, or the learner chose the classic menu) the page is not a campus: it goes to Today.
 */
const HOME_INSETS = (v: Viewport) => (v.W <= 760
  ? { left: 0, top: 118, right: 0, bottom: v.H * 0.4 + 66 }
  : { left: 420, top: 70, right: 0, bottom: 0 });

export default function CampusHomePage(): React.ReactElement {
  const campus = useCampus();
  const { audience, buildings, accessOf } = useCampusView();
  const { broadcasts, buildings: onAirSet } = useCampusOnAir();
  const facts = useHomeFacts(audience === 'member');
  const [walk, setWalk] = useState<{ id: BuildingId; seq: number } | null>(null);
  const [hereId, setHereId] = useState<BuildingId | null>(null);
  const goTo = useCallback((id: BuildingId) => { setHereId(id); setWalk((w) => ({ id, seq: (w?.seq ?? 0) + 1 })); }, []);
  const stay = useCallback(() => undefined, []);
  const { props, tour } = useCampusWorldProps(stay, stay, null);

  // Requests to open the overlay map become walks here.
  const { layer, mapFocus, closeLayer } = campus;
  const layerRef = useRef(layer); layerRef.current = layer;
  const closeRef = useRef(closeLayer); closeRef.current = closeLayer;
  useEffect(() => { if (layer === 'map' && mapFocus) goTo(mapFocus); }, [layer, mapFocus, goTo]);
  useEffect(() => () => { if (layerRef.current === 'map') closeRef.current(); }, []);

  const online = useMemo(() => (campus.presence && !campus.presenceError ? pulseOf(campus.presence, buildings).total : null), [campus.presence, campus.presenceError, buildings]);
  const live = useMemo(() => {
    const h = headlineBroadcast(broadcasts);
    return h ? { title: h.title, buildingId: ([...onAirSet][0] ?? null) as BuildingId | null } : null;
  }, [broadcasts, onAirSet]);

  if (!campus.ready) return <div className="cm-home" aria-busy="true" data-testid="cm-home-loading" />;
  if (!campus.active) return <Navigate to="/portal/today?stay=1" replace />;
  const here = hereId ? buildings.find((b) => b.id === hereId) : undefined;
  const reduce = campus.settings.reduceMotion;
  return (
    <div className={`cm-home cm-scope${reduce ? ' is-reduced' : ''}`} data-testid="cm-home">
      <CampusWorld {...props} insets={HOME_INSETS} walkTo={walk} />
      <CampusTopBar audience={audience} online={online} points={campus.look?.points ?? null} rung={campus.look?.rung_name || null}
        streak={facts.streak} initials={facts.initials || readParticipant().initials} onList={campus.openList} />
      <CampusConcierge audience={audience} firstName={facts.firstName} hereName={here ? buildingName(here, campus.settings.workplaceNames) : 'main gate'}
        buildings={buildings} accessOf={accessOf} workplaceNames={campus.settings.workplaceNames} presence={campus.presence} presenceError={campus.presenceError}
        desks={campus.staffDesks} stops={campus.planStops} live={live} hasTour={!!tour && campus.tourIndex === null} now={new Date()}
        onWalk={goTo} onTour={campus.startTour} />
      <CampusTabBar active="/portal/campus" />
      <CampusListView />
      <CampusDoorTransition />
      <CampusDmToast />
    </div>
  );
}
