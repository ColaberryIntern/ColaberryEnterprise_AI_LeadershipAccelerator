import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { BuildingId, CampusBuilding, ExplorerAccess } from '../campusMap';
import { buildingName } from '../campusMap';
import type { PlanStop } from '../campusPlan';
import { stopDetail } from '../campusPlan';
import type { SideRow } from '../interior/pageSummary';
import type { StaffDesk } from '../campusPeopleApi';
import type { ExplorerPathModel } from '../campusPath';
import AdminLink from '../AdminLink';
import { useCampusMgmt } from '../campusMgmt';
import { buildHq, roomHref } from '../hq/hqModel';
import { hasHistory, readHqUsage, topRooms } from '../hq/hqUsage';
import { deskRole } from './conciergeCopy';
import { openStaffCard } from '../staffCard';
import { openBookCall } from '../admissions/admissionsCallApi';

/**
 * The concierge's cards (C11b), each the prototype's (.helpdesk, .plan-card, .pass) fed by real campus data (WP-6: the live card is LiveCard.tsx). A card
 * with nothing true to say is not drawn.
 */
type Walk = (id: BuildingId) => void;
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

/** HELP DESK: the AI staff on duty for this viewer, each with the prototype's role (Mentor / Curriculum / Admissions); a press
 *  opens their card where you pressed (decision Q7, WP-5), with "Visit the desk" to walk there. */
export function HelpDesk({ desks, workplace = false, talk = false }: { desks: StaffDesk[]; workplace?: boolean; talk?: boolean }): React.ReactElement | null {
  const on = desks.filter((d) => d.on_duty);
  if (!on.length && !talk) return null;
  return (
    <div className="cm-helpdesk" data-testid="cm-cc-helpdesk">
      <span>Help desk</span>
      {on.map((d) => (
        <button key={d.id} type="button" className="cm-sbtn" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); openStaffCard(d.id, { x: r.left + r.width / 2, y: r.bottom }); }}
          data-testid={`cm-cc-desk-${d.id}`} aria-label={`${d.name}, ${d.title}, open their card`} aria-haspopup="dialog">
          <span className="cm-sav" aria-hidden="true">{initialsOf(d.name)}</span>{d.name} <small>{deskRole(d, workplace)}</small>
        </button>
      ))}
      {/* C20 (v3 2.7): a real person, not an AI; opens "Book a call with admissions" */}
      {talk && (
        <button type="button" className="cm-sbtn" onClick={() => openBookCall()} data-testid="cm-cc-talk" aria-haspopup="dialog">
          <span className="cm-sav" aria-hidden="true">📅</span>Talk to a person <small>Admissions</small>
        </button>
      )}
    </div>
  );
}

/** TODAY'S PLAN: the steps, done ones struck through, the next one filled; the button walks to the next stop's building. C78: all
 *  done, it shows the path ahead (pathAhead: your next lessons, the next locked one and why, the next event) so finishing today never
 *  reads as finishing; a row with a page opens it. */
export function PlanCard({ stops, buildings, workplaceNames, onWalk, ahead, onOpen }: {
  stops: PlanStop[]; buildings: CampusBuilding[]; workplaceNames: boolean; onWalk: Walk; ahead?: SideRow[] | null; onOpen?: (route: string) => void;
}): React.ReactElement | null {
  if (!stops.length) return null;
  const done = stops.filter((s) => s.done).length;
  const next = stops.find((s) => !s.done && s.buildingId) ?? null;
  const upNext = stops.find((s) => !s.done) ?? null; // C15: the step Up next names, tagged here and not repeated as another card
  const nameOf = (id: BuildingId | null) => { const b = id ? buildings.find((x) => x.id === id) : undefined; return b ? buildingName(b, workplaceNames) : null; };
  return (
    <div className="cm-plan" data-testid="cm-cc-plan">
      <div className="cm-plan-h"><b><span aria-hidden="true">📋 </span>Today&rsquo;s plan</b><small>{done} of {stops.length} done</small></div>
      <ol>
        {stops.map((s, i) => (
          <li key={s.key} className={`${s.done ? 'is-done' : ''}${s === next ? ' is-next' : ''}`}>
            <button type="button" onClick={() => s.buildingId && onWalk(s.buildingId)} disabled={!s.buildingId}>
              <span className="cm-pl-n" aria-hidden="true">{s.done ? '✓' : i + 1}</span>
              <span><b>{s.title}</b><small>{[nameOf(s.buildingId), stopDetail(s)].filter(Boolean).join(' · ')}</small></span>
              {s === upNext && <span className="cm-pl-tag" data-testid="cm-plan-upnext">UP NEXT</span>}
              {s.done && <span className="cm-sr"> (done)</span>}
            </button>
          </li>
        ))}
      </ol>
      {next
        ? <button type="button" className="cm-plan-go" onClick={() => onWalk(next.buildingId!)} data-testid="cm-cc-plan-go">{done ? 'Continue' : 'Walk the route'} &rarr; {nameOf(next.buildingId)}</button>
        : <div className="cm-lead" style={{ margin: '8px 0 0' }}>All done for today <span aria-hidden="true">🎉</span> Nice work.</div>}
      {!next && !upNext && ahead && ahead.length > 0 && (
        <div className="cm-ahead" data-testid="cm-plan-ahead">
          <b>You are not finished. What comes next:</b>
          <ul>
            {ahead.map((r) => (
              <li key={`${r.label}-${r.value}`}>
                {r.route && onOpen
                  ? <button type="button" onClick={() => onOpen(r.route!)} data-testid="cm-plan-ahead-go"><span>{r.label}</span><small>{r.value} &rarr;</small></button>
                  : <span className="cm-ahead-row"><span>{r.label}</span><small>{r.value}</small></span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The pass is a glance, as the prototype's: five rows a column, then a count (the list view has every building). */
const PASS_ROWS = 5;

/** EXPLORER PASS: what is open now and what enrolling opens (from each building's real state), the path's steps and its call to action. */
export function ExplorerPass({ buildings, accessOf, workplaceNames, path }: {
  buildings: CampusBuilding[]; accessOf: (b: CampusBuilding) => ExplorerAccess; workplaceNames: boolean; path: ExplorerPathModel;
}): React.ReactElement {
  const usable = buildings.filter((b) => b.kind !== 'gate' && accessOf(b) !== 'locked');
  const list = (names: string[], cls?: string) => (
    <ul className={cls}>
      {names.slice(0, PASS_ROWS).map((n) => <li key={n}>{n}</li>)}
      {names.length > PASS_ROWS && <li className="cm-pass-more">and {names.length - PASS_ROWS} more</li>}
    </ul>
  );
  return (
    <div className="cm-pass" data-testid="cm-cc-pass">
      <div className="cm-pass-h"><span className="cm-pass-tag">EXPLORER PASS</span><span>No card needed</span></div>
      <div className="cm-pass-grid">
        <div><b>Open to you now</b>{list(usable.map((b) => `${buildingName(b, workplaceNames)}${accessOf(b) !== 'open' ? ` (${accessOf(b)})` : ''}`))}</div>
        <div><b>Enrolling opens</b>{list(path.opens, 'is-locked')}</div>
      </div>
      <Link to={path.cta.to} className="cm-btn-red" style={{ marginTop: 12 }} data-testid="cm-cc-enroll">{path.cta.label}</Link>
    </div>
  );
}

/** STAFF TOOLS: Open the Management Portal, then (C84, Ali 2026-10-28) the Management Portal rooms this badge opens, the same
 *  rooms the HQ elevator shows, most used first and capped, with "See all" walking to the HQ for the rest. The Staff Office's
 *  own rooms (Handoffs, People, View as a learner) are the "Rooms in" chips above, so they are not repeated here. Links open in
 *  a new tab through the bridge, or are disabled without Management Portal access (the AdminLink rule). */
export function StaffTools({ buildings, onAll }: { buildings: CampusBuilding[]; workplaceNames?: boolean; onAll?: () => void }): React.ReactElement | null {
  const { isMgmt, canSection } = useCampusMgmt();
  const usage = useMemo(readHqUsage, []);
  const office = buildings.find((b) => b.rooms.some((r) => r.admin));
  if (!office) return null;
  const { rooms, total } = topRooms(buildHq(canSection, isMgmt, 'staff'), usage);
  return (
    <div className="cm-staff-tools" data-testid="cm-cc-staff-tools">
      <div className="cm-plan-h"><b>Staff tools</b><small>{isMgmt ? 'Opens the Management Portal' : 'Needs Management Portal access'}</small></div>
      <div className="cm-staff-grid is-one">
        <AdminLink label={office.primary.label} route={office.primary.route} className="cm-staff-tile is-0" isMgmt={isMgmt} />
      </div>
      {rooms.length > 0 && (
        <>
          <div className="cm-staff-sub" data-testid="cm-cc-staff-rooms-h">{hasHistory(rooms, usage) ? 'Your most used rooms' : 'Your rooms'}</div>
          <div className="cm-staff-grid" data-testid="cm-cc-staff-rooms">
            {rooms.map((r) => (
              <AdminLink key={r.path} label={r.label} route={roomHref(r)} className="cm-staff-tile is-room" isMgmt={isMgmt}>
                <i className={`ic ri-${r.icon}`} aria-hidden="true" />{r.label}
              </AdminLink>
            ))}
          </div>
          {total > rooms.length && onAll && (
            <button type="button" className="cm-link cm-staff-all" onClick={onAll} data-testid="cm-cc-staff-all">See all {total} rooms in the Staff Office &rarr;</button>
          )}
        </>
      )}
    </div>
  );
}
