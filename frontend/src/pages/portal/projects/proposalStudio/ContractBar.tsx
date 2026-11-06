import React from 'react';
import type { StudentGovProjectView } from '../../../../services/govProjectPortalApi';
import { parseDeadline, countdownTo, formatCountdown, dossierDeadlineIso } from '../../../admin/govDeadline';
import { pursuitStageLabel } from './buildHelpers';

/**
 * ContractBar — the sticky Proposal Studio header (v3, T22). Eyebrow + contract name, the REAL pursuit stage, the
 * Build %, the Proposal-ready meter (x% / 95%), a clickable "Needs you N" chip (red if any fatal need, amber else),
 * plus the real agency + close countdown. Reads only the student-safe projection.
 */
export default function ContractBar({ view, onStartTour, onNeeds }: { view: StudentGovProjectView; onStartTour?: () => void; onNeeds?: () => void }): React.ReactElement {
  const readiness = view.proposalReadiness?.pct ?? 0;
  const buildPct = view.buildSummary?.rollup.pct ?? view.overallProgress?.pct ?? 0;
  const closeIso = dossierDeadlineIso(view.keyDates ?? []);
  const parsed = parseDeadline(closeIso);
  const countdown = parsed ? formatCountdown(countdownTo(parsed.ms, Date.now()), parsed.hasTime) : null;
  const needCount = view.needsCount ?? 0;
  const needTone = (view.fatalNeedsCount ?? 0) > 0 ? 'bad' : 'warn';

  return (
    <header className="gps-bar">
      <div className="gps-bar-in gps-gut">
        <div>
          <div className="gps-eyebrow">Proposal Studio &middot; Gov contract</div>
          <h1>{view.name}</h1>
          {onStartTour && <button type="button" className="gps-btn sm gps-tour-start" onClick={onStartTour}>Take a tour</button>}
        </div>
        <div className="gps-bar-meta">
          <span className="gps-chip">Stage <b>{pursuitStageLabel(view)}</b></span>
          {needCount > 0 && (
            <button type="button" className={`gps-chip gps-chip-btn gps-chip-${needTone}`} onClick={onNeeds}>Needs you <b className="gps-num">{needCount}</b></button>
          )}
          <span className="gps-chip">Build <b className="gps-num">{buildPct}%</b> verified</span>
          <span className="gps-chip gps-meter">Proposal ready <span className="gps-m"><span style={{ width: `${readiness}%` }} /></span><b className="gps-num">{readiness}%</b> / 95%</span>
          {view.agency && <span className="gps-chip">Agency <b>{view.agency}</b></span>}
          {closeIso && <span className="gps-chip">Closes <b className="gps-num">{closeIso}</b>{countdown ? <> &middot; <b className="gps-num">{countdown}</b></> : null}</span>}
        </div>
      </div>
    </header>
  );
}
