import React, { useEffect, useState } from 'react';
import { SectionCard, StatusBadge } from '../../../components/admin/shell';
import { fetchAuditTrail, AuditEntry } from '../../../services/certPrepAdminApi';

/**
 * CertAuditPanel — who decided what, and when.
 *
 * Two kinds of entry, because there are exactly two moments where a named human
 * changes what a student sees: a question revision approved (or retired), and a
 * piece of build evidence verified (or rejected). A trail carrying only the
 * first would look complete while omitting every evidence decision ever made,
 * including the rejections — which are the ones somebody comes looking for.
 *
 * Rejection reasons are rendered in full rather than truncated. "Why didn't my
 * build count?" is the question this panel exists to answer.
 */

const KIND_LABEL: Record<AuditEntry['kind'], string> = {
  question_review: 'Question',
  evidence_decision: 'Evidence',
};

const OUTCOME_TONE: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'neutral'> = {
  approved: 'success', verified: 'success',
  rejected: 'danger', retired: 'warning',
  in_review: 'info', draft: 'neutral', pending: 'neutral',
};

export default function CertAuditPanel() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAuditTrail()
      .then((rows) => { if (!cancelled) setEntries(rows); })
      .catch(() => { if (!cancelled) setError('Could not load the audit trail.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <SectionCard
      title="Audit trail"
      subtitle="Question approvals and evidence decisions, newest first"
      icon="history-line"
    >
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="table-responsive">
        <table className="table table-sm align-middle mb-0">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Kind</th>
              <th scope="col">What</th>
              <th scope="col">Outcome</th>
              <th scope="col">Who</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="text-muted">Loading…</td></tr>}
            {!loading && entries.length === 0 && (
              <tr><td colSpan={5} className="text-muted">No decisions recorded yet.</td></tr>
            )}
            {entries.map((e, i) => {
              const outcome = e.status ?? e.state ?? '';
              return (
                <tr key={`${e.kind}-${e.mapping_id ?? e.question_key}-${e.revision ?? ''}-${i}`}>
                  <td className="text-nowrap small">{e.at ? new Date(e.at).toLocaleString() : '—'}</td>
                  <td className="small">{KIND_LABEL[e.kind]}</td>
                  <td className="small">
                    {e.kind === 'question_review' ? (
                      <><code>{e.question_key}</code> <span className="text-muted">r{e.revision}</span></>
                    ) : (
                      <>
                        <code>{e.domain_id}</code>
                        {e.objective_id && <> · <code>{e.objective_id}</code></>}
                        <div className="text-muted">{e.source_type} · enrollment <code>{e.enrollment_id}</code></div>
                        {e.reason && <div className="text-danger">{e.reason}</div>}
                      </>
                    )}
                  </td>
                  <td><StatusBadge label={outcome || '—'} tone={OUTCOME_TONE[outcome] ?? 'neutral'} /></td>
                  <td className="small">{e.actor}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
