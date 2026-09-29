import type { ChannelAccount } from '../../../services/channelAccountApi';
import { providerLabel } from './overviewFormat';
import { formatCentralDate } from './centralTime';

/**
 * connectionAlerts - which connections are in trouble, and what to say about them.
 *
 * WHY A BANNER AT ALL. Loomly tells you on EVERY screen that a connection is failing, and names
 * it. We compute account health more carefully than they do - and then show it in one place you
 * have to visit on purpose. Ali's LinkedIn stops working on 15 Nov 2026; nobody will happen to be
 * on the Overview that morning. A fact that only appears where you already went is not a warning.
 *
 * TWO SEVERITIES, because they are different jobs:
 *   failing   - posts are being refused NOW. Red. Reconnect today.
 *   expiring  - still working, with a date attached. Amber. Reconnect this week.
 *
 * Pure: the rules are decided here from plain account rows, and tested without mounting anything.
 */

/** How far ahead a looming expiry is worth interrupting someone about. */
export const EXPIRY_WARNING_DAYS = 14;

export type AlertSeverity = 'failing' | 'expiring';

export interface ConnectionAlert {
  severity: AlertSeverity;
  accountId: string;
  /** "LinkedIn", "Facebook Page" - what an operator calls it. */
  network: string;
  /** Which brand it belongs to, because the fix is per brand. */
  brandName: string | null;
  /** The account's own name, so two LinkedIns are distinguishable. */
  displayName: string;
  /** Null when nothing expires (a failing account may have no date). */
  until: string | null;
  daysLeft: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysUntil(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  return Number.isNaN(at) ? null : Math.floor((at - now.getTime()) / DAY_MS);
}

/**
 * The accounts worth interrupting someone about, worst first.
 *
 * A revoked account is deliberately NOT an alert: somebody disconnected it on purpose, and
 * nagging about a decision that was just made is how a banner teaches people to ignore banners.
 */
export function connectionAlerts(
  accounts: readonly ChannelAccount[],
  now: Date = new Date(),
  /** brand id -> name, so the banner can say WHICH brand to go and fix. */
  brandNames?: ReadonlyMap<string, string>,
): ConnectionAlert[] {
  const out: ConnectionAlert[] = [];
  for (const a of accounts) {
    if (a.revoked_at || a.health === 'revoked') continue;
    const days = daysUntil(a.usable_until ?? null, now);
    const base = {
      accountId: a.id,
      network: providerLabel(a.provider),
      brandName: (a.brand_id ? brandNames?.get(a.brand_id) : null) ?? null,
      displayName: a.display_name,
      until: a.usable_until ?? null,
      daysLeft: days,
    };

    if (a.health === 'expired' || a.health === 'unhealthy') {
      out.push({ ...base, severity: 'failing' });
    } else if (a.health === 'expiring' || (days !== null && days >= 0 && days <= EXPIRY_WARNING_DAYS)) {
      out.push({ ...base, severity: 'expiring' });
    }
  }
  // Failing first, then soonest to die.
  return out.sort((x, y) => {
    if (x.severity !== y.severity) return x.severity === 'failing' ? -1 : 1;
    return (x.daysLeft ?? 9999) - (y.daysLeft ?? 9999);
  });
}

/** The sentence at the top of the banner: what is wrong, named, and what it means. */
export function alertSentence(alerts: readonly ConnectionAlert[]): string {
  if (alerts.length === 0) return '';
  const failing = alerts.filter((a) => a.severity === 'failing');
  const first = alerts[0];
  const who = `${first.network}${first.brandName ? ` on ${first.brandName}` : ''}`;

  if (failing.length > 0) {
    return failing.length === 1
      ? `${who} is not working. Posts to it will fail until you reconnect it.`
      : `${failing.length} connections are not working, starting with ${who}. Posts to them will fail until you reconnect.`;
  }
  const when = first.until ? formatCentralDate(first.until) : null;
  const days = first.daysLeft;
  const soon = days === null ? 'soon' : days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
  return alerts.length === 1
    ? `${who} stops working ${soon}${when ? ` (${when})` : ''}. Reconnect it before then.`
    : `${alerts.length} connections expire soon, starting with ${who} ${soon}${when ? ` (${when})` : ''}.`;
}

/**
 * A stable signature of the current trouble, so dismissing a banner hides THIS problem and not
 * the next one. A new failure produces a new signature and the banner returns.
 */
export function alertSignature(alerts: readonly ConnectionAlert[]): string {
  return alerts.map((a) => `${a.severity}:${a.accountId}`).sort().join('|');
}
