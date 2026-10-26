import React from 'react';
import ChatDock from '../../pages/portal/today/ChatDock';
import { useShellDms } from '../../pages/portal/today/useShellDms';
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
 */
export default function CampusDmDock(): React.ReactElement | null {
  const { chats, closeChat, dmError } = useShellDms();
  if (!chats.length && !dmError) return null;
  return (
    <div className="te-shell cm-dm-host" data-testid="cm-dm-host">
      {chats.length > 0 && (
        <div className="te-dmdock">
          {chats.map((t) => <ChatDock key={t.roomId} target={t} onClose={() => closeChat(t.roomId)} />)}
        </div>
      )}
      {dmError && <div className="te-toast" role="status">{dmError}</div>}
    </div>
  );
}
