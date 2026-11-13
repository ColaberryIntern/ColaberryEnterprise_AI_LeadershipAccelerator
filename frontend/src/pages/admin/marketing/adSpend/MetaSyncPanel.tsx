import React, { useState } from 'react';
import { apiErrorMessage, syncMetaSpend, type MetaSyncStatus } from '../../../../services/adSpendApi';

/**
 * Pull spend from Meta. When the token is not set up, says exactly what is missing and what to
 * set, instead of offering a button that can only fail.
 */

interface Props {
  status: MetaSyncStatus;
  onSynced: () => void;
}

const stamp = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

export default function MetaSyncPanel({ status, onSynced }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const last = status.lastSync;

  const run = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await syncMetaSpend(30);
      if (r.outcome === 'success') {
        // A success that silently discarded rows is not a success worth a green message.
        // On 2026-11-13 a run of exactly this shape dropped 7 rows and $397.17, and the
        // panel said "Pulled 48 rows" with no hint anything was missing.
        const base = `Pulled ${r.rowsWritten} day-and-placement rows for ${r.rangeStart} to ${r.rangeEnd}.`;
        setMessage(r.rowsSkipped
          ? { kind: 'error', text: `${base} ${r.rowsSkipped} row(s) could not be read and are MISSING from the ledger for this range, so the totals understate spend.` }
          : { kind: 'ok', text: base });
        onSynced();
      } else {
        setMessage({ kind: 'error', text: `${r.outcome === 'skipped' ? 'Skipped' : 'Failed'}${r.errorClass ? ` (${r.errorClass})` : ''}: ${r.error ?? 'no detail'}` });
      }
    } catch (err) {
      setMessage({ kind: 'error', text: apiErrorMessage(err, 'The sync request failed.') });
    } finally {
      setBusy(false);
    }
  };

  if (!status.meta.configured) {
    return (
      <div data-testid="meta-not-configured">
        <p className="small mb-2"><b>Not connected.</b> {status.meta.reason}</p>
        <p className="small text-muted mb-0">
          To pull spend automatically, an admin of the Meta Business account creates a System User with
          the <code>ads_read</code> permission on the ad account, generates a token, and sets
          {' '}<code>META_ADS_ACCESS_TOKEN</code> and <code>META_AD_ACCOUNT_ID</code> on the server. It then runs every
          morning at about 6 AM Central and re-pulls the last 30 days. Until then, type or import spend here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="small mb-2">
        <b>Connected</b> to ad account {status.meta.accountId}. Pulls every morning at about 6 AM Central, re-checking the last 30 days.
      </p>
      {last && (
        <p className="small text-muted mb-2">
          Last run {stamp(last.startedAt)}: <b className={last.outcome === 'failure' ? 'text-danger' : undefined}>{last.outcome}</b>
          {last.outcome === 'success' && `, ${last.rowsWritten} rows`}
          {last.error && ` — ${last.error}`}
        </p>
      )}
      <button type="button" className="btn btn-outline-primary" onClick={run} disabled={busy}>
        {busy ? 'Syncing…' : 'Sync now'}
      </button>
      {message && (
        <p role={message.kind === 'error' ? 'alert' : 'status'} className={`small mt-2 mb-0 ${message.kind === 'error' ? 'text-danger' : 'text-success'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
