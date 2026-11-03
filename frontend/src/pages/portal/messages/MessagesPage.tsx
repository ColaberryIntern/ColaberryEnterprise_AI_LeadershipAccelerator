import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import PortalShell from '../today/PortalShell';
import ChatDock, { type DmTarget } from '../today/ChatDock';
import { fetchConversations, markDmRead } from '../../../services/dmApi';
import { colorFor } from '../../../services/cohortPresenceApi';
import '../today/TodayShell.css';
import './messages.css';

/**
 * One conversation, at its own URL.
 *
 * ## Why direct messages needed a URL at all
 *
 * Ali, 3 November 2026, on the "<name> sent you a message" email: "when receiving
 * a message is clicked, it makes you put your email in so you have to then check
 * another email which makes no sense at all." The sign-in half of that is fixed in
 * `portalLinkTokenService`. This is the other half: that button pointed at
 * `/portal/community`, which has no messages on it. Direct messages were a chat
 * dock opened by a `te-open-dm` event, reachable only by clicking a person
 * somewhere in the app — there was no address for a conversation, so no email,
 * notification or bookmark could ever link to one.
 *
 * ## Why the thread renders INLINE rather than opening the dock
 *
 * Dispatching `te-open-dm` would have been a smaller change and is wrong here:
 * `TodayShell.css` ends with `@media(max-width:820px){.te-dmdock{display:none}}`,
 * so the dock does not exist on a phone. A "Read and reply" button that silently
 * does nothing on the device most email is read on is not a fix.
 *
 * `.te-dmwin` is not itself positioned — only `.te-dmdock`, the fixed container,
 * is — so the same `ChatDock` renders perfectly well in the page body, and
 * `messages.css` sizes it to the column instead of to a 300px corner window. The
 * component, its polling, its optimistic send and its attachments are reused
 * exactly as the dock uses them.
 *
 * ## The peer is resolved, not trusted
 *
 * The route carries a room id and nothing else. The display name and colour come
 * from `/api/portal/dm/conversations`, which is participant-scoped server-side, so
 * a room the viewer is not a member of simply is not in the list and resolves to
 * "not available" here. That check is the server's; this page never has to decide
 * who may read what.
 */
type Phase = 'loading' | 'ready' | 'missing' | 'failed';

const MessagesPage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('loading');
  const [target, setTarget] = useState<DmTarget | null>(null);

  useEffect(() => {
    if (!roomId) { setPhase('missing'); return; }
    let alive = true;
    fetchConversations()
      .then((list) => {
        if (!alive) return;
        const found = list.find((c) => c.roomId === roomId);
        if (!found) { setPhase('missing'); return; }
        setTarget({ roomId: found.roomId, name: found.peerName, color: colorFor(found.peerId) });
        setPhase('ready');
        // Arriving here IS reading it, so clear the badge the notification set.
        // Non-fatal: the next poll shows it again, and an unread dot is a far
        // smaller problem than a thread that refuses to open.
        markDmRead(roomId).catch(() => { /* non-fatal, see above */ });
      })
      .catch(() => { if (alive) setPhase('failed'); });
    return () => { alive = false; };
  }, [roomId]);

  return (
    <PortalShell>
      <div className="pm-wrap">
        <div className="pm-head">
          <h1 className="pm-title">{phase === 'ready' && target ? target.name : 'Messages'}</h1>
          <Link className="pm-back" to="/portal/today">Back to Today</Link>
        </div>

        {phase === 'loading' && (
          <p className="pm-note" role="status">Opening your conversation&hellip;</p>
        )}

        {phase === 'ready' && target && (
          <div className="pm-thread" data-testid="pm-thread">
            <ChatDock target={target} onClose={() => navigate('/portal/today')} />
          </div>
        )}

        {phase === 'missing' && (
          <p className="pm-note" data-testid="pm-missing">
            That conversation is not available. It may belong to someone else, or it may have been
            removed. <Link to="/portal/community">Find them in the community</Link> to start a new one.
          </p>
        )}

        {phase === 'failed' && (
          <p className="pm-note" data-testid="pm-failed">
            We could not load your conversations just now. Please refresh to try again.
          </p>
        )}
      </div>
    </PortalShell>
  );
};

export default MessagesPage;
