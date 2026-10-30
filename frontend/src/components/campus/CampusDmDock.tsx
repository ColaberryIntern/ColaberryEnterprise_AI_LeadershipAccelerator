import React, { useEffect, useRef } from 'react';
import ChatDock from '../../pages/portal/today/ChatDock';
import { useShellDms } from '../../pages/portal/today/useShellDms';
import { useCampus } from './CampusContext';
import { markDmRead } from '../../services/dmApi';
import { colorFor } from '../../services/cohortPresenceApi';
import { nameInitials } from '../../utils/personName';
import '../../pages/portal/today/TodayShell.css';
import './campusDmDock.css';

/**
 * Direct messages ON the campus (Ali, 2026-10-26: "I should also be able to talk to people that are in the room without sending me
 * to Today"). The campus home is not a PortalShell page, so it had no DM host: Message on a person card, a staff desk and the DM toast
 * all fell back to "Message from Today". This mounts the same host PortalShell uses (useShellDms registers the te-open-dm bridge and
 * dmHost), so those controls open the chat dock right here, bottom-right, over the map or the room.
 *
 * Mounted ONLY by the campus home, never in CampusProvider: PortalShell pages have their own host, and two listeners would open two
 * docks per click. The dock's styles are the Today shell's, scoped to .te-shell, so the wrapper carries that class with
 * display:contents (the tokens inherit; no grid box is drawn). Phones keep the existing rule (the dock is hidden under 820 px).
 *
 * C23 phase 3 (Q6): CHAT HEADS (D:567-570, D:2625-2628): up to four round faces, bottom right, for conversations with unread that
 * are not open; a press opens that chat. The server's unread is a yes/no per conversation, so a head carries a dot, never an
 * invented count. And an open chat is marked read (on open, and when the poll shows new unread in it), so the inbox badge and the
 * heads clear wherever the chat was opened from (the toast, a desk, a person card, the inbox).
 */
export const HEADS_MAX = 4;

export default function CampusDmDock(): React.ReactElement | null {
  const { chats, closeChat, dmError, openChatTarget } = useShellDms();
  const { dmConversations, refreshDms, staffDesks } = useCampus();
  const marking = useRef(new Set<string>());

  useEffect(() => {
    const open = new Set(chats.map((c) => c.roomId));
    const toMark = (dmConversations ?? []).filter((c) => c.unread && open.has(c.roomId) && !marking.current.has(c.roomId));
    toMark.forEach((c) => {
      marking.current.add(c.roomId);
      markDmRead(c.roomId).catch(() => { /* the next poll shows it again; non-fatal */ }).finally(() => { marking.current.delete(c.roomId); refreshDms(); });
    });
  }, [chats, dmConversations, refreshDms]);

  const staffIds = new Set(staffDesks.map((d) => d.enrollment_id).filter(Boolean) as string[]);
  const heads = (dmConversations ?? []).filter((c) => c.unread && !chats.some((t) => t.roomId === c.roomId)).slice(0, HEADS_MAX);
  if (!chats.length && !dmError && !heads.length) return null;
  return (
    <div className="te-shell cm-dm-host" data-testid="cm-dm-host">
      {chats.length > 0 && (
        <div className="te-dmdock">
          {chats.map((t) => <ChatDock key={t.roomId} target={t} onClose={() => closeChat(t.roomId)} />)}
        </div>
      )}
      {heads.length > 0 && chats.length === 0 && (
        <div className="cm-heads" data-testid="cm-heads">
          {heads.map((c) => {
            const pic = c.peerAvatar && /^(data:image\/|https:\/\/)/.test(c.peerAvatar) ? c.peerAvatar : null;
            return (
              <button key={c.roomId} type="button" className={`cm-head${staffIds.has(c.peerId) ? ' is-staff' : ''}`} style={pic ? undefined : { background: colorFor(c.peerId) }}
                onClick={() => openChatTarget({ roomId: c.roomId, name: c.peerName, color: colorFor(c.peerId) })}
                aria-label={`Open your conversation with ${c.peerName}, unread`} title={c.peerName} data-testid={`cm-head-${c.roomId}`}>
                {pic ? <img src={pic} alt="" /> : nameInitials(c.peerName)}<i className="cm-head-dot" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      )}
      {dmError && <div className="te-toast" role="status">{dmError}</div>}
    </div>
  );
}
