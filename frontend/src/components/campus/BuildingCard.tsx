import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useCardFocus } from './useCardFocus';
import type { CampusBuilding, ExplorerAccess } from './campusMap';
import { buildingName, roomLabel, CHOW_ROUTE } from './campusMap';
import { openOrderSheet } from './chow/OrderSheet';
import { enrollCta } from './campusAccess';
import { GATED_FEATURES } from '../paywall/gatedFeatures';
import { useIsMgmt } from './campusMgmt';
import AdminLink from './AdminLink';
import WhoIsHere, { WhoIsHereProps } from './WhoIsHere';
import type { StaffDesk as Desk } from './campusPeopleApi';
import './campusArrival.css';

/** C11b: one "Happening here" row (the prototype's .now list), from real data only. */
export interface Happening { title: string; detail: string; tone: 'live' | 'hot' | '' }

/**
 * The card that opens when you arrive at a building (Campus C2): its name, what you can
 * do here (primary action), its rooms as real links, and - for an Explorer - what is
 * locked, a demo or a preview, with the enroll path the paywall already uses.
 *
 * Real data only: "Who's here" (C4) renders only when the caller passes presence, and the AI staff
 * desks (C5) only when the server listed one for this building, so nothing invented ever shows. A route that does not exist
 * yet (marked `planned` in the catalog) shows as "Opening soon", never as a dead link.
 */
export interface BuildingCardProps {
  building: CampusBuilding;
  access: ExplorerAccess;
  workplaceNames: boolean;
  onClose: () => void;
  /** Called when the learner follows any link out of the card (the overlay closes). */
  onNavigate: () => void;
  /** C4: presence for this building. Absent = the section is not rendered at all. */
  whoIsHere?: WhoIsHereProps;
  /** C3: zoom through this building's door to a route. Absent = a plain link (C2 behavior). */
  onEnterRoom?: (route: string) => void;
  /** C5: the AI staff desks for THIS building, already filtered for the viewer. */
  desks?: Desk[];
  /** C6: extra content for this building's card (the Explorer path in the Main Gate). */
  children?: React.ReactNode;
  /** C11b: the prototype hero's kicker place ("South Avenue"), its one-line description, and what is happening here now. */
  zoneLabel?: string;
  line?: string | null;
  happening?: Happening[];
  /** C11b: who is looking (partners get the navy action; an Explorer on a not-open building is led by the unlock). */
  audience?: string;
  /** C11b: "Go somewhere else" (the home focuses its search). Absent = the button is not shown. */
  onElsewhere?: () => void;
  /** WP-2: the hero kicker as the prototype words it for this arrival (a tour stop, an Explorer at a locked building, a partner). */
  kicker?: string;
  /** WP-2: something starting here within 15 minutes takes over the main action ("<class> · go now"). */
  urgent?: { label: string; route: string } | null;
  /** WP-2: the tour stop card (top of the panel), today's plan box, and the tour nav (above the footer). */
  tourTop?: React.ReactNode;
  planBox?: React.ReactNode;
  tourNav?: React.ReactNode;
  /** WP-4: this room was picked in the Wayfinder: it flashes twice (the prototype's .rooms a.flash). */
  flashRoute?: string;
  /** WP-6: Colaberry Live here: the hero in the state's colour and the stage under it. */
  heroClass?: string;
  stage?: React.ReactNode;
  /** v6 D1: the two ways in (the board / your spot), under the tour block. They replace the single main action (an urgent one still wins). */
  ways?: React.ReactNode;
}

/** The prototype prints the address under the main action ("enterprise.colaberry.ai/portal/..."); this is the real host. */
const hostOf = (): string => (typeof window !== 'undefined' && window.location.host) || 'enterprise.colaberry.ai';

// Demo and preview say what the Explorer can do here. A locked building shows its own paywall copy instead (contextual sign-up).
const NOTICE: Record<'demo' | 'preview', string> = {
  demo: 'Explore it in demo mode. Running and saving work is for members.',
  preview: 'You can watch a short preview. Enrolling opens everything here.',
};

/** C6 contextual sign-up: the copy PageGate's paywall shows for THIS building's page (title and up to 3 benefits). */
function LockedNotice({ b }: { b: CampusBuilding }): React.ReactElement {
  const copy = GATED_FEATURES[b.gate ?? 'classroom'];
  return (
    <>
      <p className="cm-signup-title" data-testid="cm-signup-title">{copy.title}</p>
      <ul className="cm-signup-benefits">{copy.benefits.slice(0, 3).map((x) => <li key={x}>{x}</li>)}</ul>
    </>
  );
}

export default function BuildingCard({ building: b, access, workplaceNames, onClose, onNavigate, whoIsHere, onEnterRoom, desks, children, zoneLabel, line, happening, onElsewhere, audience, kicker, urgent, tourTop, planBox, tourNav, flashRoute, heroClass, stage, ways }: BuildingCardProps): React.ReactElement {
  const name = buildingName(b, workplaceNames);
  // A plain click goes through the door; a modified click (new tab, etc.) stays a normal link.
  const go = (route: string) => (e: React.MouseEvent) => {
    if (onEnterRoom && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); onEnterRoom(route); return; }
    onNavigate();
  };
  // C6: admin links (Staff Office) work only through the Management Portal bridge; without that access they are disabled.
  const isMgmt = useIsMgmt();
  const adminLink = (label: string, route: string, cls: string, key?: string) => <AdminLink key={key} label={label} route={route} className={cls} isMgmt={isMgmt} />;
  const hasAdmin = !!b.primary.admin || b.rooms.some((r) => r.admin);
  const primaryPlanned = b.rooms.find((r) => r.route === b.primary.route)?.planned;
  const headingId = `cm-card-${b.id}`;
  const heading = useRef<HTMLHeadingElement | null>(null);
  useCardFocus(heading);
  return (
    <section className={`cm-card cm-arrive cm-b-${b.id}${audience === 'business' ? ' is-partner' : ''}${audience === 'explorer' && access !== 'open' ? ' is-unlock-first' : ''}`} aria-labelledby={headingId} data-testid="cm-card" data-building={b.id}>
      <div className={`cm-arrive-hero${heroClass ? ` ${heroClass}` : ''}`} data-testid="cm-arrive-hero">
        <div className="cm-kicker" data-testid="cm-arrive-kicker">{kicker ?? <>You&rsquo;ve arrived{zoneLabel ? <> &middot; {zoneLabel}</> : null}</>}</div>
        <h2 id={headingId} className="cm-card-title" tabIndex={-1} ref={heading}>{name}</h2>
        {line && <p className="cm-arrive-line" data-testid="cm-arrive-line">{line}</p>}
        <button type="button" className="cm-card-x" onClick={onClose} aria-label={`Close ${name}`}>×</button>
      </div>
      <div className="cm-arrive-body">
        {tourTop}
        {/* C48 (Ali, 2026-10-25): the tour's Next / Back sit at the TOP with the stop, never at the bottom of a long card */}
        {tourNav}
        {ways}
        {stage}
        {planBox}
        {happening && (
          <>
            <h3 className="cm-card-h">Happening here</h3>
            <ul className="cm-now" data-testid="cm-arrive-now">
              {happening.map((h) => <li key={h.title}><i className={`dot${h.tone ? ` is-${h.tone}` : ''}`} aria-hidden="true" /><div><b>{h.title}</b><span>{h.detail}</span></div></li>)}
            </ul>
          </>
        )}

        {ways && !urgent ? null : urgent && !b.primary.admin
          ? <Link className="cm-btn cm-cta is-urgent" to={urgent.route} onClick={go(urgent.route)} data-testid="cm-arrive-cta"><span>{urgent.label}</span><span aria-hidden="true">&rarr;</span></Link>
          : b.primary.admin ? adminLink(b.primary.label, b.primary.route, 'cm-btn cm-cta') : primaryPlanned
          ? <span className="cm-btn cm-cta is-disabled" aria-disabled="true">{b.primary.label} - opening soon</span>
          : b.primary.route === CHOW_ROUTE // C39: Chow Hall has no page; its button opens the order sheet
          ? <button type="button" className="cm-btn cm-cta" onClick={() => openOrderSheet()} data-testid="cm-arrive-cta"><span>{b.primary.label}</span></button>
          : <Link className="cm-btn cm-cta" to={b.primary.route} onClick={go(b.primary.route)} data-testid="cm-arrive-cta"><span>{b.primary.label}</span><span aria-hidden="true">&rarr;</span></Link>}
        {!b.primary.admin && b.primary.route !== CHOW_ROUTE && (urgent || (!primaryPlanned && !ways)) && <div className="cm-arrive-route" aria-hidden="true">{hostOf()}{urgent ? urgent.route : b.primary.route}</div>}
        {hasAdmin && (
          <p className="cm-who-note" data-testid="cm-admin-note">{isMgmt ? 'Opens the Management Portal in a new tab.' : 'Needs Management Portal access.'}</p>
        )}

        {access !== 'open' && (
          <div className="cm-card-note">
            {access === 'locked' ? <LockedNotice b={b} /> : <p>{NOTICE[access]}</p>}
            <Link className="cm-btn is-secondary" to={enrollCta(b).to} onClick={onNavigate}>{enrollCta(b).label}</Link>
          </div>
        )}

        {/* WP-5: the staff on duty here are chips at the head of Who's here (their card is a popover, Q7); without presence, just them */}
        {(whoIsHere || (desks && desks.length > 0)) && <WhoIsHere {...(whoIsHere ?? { presence: undefined, error: false, peopleHidden: true })} desks={desks} />}

        {b.rooms.length > 0 && (
          <>
            <h3 className="cm-card-h">Rooms in this building</h3>
            <ul className="cm-rooms">
              {b.rooms.map((r) => (
                <li key={r.route}>
                  {r.admin ? adminLink(roomLabel(r, workplaceNames), r.route, 'cm-room') : r.planned
                    ? <span className="cm-room is-disabled" aria-disabled="true">{roomLabel(r, workplaceNames)} <small>opening soon</small></span>
                    : <Link className={`cm-room${r.route === flashRoute ? ' is-flash' : ''}`} to={r.route} onClick={go(r.route)}>{roomLabel(r, workplaceNames)}<small aria-hidden="true">{r.route}</small></Link>}
                </li>
              ))}
            </ul>
          </>
        )}

        {children}

        <div className="cm-arrive-foot">
          <button type="button" className="cm-btn-line" onClick={onClose} data-testid="cm-arrive-back">&larr; Back to the Quad</button>
          {onElsewhere && <button type="button" className="cm-btn-line" onClick={onElsewhere} data-testid="cm-arrive-elsewhere">Go somewhere else</button>}
        </div>
      </div>
    </section>
  );
}
