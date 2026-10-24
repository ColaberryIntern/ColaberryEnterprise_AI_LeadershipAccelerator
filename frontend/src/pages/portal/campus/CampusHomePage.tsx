import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import CampusWorld from '../../../components/campus/CampusWorld';
import CampusTopBar from '../../../components/campus/home/CampusTopBar';
import CampusConcierge from '../../../components/campus/home/CampusConcierge';
import { pulseOf } from '../../../components/campus/home/CampusConcierge';
import { useHomeFacts } from '../../../components/campus/home/useHomeFacts';
import CampusGate, { gateSeen } from '../../../components/campus/home/CampusGate';
import CampusMeHost from '../../../components/campus/home/CampusMeHost';
import Wayfinder from '../../../components/campus/home/Wayfinder';
import { useHomeMap, homeInsets } from '../../../components/campus/home/useHomeMap';
import { useHomeWayfinder } from '../../../components/campus/home/useHomeWayfinder';
import { useUnlockCheer, useWelcomeBack, useGateStreak, inViewAs } from '../../../components/campus/home/useHomeCheers';
import { rightNowRows, urgentOf } from '../../../components/campus/home/rightNow';
import { useCampus } from '../../../components/campus/CampusContext';
import { useCampusView } from '../../../components/campus/useCampusView';
import { useCampusWorldProps } from '../../../components/campus/useCampusWorldProps';
import { useLiveNow } from '../../../components/campus/campusOnAir';
import { openWayfinder } from '../../../components/campus/wayfinderHost';
import type { BuildingId } from '../../../components/campus/campusMap';
import { buildingName } from '../../../components/campus/campusMap';
import CampusListView from '../../../components/campus/CampusListView';
import CampusDoorTransition from '../../../components/campus/CampusDoorTransition';
import CampusDmToast from '../../../components/campus/CampusDmToast';
import CampusTabBar from '../../../components/campus/CampusTabBar';
import CampusLive from '../../../components/campus/CampusLive';
import CampusCheer from '../../../components/campus/CampusCheer';
import { useLevelCheer } from '../../../components/campus/home/useLevelCheer';
import { useMyPhoto } from '../../../components/campus/home/useMyPhoto';
import { useHomeAgenda, mapMoments } from '../../../components/campus/home/useMapMoments';
import { useConciergeReveal } from '../../../components/campus/home/useConciergeReveal';
import { useLiveCheckIn } from '../../../components/campus/home/useLiveCheckIn';
import { levelOfRung } from '../../../services/bandLadder';
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
 * WP-4: the Wayfinder (the pill, "/", Ctrl/Cmd+K), what is coming up (useHomeAgenda: the map's badges, the panel's Right now and
 * urgent card), and the points feedback: the streak claimed at the gate (Q9), unlock cheers, and welcome back.
 *
 * With the campus off (flag, or the learner chose the classic menu) the page is not a campus: it goes to Today.
 */
export default function CampusHomePage(): React.ReactElement {
  const campus = useCampus();
  const { ready: audienceReady = true } = useCampusView();
  // C13: nothing audience-specific (gate, top bar, panel, buildings) until the server has said which campus this is. The whole home
  // mounts only then, so its camera, gate and timers start together with the map (holding just the map back left the phone camera
  // short of the whole campus after a card closed).
  if (!campus.ready || (campus.active && !audienceReady)) return <div className="cm-home" aria-busy="true" data-testid="cm-home-loading" />;
  if (!campus.active) return <Navigate to="/portal/today?stay=1" replace />;
  return <CampusHome />;
}

function CampusHome(): React.ReactElement {
  const campus = useCampus();
  const { audience, buildings, accessOf } = useCampusView();
  const liveNow = useLiveNow(); // WP-6: Colaberry Live's broadcast, state and one-second clock
  useLiveCheckIn(audience, liveNow, campus.here ?? null); // WP-7 (Q2): walking into the live Classroom checks a member in
  const facts = useHomeFacts(audience === 'member');
  const [cardOpen, setCardOpen] = useState(false);
  const [hover, setHover] = useState<BuildingId | null>(null);
  // D7: the entry gate, once per Central day (decided once, on the first render of the page).
  const [gateOpen, setGateOpen] = useState(() => !gateSeen(new Date()));
  const [skippedGate] = useState(() => !gateOpen);
  const map = useHomeMap(gateOpen);
  const { setHere, settings, presence, presenceError, staffDesks, look, reloadLook } = campus;
  const wp = settings.workplaceNames;
  // The building whose card opened is where you now are.
  // C17: out on the grass after a click-to-walk (the kicker reads "On campus" until you next arrive somewhere).
  const [onLawn, setOnLawn] = useState(false);
  const onCard = useCallback((s: { open: boolean; building: BuildingId | null }) => {
    setCardOpen(s.open); if (s.building) { setHere(s.building); setOnLawn(false); }
  }, [setHere]);
  // C17: walking to a spot on the grass leaves every building: "here" clears (the side panel shows the whole campus again).
  const onGround = useCallback(() => { setHere(null); setOnLawn(true); }, [setHere]);
  const stay = useCallback(() => undefined, []);
  const { props, tour, touring, extra, onComplete } = useCampusWorldProps(stay, stay, null);
  useLevelCheer(look?.rung_name || null);
  useUnlockCheer(look?.catalog, campus.openMe);
  useWelcomeBack({ audience, buildings, workplace: wp, skippedGate, here: campus.here, goTo: map.goTo });
  const claimStreak = useGateStreak({ audience, claimedToday: facts.claimedToday, onStreak: facts.streakNow, onPoints: reloadLook });
  // WP-3: you on the map (photo, level for those who earn points), a member's time badges, the night look, the concierge's entrance.
  const photo = useMyPhoto(campus.active);
  const agenda = useHomeAgenda(audience, campus.active);
  const reveal = useConciergeReveal(gateOpen, map.onGateOpening);
  const quiet = !!presence && !presenceError && Object.values(presence).every((a) => a.people.length === 0);
  const liveKey = liveNow ? `${liveNow.b.id}|${liveNow.b.title}|${liveNow.building}|${liveNow.state}` : '';
  const live = useMemo(() => (liveNow ? { title: liveNow.b.title, buildingId: liveNow.building, state: liveNow.state } : null), [liveKey]); // keyed on what the panel shows, so the one-second clock does not rebuild it
  const liveB = live?.buildingId ? buildings.find((b) => b.id === live.buildingId) : undefined;
  const urgent = useMemo(() => urgentOf(audience, agenda, buildings, wp), [audience, agenda, buildings, wp]);
  const suggested = useMemo(() => rightNowRows({ audience, workplace: wp, buildings, stops: campus.planStops, planMinutes: campus.planMinutes, agenda, presence,
    presenceError, live: !!live, urgent }), [audience, wp, buildings, campus.planStops, campus.planMinutes, agenda, presence, presenceError, live, urgent]);
  const wf = useHomeWayfinder({ audience, workplace: wp, buildings, accessOf, presence, presenceError, desks: staffDesks, urgent, suggested, goTo: map.goTo, openPerson: campus.openPersonCard });

  // The home shows Colaberry Live as the prototype's top pill (CampusLive below), so the portal-wide live-now badge steps aside here.
  useEffect(() => { document.documentElement.classList.add('cm-on-home'); return () => document.documentElement.classList.remove('cm-on-home'); }, []);
  const online = useMemo(() => (presence && !presenceError ? pulseOf(presence, buildings).total : null), [presence, presenceError, buildings]);

  const reduce = settings.reduceMotion;
  const initials = facts.initials || readParticipant().initials;
  const enter = (t: boolean) => { setGateOpen(false); reveal.show(); if (reduce) map.camRef.current?.base(); if (t) campus.startTour(); void claimStreak(); };
  const level = audience === 'member' || audience === 'explorer' ? levelOfRung(look?.rung_name) : null;
  return (
    <div className={`cm-home cm-scope${reduce ? ' is-reduced' : ''}`} data-testid="cm-home">
      {gateOpen && <CampusGate audience={audience} firstName={facts.firstName} fullName={facts.fullName} initials={initials}
        rung={look?.rung_name || null} points={look?.points ?? null} streak={facts.streak} online={online} workplace={wp}
        streakPoints={facts.claimedToday === false && !inViewAs() ? facts.nextPoints : null}
        live={liveB ? { place: buildingName(liveB, wp), preview: liveNow?.b.access_mode === 'preview' } : null}
        hasTour={!!tour} reduceMotion={reduce} now={new Date()} onOpening={reveal.onOpening} onEnter={enter} photo={photo} />}
      <CampusWorld {...props} insets={homeInsets} walkTo={map.walk} onCard={onCard} cameraRef={map.camRef} startAt={campus.here}
        startCam={map.startCam} recenter={map.recenter} me={{ initials, photo, level, tone: audience }} moments={mapMoments(audience, agenda)} quiet={quiet} hover={hover} liveNow={liveNow} onGround={onGround} />
      <CampusTopBar audience={audience} online={online} points={look?.points ?? null} rung={look?.rung_name || null} photo={photo} workplace={wp}
        streak={facts.streak} initials={initials} onList={campus.openList} onFind={() => { openWayfinder(); }} onMe={() => (campus.meOpen ? campus.closeMe() : campus.openMe())} />
      <CampusMeHost fullName={facts.fullName} initials={initials} onClosed={() => map.camRef.current?.recenter()} />
      <CampusConcierge waiting={!reveal.shown} cardOpen={cardOpen} audience={audience} firstName={facts.firstName} hereId={campus.here ?? null} onLawn={onLawn}
        buildings={buildings} accessOf={accessOf} workplaceNames={wp} presence={presence} presenceError={presenceError} desks={staffDesks}
        stops={campus.planStops} planMinutes={campus.planMinutes} live={live} now={new Date()} agenda={agenda} urgent={urgent}
        tourStops={tour ? tour.stops : null} touring={touring} tourProgress={campus.tourProgress} justToured={campus.justToured}
        onWalk={map.goTo} onRun={(id) => map.goTo(id, { run: true })} onHover={setHover} onTour={campus.resumeTour} onEndTour={campus.endTour} onDismissTour={campus.dismissTour} onDone={onComplete}
        onOpen={(r) => campus.enterThroughDoor(r, null)} photo={photo} />
      <div className="cm-home-livebar"><CampusLive onWalk={(id, run) => map.goTo(id, { run })} hereId={campus.here ?? null} /></div>
      <CampusTabBar active="/portal/campus" />
      <CampusListView />
      <CampusDoorTransition />
      <CampusDmToast />
      <CampusCheer burst reduceMotion={reduce} />
      <Wayfinder ctx={wf.ctx} onPick={wf.onPick} />
      {extra}
    </div>
  );
}
