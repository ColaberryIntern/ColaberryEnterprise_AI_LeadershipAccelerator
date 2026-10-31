import React from 'react';
import { badgeLevel, buttonSub, openFloors, roomHref, roomName, roomsText, type HqFloor } from './hqModel';
import type { HqState } from './useHq';
import { HqPeople, type HqPerson } from './HqPeople';
import type { HqPlaced } from './hqModel';

/**
 * Campus HQ scenes 4 and 5 (H5): the elevator (a brass button panel, top floor first then G, and the floor guide) and a
 * floor (one office door per room). Locked buttons and doors are visible, grey with a red lock, aria-disabled, and say why
 * on click. An open room is a real link that opens its admin page in a NEW TAB through the Management Portal bridge.
 */
const ext = (p: string) => p.replace('https://', '');

function Guide({ s, f, face, people }: { s: HqState; f: HqFloor | null; face: string; people: HqPlaced<HqPerson> }): React.ReactElement {
  const { hq } = s;
  if (!f && s.hover === 'G') {
    return (<><div className="kick">GROUND FLOOR</div><h3>Lobby · {face}</h3><ul>{hq.ground.map((g) => <li key={g.key}><i className={`ri-${g.icon}`} />{g.label}</li>)}</ul></>);
  }
  if (!f) {
    const open = openFloors(hq);
    return (<><div className="kick">YOUR RIDE</div><h3>Pick a floor</h3>
      <div className="kv">Lit buttons are the floors your badge opens. Grey buttons with a red ring are locked for you.</div>
      <div className="kv"><b>{badgeLevel(hq)}</b>{hq.isStaff && open.length > 0 ? ` · ${open.map((x) => x.num).join(', ')}` : ''}</div></>);
  }
  const on = f.access !== 'none';
  return (<><div className="kick">FLOOR {f.num}</div><h3>{f.label}</h3>
    <div className="kv">{on ? (f.access === 'all' ? 'Every room is open to you.' : `${f.openCount} of ${f.rooms.length} rooms open to you.`) : hq.isStaff ? 'Your badge doesn’t open this floor.' : 'Colaberry staff only.'}</div>
    <ul data-testid="cm-hq-guide-rooms">{f.rooms.map((r) => (
      <li key={r.path} className={r.open ? '' : 'no'}><i className={`ri-${r.icon}`} />{roomName(r, hq.isStaff)}
        {hq.isStaff && <HqPeople people={people.byRoom.get(r.path) ?? []} label={`At ${r.label}`} size="sm" />}</li>
    ))}</ul></>);
}

export function HqCab({ s, face, people }: { s: HqState; face: string; people: HqPlaced<HqPerson> }): React.ReactElement {
  const { hq } = s;
  const hovered = s.hover && s.hover !== 'G' ? s.floorOf(s.hover) : null;
  const button = (f: HqFloor) => {
    const lock = f.access === 'none';
    const here = hq.isStaff ? people.byFloor.get(f.num) ?? [] : [];
    return (
      <button key={f.key} type="button" className={`fb${s.cabAt === f.num ? ' cur' : ''}${lock ? ' lock' : ''}`} data-testid={`cm-hq-fb-${f.num}`}
        aria-disabled={lock ? true : undefined} aria-label={`Floor ${f.num}, ${f.label}${lock ? ', no access' : ''}${here.length ? `, ${here.length} here` : ''}`}
        onMouseEnter={() => s.setHover(f.num)} onFocus={() => s.setHover(f.num)} onClick={() => (lock ? s.locked(f) : s.ride(f.num))}>
        <span className="c">{lock ? '🔒' : f.num}</span>
        <span className="lb"><b>{f.label}</b><small>{buttonSub(f, hq.isStaff)}{here.length ? ` · 👤${here.length}` : ''}</small></span>
      </button>
    );
  };
  return (
    <div className="cm-hq-cab" data-testid="cm-hq-cab">
      <div className="walls" /><div className="rail" />
      <div className="ind2" aria-live="polite"><small>FLOOR</small><span data-testid="cm-hq-indicator">{s.cabAt}</span></div>
      <div className="guide" data-testid="cm-hq-guide"><Guide s={s} f={hovered} face={face} people={people} /></div>
      <div className="panel" aria-label="Floor buttons">
        <h5>SELECT A FLOOR</h5>
        <div className="btns">
          {hq.floors.map(button)}
          <button type="button" className={`fb${s.cabAt === 'G' ? ' cur' : ''}`} data-testid="cm-hq-fb-G" aria-label="Floor G, Lobby"
            onMouseEnter={() => s.setHover('G')} onFocus={() => s.setHover('G')} onClick={() => s.ride('G')}>
            <span className="c">G</span><span className="lb"><b>Lobby</b><small>Everyone</small></span>
          </button>
        </div>
      </div>
      <div className={`cabdoors${s.doorsShut ? ' shut' : ''}`}><i /><i /></div>
    </div>
  );
}

export function HqFloorScene({ s, f, people }: { s: HqState; f: HqFloor; people: HqPlaced<HqPerson> }): React.ReactElement {
  const { hq } = s;
  return (
    <div className="cm-hq-floor" data-testid="cm-hq-floor">
      <div className="corr" />
      <div className="plate"><div className="n">FLOOR {f.num}</div><b>{f.label.toUpperCase()}</b></div>
      <div className="offices">
        {f.rooms.map((r) => {
          const here = hq.isStaff ? people.byRoom.get(r.path) ?? [] : [];
          const inner = (<>
            {r.external && r.open && <span className="ext">↗</span>}
            <span className="gl"><i className={`ri-${r.icon}`} /><b>{roomName(r, hq.isStaff)}</b>{hq.isStaff && <code>{ext(r.path)}</code>}</span>
            <span className="pl">{r.open ? (r.own ? 'OPEN →' : 'OPEN ↗') : '🔒 NO ACCESS'}</span><span className="kn" />
            {here.length > 0 && <span className="who"><HqPeople people={here} label={`At ${r.label}`} size="sm" /></span>}
          </>);
          return r.open ? (
            <a key={r.path} className="office" href={roomHref(r)} target={r.own ? undefined : '_blank'} rel={r.own ? undefined : 'noopener noreferrer'} aria-label={r.own ? r.label : `${r.label}, opens in a new tab`} data-testid="cm-hq-office">{inner}</a>
          ) : (
            <button key={r.path} type="button" className="office lock" aria-disabled="true" aria-label={`${roomName(r, hq.isStaff)}, no access`} onClick={() => s.lockedRoom(r)} data-testid="cm-hq-office-locked">{inner}</button>
          );
        })}
      </div>
      <div className="cm-hq-floorbar">
        <button type="button" className="cm-hq-btn is-navy" onClick={s.toCab} data-testid="cm-hq-to-cab">↕ Elevator</button>
        <button type="button" className="cm-hq-btn" onClick={s.toLobby} data-testid="cm-hq-to-lobby">Lobby</button>
      </div>
      <span className="cm-hq-sr">{roomsText(f.rooms.length)} on this floor</span>
    </div>
  );
}
