import React from 'react';
import { CcppHistory, TrustPanel } from '../../../adminOs/personTypes';
import SectionCard from '../shell/SectionCard';
import PriorHistoryPanel from './PriorHistoryPanel';
import { Field, fmtDateTime } from './primitives';

/**
 * How much of this profile a reader should believe.
 *
 * Extracted from `PersonProfilePage` on 2026-10-11 (T212) under CLAUDE.md's
 * 500-line file ceiling. Behaviour unchanged.
 *
 * The second card is the point of the tab: every gap is listed with the REASON
 * it is a gap. A blank field reads as zero or as a bug; "we never captured
 * consent for this person" reads as what it is. Pre-platform history sits here
 * rather than in a history tab of its own because for roughly a third of the
 * database this platform's record starts mid-story, and that is a statement
 * about trustworthiness more than about the person.
 */
export default function DataTrustTab({ trust, history }: {
  trust: TrustPanel;
  history: CcppHistory | null | undefined;
}) {
  return (
    <div className="row g-3">
      <div className="col-lg-6">
        <SectionCard title="Identity">
          <div className="row">
            <Field label="Matched by" value={
              trust.matchMethod === 'exact_email'
                ? 'Exact email'
                : <span className="text-muted">Single source only</span>} />
            <Field label="Lead records" value={trust.leadIds.length || null} />
            <Field label="Enrolment records" value={trust.enrollmentIds.length || null} />
            <Field label="Traced to acquisition" value={
              trust.tracedToLead
                ? <span className="badge text-bg-success">Yes</span>
                : <span className="badge text-bg-warning">No</span>} />
            <Field label="Consent recorded" value={
              trust.consentRecorded === null
                ? null
                : <span className={`badge text-bg-${trust.consentRecorded ? 'success' : 'danger'}`}>
                    {trust.consentRecorded ? 'Yes' : 'No'}
                  </span>} />
            <Field label="Freshest activity" value={fmtDateTime(trust.lastActivity)} />
          </div>
        </SectionCard>
      </div>

      <div className="col-lg-6">
        <SectionCard title="What we cannot tell you">
          {trust.gaps.length === 0 ? (
            <p className="text-muted small mb-0">No known gaps for this person.</p>
          ) : (
            <ul className="list-unstyled mb-0">
              {trust.gaps.map((g) => (
                <li key={g.field} className="mb-3">
                  <div className="fw-semibold small">{g.field}</div>
                  {/* Stated, not blank. A blank reads as zero. */}
                  <div className="text-muted small">{g.reason}</div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="col-12">
        <SectionCard title="Before this platform">
          <PriorHistoryPanel history={history} />
        </SectionCard>
      </div>
    </div>
  );
}
