import React, { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';
import { timeAgo } from './communityUtils';
import './community.css';
import {
  fetchNotifications, fetchUnreadNotificationCount, markNotificationRead, markAllNotificationsRead,
  CommunityNotification,
} from '../../../services/communityApi';

function notifText(n: CommunityNotification): string {
  const who = n.actor?.display_name ?? 'Someone';
  if (n.notification_type === 'mention') return `${who} mentioned you in a ${n.source_type}`;
  return n.source_type === 'comment' ? `${who} replied to you` : `${who} commented on your post`;
}

/**
 * Topbar notification bell (Community). Polls a lightweight unread count every
 * 45s; opening the panel fetches the list. Clicking an item marks it read and
 * jumps to the community feed. Degrades silently for users with no community
 * membership (count stays 0). Lives in the portal shell so it shows everywhere.
 */
const NotificationBell: React.FC = () => {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CommunityNotification[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = () => fetchUnreadNotificationCount().then(setCount).catch(() => {});
    load();
    const t = window.setInterval(load, 45_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) fetchNotifications().then(setItems).catch(() => setItems([]));
  };

  const onItem = (n: CommunityNotification) => {
    if (!n.read) { markNotificationRead(n.id).catch(() => {}); setCount((c) => Math.max(0, c - 1)); }
    setOpen(false);
    window.location.assign('/portal/community');
  };

  const onReadAll = async () => {
    await markAllNotificationsRead().catch(() => {});
    setCount(0);
    setItems((prev) => (prev ? prev.map((n) => ({ ...n, read: true })) : prev));
  };

  return (
    <div className="cm-bell" ref={ref}>
      <button type="button" className="cm-bell-btn" onClick={toggle} aria-label={`Notifications${count > 0 ? ` (${count} unread)` : ''}`}>
        <svg viewBox="0 0 24 24" fill="none"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M13.7 21a2 2 0 0 1-3.4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        {count > 0 && <span className="cm-bell-badge">{count > 9 ? '9+' : count}</span>}
      </button>
      {open && (
        <div className="cm-bell-panel" role="dialog" aria-label="Notifications">
          <div className="cm-bell-head">
            <b>Notifications</b>
            {count > 0 && <button type="button" onClick={onReadAll}>Mark all read</button>}
          </div>
          {items === null && <div className="cm-empty">Loading…</div>}
          {items !== null && items.length === 0 && <div className="cm-empty">No notifications yet.</div>}
          {items?.map((n) => (
            <button type="button" key={n.id} className={`cm-notif${n.read ? '' : ' unread'}`} onClick={() => onItem(n)}>
              <Avatar name={n.actor?.display_name ?? '?'} src={n.actor?.avatar_url ?? null} size="sm" />
              <div className="cm-notif-body">
                <span className="cm-notif-text">{notifText(n)}</span>
                <span className="cm-notif-time">{timeAgo(n.created_at)}</span>
              </div>
              {!n.read && <span className="cm-notif-dot" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
