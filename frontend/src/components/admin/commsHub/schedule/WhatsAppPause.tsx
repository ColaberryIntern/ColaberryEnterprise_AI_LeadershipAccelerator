import React, { useState } from 'react';
import { apiErrorMessage, clearWhatsAppPause } from '../../../../services/commsHubApi';

/**
 * CH10.4 When WhatsApp limited the hub number, the hub stops WhatsApp sends for 48 hours on its own.
 * This says so, until when (Central), and offers "Resume WhatsApp early" behind a confirm: WhatsApp
 * paused the number for a reason, and resuming early risks a longer ban. Other channels keep sending.
 */
export function centralWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}

export default function WhatsAppPause({ until, onCleared }: { until: string; onCleared: () => void }): React.ReactElement {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const resume = async (): Promise<void> => {
    setBusy(true); setProblem(null);
    try { await clearWhatsAppPause(); setConfirming(false); onCleared(); } catch (err) { setProblem(apiErrorMessage(err, 'WhatsApp could not be resumed.')); } finally { setBusy(false); }
  };
  return (
    <div className="alert alert-warning mt-2 mb-0" role="alert" data-testid="ch-wa-paused">
      <p className="fw-bold mb-1">Paused by WhatsApp until {centralWhen(until)}.</p>
      <p className="small mb-2">WhatsApp is limiting the hub number, so the hub stopped sending to WhatsApp. Waiting messages go out on their own after that. Other channels keep sending.</p>
      {problem && <p className="small mb-2">{problem}</p>}
      {!confirming && <button type="button" className="btn btn-sm btn-outline-secondary comms-hub-action" onClick={() => setConfirming(true)}>Resume WhatsApp early</button>}
      {confirming && (
        <div className="d-flex flex-wrap align-items-center gap-2">
          <span className="small">Resuming early can get the number blocked for longer. Resume now?</span>
          <button type="button" className="btn btn-sm btn-primary comms-hub-action" disabled={busy} onClick={() => { void resume(); }}>{busy ? 'Resuming...' : 'Yes, resume now'}</button>
          <button type="button" className="btn btn-sm btn-outline-secondary comms-hub-action" disabled={busy} onClick={() => setConfirming(false)}>Keep it paused</button>
        </div>
      )}
    </div>
  );
}
