import { useEffect, useRef, useState } from 'react';
import { fetchRemindersApi } from './careerPrepApi';
import { recapCards, recapText } from './logic/recapCopy';
import type { CareerPrepRoomState } from './useCareerPrep';
import { useSession, type SessionApi } from './useSession';
import { cards, cora } from './useRoomLog';

/**
 * Career Prep v27 (CP4.5): the room's session, with what happens around it. When a session finishes or is
 * ended, Cora posts the server's recap (computed from the rows the session wrote) with the next cards (See my
 * dashboard, Same time tomorrow, Another session), the dashboard reloads, and the skills the session moved
 * are marked New. On opening the room, a reminder sent in the last 12 hours becomes Cora's first line (the
 * in-app half of a reminder; the email is the other half).
 */
export function useRoomSession(room: CareerPrepRoomState): { session: SessionApi; newKeys: string[]; sessionId: () => string | null } {
  const [newKeys, setNewKeys] = useState<string[]>([]);
  const session = useSession(room.plan, (s, recap) => {
    if (recap) {
      room.say(cora(recapText(recap)), cards('After your session', recapCards(s.startedAt)));
      setNewKeys(recap.skills.map((k) => k.key));
    }
    void room.reload();
  });
  const id = useRef<string | null>(null);
  id.current = session.session?.id ?? null;

  const say = room.say;
  useEffect(() => {
    let live = true;
    Promise.resolve().then(fetchRemindersApi).then((list) => {
      if (live && list.some((r) => r.status === 'sent')) {
        say(cora('Here is the reminder you asked for: it is time for your session.'),
          cards('Reminder', [{ id: 'start', icon: 'play-circle-line', title: "Start today's session", line: 'The timer starts when you do.', badge: 'Now' }]));
      }
    }).catch(() => undefined);
    return () => { live = false; };
  }, [say]);

  return { session, newKeys, sessionId: () => id.current };
}
