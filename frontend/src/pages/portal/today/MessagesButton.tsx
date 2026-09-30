import React, { useCallback, useEffect, useState } from 'react';
import { DmConversation, fetchConversations, markDmRead } from '../../../services/dmApi';
import { colorFor } from '../../../services/cohortPresenceApi';
import { DmTarget } from './ChatDock';

// Topbar Messages icon: unread badge + a dropdown of DM conversations. Clicking
// a conversation opens its chat dock (via onOpen) and marks it read. Polls every
// 15s so the badge stays fresh.
const MessagesButton: React.FC<{ onOpen: (t: DmTarget) => void }> = ({ onOpen }) => {
  const [convos, setConvos] = useState<DmConversation[]>([]);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(() => {
    fetchConversations().then(setConvos).catch(() => { /* keep last */ });
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 15000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const unread = convos.filter((c) => c.unread).length;

  const openConvo = (c: DmConversation) => {
    onOpen({ roomId: c.roomId, name: c.peerName, color: colorFor(c.peerId) });
    markDmRead(c.roomId).then(refresh).catch(() => { /* non-fatal */ });
    setOpen(false);
  };

  return (
    <div className="te-msgbtn-wrap">
      <button type="button" className="te-iconbtn te-msgbtn" onClick={() => setOpen((v) => !v)} title="Messages" aria-label={`Messages${unread ? `, ${unread} unread` : ''}`}>
        <svg viewBox="0 0 24 24" fill="none"><path d="M4 5h16v11H8l-4 4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
        {unread > 0 && <span className="te-msg-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <>
          <div className="te-msg-backdrop" onClick={() => setOpen(false)} />
          <div className="te-msg-panel" role="menu">
            <div className="te-msg-h">Messages</div>
            {convos.length === 0 && (
              <div className="te-msg-empty">No conversations yet. Click a face in Contacts to start one.</div>
            )}
            {convos.map((c) => (
              <button key={c.roomId} type="button" className={`te-msg-row${c.unread ? ' unread' : ''}`} onClick={() => openConvo(c)}>
                <span className="te-msg-av" style={{ background: colorFor(c.peerId) }}>{c.peerName.slice(0, 1).toUpperCase()}</span>
                <span className="te-msg-txt">
                  <b>{c.peerName}</b>
                  <span className="te-msg-prev">{c.lastMessage}</span>
                </span>
                {c.unread && <span className="te-msg-dot" aria-label="unread" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default MessagesButton;
