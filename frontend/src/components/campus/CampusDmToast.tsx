import React from 'react';
import { Link } from 'react-router-dom';
import { useCampus } from './CampusContext';
import type { BuildingId } from './campusMap';
import './campusPanels.css';
import type { DmToast, ToastHold } from './useCampusDmToasts';
import { hasDmHost, openDmThroughShell } from './dmHost';

/**
 * The campus "new message" toast (Colaberry Campus C5). The polling lives in CampusProvider (it survives navigation);
 * this only shows the current toast. Open goes through the single DM entry point when this page has one (PortalShell);
 * otherwise it links to Today, where the Messages inbox lives.
 */
export function DmToastView({ toast, onDismiss, onHold, onRelease, overLayer = false, onWalkOver }: {
  toast: DmToast | null; onDismiss: () => void; onHold?: (why: ToastHold) => void; onRelease?: (why: ToastHold) => void;
  /** C11: a campus layer (map, list) is open; on phones the toast moves to the top, clear of the card's actions. */
  overLayer?: boolean;
  /** C11b: the building the sender is in now (from presence), for the prototype's "Walk over"; absent = not on campus. */
  onWalkOver?: () => void;
}): React.ReactElement | null {
  if (!toast) return null;
  // C11: hovering or focusing the toast pauses its timer (useCampusDmToasts); leaving restarts it.
  const leave = (e: React.FocusEvent<HTMLDivElement>) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onRelease?.('focus'); };
  return (
    <div className={`cm-dm-toast${overLayer ? ' is-over-layer' : ''}`} role="status" aria-live="polite" data-testid="cm-dm-toast"
      onMouseEnter={() => onHold?.('hover')} onMouseLeave={() => onRelease?.('hover')} onFocus={() => onHold?.('focus')} onBlur={leave}>
      <span><strong>{toast.peerName}</strong> sent you a message</span>
      {hasDmHost()
        ? <button type="button" className="cm-link" data-testid="cm-dm-toast-open" onClick={() => { openDmThroughShell(toast.peerId, toast.peerName); onDismiss(); }}>Open</button>
        : <Link className="cm-link" to="/portal/today" onClick={onDismiss}>Open on Today</Link>}
      {onWalkOver && <button type="button" className="cm-link" data-testid="cm-dm-toast-walk" onClick={() => { onWalkOver(); onDismiss(); }}>Walk over</button>}
      <button type="button" className="cm-card-x" aria-label="Dismiss" onClick={onDismiss}>×</button>
    </div>
  );
}

export default function CampusDmToast(): React.ReactElement | null {
  const { active, dmToast, dismissDmToast, holdDmToast, releaseDmToast, layer, presence, openMap } = useCampus();
  // C11b: the sender's building, only when presence names them there (a real place, never a guess)
  const where = dmToast && presence ? Object.entries(presence).find(([, a]) => a.people.some((p) => 'enrollment_id' in p && p.enrollment_id === dmToast.peerId))?.[0] : undefined;
  return active ? <DmToastView toast={dmToast} onDismiss={dismissDmToast} onHold={holdDmToast} onRelease={releaseDmToast} overLayer={layer !== 'none'}
    onWalkOver={where ? () => openMap(where as BuildingId) : undefined} /> : null;
}
