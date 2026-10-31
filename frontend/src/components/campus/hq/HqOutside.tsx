import React, { useState } from 'react';
import { art } from '../art/artColor';
import { conciergeLine, floorStatus, openFloors, readerLine, type HqFloor } from './hqModel';
import type { HqState } from './useHq';
import type { CampusAudience } from '../campusMap';
import { HqPeople, type HqPerson } from './HqPeople';

/**
 * Campus HQ scenes 2 and 3 (H5): the tower from outside and the lobby. Both are drawn from the generated floors, so a new
 * sidebar group is a new band on the tower and a new row on the directory with no edit here.
 */
const BAND_H = 34;
const W = 360;
const BASE_H = 120;
const TOP = 170;

export function isNight(hour: number): boolean { return hour >= 19 || hour < 6; }
/** C89 (Ali, 2026-10-29: "bring the blue back"): the tower's bands are navy at every hour (they were cream by day). The map
 *  tower (art/hqTower.tsx) uses the same token, so the two pictures always match. Night still dims the locked windows. */
export const TOWER_BAND = 'hq-band-night';

export function HqOutside({ s, face, hour, people }: { s: HqState; face: string; hour: number; people: Map<string, HqPerson[]> }): React.ReactElement {
  const { hq } = s;
  const [tip, setTip] = useState<{ f: HqFloor; x: number; y: number } | null>(null);
  const night = isNight(hour);
  const n = hq.floors.length;
  const by = TOP + n * BAND_H;
  const lit = openFloors(hq).length;
  return (
    <div className={`cm-hq-ext${night ? ' is-night' : ''}`} data-testid="cm-hq-ext">
      <svg viewBox={`-20 0 ${W + 120} ${by + BASE_H}`} role="img" aria-label={`Colaberry Tower, ${n} floors`} onMouseLeave={() => setTip(null)}>
        <polygon points={`${W / 2 + 40},10 ${W / 2 + 60},${TOP - 60} ${W / 2 + 20},${TOP - 60}`} fill={art('hq-brass')} />
        <rect x={W / 2 - 10} y={TOP - 60} width={100} height={60} fill={art(TOWER_BAND)} stroke={art('hq-brass')} />
        <circle cx={W / 2 + 40} cy={TOP - 30} r={18} fill={art('red')} />
        <text x={W / 2 + 40} y={TOP - 24} textAnchor="middle" className="cm-hq-serif" fontSize={18} fontWeight={800} fill={art('cloud')}>C</text>
        {hq.floors.map((f, i) => {
          const y = TOP + i * BAND_H;
          const on = f.access !== 'none';
          const w = W - (i === 0 ? 60 : 0);
          const x = (W - w) / 2 + 40;
          const here = people.get(f.num)?.length ?? 0;
          return (
            <g key={f.key} className="cm-hq-band" data-testid={`cm-hq-band-${f.num}`} data-lit={on ? '1' : '0'}
              onMouseMove={(e) => { const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); setTip({ f, x: e.clientX - r.left, y: e.clientY - r.top }); }}
              onClick={() => (on ? s.ride(f.num) : s.locked(f))}>
              <rect x={x} y={y} width={w} height={BAND_H} fill={art(TOWER_BAND)} stroke={art('hq-brass')} strokeWidth={1} />
              {Array.from({ length: 10 }, (_v, j) => (
                <rect key={j} x={x + 14 + j * ((w - 28) / 10)} y={y + 8} width={(w - 28) / 10 - 8} height={BAND_H - 16} rx={2}
                  fill={art(on ? 'hq-win' : night ? 'hq-win-night' : 'hq-win-off')} opacity={on && (i + j) % 4 === 0 ? 0.75 : 1} />
              ))}
              <rect className="cm-hq-bandhi" x={x} y={y} width={w} height={BAND_H} fill={art(on ? 'hq-band-hi' : 'hq-band-lock')} />
              <text x={x - 10} y={y + BAND_H / 2 + 4} textAnchor="end" className="cm-hq-mono" fontSize={12} fontWeight={700} fill={art(on ? 'hq-brass3' : 'hq-num-off')}>{f.num}</text>
              {!on && hq.isStaff && <text x={x + w + 10} y={y + BAND_H / 2 + 4} fontSize={11} fill={art('red')}>🔒</text>}
              {here > 0 && hq.isStaff && <text x={x + w + (on ? 10 : 26)} y={y + BAND_H / 2 + 4} fontSize={11} fontWeight={800} fill={art('hq-brass3')}>👤{here}</text>}
            </g>
          );
        })}
        <rect x={20} y={by} width={W + 40} height={BASE_H} fill={art('hq-navy')} />
        <rect x={20} y={by} width={W + 40} height={8} fill={art('hq-brass')} />
        <text x={W / 2 + 40} y={by + 34} textAnchor="middle" className="cm-hq-serif" fontSize={22} fontWeight={800} letterSpacing={6} fill={art('hq-brass2')}>COLABERRY</text>
        <text x={W / 2 + 40} y={by + 52} textAnchor="middle" fontSize={9} fontWeight={700} letterSpacing={5} fill={art('hq-sign-sub')}>REFACTORED.AI</text>
        <g className="cm-hq-band" onClick={s.walkIn}>
          <rect x={W / 2 + 5} y={by + 62} width={70} height={BASE_H - 62} fill={art('hq-brass2')} />
          <rect x={W / 2 + 10} y={by + 67} width={60} height={BASE_H - 67} fill={art('hq-sky')} opacity={0.85} />
          <line x1={W / 2 + 40} y1={by + 67} x2={W / 2 + 40} y2={by + BASE_H} stroke={art('hq-brass3')} strokeWidth={2} />
        </g>
        <rect x={W / 2 - 70} y={by + 70} width={64} height={18} rx={2} fill={art('hq-brass')} />
        <text x={W / 2 - 38} y={by + 82} textAnchor="middle" fontSize={7.5} fontWeight={800} letterSpacing={1} fill={art('hq-navy')}>{face.toUpperCase()}</text>
      </svg>
      {tip && (
        <div className="cm-hq-tip" style={{ left: tip.x + 14, top: tip.y + 14 }} role="status">
          <b>{tip.f.num} · {tip.f.label}</b>
          <small>{tip.f.own ? `Your office · ${tip.f.rooms.length} ${tip.f.rooms.length === 1 ? 'room' : 'rooms'}` : !hq.isStaff ? 'Colaberry staff only' : tip.f.access !== 'none' ? `${tip.f.openCount} of ${tip.f.rooms.length} rooms open to you` : '🔒 Your badge doesn’t open this floor'}</small>
        </div>
      )}
      <div className="cm-hq-legend">
        <div><i className="is-lit" />Floors your badge opens</div>
        <div><i className="is-off" />Floors you can’t reach</div>
        <div className="sm">Hover a floor to see what’s on it</div>
      </div>
      <div className="cm-hq-cta">
        <button type="button" className="cm-hq-btn is-red" onClick={s.walkIn} data-testid="cm-hq-walk-in">Walk in →</button>
        <span className="cm-hq-chip">{hq.isStaff ? <>Your badge opens <b>{lit}</b> of {n} floors</> : lit > 0 ? <>Your badge opens your office + the lobby</> : 'You can use the ground floor'}</span>
      </div>
    </div>
  );
}

export function HqLobby({ s, face, audience, firstName, hour, desk, lobby, people, onGround }: {
  s: HqState; face: string; audience: CampusAudience; firstName: string; hour: number;
  desk: { name: string; initials: string } | null; lobby: HqPerson[]; people: Map<string, HqPerson[]>; onGround: (route: string) => void;
}): React.ReactElement {
  const { hq } = s;
  const portalDoors = hq.ground.filter((g) => g.portal);
  return (
    <div className="cm-hq-lobby" data-testid="cm-hq-lobby">
      <div className="wall" /><div className="cornice" /><div className="floor" />
      <div className="cm-hq-sign"><div className="w"><span className="c">C</span>OLABERRY</div><div className="s">REFACTORED.AI</div><div className="face">{face.toUpperCase()}</div></div>
      <div className="cm-hq-bank">
        {portalDoors.map((g) => (
          <button key={g.key} type="button" className="cm-hq-gdoor" onClick={() => onGround(g.route)} aria-label={`${g.label}, ground floor`} data-testid={`cm-hq-gdoor-${g.key}`}>
            <span className="pl">{g.label.toUpperCase()}<br />{g.sub}</span>
          </button>
        ))}
        <button type="button" className="cm-hq-elev" onClick={s.toCab} aria-label="Elevator A" data-testid="cm-hq-call">
          <span className="ind">{s.cabAt}</span><span className="dr"><i /><i /></span>
        </button>
        <button type="button" className="cm-hq-callbtn" onClick={s.toCab} aria-label="Call the elevator"><i>▲</i><i>▼</i></button>
        <button type="button" className="cm-hq-elev" onClick={s.toCab} aria-label="Elevator B"><span className="ind">PH</span><span className="dr"><i /><i /></span></button>
      </div>
      <div className="cm-hq-bubble" data-testid="cm-hq-concierge"><b>CONCIERGE{desk ? ` · ${desk.name.toUpperCase()}` : ''}</b>{conciergeLine(hq, firstName, audience, hour)}</div>
      <div className="cm-hq-desk">
        {desk && <div className="host"><span className="av">{desk.initials}</span><span className="bd" /></div>}
        <div className="top2" /><div className="body">CONCIERGE</div>
      </div>
      {lobby.length > 0 && <div className="cm-hq-lobby-people" data-testid="cm-hq-lobby-people"><HqPeople people={lobby} label="In the lobby" /></div>}
      <div className="cm-hq-dir" aria-label="Building directory" data-testid="cm-hq-directory">
        <h5>DIRECTORY</h5>
        {hq.floors.map((f) => {
          const on = f.access !== 'none';
          const here = hq.isStaff ? people.get(f.num)?.length ?? 0 : 0;
          return (
            <button key={f.key} type="button" className={`r ${(hq.isStaff && on) || f.own ? 'yes' : 'no'}`} aria-disabled={on ? undefined : true}
              onClick={() => (on ? s.ride(f.num) : s.locked(f))} title={floorStatus(f, hq.isStaff)}>
              <span className="n">{f.num}</span><span className="l">{f.label}</span>
              {here > 0 && <span className="p">👤{here}</span>}
              <span className="s">{f.own ? '✓' : !hq.isStaff ? 'STAFF' : on ? '✓' : '🔒'}</span>
            </button>
          );
        })}
        <button type="button" className="r yes" onClick={() => s.ride('G')}><span className="n">G</span><span className="l">LOBBY · {face.toUpperCase()}</span><span className="s">✓</span></button>
      </div>
      <div className="cm-hq-gate">
        <span className="tsl" />
        <button type="button" className={`reader ${hq.isStaff ? 'ok' : 'no'}`} onClick={s.toCab} data-testid="cm-hq-reader">
          <span className="dot">{hq.isStaff ? '✓' : 'G'}</span>{readerLine(hq, audience)}
        </button>
        <span className="tsl" />
      </div>
    </div>
  );
}
