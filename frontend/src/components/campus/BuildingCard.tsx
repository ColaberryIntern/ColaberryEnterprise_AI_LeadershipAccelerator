import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useCardFocus } from './useCardFocus';
import type { CampusBuilding, ExplorerAccess } from './campusMap';
import { buildingName, roomLabel } from './campusMap';
import { accessLabel, enrollCta } from './campusAccess';
import { GATED_FEATURES } from '../paywall/gatedFeatures';
import { useIsMgmt } from './campusMgmt';
import AdminLink from './AdminLink';
import WhoIsHere, { WhoIsHereProps } from './WhoIsHere';
import StaffDesk from './StaffDesk';
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
}

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

export default function BuildingCard({ building: b, access, workplaceNames, onClose, onNavigate, whoIsHere, onEnterRoom, desks, children, zoneLabel, line, happening, onElsewhere, audience }: BuildingCardProps): React.ReactElement {
  const name = buildingName(b, workplaceNames);
  // A plain click goes through the door; a modified click (new tab, etc.) stays a normal link.
  const go = (route: string) => (e: React.MouseEvent) => {
    if (onEnterRoom && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); onEnterRoom(route); return; }
    onNavigate();
  };
  const chip = accessLabel(access);
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
      <div className="cm-arrive-hero" data-testid="cm-arrive-hero">
        <div className="cm-kicker">You&rsquo;ve arrived{zoneLabel ? <> &middot; {zoneLabel}</> : null}</div>
        <h2 id={headingId} className="cm-card-title" tabIndex={-1} ref={heading}>{name}</h2>
        {line && <p className="cm-arrive-line" data-testid="cm-arrive-line">{line}</p>}
        {chip && <div className="cm-card-chip">{chip}</div>}
        <button type="button" className="cm-card-x" onClick={onClose} aria-label={`Close ${name}`}>×</button>
      </div>
      <div className="cm-arrive-body">
        {happening && (
          <>
            <h3 className="cm-card-h">Happening here</h3>
            <ul className="cm-now" data-testid="cm-arrive-now">
              {happening.map((h) => <li key={h.title}><i className={`dot${h.tone ? ` is-${h.tone}` : ''}`} aria-hidden="true" /><div><b>{h.title}</b><span>{h.detail}</span></div></li>)}
            </ul>
          </>
        )}

        {b.primary.admin ? adminLink(b.primary.label, b.primary.route, 'cm-btn cm-cta') : primaryPlanned
          ? <span className="cm-btn cm-cta is-disabled" aria-disabled="true">{b.primary.label} - opening soon</span>
          : <Link className="cm-btn cm-cta" to={b.primary.route} onClick={go(b.primary.route)} data-testid="cm-arrive-cta"><span>{b.primary.label}</span><span aria-hidden="true">&rarr;</span></Link>}
        {!b.primary.admin && !primaryPlanned && <div className="cm-arrive-route" aria-hidden="true">{b.primary.route}</div>}
        {hasAdmin && (
          <p className="cm-who-note" data-testid="cm-admin-note">{isMgmt ? 'Opens the Management Portal in a new tab.' : 'Needs Management Portal access.'}</p>
        )}

        {access !== 'open' && (
          <div className="cm-card-note">
            {access === 'locked' ? <LockedNotice b={b} /> : <p>{NOTICE[access]}</p>}
            <Link className="cm-btn is-secondary" to={enrollCta(b).to} onClick={onNavigate}>{enrollCta(b).label}</Link>
          </div>
        )}

        {whoIsHere && <WhoIsHere presence={whoIsHere.presence} error={whoIsHere.error} loading={whoIsHere.loading} onPick={whoIsHere.onPick} />}

        {desks && desks.length > 0 && (
          <div className="cm-desks">
            <h3 className="cm-card-h">Staff desks</h3>
            {desks.map((d) => <StaffDesk key={d.id} desk={d} onMessaged={onNavigate} />)}
          </div>
        )}

        {b.rooms.length > 0 && (
          <>
            <h3 className="cm-card-h">Rooms in this building</h3>
            <ul className="cm-rooms">
              {b.rooms.map((r) => (
                <li key={r.route}>
                  {r.admin ? adminLink(roomLabel(r, workplaceNames), r.route, 'cm-room') : r.planned
                    ? <span className="cm-room is-disabled" aria-disabled="true">{roomLabel(r, workplaceNames)} <small>opening soon</small></span>
                    : <Link className="cm-room" to={r.route} onClick={go(r.route)}>{roomLabel(r, workplaceNames)}<small aria-hidden="true">{r.route}</small></Link>}
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
