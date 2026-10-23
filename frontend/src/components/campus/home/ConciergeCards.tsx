import React from 'react';
import { Link } from 'react-router-dom';
import type { BuildingId, CampusBuilding, ExplorerAccess } from '../campusMap';
import { buildingName } from '../campusMap';
import type { PlanStop } from '../campusPlan';
import { stopDetail } from '../campusPlan';
import type { StaffDesk } from '../campusPeopleApi';
import type { ExplorerPathModel } from '../campusPath';
import AdminLink from '../AdminLink';
import { useIsMgmt } from '../campusMgmt';
import { roomLabel } from '../campusMap';
import { deskRole } from './conciergeCopy';

/**
 * The concierge's cards (C11b), each the prototype's (.helpdesk, .plan-card, .pass, .livecard) fed by real campus data. A card
 * with nothing true to say is not drawn.
 */
type Walk = (id: BuildingId) => void;
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

/** HELP DESK: the AI staff on duty for this viewer, each with the prototype's role (Mentor / Curriculum / Admissions); a press
 *  walks to their desk (the building card shows it; the staff popover is decision Q7, WP-5). */
export function HelpDesk({ desks, workplace = false, onWalk }: { desks: StaffDesk[]; workplace?: boolean; onWalk: Walk }): React.ReactElement | null {
  const on = desks.filter((d) => d.on_duty);
  if (!on.length) return null;
  return (
    <div className="cm-helpdesk" data-testid="cm-cc-helpdesk">
      <span>Help desk</span>
      {on.map((d) => (
        <button key={d.id} type="button" className="cm-sbtn" onClick={() => onWalk(d.building as BuildingId)} data-testid={`cm-cc-desk-${d.id}`}
          aria-label={`${d.name}, ${d.title}, walk to their desk`}>
          <span className="cm-sav" aria-hidden="true">{initialsOf(d.name)}</span>{d.name} <small>{deskRole(d, workplace)}</small>
        </button>
      ))}
    </div>
  );
}

/** TODAY'S PLAN: the steps, done ones struck through, the next one filled; the button walks to the next stop's building. */
export function PlanCard({ stops, buildings, workplaceNames, onWalk }: { stops: PlanStop[]; buildings: CampusBuilding[]; workplaceNames: boolean; onWalk: Walk }): React.ReactElement | null {
  if (!stops.length) return null;
  const done = stops.filter((s) => s.done).length;
  const next = stops.find((s) => !s.done && s.buildingId) ?? null;
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
              {s.done && <span className="cm-sr"> (done)</span>}
            </button>
          </li>
        ))}
      </ol>
      {next
        ? <button type="button" className="cm-plan-go" onClick={() => onWalk(next.buildingId!)} data-testid="cm-cc-plan-go">{done ? 'Continue' : 'Walk the route'} &rarr; {nameOf(next.buildingId)}</button>
        : <div className="cm-lead" style={{ margin: '8px 0 0' }}>All done for today <span aria-hidden="true">🎉</span> Nice work.</div>}
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

/** COLABERRY LIVE: shown only while a broadcast is on air; Walk in walks to its building. */
export function LiveCard({ title, buildingId, onWalk }: { title: string; buildingId: BuildingId | null; onWalk: Walk }): React.ReactElement {
  return (
    <div className="cm-cc-livecard" data-testid="cm-cc-live">
      <div className="cm-cc-livecard-brand"><span aria-hidden="true">{'● '}</span>On air now</div>
      <div className="cm-cc-livecard-title">{title}</div>
      {buildingId && <div className="cm-cc-livecard-row"><button type="button" className="cm-btn-red" onClick={() => onWalk(buildingId)} data-testid="cm-cc-live-walk">Walk in</button></div>}
    </div>
  );
}

/** STAFF TOOLS (the prototype's staff "Needs attention" tiles, made of what exists): the Staff Office's Management Portal links,
 *  opened in a new tab through the bridge, or disabled without Management Portal access (the AdminLink rule). */
export function StaffTools({ buildings, workplaceNames }: { buildings: CampusBuilding[]; workplaceNames: boolean }): React.ReactElement | null {
  const isMgmt = useIsMgmt();
  const office = buildings.find((b) => b.rooms.some((r) => r.admin));
  if (!office) return null;
  const links = [{ label: office.primary.label, route: office.primary.route }, ...office.rooms.filter((r) => r.admin).map((r) => ({ label: roomLabel(r, workplaceNames), route: r.route }))];
  return (
    <div className="cm-staff-tools" data-testid="cm-cc-staff-tools">
      <div className="cm-plan-h"><b>Staff tools</b><small>{isMgmt ? 'Opens the Management Portal' : 'Needs Management Portal access'}</small></div>
      <div className="cm-staff-grid">{links.map((l, i) => <AdminLink key={l.route} label={l.label} route={l.route} className={`cm-staff-tile is-${i}`} isMgmt={isMgmt} />)}</div>
    </div>
  );
}
