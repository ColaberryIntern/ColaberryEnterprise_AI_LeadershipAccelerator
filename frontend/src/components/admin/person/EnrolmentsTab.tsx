import React from 'react';
import { Link } from 'react-router-dom';
import { LearningRow } from '../../../adminOs/personTypes';
import SectionCard from '../shell/SectionCard';
import { Unknown, fmtDate } from './primitives';

/**
 * Every enrolment row this caller may see.
 *
 * Extracted from `PersonProfilePage` on 2026-10-11 (T212) under CLAUDE.md's
 * 500-line file ceiling. Behaviour unchanged.
 *
 * `tier` and `enrollmentType` are both shown, side by side, deliberately. They
 * are the two columns the Growth OS Reset exists to keep coherent — programme
 * (`standard` / `explorer`) and access level (`guest` / `member`) — and a row
 * where they disagree is exactly what an operator needs to be able to see
 * rather than infer. The empty state says "visible to you", not "none",
 * because a scoped role legitimately sees fewer rows than exist.
 */
export default function EnrolmentsTab({ learning }: { learning: LearningRow[] }) {
  return (
    <SectionCard title="Programme" padded={false}>
      {learning.length === 0 ? (
        <p className="text-muted small p-4 mb-0 text-center">No enrolments visible to you.</p>
      ) : (
        <div className="table-responsive">
          <table className="table table-sm mb-0 align-middle">
            <thead className="table-light">
              <tr><th>Status</th><th>Tier</th><th>Type</th><th>Enrolled</th><th>Cohort</th></tr>
            </thead>
            <tbody>
              {learning.map((e) => (
                <tr key={e.enrollmentId}>
                  <td>
                    <span className={`badge text-bg-${e.status === 'active' ? 'success' : 'secondary'}`}>
                      {e.status || 'unknown'}
                    </span>
                  </td>
                  <td>{e.tier || <Unknown />}</td>
                  <td>{e.enrollmentType || <Unknown />}</td>
                  <td>{fmtDate(e.enrolledAt) || <Unknown />}</td>
                  <td className="text-muted small">
                    {e.cohortId
                      ? <Link to={`/admin/cohorts/${e.cohortId}`}>{e.cohortId.slice(0, 8)}…</Link>
                      : <Unknown />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
