import React, { useEffect, useRef, useState } from 'react';
import type { CampusAudience } from '../campusMap';
import { useCampus } from '../CampusContext';
import { AUDIENCES, AUDIENCE_LABEL } from '../campusAudienceSwitch';

/**
 * The top bar's account chip (EXPLORER / BUSINESS / STAFF, the prototype's .acct-chip). WP-7 (Ali, 2026-10-23): for an account the
 * server allows (staff by default, or one listed in CAMPUS_AUDIENCE_SWITCH_IDS) the chip is a button: pressing it opens the
 * account types, and picking one redraws the campus as that account would see it. "Back to my account" ends the preview. A member's
 * campus normally has no chip; an allowed member gets a MEMBER chip so there is something to press.
 */
const CLS: Record<CampusAudience, string> = { member: 'is-member', explorer: 'is-explorer', business: 'is-business', staff: 'is-staff' };

export default function AccountChip({ audience }: { audience: CampusAudience }): React.ReactElement | null {
  const { audienceSwitch, viewAs, setViewAs } = useCampus();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const label = AUDIENCE_LABEL[audience];
  if (!audienceSwitch) {
    return audience === 'member' ? null : <span className={`cm-acct ${CLS[audience]}`} data-testid={`cm-stats-acct-${audience}`}>{label}</span>;
  }
  const pick = (a: CampusAudience | null) => { setViewAs(a); setOpen(false); };
  return (
    <span className="cm-acct-switch" ref={box} onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); } }}>
      <button type="button" className={`cm-acct is-button ${CLS[audience]}${viewAs ? ' is-preview' : ''}`} aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen((v) => !v)} data-testid={`cm-stats-acct-${audience}`} aria-label={`Account type: ${label}. Change the account type you are viewing as`}>
        {label}{viewAs ? ' · preview' : ''} <span aria-hidden="true">{'▾'}</span>
      </button>
      {open && (
        <span className="cm-acct-menu" role="menu" aria-label="View the campus as" data-testid="cm-acct-menu">
          <small>View the campus as</small>
          {AUDIENCES.map((a) => (
            <button key={a} type="button" role="menuitemradio" aria-checked={a === audience} onClick={() => pick(a)} data-testid={`cm-acct-pick-${a}`}>
              {AUDIENCE_LABEL[a]}
            </button>
          ))}
          {viewAs && <button type="button" role="menuitem" className="is-reset" onClick={() => pick(null)} data-testid="cm-acct-reset">Back to my account</button>}
          <small className="cm-acct-note">Only changes what you see here. Your account and access stay the same.</small>
        </span>
      )}
    </span>
  );
}
