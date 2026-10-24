import React, { useState } from 'react';
import type { BuildingId, CampusAudience, CampusBuilding } from '../campusMap';
import { BUILDING_ICON, buildingName } from '../campusMap';
import { subOf } from '../campusArrival';
import { art } from '../art/artColor';
import type { NowRow, TeamRow, Urgent } from './rightNow';
import { nameInitials } from '../../../utils/personName';
import '../campusWayfinder.css';

/**
 * The panel's live sections (WP-4), each the prototype's: the urgent card (#urgent, red, "Run there →" / "Skip the walk"), "Right
 * now" (.sugg rows: an icon tile in the building's colour, title, detail, "<Building> →"; hovering a row lifts that building on the
 * map), a partner's "Your team on campus right now", and the campus directory toggle (every building, a press walks there).
 */
type Walk = (id: BuildingId) => void;
const initialsOf = (name: string) => nameInitials(name); // C13: the shared helper

export function UrgentCard({ u, onRun, onSkip }: { u: Urgent; onRun: () => void; onSkip: () => void }): React.ReactElement {
  return (
    <div className="cm-urgent" role="status" data-testid="cm-cc-urgent">
      <div className="t">{u.title}</div>
      <div className="d">{u.detail}</div>
      <div className="row">
        <button type="button" className="cm-btn-white" onClick={onRun} data-testid="cm-cc-urgent-run">Run there &rarr;</button>
        <button type="button" className="cm-btn-ghost-w" onClick={onSkip} data-testid="cm-cc-urgent-skip">Skip the walk</button>
      </div>
    </div>
  );
}

function Tile({ id }: { id: BuildingId }): React.ReactElement {
  return <span className="ic" style={{ background: art(id) }} aria-hidden="true">{BUILDING_ICON[id] ?? ''}</span>;
}

export function RightNow({ rows, buildings, workplace, onWalk, onHover }: {
  rows: NowRow[]; buildings: CampusBuilding[]; workplace: boolean; onWalk: Walk; onHover: (id: BuildingId | null) => void;
}): React.ReactElement | null {
  if (!rows.length) return null;
  const nameOf = (id: BuildingId) => { const b = buildings.find((x) => x.id === id); return b ? buildingName(b, workplace) : ''; };
  return (
    <>
      <div className="cm-sec">Right now</div>
      <div className="cm-sugg" data-testid="cm-cc-now">
        {rows.map((r) => (
          <button key={r.key} type="button" className="cm-sg" onClick={() => onWalk(r.buildingId)} data-row={r.key}
            onMouseEnter={() => onHover(r.buildingId)} onMouseLeave={() => onHover(null)} onFocus={() => onHover(r.buildingId)} onBlur={() => onHover(null)}>
            <Tile id={r.buildingId} />
            <span><span className="t">{r.title}</span><span className="d">{r.detail}</span></span>
            <span className="go">{nameOf(r.buildingId)} &rarr;</span>
          </button>
        ))}
      </div>
    </>
  );
}

export function TeamNow({ rows, buildings, workplace, onWalk, onHover }: {
  rows: TeamRow[]; buildings: CampusBuilding[]; workplace: boolean; onWalk: Walk; onHover: (id: BuildingId | null) => void;
}): React.ReactElement {
  const nameOf = (id: BuildingId) => { const b = buildings.find((x) => x.id === id); return b ? buildingName(b, workplace) : ''; };
  return (
    <>
      <div className="cm-sec">Your team on campus right now</div>
      <div className="cm-sugg" data-testid="cm-cc-team">
        {rows.length === 0 && <div className="cm-pc-note">None of your team is on campus right now.</div>}
        {rows.map((r) => (
          <button key={r.key} type="button" className="cm-sg" onClick={() => onWalk(r.buildingId)}
            onMouseEnter={() => onHover(r.buildingId)} onMouseLeave={() => onHover(null)} onFocus={() => onHover(r.buildingId)} onBlur={() => onHover(null)}>
            {r.person.avatar_url ? <img className="cm-tav" src={r.person.avatar_url} alt="" /> : <span className="cm-tav" aria-hidden="true">{initialsOf(r.name)}</span>}
            <span><span className="t">{r.name}</span><span className="d">{r.detail}</span></span>
            <span className="go">{nameOf(r.buildingId)} &rarr;</span>
          </button>
        ))}
      </div>
    </>
  );
}

/** "Campus directory · all N buildings" (HQ directory in Workplace names): a toggle over every building, a press walks there. */
export function Directory({ buildings, audience, workplace, onWalk }: { buildings: CampusBuilding[]; audience: CampusAudience; workplace: boolean; onWalk: Walk }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const list = buildings.filter((b) => b.kind !== 'gate');
  return (
    <>
      <button type="button" className="cm-linkish" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-testid="cm-cc-dir-toggle">
        {workplace ? 'HQ' : 'Campus'} directory &middot; all {list.length} buildings
      </button>
      {open && (
        <div className="cm-dir" data-testid="cm-cc-dir">
          {list.map((b) => (
            <button key={b.id} type="button" onClick={() => onWalk(b.id)}>
              <b><span aria-hidden="true">{BUILDING_ICON[b.id] ?? ''} </span>{buildingName(b, workplace)}</b>
              <span>{subOf(b, audience, workplace) ?? ''}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
