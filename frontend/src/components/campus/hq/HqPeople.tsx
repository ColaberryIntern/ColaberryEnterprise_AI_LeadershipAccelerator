import React from 'react';

/** An employee in the HQ, as the presence server names them (photo or initials, never an invented face). */
export interface HqPerson { key: string; name: string; initials: string; photo: string | null; hq_path?: string }

const SHOWN = 4;

/** A small stack of faces with the names in the label, "+n" past four (Campus HQ: who is on this floor or at this door). */
export function HqPeople({ people, label, size = 'md' }: { people: HqPerson[]; label: string; size?: 'sm' | 'md' }): React.ReactElement | null {
  if (!people.length) return null;
  const names = people.map((p) => p.name).join(', ');
  return (
    <span className={`cm-hq-people is-${size}`} role="img" aria-label={`${label}: ${names}`} title={names} data-testid="cm-hq-people">
      {people.slice(0, SHOWN).map((p) => (
        <span key={p.key} className="av">{p.photo ? <img src={p.photo} alt="" /> : p.initials}</span>
      ))}
      {people.length > SHOWN && <span className="av more">+{people.length - SHOWN}</span>}
    </span>
  );
}
