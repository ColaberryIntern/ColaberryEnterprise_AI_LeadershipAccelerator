import React, { useState } from 'react';
import { StatusBadge } from '../../../components/admin/shell';
import { QueueBucket } from '../../../services/adminInternshipApi';
import { useReview } from './reviewContext';

/**
 * Reading order is the lifecycle: still being decided, then accepted and
 * finishing onboarding, then in the programme. "In review" deliberately ends at
 * the decision, so an active intern never reads as an open application.
 */
const BUCKETS: Array<{ key: QueueBucket; label: string }> = [
  { key: 'in_review', label: 'In review' },
  { key: 'awaiting_review', label: 'Awaiting review' },
  { key: 'information_requested', label: 'Info requested' },
  { key: 'interview_incomplete', label: 'Interview open' },
  { key: 'calls_failed', label: 'Calls failed' },
  { key: 'waitlisted', label: 'Waitlisted' },
  { key: 'approved_awaiting_documents', label: 'Docs pending' },
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'active_interns', label: 'Active interns' },
  { key: 'converted', label: 'Converted' },
];

/**
 * The applicant queue — a fixed left pane. Filtering by bucket keeps the open
 * applicant (the old page cleared it on every bucket click, which is half of why
 * navigating felt like losing your place). Selecting a row loads the detail in
 * the pane beside it, not below it.
 */
const InternshipQueue: React.FC = () => {
  const r = useReview();
  const [term, setTerm] = useState('');
  const counts = r.queue?.counts;
  const rows = (r.queue?.rows ?? []).filter((row) => {
    if (!term.trim()) return true;
    const t = term.toLowerCase();
    return (row.full_name ?? '').toLowerCase().includes(t) || (row.email ?? '').toLowerCase().includes(t);
  });

  return (
    <div className="aint-queue">
      <div className="aint-qhead">
        <h2 style={{ fontSize: 14, margin: 0 }}>Applicant queue</h2>
        <div className="aint-search">
          <span aria-hidden="true">🔎</span>
          <input placeholder="Search name or email…" value={term} onChange={(e) => setTerm(e.target.value)} />
        </div>
      </div>

      <div className="aint-filters">
        {BUCKETS.map((b) => (
          <button
            key={b.key}
            type="button"
            className={`aint-chip${r.bucket === b.key ? ' on' : ''}`}
            // Filter only. Never clears the open applicant.
            onClick={() => r.setBucket(b.key)}
          >
            {b.label}{counts ? <span className="n">{counts[b.key] ?? 0}</span> : null}
          </button>
        ))}
      </div>

      <div className="aint-qlist">
        {r.queueLoading && <p className="text-muted" style={{ padding: '12px 14px', margin: 0 }}>Loading the queue…</p>}
        {!r.queueLoading && r.queueError && (
          <div className="alert alert-danger m-3" role="alert" style={{ fontSize: 13 }}>{r.queueError}</div>
        )}
        {!r.queueLoading && !r.queueError && rows.length === 0 && (
          <p className="text-muted" style={{ padding: '14px', margin: 0, fontSize: 13 }}>
            {counts && BUCKETS.every((b) => (counts[b.key] ?? 0) === 0)
              ? 'No internship applications have been started yet.'
              : term.trim()
                ? 'No applicant here matches that search.'
                : 'Nothing in this bucket right now.'}
          </p>
        )}
        {rows.map((row) => (
          <button
            key={row.application_id}
            type="button"
            className={`aint-qrow${r.selected === row.application_id ? ' on' : ''}`}
            onClick={() => r.setSelected(row.application_id)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span className="nm">{row.full_name ?? '—'}</span>
              {row.blocking_count > 0 && <span className="aint-flag" title="Things to check">{row.blocking_count}</span>}
            </div>
            <div className="em">{row.email ?? '—'}</div>
            <div className="meta">
              <StatusBadge label={row.state.replace(/_/g, ' ')} />
              <span>{row.interview_channel ?? '—'}</span>
              <span className="aint-prog"><i style={{ width: `${row.progress.total ? (row.progress.resolved / row.progress.total) * 100 : 0}%` }} /></span>
              <span>{row.progress.resolved}/{row.progress.total}</span>
              {row.submitted_at && <span>· {new Date(row.submitted_at).toLocaleDateString()}</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default InternshipQueue;
