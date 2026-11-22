import React, { useCallback, useEffect, useState } from 'react';
import { SectionCard } from '../../shell';
import { getWhatsAppStatus, type WhatsAppStatus } from '../../../../services/commsHubApi';
import WhatsAppGroups from './WhatsAppGroups';
import WhatsAppPause from './WhatsAppPause';

/**
 * CH10.1 The WhatsApp card on Schedule & history: the channel's state in plain words. WhatsApp ships
 * switched off; until it is connected the card says so and nothing can be sent to a group.
 */
const BADGE: Record<WhatsAppStatus['state'], { label: string; cls: string; icon: string }> = {
  not_configured: { label: 'Not connected', cls: 'ch-status-neutral', icon: 'ri-link-unlink' },
  waiting_for_qr: { label: 'Waiting for QR scan', cls: 'ch-status-info', icon: 'ri-qr-code-line' },
  connected: { label: 'Connected', cls: 'ch-status-success', icon: 'ri-checkbox-circle-line' },
  disconnected: { label: 'Disconnected', cls: 'ch-status-danger', icon: 'ri-error-warning-line' },
};

export function whatsAppHeadline(s: WhatsAppStatus): string {
  if (s.state === 'connected') return s.number_last4 ? `Connected as the number ending ${s.number_last4}.` : 'Connected.';
  if (s.state === 'not_configured') return 'WhatsApp is not connected. Nothing is sent to WhatsApp groups until it is set up.';
  return s.reason ?? 'WhatsApp is not sending right now.';
}

export default function WhatsAppCard(): React.ReactElement {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    setFailed(false);
    Promise.resolve(getWhatsAppStatus()).then((s) => { if (s) setStatus(s); else setFailed(true); }, () => setFailed(true));
  }, []);
  useEffect(() => { load(); }, [load]);
  const badge = status ? BADGE[status.state] : null;
  return (
    <SectionCard title="WhatsApp groups" icon="whatsapp-line">
      <div data-testid="ch-whatsapp-card" aria-live="polite">
        {failed && (
          <div className="alert alert-warning d-flex align-items-center justify-content-between mb-0" role="alert">
            <span>The WhatsApp status did not load.</span>
            <button type="button" className="btn btn-sm btn-outline-secondary comms-hub-action" onClick={load}>Try again</button>
          </div>
        )}
        {!failed && !status && <p className="text-muted mb-0" role="status">Loading...</p>}
        {status && badge && (
          <>
            <p className="mb-1">
              <span className={`ch-status ${badge.cls} me-2`}><i className={badge.icon} aria-hidden="true" />{badge.label}</span>
            </p>
            <p className="mb-0">{whatsAppHeadline(status)}</p>
            {status.state === 'not_configured' && status.reason && <p className="small text-muted mt-1 mb-0">{status.reason}</p>}
            {status.paused_until && <WhatsAppPause until={status.paused_until} onCleared={load} />}
            {status.configured && <WhatsAppGroups connected={status.state === 'connected'} />}
          </>
        )}
      </div>
    </SectionCard>
  );
}
