import React from 'react';
import type { HqFloor } from '../campus/hq/hqModel';
import { CAREER_PREP_ROOM_PATH } from '../campus/hq/careerPrepDoors';
import { careerPrepSummary } from './logic/careerPrepCopy';
import { useCareerPrepSummary } from './useCareerPrepSummary';
import './careerPrepFloor.css';

/**
 * Career Prep v27 (CP2.3): the student's Career Prep floor, as design/shots/L2-1_floor6_one_door.jpg.
 * The sign, the floor screen (greeting, Walk in, the stops that have data), ONE large door with
 * "Start here", and Cora at her desk. Every one of them opens the room. Nothing here invents a
 * number: a stop without data is not rendered, and with no summary the door still works.
 */
export function CareerPrepFloor({ f, onElevator, onLobby }: { f: HqFloor; onElevator: () => void; onLobby: () => void }): React.ReactElement {
  const summary = useCareerPrepSummary();
  const copy = summary ? careerPrepSummary(summary) : null;
  return (
    <div className="cm-hq-floor cp-floor" data-testid="cp-floor">
      <div className="corr" />
      <div className="plate"><div className="n">FLOOR {f.num}</div><b>CAREER PREP</b></div>

      <section className="cp-screen" aria-label="Floor screen">
        <p className="cp-greet" data-testid="cp-greeting">{copy?.greeting ?? 'Cora, your interview coach, is ready when you are.'}</p>
        <a className="cp-walkin" href={CAREER_PREP_ROOM_PATH} data-testid="cp-walkin">Walk in</a>
        {copy && copy.stops.length > 0 && (
          <ul className="cp-stops" aria-label="Your numbers">
            {copy.stops.map((s) => (
              <li key={s.key}><a href={CAREER_PREP_ROOM_PATH} data-testid={`cp-stop-${s.key}`}><b>{s.value}</b><small>{s.label}</small></a></li>
            ))}
          </ul>
        )}
      </section>

      <a className="cp-door" href={CAREER_PREP_ROOM_PATH} aria-label="Career Prep: start here" data-testid="cp-door">
        <span className="cp-flag" aria-hidden="true">Start here</span>
        <i className="ri-focus-3-line" aria-hidden="true" />
        <b>Career Prep</b>
        {copy?.doorStatus && <small className="cp-status">{copy.doorStatus}</small>}
        <span className="cp-open">OPEN →</span>
      </a>

      <a className="cp-cora" href={CAREER_PREP_ROOM_PATH} data-testid="cp-cora">
        <span className="av" aria-hidden="true">C</span>
        <span className="tx"><b>Cora <small>AI</small></b><small>your interview coach</small></span>
        <span className="say">Come in. I will help you get ready for your next interview.</span>
      </a>

      <div className="cm-hq-floorbar">
        <button type="button" className="cm-hq-btn is-navy" onClick={onElevator} data-testid="cm-hq-to-cab">Elevator</button>
        <button type="button" className="cm-hq-btn" onClick={onLobby} data-testid="cm-hq-to-lobby">Lobby</button>
      </div>
      <span className="cm-hq-sr">1 door on this floor</span>
    </div>
  );
}

/** The side panel's Career Prep rows: what is waiting on the student, each opening the room. */
export function CareerPrepPanelRows(): React.ReactElement | null {
  const summary = useCareerPrepSummary();
  const waiting = summary ? careerPrepSummary(summary).waiting : [];
  if (!waiting.length) return null;
  return (
    <>
      <div className="sec">Waiting on you</div>
      <div className="cm-hq-rlist" data-testid="cp-waiting">
        {waiting.slice(0, 2).map((w) => (
          <a key={w} className="cm-hq-rrow" href={CAREER_PREP_ROOM_PATH}><span className="t"><b>{w}</b></span><span className="go">Open →</span></a>
        ))}
      </div>
    </>
  );
}
