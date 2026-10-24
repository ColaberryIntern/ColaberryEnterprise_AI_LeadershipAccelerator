import React from 'react';
import type { CampusAreaPresence, CampusPerson, CampusPresenceEntry } from './campusApi';
import type { StaffDesk } from './campusPeopleApi';
import { levelOfRung } from '../../services/bandLadder';
import { art } from './art/artColor';
import { openStaffCard, staffTone } from './staffCard';
import type { At } from './usePopover';
import { nameInitials } from '../../utils/personName';
import './campusPop.css';

/**
 * "Who's here" in a building card (C4; WP-5 the prototype's renderWho, D:2202-2208): "Who's here · N + staff", the AI staff on
 * duty here first (gold STAFF tag; a press opens their card), then up to eight people by first name with their level, then
 * "+N more" for everyone else (it opens the peek, which lists them, private people included).
 *
 * Never invents a person's appearance: a photo only when the learner uploaded one (avatar_url), otherwise initials. People the
 * viewer may not see by name are counted, never listed. A failed read says so ("that isn't the same as nobody being here"); an
 * empty building says "Nobody yet. You're first in."
 */
const isNamed = (e: CampusPresenceEntry): e is CampusPerson => !('anonymous' in e);
export const WHO_MAX = 8;

export function initialsOf(name: string): string {
  return nameInitials(name); // C13: the shared helper
}

const atOf = (e: React.MouseEvent<HTMLElement>): At => {
  if (e.clientX || e.clientY) return { x: e.clientX, y: e.clientY };
  const r = e.currentTarget.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.bottom };
};

function PersonChip({ p, onPick }: { p: CampusPerson; onPick?: (p: CampusPerson, at: At) => void }): React.ReactElement {
  const lv = levelOfRung(p.rung_name);
  const first = p.display_name.split(/\s+/)[0] || p.display_name;
  const inner = (
    <>
      <span className="av" aria-hidden="true">{p.avatar_url ? <img className="cm-face" src={p.avatar_url} alt="" /> : initialsOf(p.display_name)}</span>
      <span className="cm-person-name">{first}</span>
      {lv && <span className="cm-lv-chip" title={p.rung_name}>Lv {lv}</span>}
    </>
  );
  return (
    <li className="cm-person" data-enrollment={p.enrollment_id}>
      {onPick
        ? <button type="button" className="p cm-person-btn" onClick={(e) => onPick(p, atOf(e))} aria-label={`${p.display_name}${lv ? `, level ${lv}` : ''}, open their card`}>{inner}</button>
        : <span className="p is-plain">{inner}</span>}
    </li>
  );
}

export interface WhoIsHereProps {
  presence: CampusAreaPresence | undefined;
  error: boolean;
  /** True until the first presence read has answered: unknown is not the same as empty. */
  loading?: boolean;
  /** C5: open a named person's card where it was pressed. Absent = chips are plain (C4 behavior). */
  onPick?: (p: CampusPerson, at: At) => void;
  /** WP-5: the AI staff on duty in this building (already filtered for the viewer), and opening one's card (default: the staff card bus). */
  desks?: StaffDesk[];
  onStaff?: (id: string, at: At) => void;
  /** WP-5: "+N more" opens the peek over this building. */
  onMore?: (at: At) => void;
  /** Presence is not wired here (an older caller): show only the staff. */
  peopleHidden?: boolean;
}

export default function WhoIsHere({ presence, error, loading = false, onPick, desks = [], onStaff = openStaffCard, onMore, peopleHidden = false }: WhoIsHereProps): React.ReactElement {
  // every desk the server listed here (its card says whether it is open: "Back soon", "opens soon"), on-duty desks first
  const staff = [...desks].sort((x, y) => Number(y.on_duty) - Number(x.on_duty));
  const count = presence && !error ? presence.count : 0;
  let people: React.ReactNode = null;
  if (peopleHidden) people = null;
  else if (loading && !error) people = <li className="more" data-testid="cm-who-loading">Checking who&rsquo;s here&hellip;</li>;
  else if (error) people = <li className="more" data-testid="cm-who-broken">⚠ Can&rsquo;t load who&rsquo;s here right now &mdash; that isn&rsquo;t the same as nobody being here.</li>;
  else if (!presence || presence.count === 0) people = <li className="more" data-testid="cm-who-quiet">Nobody yet. You&rsquo;re first in.</li>;
  else {
    const named = presence.people.filter(isNamed);
    const shown = named.slice(0, WHO_MAX);
    const rest = Math.max(0, presence.count - shown.length);
    people = (
      <>
        {shown.map((p) => <PersonChip key={p.enrollment_id} p={p} onPick={onPick} />)}
        {rest > 0 && <li>{onMore
          ? <button type="button" className="more" onClick={(e) => onMore(atOf(e))} data-testid="cm-who-more">+{rest} more</button>
          : <span className="more" data-testid="cm-who-more">+{rest} more</span>}</li>}
      </>
    );
  }
  return (
    <div className="cm-who" data-testid="cm-who">
      <h3 className="cm-card-h">Who&rsquo;s here{count > 0 ? ` · ${count}` : ''}{count > 0 && staff.length > 0 ? ' + staff' : ''}</h3>
      <ul className="cm-who-chips cm-people">
        {staff.map((d) => (
          <li key={d.id}>
            <button type="button" className="p is-staff" onClick={(e) => onStaff(d.id, atOf(e))} data-testid={`cm-who-staff-${d.id}`}
              aria-label={`${d.name}, AI staff, open their card`}>
              <span className="av" style={{ background: art(staffTone(d.id)) }} aria-hidden="true">{initialsOf(d.name)}</span>{d.name}<span className="tag">STAFF</span>
            </button>
          </li>
        ))}
        {people}
      </ul>
    </div>
  );
}
