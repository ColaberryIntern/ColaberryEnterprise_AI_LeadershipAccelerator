import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CampusPerson } from './campusApi';
import { initialsOf } from './WhoIsHere';
import { hasDmHost, openDmThroughShell } from './dmHost';
import { postWave } from './campusPeopleApi';
import { MESSAGE_BLOCKED_NOTE } from './campusPeople';
import { publicOnly, GEAR_NAMES } from './campusGear';
import { rungTone } from '../../services/bandLadder';
import '../../styles/rungTones.css';
import { useCardFocus } from './useCardFocus';

/**
 * A person's card on the campus (Colaberry Campus C5): Message, Wave, Walk over.
 *
 *  - Message and Wave are offered only when the server says the DM rule allows it (can_message). Otherwise they are
 *    disabled with the reason, never hidden, so nobody wonders why a button is missing.
 *  - Message goes through the single DM entry point (te-open-dm -> PortalShell). On pages without PortalShell it is a
 *    link to Today rather than a button that does nothing.
 *  - Wave is a real DM, deduplicated by the server (10 minutes per pair); the button is single flight on top.
 *  - Walk over walks your avatar to their building.
 */
export interface PersonCardProps {
  person: CampusPerson;
  buildingLabel: string;
  onClose: () => void;
  onWalkOver: () => void;
  /** Called after Message hands off to the chat dock (the overlay closes so the dock is visible). */
  onMessaged?: () => void;
}

type WaveState = { kind: 'idle' } | { kind: 'sending' } | { kind: 'done'; text: string } | { kind: 'error'; text: string };

export default function PersonCard({ person: p, buildingLabel, onClose, onWalkOver, onMessaged }: PersonCardProps): React.ReactElement {
  const can = p.can_message === true;
  const host = hasDmHost();
  const [wave, setWave] = useState<WaveState>({ kind: 'idle' });
  const inFlight = useRef(false);
  const heading = useRef<HTMLHeadingElement | null>(null);
  useCardFocus(heading);

  const doWave = () => {
    if (!can || inFlight.current) return;
    inFlight.current = true;
    setWave({ kind: 'sending' });
    postWave(p.enrollment_id)
      .then((r) => setWave({ kind: 'done', text: r.sent ? `You waved at ${p.display_name}.` : 'You waved a moment ago.' }))
      .catch((e: Error) => setWave({ kind: 'error', text: e.message }))
      .finally(() => { inFlight.current = false; });
  };

  return (
    <section className="cm-card cm-person-card" aria-label={`${p.display_name}'s card`} data-testid="cm-person-card" data-enrollment={p.enrollment_id}>
      <button type="button" className="cm-card-x" onClick={onClose} aria-label={`Close ${p.display_name}'s card`}>×</button>
      <div className="cm-person-head">
        {p.avatar_url
          ? <img className="cm-face is-large" src={p.avatar_url} alt="" />
          : <span className="cm-face cm-initials is-large" aria-hidden="true" data-testid="cm-person-initials">{initialsOf(p.display_name)}</span>}
        <div>
          <h2 className="cm-card-title" tabIndex={-1} ref={heading}>{p.display_name}</h2>
          <p className="cm-who-note">In {buildingLabel}</p>
          {p.rung_name && (
            <p className={`cm-person-level rung-${rungTone(p.rung_name)}`} data-testid="cm-person-level"
              style={{ background: 'var(--rung-bg)', color: 'var(--rung-fg)', borderColor: 'var(--rung-line)' }}>{p.rung_name}</p>
          )}
          {Object.keys(publicOnly(p.gear)).length > 0 && (
            <p className="cm-who-note" data-testid="cm-person-gear">Wearing: {Object.values(publicOnly(p.gear)).map((id) => GEAR_NAMES[id] ?? id).join(', ')}</p>
          )}
        </div>
      </div>

      <div className="cm-person-actions">
        {!can && <span className="cm-btn is-disabled" aria-disabled="true" data-testid="cm-message-blocked">Message</span>}
        {can && host && (
          <button type="button" className="cm-btn" data-testid="cm-message"
            onClick={() => { openDmThroughShell(p.enrollment_id, p.display_name); onMessaged?.(); }}>Message</button>
        )}
        {can && !host && <Link className="cm-btn" to="/portal/today" data-testid="cm-message-today" onClick={onMessaged}>Message from Today</Link>}
        <button type="button" className="cm-btn is-secondary" data-testid="cm-wave" onClick={doWave}
          disabled={!can || wave.kind === 'sending'} aria-disabled={!can || wave.kind === 'sending'}>
          {wave.kind === 'sending' ? 'Waving...' : 'Wave'}
        </button>
        <button type="button" className="cm-btn is-secondary" data-testid="cm-walk-over" onClick={onWalkOver}>Walk over</button>
      </div>
      {!can && <p className="cm-who-note" data-testid="cm-message-note">{MESSAGE_BLOCKED_NOTE}</p>}
      {(wave.kind === 'done' || wave.kind === 'error') && <p className="cm-who-note" role="status" data-testid="cm-wave-status">{wave.text}</p>}
    </section>
  );
}
