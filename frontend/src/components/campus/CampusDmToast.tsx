import React from 'react';
import { Link } from 'react-router-dom';
import { useCampus } from './CampusContext';
import type { DmToast } from './useCampusDmToasts';
import { hasDmHost, openDmThroughShell } from './dmHost';

/**
 * The campus "new message" toast (Colaberry Campus C5). The polling lives in CampusProvider (it survives navigation);
 * this only shows the current toast. Open goes through the single DM entry point when this page has one (PortalShell);
 * otherwise it links to Today, where the Messages inbox lives.
 */
export function DmToastView({ toast, onDismiss }: { toast: DmToast | null; onDismiss: () => void }): React.ReactElement | null {
  if (!toast) return null;
  return (
    <div className="cm-dm-toast" role="status" aria-live="polite" data-testid="cm-dm-toast">
      <span><strong>{toast.peerName}</strong> sent you a message</span>
      {hasDmHost()
        ? <button type="button" className="cm-link" data-testid="cm-dm-toast-open" onClick={() => { openDmThroughShell(toast.peerId, toast.peerName); onDismiss(); }}>Open</button>
        : <Link className="cm-link" to="/portal/today" onClick={onDismiss}>Open on Today</Link>}
      <button type="button" className="cm-card-x" aria-label="Dismiss" onClick={onDismiss}>×</button>
    </div>
  );
}

export default function CampusDmToast(): React.ReactElement | null {
  const { active, dmToast, dismissDmToast } = useCampus();
  return active ? <DmToastView toast={dmToast} onDismiss={dismissDmToast} /> : null;
}
