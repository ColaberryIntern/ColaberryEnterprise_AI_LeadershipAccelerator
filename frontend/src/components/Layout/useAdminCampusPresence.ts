import axios from 'axios';
import { useEffect } from 'react';
import { ALL_LINKS } from './adminNav';
import { readCampusSettings } from '../campus/campusSettings';
import { recordHqVisit } from '../campus/hq/hqUsage';

/**
 * Campus HQ presence from the Management Portal (Ali, 2026-10-28): an employee working here counts as online and stands on
 * the HQ floor of the page they have open, even if they never open the campus.
 *
 * Sends POST /api/admin/campus/here on every route change and every 45 s while the tab is visible. What it sends is the
 * SIDEBAR LINK the route belongs to (hqPathFor), never the route itself, so a detail page (/admin/leads/<id>) is reported as
 * its room (/admin/leads) and no record id ever leaves the page. A route with no sidebar entry is sent as null (the lobby).
 * "Show which building I'm in" off (the campus setting, same browser storage) is honored: online, but in no building.
 *
 * Its own request, not the admin api client: that client logs the session out on a 401, and a heartbeat must never be the
 * thing that ends someone's session. Fire-and-forget: a failed beat changes nothing on the page and the next beat retries.
 */
export const BEAT_MS = 45_000;
const TIMEOUT_MS = 8_000;

/** The sidebar link a route belongs to (longest prefix, `/`-delimited), or null. New-tab links are not pages here. */
export function hqPathFor(pathname: string): string | null {
  let best: string | null = null;
  for (const l of ALL_LINKS) {
    if (l.newTab || !l.path.startsWith('/admin/')) continue;
    if ((pathname === l.path || pathname.startsWith(l.path + '/')) && (!best || l.path.length > best.length)) best = l.path;
  }
  return best;
}

export function sendAdminCampusBeat(pathname: string): Promise<void> {
  const token = localStorage.getItem('admin_token');
  if (!token) return Promise.resolve();
  // Started inside a promise, so even a synchronous throw from the client becomes a rejection the catch below absorbs.
  return Promise.resolve()
    .then(() => axios.post(`${process.env.REACT_APP_API_URL || ''}/api/admin/campus/here`,
      { path: hqPathFor(pathname), share: readCampusSettings().shareBuilding },
      { headers: { Authorization: `Bearer ${token}` }, timeout: TIMEOUT_MS }))
    .then(() => undefined)
    .catch(() => undefined); // the next beat retries; see the header for why this never surfaces
}

/** `enabled` = this admin session has a linked staff account (no campus identity otherwise; the server would 204). */
export function useAdminCampusPresence(pathname: string, enabled: boolean): void {
  // C84: count the page against its sidebar room, for the campus Staff tools card (this browser only; see hqUsage).
  useEffect(() => { recordHqVisit(hqPathFor(pathname)); }, [pathname]);
  useEffect(() => {
    if (!enabled) return undefined;
    const beat = () => { if (document.visibilityState !== 'hidden') void sendAdminCampusBeat(pathname); };
    beat();
    const t = window.setInterval(beat, BEAT_MS);
    document.addEventListener('visibilitychange', beat);
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', beat); };
  }, [pathname, enabled]);
}
