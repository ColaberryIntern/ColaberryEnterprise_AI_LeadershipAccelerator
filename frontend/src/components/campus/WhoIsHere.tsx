import React from 'react';
import type { CampusAreaPresence, CampusPerson, CampusPresenceEntry } from './campusApi';

/**
 * "Who's here" in a building card (Colaberry Campus C4).
 *
 * Never invents a person's appearance: a photo only when the learner uploaded one (avatar_url),
 * otherwise initials on a neutral token color. People the viewer may not see by name (the server
 * already decided, matching the people rail) are summarised as "N learners", never listed.
 * States: a failed read says so plainly; an empty building says "Nobody here right now".
 */
const isNamed = (e: CampusPresenceEntry): e is CampusPerson => !('anonymous' in e);

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '')).toUpperCase();
}

function PersonChip({ p, onPick }: { p: CampusPerson; onPick?: (p: CampusPerson) => void }): React.ReactElement {
  const inner = (
    <>
      {p.avatar_url
        ? <img className="cm-face" src={p.avatar_url} alt="" />
        : <span className="cm-face cm-initials" aria-hidden="true">{initialsOf(p.display_name)}</span>}
      <span className="cm-person-name">{p.display_name}</span>
    </>
  );
  // C5: with onPick, the chip opens that person's card.
  return (
    <li className="cm-person" data-enrollment={p.enrollment_id}>
      {onPick ? <button type="button" className="cm-person-btn" onClick={() => onPick(p)} aria-label={`${p.display_name}, open their card`}>{inner}</button> : inner}
    </li>
  );
}

export interface WhoIsHereProps {
  presence: CampusAreaPresence | undefined;
  error: boolean;
  /** True until the first presence read has answered: unknown is not the same as empty. */
  loading?: boolean;
  /** C5: open a named person's card. Absent = chips are plain (C4 behavior). */
  onPick?: (p: CampusPerson) => void;
}

export default function WhoIsHere({ presence, error, loading = false, onPick }: WhoIsHereProps): React.ReactElement {
  let body: React.ReactNode;
  if (loading && !error) {
    body = <p className="cm-who-note" data-testid="cm-who-loading">Checking who's here...</p>;
  } else if (error) {
    body = <p className="cm-who-note" data-testid="cm-who-broken">We can't load who's online. Everything else still works.</p>;
  } else if (!presence || presence.count === 0) {
    body = <p className="cm-who-note" data-testid="cm-who-quiet">Nobody here right now.</p>;
  } else {
    const named = presence.people.filter(isNamed);
    const others = presence.people.length - named.length;
    body = (
      <>
        {named.length > 0 && <ul className="cm-people">{named.map((p) => <PersonChip key={p.enrollment_id} p={p} onPick={onPick} />)}</ul>}
        {others > 0 && <p className="cm-who-note" data-testid="cm-who-anon">{others === 1 ? '1 other learner' : `${others} other learners`}</p>}
      </>
    );
  }
  return (
    <div className="cm-who" data-testid="cm-who">
      <h3 className="cm-card-h">Who's here{presence && !error && presence.count > 0 ? ` - ${presence.count}` : ''}</h3>
      {body}
    </div>
  );
}
