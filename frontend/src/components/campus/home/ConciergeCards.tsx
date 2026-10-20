import React from 'react';
import { Link } from 'react-router-dom';
import type { BuildingId, CampusBuilding, ExplorerAccess } from '../campusMap';
import { buildingName } from '../campusMap';
import type { PlanStop } from '../campusPlan';
import type { StaffDesk } from '../campusPeopleApi';
import type { ExplorerPathModel } from '../campusPath';

/**
 * The concierge's cards (C11b), each the prototype's (.helpdesk, .plan-card, .pass, .livecard) fed by real campus data. A card
 * with nothing true to say is not drawn.
 */
type Walk = (id: BuildingId) => void;
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

/** HELP DESK: the AI staff on duty for this viewer; a press walks to their desk (the building card shows it). */
export function HelpDesk({ desks, onWalk }: { desks: StaffDesk[]; onWalk: Walk }): React.ReactElement | null {
  const on = desks.filter((d) => d.on_duty);
  if (!on.length) return null;
  return (
    <div className="cm-helpdesk" data-testid="cm-cc-helpdesk">
      <span>Help desk</span>
      {on.map((d) => (
        <button key={d.id} type="button" className="cm-sbtn" onClick={() => onWalk(d.building as BuildingId)} data-testid={`cm-cc-desk-${d.id}`}
          aria-label={`${d.name}, ${d.title}, walk to their desk`}>
          <span className="cm-sav" aria-hidden="true">{initialsOf(d.name)}</span>{d.name} <small>{d.title}</small>
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
      <div className="cm-plan-h"><b>Today&rsquo;s plan</b><small>{done} of {stops.length} done</small></div>
      <ol>
        {stops.map((s, i) => (
          <li key={s.key} className={`${s.done ? 'is-done' : ''}${s === next ? ' is-next' : ''}`}>
            <button type="button" onClick={() => s.buildingId && onWalk(s.buildingId)} disabled={!s.buildingId}>
              <span className="cm-pl-n" aria-hidden="true">{s.done ? '✓' : i + 1}</span>
              <span><b>{s.title}</b>{nameOf(s.buildingId) && <small>{nameOf(s.buildingId)}</small>}</span>
              {s.done && <span className="cm-sr"> (done)</span>}
            </button>
          </li>
        ))}
      </ol>
      {next
        ? <button type="button" className="cm-plan-go" onClick={() => onWalk(next.buildingId!)} data-testid="cm-cc-plan-go">{done ? 'Continue' : 'Walk the route'} &rarr; {nameOf(next.buildingId)}</button>
        : <div className="cm-lead" style={{ margin: '8px 0 0' }}>All done for today. Nice work.</div>}
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
