import { useEffect, useState } from 'react';
import { fetchNotifications, type CommunityNotification } from '../../../services/communityApi';
import { notificationPlace } from '../campusNotify';
import type { BuildingId } from '../campusMap';

/**
 * C23 phase 3 (WP-10): unread notifications per building, for the map's red count pins. Only real notifications, placed by the same
 * notificationPlace the bell uses (never an invented building). Direct messages are left out: they also raise a `new_message`
 * notification, and the 💬 inbox already counts them, so a DM would otherwise be counted twice (the community digest excludes them
 * for the same reason). Polled on the bell's 45 s cadence, only while the tab is visible; a failed read keeps the last pins.
 */
export const NOTIF_PIN_POLL_MS = 45_000;

export function pinsFrom(list: CommunityNotification[]): Partial<Record<BuildingId, number>> {
  const out: Partial<Record<BuildingId, number>> = {};
  for (const n of list) {
    if (n.read || n.notification_type === 'new_message') continue;
    const b = notificationPlace(n.notification_type).buildingId as BuildingId;
    out[b] = (out[b] ?? 0) + 1;
  }
  return out;
}

export function useNotifPins(active: boolean): Partial<Record<BuildingId, number>> {
  const [pins, setPins] = useState<Partial<Record<BuildingId, number>>>({});
  useEffect(() => {
    if (!active) { setPins({}); return undefined; }
    let alive = true;
    const tick = () => {
      if (document.visibilityState === 'hidden') return;
      fetchNotifications().then((list) => { if (alive) setPins(pinsFrom(list)); }).catch(() => { /* keep the last pins; retried next tick */ });
    };
    tick();
    const id = window.setInterval(tick, NOTIF_PIN_POLL_MS);
    return () => { alive = false; window.clearInterval(id); };
  }, [active]);
  return pins;
}
