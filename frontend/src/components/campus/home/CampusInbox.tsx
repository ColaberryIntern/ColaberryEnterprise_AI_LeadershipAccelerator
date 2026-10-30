import React, { useEffect, useMemo, useRef } from 'react';
import { useCampus } from '../CampusContext';
import { CAMPUS_BUILDINGS, buildingName } from '../campusMap';
import { openDmThroughShell } from '../dmHost';
import { markDmRead, myEnrollmentId } from '../../../services/dmApi';
import { nameInitials } from '../../../utils/personName';
import { inboxSections, type InboxRow } from './inboxModel';

/**
 * C23 phase 3 (Q6, WP-10): the campus inbox, the popover under the top bar's 💬 (D:538-546, D:2683-2691). Three sections from real
 * data (inboxModel): the AI desks that take messages, your recent conversations, and people in your building you have not talked
 * to yet. A row opens the chat dock right here (the campus home's DM host) and, when the conversation had unread, marks it read.
 * Esc or a press outside closes it (the 💬 button toggles it); the home recenters its map when it closes (rule R10).
 */
export const MESSAGES_BUTTON_ID = 'cm-stats-messages';

function Face({ row }: { row: InboxRow }): React.ReactElement {
  const pic = row.avatar && /^(data:image\/|https:\/\/)/.test(row.avatar) ? row.avatar : null;
  return <span className={`cm-ib-av${row.staff ? ' is-staff' : ''}`} aria-hidden="true">{pic ? <img src={pic} alt="" /> : nameInitials(row.name)}</span>;
}

export default function CampusInbox({ open, onClose, workplace }: { open: boolean; onClose: () => void; workplace: boolean }): React.ReactElement | null {
  const { dmConversations, staffDesks, presence, here, refreshDms } = useCampus();
  const box = useRef<HTMLDivElement | null>(null);
  const s = useMemo(() => inboxSections({ conversations: dmConversations, desks: staffDesks, presence, here, me: myEnrollmentId(), workplace }),
    [dmConversations, staffDesks, presence, here, workplace]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || box.current?.contains(t) || t.closest(`[data-testid="${MESSAGES_BUTTON_ID}"]`)) return;
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey, true); document.removeEventListener('mousedown', onDown); };
  }, [open, onClose]);
  if (!open) return null;

  const openRow = (r: InboxRow) => {
    openDmThroughShell(r.peerId, r.name);
    if (r.roomId && r.unread) markDmRead(r.roomId).then(refreshDms).catch(() => { /* the next poll shows it again; non-fatal */ });
    onClose();
  };
  const hb = here ? CAMPUS_BUILDINGS.find((b) => b.id === here) : undefined;
  const section = (title: string, rows: InboxRow[], id: string) => rows.length > 0 && (
    <section aria-labelledby={`cm-ib-${id}`} data-testid={`cm-inbox-${id}`}>
      <h4 id={`cm-ib-${id}`}>{title}</h4>
      {rows.map((r) => (
        <button key={r.key} type="button" className={`cm-ib-row${r.unread ? ' is-unread' : ''}`} onClick={() => openRow(r)} data-testid={`cm-inbox-row-${r.peerId}`}>
          <Face row={r} />
          <span className="cm-ib-txt">
            <b>{r.name}{r.staff && <span className="cm-ib-tag">AI staff</span>}</b>
            <small>{r.preview}</small>
          </span>
          {r.unread && <i className="cm-ib-dot" aria-label="unread" />}
        </button>
      ))}
    </section>
  );
  const empty = !s.staff.length && !s.recent.length && !s.here.length;
  return (
    <div className="cm-inbox" ref={box} role="dialog" aria-label="Messages" data-testid="cm-inbox">
      {section('Staff · always on', s.staff, 'staff')}
      {section('Recent', s.recent, 'recent')}
      {section(hb ? `In the ${buildingName(hb, workplace)} with you` : 'Here with you', s.here, 'here')}
      {empty && <p className="cm-ib-empty" data-testid="cm-inbox-empty">No conversations yet. Message someone from their card on the map.</p>}
    </div>
  );
}
