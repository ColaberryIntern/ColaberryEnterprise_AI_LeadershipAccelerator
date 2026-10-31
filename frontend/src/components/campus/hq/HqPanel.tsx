import React from 'react';
import { badgeLevel, floorStatus, openFloors, roomHref, roomName, roomsText, type HqFloor, type HqPlaced } from './hqModel';
import type { HqState } from './useHq';
import { HqPeople, type HqPerson } from './HqPeople';

/**
 * Campus HQ, the arrival panel's part (H5.1): your badge (what it opens, at a glance), the Floors list in sidebar order, and
 * on a floor its rooms with "Open in admin ↗". Locked rows are grey with a red lock, aria-disabled, and say why on click.
 * Staff also see who is on each floor (Ali, 2026-10-28); learners see floor names only, never room names (H6).
 */
export interface HqBadgeWho { name: string; initials: string; title: string }

export function HqBadge({ s, who }: { s: HqState; who: HqBadgeWho }): React.ReactElement {
  const open = openFloors(s.hq);
  return (
    <div className="cm-hq-badge" data-testid="cm-hq-badge">
      <div className="row"><span className="ph">{who.initials}</span><span className="nm"><b>{who.name}</b><small>{who.title}</small></span></div>
      <div className="lv" data-testid="cm-hq-badge-level">{badgeLevel(s.hq)}</div>
      <div className="chips"><span className="g">G · Lobby</span>{open.map((f) => <span key={f.key}>{f.num} · {f.label}</span>)}</div>
      <span className="strip" />
    </div>
  );
}

function FloorRow({ s, f, here }: { s: HqState; f: HqFloor; here: HqPerson[] }): React.ReactElement {
  const on = f.access !== 'none';
  const cur = s.scene === 'floor' && s.floor === f.num;
  return (
    <button type="button" className={`cm-hq-frow${on ? '' : ' lock'}${cur ? ' here' : ''}`} aria-disabled={on ? undefined : true}
      onClick={() => (on ? s.ride(f.num) : s.locked(f))} data-testid={`cm-hq-frow-${f.num}`}>
      <span className="n">{f.num}</span>
      <span className="t"><b>{f.label}</b><small>{roomsText(f.rooms.length)}</small></span>
      {here.length > 0 && <HqPeople people={here} label={`On ${f.label}`} size="sm" />}
      <span className="st">{floorStatus(f, s.hq.isStaff)}</span>
    </button>
  );
}

export function HqPanel({ s, who, face, placed }: { s: HqState; who: HqBadgeWho; face: string; placed: HqPlaced<HqPerson> }): React.ReactElement {
  const { hq } = s;
  const f = s.scene === 'floor' ? s.floorOf(s.floor) : null;
  if (f) {
    return (
      <div className="cm-hq-side" data-testid="cm-hq-panel-floor">
        <div className="kick">FLOOR {f.num}</div>
        <h2>{f.label}</h2>
        <p className="lead">{f.access === 'all' ? 'Every room on this floor is open to you.' : `Your badge opens ${f.openCount} of the ${f.rooms.length} rooms here. The rest stay locked.`}{f.own ? ' Open it to pick up your build.' : ' Each room opens its admin page in a new tab.'}</p>
        <div className="sec">Rooms on this floor <small>{f.openCount} open</small></div>
        <div className="cm-hq-rlist">
          {f.rooms.map((r) => {
            const body = (<><i className={`ic ri-${r.icon}`} /><span className="t"><b>{roomName(r, hq.isStaff)}</b><code>{r.path.replace('https://', '')}</code></span>
              <HqPeople people={placed.byRoom.get(r.path) ?? []} label={`At ${r.label}`} size="sm" />
              <span className="go">{r.open ? (r.external ? 'Open ↗' : r.own ? 'Open →' : 'Open in admin ↗') : '🔒'}</span></>);
            return r.open
              ? <a key={r.path} className="cm-hq-rrow" href={roomHref(r)} target={r.own ? undefined : '_blank'} rel={r.own ? undefined : 'noopener noreferrer'} data-testid="cm-hq-rrow">{body}</a>
              : <button key={r.path} type="button" className="cm-hq-rrow lock" aria-disabled="true" onClick={() => s.lockedRoom(r)}>{body}</button>;
          })}
        </div>
        <div className="sec">Ride somewhere else</div>
        <div className="cm-hq-btnrow">
          <button type="button" className="cm-hq-btn is-navy" onClick={s.toCab}>↕ Elevator</button>
          <button type="button" className="cm-hq-btn" onClick={s.toLobby}>Lobby</button>
        </div>
      </div>
    );
  }
  const kick = s.scene === 'cab' ? 'IN THE ELEVATOR' : s.scene === 'lobby' ? 'IN THE LOBBY' : 'OUTSIDE';
  const people = hq.isStaff ? placed : null;
  return (
    <div className="cm-hq-side" data-testid="cm-hq-panel">
      <div className="kick">{kick}</div>
      <h2>{s.scene === 'ext' ? 'Colaberry Tower' : 'Where your badge works'}</h2>
      <p className="lead">{hq.isStaff
        ? 'Your badge decides which floors the elevator will take you to. Floors mirror the admin sidebar, and rooms are its pages.'
        : openFloors(hq).length
          ? 'Your badge opens the ground floor and your office floor. The other floors are Colaberry staff floors.'
          : `Members and explorers use the ground floor: the ${hq.ground[0]?.label ?? face}. The floors above are Colaberry staff floors.`}</p>
      <HqBadge s={s} who={who} />
      <div className="sec">Floors <small>{hq.isStaff || openFloors(hq).length ? `${openFloors(hq).length} open` : 'staff only'}</small></div>
      <div className="cm-hq-flist">
        {hq.floors.map((x) => <FloorRow key={x.key} s={s} f={x} here={people?.byFloor.get(x.num) ?? []} />)}
        <button type="button" className="cm-hq-frow" onClick={() => s.ride('G')} data-testid="cm-hq-frow-G">
          <span className="n">G</span><span className="t"><b>Lobby · {face}</b><small>{hq.ground.map((g) => g.label).join(' · ')}</small></span>
          {people && <HqPeople people={people.lobby} label="In the lobby" size="sm" />}
          <span className="st">✓ Everyone</span>
        </button>
      </div>
      <div className="cm-hq-note">This building is generated from the admin sidebar. When a group or page is added, moved or renamed there, the floors and rooms here change with it. Access follows the same section rules as the sidebar.</div>
    </div>
  );
}
