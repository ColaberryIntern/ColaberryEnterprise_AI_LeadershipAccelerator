import React from 'react';
import type { StudentGovProjectView } from '../../../../services/govProjectPortalApi';
import { parseDeadline, countdownTo, formatCountdown, dossierDeadlineIso, deadlineTone } from '../../../admin/govDeadline';
import { pursuitStageLabel } from './buildHelpers';

/**
 * ContractBar — the sticky Proposal Studio header (v3, T22). Eyebrow + contract name, the REAL pursuit stage, the
 * Build %, the Proposal-ready meter (x% / 95%), a clickable "Needs you N" chip (red if any fatal need, amber else),
 * plus the real agency + close countdown. Reads only the student-safe projection.
 */
export default function ContractBar({ view, onStartTour, onNeeds, canManage, onSetDueDate }: { view: StudentGovProjectView; onStartTour?: () => void; onNeeds?: () => void; canManage?: boolean; onSetDueDate?: (closeDate: string, priorityScore: number | null) => void | Promise<void> }): React.ReactElement {
  const readiness = view.proposalReadiness?.pct ?? 0;
  const buildPct = view.buildSummary?.rollup.pct ?? view.overallProgress?.pct ?? 0;
  // Prefer the AUTHORITATIVE close date carried from the opportunity (so the deadline survives the move into the
  // Studio); fall back to the AI-extracted dossier key dates for a ZIP-only pursuit with no OP close.
  const closeIso = view.closeDate ?? dossierDeadlineIso(view.keyDates ?? []);
  const parsed = parseDeadline(closeIso);
  const cd = parsed ? countdownTo(parsed.ms, Date.now()) : null;
  const countdown = parsed && cd ? formatCountdown(cd, parsed.hasTime) : null;
  // Urgency colour for the countdown (past/≤3d → bad, ≤7d → warn, else ok), reusing the shared tag tones.
  const toneClass = cd ? ({ danger: 'bad', warning: 'warn', success: 'ok', secondary: '' } as const)[deadlineTone(cd)] : '';
  const needCount = view.needsCount ?? 0;
  // v4: the Needs chip is ALWAYS shown. Severity drives the fill colour.
  const severity = (view.fatalNeedsCount ?? 0) > 0 ? 'fatal' : needCount > 0 ? 'score' : 'clear';
  const needClass = severity === 'fatal' ? 'bad' : severity === 'score' ? 'warn' : 'ok';

  return (
    <header className="gps-bar" data-testid="studio-bar">
      <div className="gps-bar-in gps-gut">
        <div>
          <div className="gps-eyebrow">Proposal Studio &middot; Gov contract</div>
          <h1>{view.name}</h1>
        </div>
        <div className="gps-bar-meta">
          <span className="gps-chip">Stage <b>{pursuitStageLabel(view)}</b></span>
          {view.agency && <span className="gps-chip">Agency <b>{view.agency}</b></span>}
          <span className="gps-chip">Build <b className="gps-num">{buildPct}%</b> verified</span>
          <span className="gps-chip gps-meter" data-tour="ready" data-testid="bar-ready">Proposal ready <span className="gps-m"><span style={{ width: `${readiness}%` }} /></span><b className="gps-num">{readiness}%</b> / 95%</span>
          <button type="button" data-tour="needs" data-testid="bar-needs" data-count={needCount} data-severity={severity} className={`gps-chip gps-chip-btn gps-chip-${needClass}`} onClick={onNeeds}>Needs you <b className="gps-num">{needCount}</b></button>
          {onStartTour && <button type="button" data-testid="bar-tour" className="gps-chip gps-chip-btn" onClick={onStartTour}>Take the tour</button>}
          {view.priorityScore != null && <span className="gps-chip" data-testid="bar-priority">Priority <b className="gps-num">{view.priorityScore}</b></span>}
          {closeIso && <span className="gps-chip" data-testid="bar-closes">Closes <b className="gps-num">{closeIso}</b></span>}
          {countdown && <span className={`gps-tag ${toneClass}`.trim()} data-testid="bar-countdown">{countdown}</span>}
          {!closeIso && canManage && onSetDueDate && <DueDateSetter onSet={onSetDueDate} />}
        </div>
      </div>
    </header>
  );
}

/**
 * DueDateSetter — management-only inline control shown on the bar when a pursuit carried NO close date into the Studio.
 * A "Set due date" chip expands to a date (+ optional 0-100 urgency) and saves via onSet, which persists the override
 * and reloads the view — at which point the "Closes" chip + countdown replace this control.
 */
function DueDateSetter({ onSet }: { onSet: (closeDate: string, priorityScore: number | null) => void | Promise<void> }): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const [date, setDate] = React.useState('');
  const [prio, setPrio] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  if (!open) {
    return <button type="button" className="gps-chip gps-chip-btn" data-testid="bar-set-due" onClick={() => setOpen(true)}>Set due date</button>;
  }
  const save = async (): Promise<void> => {
    if (!date || saving) return;
    setSaving(true);
    try { await onSet(date, prio === '' ? null : Number(prio)); setOpen(false); } finally { setSaving(false); }
  };
  return (
    <span className="gps-chip" data-testid="bar-due-form">
      <input type="date" aria-label="Proposal due date" data-testid="bar-due-date" value={date} onChange={(e) => setDate(e.target.value)} />
      <input type="number" min={0} max={100} aria-label="Urgency 0 to 100" placeholder="Urgency" data-testid="bar-due-prio" value={prio} onChange={(e) => setPrio(e.target.value)} style={{ width: '5.5em' }} />
      <button type="button" data-testid="bar-due-save" onClick={save} disabled={!date || saving}>{saving ? 'Saving…' : 'Save'}</button>
    </span>
  );
}
