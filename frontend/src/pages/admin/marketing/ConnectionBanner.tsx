import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ChannelAccount } from '../../../services/channelAccountApi';
import { alertSentence, alertSignature, connectionAlerts } from './connectionAlerts';

/**
 * ConnectionBanner - trouble with a connection follows you around the Marketing tab.
 *
 * Loomly tells you on EVERY screen that a connection is failing, and names it. We compute account
 * health more carefully than they do and then show it in one place you have to visit on purpose.
 * Ali's LinkedIn stops working on 15 Nov 2026; nobody will happen to be on the Overview that
 * morning.
 *
 * DISMISSAL IS PER PROBLEM, NOT PER PERSON. Hiding it writes the CURRENT trouble's signature to
 * `sessionStorage`: it stays hidden for this browser session, and the moment a different account
 * breaks - or a warning turns into a failure - the signature changes and the banner returns. It
 * cannot be dismissed permanently, because the thing it is about does not go away on its own.
 *
 * It shows accounts across every brand, not only the one in the switcher. A LinkedIn that stopped
 * working on another brand is still a post that will not go out.
 */

const DISMISS_KEY = 'colaberry.marketing.connectionBannerDismissed';

function readDismissed(): string | null {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

function writeDismissed(signature: string): void {
  try {
    window.sessionStorage.setItem(DISMISS_KEY, signature);
  } catch {
    // A browser that will not store it simply shows the banner again next page. Acceptable:
    // the failure mode is "warned twice", not "not warned".
  }
}

export interface ConnectionBannerProps {
  accounts: readonly ChannelAccount[];
  /** brand id -> name, so the sentence can say which brand to fix. */
  brandNames: ReadonlyMap<string, string>;
  /** Injectable for tests. */
  now?: Date;
}

export default function ConnectionBanner({ accounts, brandNames, now }: ConnectionBannerProps) {
  const alerts = useMemo(() => connectionAlerts(accounts, now ?? new Date(), brandNames), [accounts, brandNames, now]);
  const signature = alertSignature(alerts);
  const [dismissed, setDismissed] = useState<string | null>(() => readDismissed());

  if (alerts.length === 0 || dismissed === signature) return null;

  const failing = alerts.some((a) => a.severity === 'failing');
  return (
    <div
      className={`alert ${failing ? 'alert-danger' : 'alert-warning'} d-flex flex-wrap align-items-center gap-2 mb-0 py-2 rounded-0 small`}
      role={failing ? 'alert' : 'status'}
      data-testid="connection-banner"
      data-severity={failing ? 'failing' : 'expiring'}
    >
      <span className="flex-grow-1">{alertSentence(alerts)}</span>
      <Link className={`btn btn-sm ${failing ? 'btn-danger' : 'btn-warning'}`} to="/admin/marketing/brands" data-testid="connection-banner-fix">
        Reconnect
      </Link>
      <button
        type="button"
        className="btn btn-sm btn-link text-reset"
        onClick={() => { writeDismissed(signature); setDismissed(signature); }}
        data-testid="connection-banner-dismiss"
      >
        Hide for now
      </button>
    </div>
  );
}
