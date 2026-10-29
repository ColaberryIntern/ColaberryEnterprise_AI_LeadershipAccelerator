import React from 'react';
import { Link } from 'react-router-dom';
import { useCampus } from './CampusContext';
import { CAMPUS_BUILDINGS, buildingName } from './campusMap';
import type { BuildingId } from './campusMap';
import './campusPanels.css';
import type { DmToast, ToastHold } from './useCampusDmToasts';
import { hasDmHost, openDmThroughShell } from './dmHost';
import { nameInitials } from '../../utils/personName';

/**
 * The campus "new message" toast (Colaberry Campus C5; C23 Q6 to the prototype's toast). The polling lives in CampusProvider
 * (it survives navigation); this only shows the current toast: the sender's face, "In <building> · just now" when presence
 * places them (never guessed), the message itself, then Reply and Walk over. Reply goes through the single DM entry point
 * when this page has one (the home's dock, PortalShell); otherwise it links to Today, where the Messages inbox lives.
 */
export function DmToastView({ toast, onDismiss, onHold, onRelease, overLayer = false, onWalkOver, place }: {
  toast: DmToast | null; onDismiss: () => void; onHold?: (why: ToastHold) => void; onRelease?: (why: ToastHold) => void;
  /** C11: a campus layer (map, list) is open; on phones the toast moves to the top, clear of the card's actions. */
  overLayer?: boolean;
  /** C11b: the building the sender is in now (from presence), for the prototype's "Walk over"; absent = not on campus. */
  onWalkOver?: () => void;
  /** C23: that building's name, for "In <place> · just now". */
  place?: string;
}): React.ReactElement | null {
  if (!toast) return null;
  // C11: hovering or focusing the toast pauses its timer (useCampusDmToasts); leaving restarts it.
  const leave = (e: React.FocusEvent<HTMLDivElement>) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onRelease?.('focus'); };
  // Only an image data URL or an https picture is drawn; anything else falls back to initials.
  const face = toast.peerAvatar && /^(data:image\/|https:\/\/)/.test(toast.peerAvatar) ? toast.peerAvatar : null;
  return (
    <div className={`cm-dm-toast${overLayer ? ' is-over-layer' : ''}`} role="status" aria-live="polite" data-testid="cm-dm-toast"
      onMouseEnter={() => onHold?.('hover')} onMouseLeave={() => onRelease?.('hover')} onFocus={() => onHold?.('focus')} onBlur={leave}>
      <span className="cm-dm-toast-av" aria-hidden="true">{face ? <img src={face} alt="" /> : nameInitials(toast.peerName)}</span>
      <div className="cm-dm-toast-body">
        <span><strong>{toast.peerName}</strong><span className="cm-sr-only"> sent you a message</span></span>
        <small className="cm-dm-toast-where" data-testid="cm-dm-toast-where">{place ? `In ${place} · just now` : 'just now'}</small>
        {toast.text && <p className="cm-dm-toast-text" data-testid="cm-dm-toast-text">{toast.text}</p>}
        <div className="cm-dm-toast-acts">
          {hasDmHost()
            ? <button type="button" className="cm-link is-reply" data-testid="cm-dm-toast-open" onClick={() => { openDmThroughShell(toast.peerId, toast.peerName); onDismiss(); }}>Reply</button>
            : <Link className="cm-link is-reply" to="/portal/today" onClick={onDismiss}>Reply on Today</Link>}
          {onWalkOver && <button type="button" className="cm-link" data-testid="cm-dm-toast-walk" onClick={() => { onWalkOver(); onDismiss(); }}>Walk over</button>}
        </div>
      </div>
      <button type="button" className="cm-card-x" aria-label="Dismiss" onClick={onDismiss}>×</button>
    </div>
  );
}

export default function CampusDmToast(): React.ReactElement | null {
  const { active, dmToast, dismissDmToast, holdDmToast, releaseDmToast, layer, presence, openMap, settings } = useCampus();
  // C11b: the sender's building, only when presence names them there (a real place, never a guess)
  const where = dmToast && presence ? Object.entries(presence).find(([, a]) => a.people.some((p) => 'enrollment_id' in p && p.enrollment_id === dmToast.peerId))?.[0] : undefined;
  const b = where ? CAMPUS_BUILDINGS.find((x) => x.id === where) : undefined;
  return active ? <DmToastView toast={dmToast} onDismiss={dismissDmToast} onHold={holdDmToast} onRelease={releaseDmToast} overLayer={layer !== 'none'}
    onWalkOver={where ? () => openMap(where as BuildingId) : undefined} place={b ? buildingName(b, settings.workplaceNames) : undefined} /> : null;
}
