import React, { useMemo } from 'react';
import type { StudentGovProjectView, StudentGovVetting } from '../../../../services/govProjectPortalApi';
import { KeyDatesTimeline } from '../../../admin/govWorkspace/KeyDatesTimeline';
import { parseDeadline, countdownTo, formatCountdown } from '../../../admin/govDeadline';

/**
 * QualRail — the student-safe mirror of the admin Qualification Workspace's persistent right rail, shown beside the
 * intern's pre-award steps 1-5 in place of the Proposal-agent panel. It reuses the admin's PURE presentational pieces
 * (KeyDatesTimeline, the govDeadline countdown) fed entirely from `StudentGovProjectView`, and replicates the admin
 * AiVettingCard's markup against the student vetting shape so the intern sees the SAME advisory read, read-only.
 *
 * Student-safe by construction: it renders only the AI vetting verdict/coverage/reason/quote, the proposal deadline,
 * and the public meetings + key dates. It deliberately carries NO dollars, NO buyer contacts, NO builder/approver
 * identities, and NO admin controls (the admin rail's Team section and every mutation are omitted).
 */

const VERDICTS: Record<string, { label: string; cls: string }> = {
  pursue: { label: '⭐ AI vetted: recommends pursuing', cls: 'bg-success text-white' },
  pass: { label: 'AI recommends passing', cls: 'bg-danger-subtle text-danger-emphasis' },
  inconclusive: { label: 'AI could not call it: needs your read', cls: 'bg-warning-subtle text-warning-emphasis' },
};

/** Student-safe clone of the admin AiVettingCard markup, typed to the projection's vetting subset. */
function VettingCard({ vetting }: { vetting: StudentGovVetting | null | undefined }): React.ReactElement | null {
  if (!vetting) return null;
  const done = vetting.status === 'completed';
  const v = vetting.verdict ? VERDICTS[vetting.verdict] : null;
  return (
    <div className="card shadow-sm" data-testid="qual-vetting-card">
      <div className="card-body">
        <h2 className="h6 fw-semibold mb-2"><i className="ri-robot-2-line me-1" aria-hidden="true" />AI vetting</h2>
        {!done && (
          <p className="small text-secondary mb-0" data-testid="qual-vetting-pending">
            <i className="ri-loader-4-line me-1" aria-hidden="true" />The AI checks are running on this pursuit. Results appear here on their own, no button needed.
          </p>
        )}
        {done && v && (
          <>
            <span className={`badge ${v.cls} mb-2`} data-testid="qual-vetting-verdict">{v.label}</span>
            {typeof vetting.coveragePct === 'number' && (
              <div className="small mb-2"><span className="fw-semibold">{vetting.coveragePct}%</span> of the capabilities this bid needs match Our Services.</div>
            )}
            {vetting.reason && <p className="small mb-2">{vetting.reason}</p>}
            {vetting.quote && <blockquote className="small text-secondary border-start ps-2 mb-2">{vetting.quote}</blockquote>}
            <p className="small text-secondary mb-0">Advisory, from the requirements found in the solicitation before anyone confirmed them.</p>
          </>
        )}
      </div>
    </div>
  );
}

/** The proposal deadline + a working countdown, from the authoritative close date. No dollars, no buyer. */
function DeadlineCard({ closeDate }: { closeDate: string | null | undefined }): React.ReactElement | null {
  const label = useMemo(() => {
    if (!closeDate) return null;
    const pd = parseDeadline(closeDate);
    if (!pd) return null;
    return formatCountdown(countdownTo(pd.ms, Date.now()), pd.hasTime);
  }, [closeDate]);
  if (!closeDate) return null;
  return (
    <div className="card shadow-sm" data-testid="qual-deadline-card">
      <div className="card-body">
        <h2 className="h6 fw-semibold mb-1"><i className="ri-time-line me-1" aria-hidden="true" />Proposal deadline</h2>
        <div className="fs-5 fw-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>{closeDate}</div>
        {label && <div className="small text-secondary">{label}</div>}
      </div>
    </div>
  );
}

export default function QualRail({ view }: { view: StudentGovProjectView }): React.ReactElement {
  const meetings = (view.meetings ?? []).map((m) => ({ date: m.date, text: m.text }));
  const keyDates = (view.keyDates ?? []).map((k) => ({ date: k.date, text: k.text }));
  const hasDates = meetings.length > 0 || keyDates.length > 0;
  return (
    <aside className="gps-qual-rail d-flex flex-column gap-3" data-testid="qual-rail" style={{ position: 'sticky', top: 16 }}>
      <VettingCard vetting={view.vetting} />
      <DeadlineCard closeDate={view.closeDate} />
      {hasDates && (
        <div className="card shadow-sm" data-testid="qual-keydates">
          <div className="card-body">
            <h2 className="h6 fw-semibold mb-2"><i className="ri-calendar-event-line me-1" aria-hidden="true" />Key dates &amp; meetings</h2>
            <KeyDatesTimeline meetings={meetings} keyDates={keyDates} />
          </div>
        </div>
      )}
    </aside>
  );
}
