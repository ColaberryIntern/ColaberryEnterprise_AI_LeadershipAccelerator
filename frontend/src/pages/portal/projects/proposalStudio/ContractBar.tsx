import React from 'react';
import type { StudentGovProjectView } from '../../../../services/govProjectPortalApi';
import { parseDeadline, countdownTo, formatCountdown, dossierDeadlineIso } from '../../../admin/govDeadline';

/**
 * ContractBar — the sticky Proposal Studio header. Eyebrow + contract name, then the pursuit Stage, the Build % and
 * the Proposal-ready meter (x% / 95%), plus the real agency + close countdown. Ported from the approved design
 * (docs/gov-proposal-studio/designs/proposal-studio.html). Reads only the student-safe projection.
 */
export default function ContractBar({ view, onStartTour }: { view: StudentGovProjectView; onStartTour?: () => void }): React.ReactElement {
  const readiness = view.proposalReadiness?.pct ?? 0;
  const buildPct = view.buildSummary?.rollup.pct ?? view.overallProgress?.pct ?? 0;
  const closeIso = dossierDeadlineIso(view.keyDates ?? []);
  const parsed = parseDeadline(closeIso);
  const countdown = parsed ? formatCountdown(countdownTo(parsed.ms, Date.now()), parsed.hasTime) : null;

  return (
    <header className="gps-bar">
      <div className="gps-bar-in gps-gut">
        <div>
          <div className="gps-eyebrow">Proposal Studio &middot; Gov contract</div>
          <h1>{view.name}</h1>
          {onStartTour && <button type="button" className="gps-btn sm gps-tour-start" onClick={onStartTour}>Take a tour</button>}
        </div>
        <div className="gps-bar-meta">
          <span className="gps-chip">Stage <b>Proposal production</b></span>
          <span className="gps-chip">Build <b className="gps-num">{buildPct}%</b> verified</span>
          <span className="gps-chip gps-meter">Proposal ready <span className="gps-m"><span style={{ width: `${readiness}%` }} /></span><b className="gps-num">{readiness}%</b> / 95%</span>
          {view.agency && <span className="gps-chip">Agency <b>{view.agency}</b></span>}
          {closeIso && <span className="gps-chip">Closes <b className="gps-num">{closeIso}</b>{countdown ? <> &middot; <b className="gps-num">{countdown}</b></> : null}</span>}
        </div>
      </div>
    </header>
  );
}
