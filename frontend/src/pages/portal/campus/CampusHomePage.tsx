import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import CampusWorld from '../../../components/campus/CampusWorld';
import CampusTopBar from '../../../components/campus/home/CampusTopBar';
import CampusConcierge from '../../../components/campus/home/CampusConcierge';
import { pulseOf } from '../../../components/campus/home/CampusConcierge';
import { useHomeFacts } from '../../../components/campus/home/useHomeFacts';
import CampusGate, { gateSeen } from '../../../components/campus/home/CampusGate';
import CampusMePanel from '../../../components/campus/home/CampusMePanel';
import { useHomeMap, homeInsets } from '../../../components/campus/home/useHomeMap';
import { useCampus } from '../../../components/campus/CampusContext';
import { useCampusView } from '../../../components/campus/useCampusView';
import { useCampusWorldProps } from '../../../components/campus/useCampusWorldProps';
import { useCampusOnAir, headlineBroadcast } from '../../../components/campus/campusOnAir';
import { buildingName } from '../../../components/campus/campusMap';
import type { BuildingId } from '../../../components/campus/campusMap';
import CampusListView from '../../../components/campus/CampusListView';
import CampusDoorTransition from '../../../components/campus/CampusDoorTransition';
import CampusDmToast from '../../../components/campus/CampusDmToast';
import CampusTabBar from '../../../components/campus/CampusTabBar';
import CampusLive from '../../../components/campus/CampusLive';
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
 * bar and the side panel (the concierge) float over it. It is full-bleed (no PortalShell), so it mounts what the shell would have:
 * the list view, the door transition (rooms open through it), the DM toast and, on phones, the campus tab bar.
 *
 * WP-1: this is the ONLY map. Every "open the map" in the campus, from any page, lands here (useHomeMap reads the request); the
 * side panel is always visible (a peek strip on a phone while a card is open); the camera recenters on every return to the campus;
 * and where you are survives a page visit (CampusContext.here), so coming back never restarts you at the gate.
 *
 * With the campus off (flag, or the learner chose the classic menu) the page is not a campus: it goes to Today.
 */
export default function CampusHomePage(): React.ReactElement {
  const campus = useCampus();
  const { audience, buildings, accessOf } = useCampusView();
  const { broadcasts, buildings: onAirSet } = useCampusOnAir();
  const facts = useHomeFacts(audience === 'member');
  const [cardOpen, setCardOpen] = useState(false);
  const [meOpen, setMeOpen] = useState(false);
  // D7: the entry gate, once per Central day (decided once, on the first render of the page).
  const [gateOpen, setGateOpen] = useState(() => !gateSeen(new Date()));
  const map = useHomeMap(gateOpen);
  const { setHere } = campus;
  // The building whose card opened is where you now are.
  const onCard = useCallback((s: { open: boolean; building: BuildingId | null }) => { setCardOpen(s.open); if (s.building) setHere(s.building); }, [setHere]);
  const stay = useCallback(() => undefined, []);
  const { props, tour, touring } = useCampusWorldProps(stay, stay, null);

  // The home shows Colaberry Live as the prototype's top pill (CampusLive below), so the portal-wide live-now badge steps aside here.
  useEffect(() => { document.documentElement.classList.add('cm-on-home'); return () => document.documentElement.classList.remove('cm-on-home'); }, []);

  const online = useMemo(() => (campus.presence && !campus.presenceError ? pulseOf(campus.presence, buildings).total : null), [campus.presence, campus.presenceError, buildings]);
  const live = useMemo(() => {
    const h = headlineBroadcast(broadcasts);
    return h ? { title: h.title, buildingId: ([...onAirSet][0] ?? null) as BuildingId | null } : null;
  }, [broadcasts, onAirSet]);

  if (!campus.ready) return <div className="cm-home" aria-busy="true" data-testid="cm-home-loading" />;
  if (!campus.active) return <Navigate to="/portal/today?stay=1" replace />;
  const here = campus.here ? buildings.find((b) => b.id === campus.here) : undefined;
  const reduce = campus.settings.reduceMotion;
  const initials = facts.initials || readParticipant().initials;
  const enter = (t: boolean) => { setGateOpen(false); if (reduce) map.camRef.current?.base(); if (t) campus.startTour(); };
  return (
    <div className={`cm-home cm-scope${reduce ? ' is-reduced' : ''}`} data-testid="cm-home">
      {gateOpen && <CampusGate audience={audience} firstName={facts.firstName} fullName={facts.fullName} initials={initials}
        rung={campus.look?.rung_name || null} points={campus.look?.points ?? null} streak={facts.streak} online={online} workplace={campus.settings.workplaceNames}
        hasTour={!!tour} reduceMotion={reduce} now={new Date()} onOpening={map.onGateOpening} onEnter={enter} />}
      <CampusWorld {...props} insets={homeInsets} walkTo={map.walk} onCard={onCard} cameraRef={map.camRef} startAt={campus.here}
        startCam={map.startCam} recenter={map.recenter} />
      <CampusTopBar audience={audience} online={online} points={campus.look?.points ?? null} rung={campus.look?.rung_name || null}
        streak={facts.streak} initials={initials} onList={campus.openList} onMe={() => setMeOpen((v) => !v)} />
      {meOpen && <CampusMePanel audience={audience} fullName={facts.fullName} initials={initials} onClose={() => { setMeOpen(false); map.camRef.current?.recenter(); }} />}
      <CampusConcierge cardOpen={cardOpen} audience={audience} firstName={facts.firstName} hereName={here ? buildingName(here, campus.settings.workplaceNames) : 'main gate'}
        hereId={here ? here.id : null} buildings={buildings} accessOf={accessOf} workplaceNames={campus.settings.workplaceNames} presence={campus.presence}
        presenceError={campus.presenceError} desks={campus.staffDesks} stops={campus.planStops} live={live} now={new Date()}
        tourStops={tour ? tour.stops : null} touring={touring} tourProgress={campus.tourProgress}
        onWalk={map.goTo} onTour={campus.resumeTour} onEndTour={campus.endTour} onOpen={(r) => campus.enterThroughDoor(r, null)} />
      <div className="cm-home-livebar"><CampusLive /></div>
      <CampusTabBar active="/portal/campus" />
      <CampusListView />
      <CampusDoorTransition />
      <CampusDmToast />
    </div>
  );
}
