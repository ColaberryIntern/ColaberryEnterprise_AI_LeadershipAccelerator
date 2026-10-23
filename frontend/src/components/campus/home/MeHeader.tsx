import React from 'react';
import type { CampusAudience } from '../campusMap';
import type { CampusLook } from '../campusApi';
import { Figure } from '../interior/Figure';
import { publicOnly, GEAR_ICON } from '../campusGear';
import { art } from '../art/artColor';
import { levelOfRung } from '../../../services/bandLadder';

/**
 * The top of the Me panel (WP-7, E M2-M3; the prototype's renderMe, D:3205-3216): your full-body figure with your gear, photo and
 * level coin; the account kicker; your name; "Lv n" with the rung and points; the bar from your LAST unlock to the NEXT, with the
 * next item's icon ("120 pts to 🧥 Hoodie"), or "Everything unlocked 👑"; staff get "Program staff · all-access"; and the photo
 * button. Only learners earn points and levels, as in the prototype. Real data only: a partner's title and company are not known
 * here, so that line is left off.
 */
export interface Progress { pct: number; left: number; icon: string; name: string }

/** Pure: progress from the previous unlock to the next locked item, or null when everything is unlocked. */
export function progressOf(look: CampusLook): Progress | null {
  const sorted = [...look.catalog].sort((a, b) => a.threshold - b.threshold);
  const next = sorted.find((i) => !i.unlocked);
  if (!next) return null;
  const prev = sorted.filter((i) => i.unlocked && i.threshold <= look.points).reduce((m, i) => Math.max(m, i.threshold), 0);
  const span = Math.max(1, next.threshold - prev);
  const pct = Math.max(0, Math.min(100, Math.round(((look.points - prev) / span) * 100)));
  return { pct, left: Math.max(0, next.threshold - look.points), icon: GEAR_ICON[next.id] ?? '✨', name: next.name };
}

const KICKER: Record<CampusAudience, string> = { member: 'Enrolled learner', explorer: 'Explorer', business: 'Business account', staff: 'Program staff' };

export interface MeHeaderProps {
  audience: CampusAudience;
  fullName: string;
  initials: string;
  photo: string | null;
  look: CampusLook | null;
  headingRef: React.Ref<HTMLHeadingElement>;
  onPhoto: () => void;
  photoBusy: boolean;
}

export default function MeHeader({ audience, fullName, initials, photo, look, headingRef, onPhoto, photoBusy }: MeHeaderProps): React.ReactElement {
  const earns = audience === 'member' || audience === 'explorer';
  const level = earns && look ? levelOfRung(look.rung_name) : null;
  const prog = earns && look ? progressOf(look) : null;
  const me = { key: 'me-preview', name: fullName || 'You', initials, photo, you: true, levelN: level,
    gear: earns && look ? publicOnly(look.equipped) : {}, tone: art(audience === 'business' ? 'business' : audience === 'staff' ? 'explorer' : 'in-you') };
  return (
    <div className="cm-me-top">
      <svg viewBox="0 0 120 150" className="cm-me-prev" aria-hidden="true" data-testid="cm-me-figure">
        <rect width="120" height="150" rx="16" fill={art('me-prev-bg')} />
        <Figure x={60} y={138} s={1.18} p={me} pose="stand" testId="cm-me-figure-person" />
      </svg>
      <div>
        <div className="cm-kicker">{KICKER[audience]}</div>
        <h2 id="cm-me-name" tabIndex={-1} ref={headingRef}>{fullName || 'You'}</h2>
        {earns && look && (
          <div className="cm-me-lv" data-testid="cm-me-level">
            {level !== null && <span className="cm-lv is-big">Lv {level}</span>}
            {[look.rung_name, `${look.points.toLocaleString('en-US')} pts`].filter(Boolean).join(' · ')}
          </div>
        )}
        {earns && look && (prog ? (
          <div className="cm-me-next" data-testid="cm-me-next">
            <div className="cm-me-bar" aria-hidden="true"><i style={{ width: `${prog.pct}%` }} /></div>
            <small>{prog.left.toLocaleString('en-US')} pts to <span aria-hidden="true">{prog.icon} </span>{prog.name}</small>
          </div>
        ) : <small className="cm-me-muted" data-testid="cm-me-all">Everything unlocked <span aria-hidden="true">👑</span></small>)}
        {audience === 'staff' && <small className="cm-me-muted" data-testid="cm-me-staff">Program staff · all-access</small>}
        <div className="cm-me-actions">
          <button type="button" className="cm-btn-line" onClick={onPhoto} disabled={photoBusy} data-testid="cm-me-photo">
            <span aria-hidden="true">📷 </span>{photoBusy ? 'Saving…' : photo ? 'Change photo' : 'Add a photo'}
          </button>
        </div>
      </div>
    </div>
  );
}
