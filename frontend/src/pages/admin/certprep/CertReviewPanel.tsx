import React, { useCallback, useEffect, useState } from 'react';
import { SectionCard, StatusBadge } from '../../../components/admin/shell';
import {
  fetchReviewQueue, setQuestionStatus, QuestionRevision, ReviewStatus,
} from '../../../services/certPrepAdminApi';

/**
 * CertReviewPanel — the gate. Nothing reaches a student until a named human
 * approves it here.
 *
 * This is the only Cert Prep surface that renders answer keys and rationales,
 * and it has to: you cannot review a question without reading its key. Every
 * other layer is built so that content cannot escape — the student API sends no
 * `correct_keys`, and analytics strips them — so the exception lives in exactly
 * one place, behind requireAdmin and the 'program' section.
 *
 * DESIGN CONSTRAINTS THAT ARE NOT NEGOTIABLE HERE:
 *
 *   - **One question per action.** There is no select-all and no bulk approve,
 *     because the API has no such endpoint and the whole value of the gate is
 *     that somebody read the item.
 *   - **No reviewer field.** The server stamps the authenticated admin. A form
 *     input for "reviewer" would be a way to attribute an approval to someone
 *     who never read the question, which is the one thing an audit trail exists
 *     to prevent.
 *   - **A fixture approval is called out.** Items approved by an automated
 *     fixture account are marked, because "approved" in that row means a script
 *     said so, not that a person read it.
 */

const STATUSES: ReviewStatus[] = ['draft', 'in_review', 'approved', 'retired'];

const STATUS_TONE: Record<ReviewStatus, 'neutral' | 'info' | 'success' | 'warning'> = {
  draft: 'neutral', in_review: 'info', approved: 'success', retired: 'warning',
};

/**
 * A reviewer that is not a person. The dev lifecycle script stamps
 * `dev-fixture@colaberry.test`; anything on a .test/.invalid domain is a script,
 * and an item it "approved" has had no human second reading.
 */
export function isFixtureReviewer(reviewer: string | null | undefined): boolean {
  if (!reviewer) return false;
  return /@[^@]*\.(test|invalid|example|local)$/i.test(reviewer.trim());
}

export function QuestionCard({ q, onMoved }: { q: QuestionRevision; onMoved: () => void }) {
  const [busy, setBusy] = useState<ReviewStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const correct = new Set(q.correct_keys ?? []);

  const move = async (status: ReviewStatus) => {
    setBusy(status);
    setError(null);
    try {
      await setQuestionStatus(q.question_key, q.revision, status);
      onMoved();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not change the status.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="border rounded p-3 mb-3">
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-2">
        <div>
          <code>{q.question_key}</code> <span className="text-muted small">revision {q.revision}</span>
          <div className="small text-muted">
            <code>{q.domain_id}</code>
            {q.objective_id && <> · <code>{q.objective_id}</code></>}
            {' · '}{q.difficulty}
            {' · '}blueprint {q.blueprint_version}
          </div>
        </div>
        <StatusBadge label={q.review_status} tone={STATUS_TONE[q.review_status] ?? 'neutral'} />
      </div>

      <p className="mb-2">{q.stem}</p>

      <ul className="list-unstyled mb-2">
        {(q.options ?? []).map((o) => (
          <li key={o.key} className={correct.has(o.key) ? 'fw-semibold' : ''}>
            <span className="me-2">{correct.has(o.key) ? '✓' : '○'}</span>
            <code className="me-2">{o.key}</code>{o.text}
            {q.distractor_rationales?.[o.key] && (
              <div className="small text-muted ms-4">{q.distractor_rationales[o.key]}</div>
            )}
          </li>
        ))}
      </ul>

      {q.rationale && (
        <p className="small text-muted mb-2"><strong>Rationale:</strong> {q.rationale}</p>
      )}

      {q.reviewer && (
        <p className="small mb-2">
          {isFixtureReviewer(q.reviewer) ? (
            <span className="text-danger">
              <i className="ri-alert-line me-1" aria-hidden="true" />
              Approved by a fixture account ({q.reviewer}) — no human has read this item.
            </span>
          ) : (
            <span className="text-muted">
              {q.review_status} by {q.reviewer}
              {q.reviewed_at && ` on ${new Date(q.reviewed_at).toLocaleDateString()}`}
            </span>
          )}
        </p>
      )}

      {error && <div className="alert alert-danger py-2 small">{error}</div>}

      <div className="d-flex flex-wrap gap-2">
        {q.review_status !== 'approved' && (
          <button type="button" className="btn btn-sm btn-primary" disabled={busy !== null} onClick={() => move('approved')}>
            {busy === 'approved' ? 'Approving…' : 'Approve'}
          </button>
        )}
        {q.review_status === 'draft' && (
          <button type="button" className="btn btn-sm btn-outline-secondary" disabled={busy !== null} onClick={() => move('in_review')}>
            Mark in review
          </button>
        )}
        {q.review_status !== 'retired' && (
          <button type="button" className="btn btn-sm btn-outline-danger" disabled={busy !== null} onClick={() => move('retired')}>
            {busy === 'retired' ? 'Retiring…' : 'Retire'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function CertReviewPanel({ onChanged }: { onChanged?: () => void }) {
  const [status, setStatus] = useState<ReviewStatus>('draft');
  const [rows, setRows] = useState<QuestionRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetchReviewQueue(status)
      .then(setRows)
      .catch(() => setError('Could not load the review queue.'))
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const afterMove = () => { load(); onChanged?.(); };

  return (
    <SectionCard
      title="Review queue"
      subtitle="One question, one decision. There is no bulk approve, on purpose."
      icon="draft-line"
      actions={
        <div className="btn-group btn-group-sm" role="group" aria-label="Review status filter">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className={`btn btn-outline-secondary ${status === s ? 'active' : ''}`}
              aria-pressed={status === s}
              onClick={() => setStatus(s)}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
      }
    >
      {error && <div className="alert alert-danger">{error}</div>}
      {loading && <p className="text-muted mb-0">Loading…</p>}
      {!loading && rows.length === 0 && (
        <p className="text-muted mb-0">Nothing in <strong>{status.replace('_', ' ')}</strong>.</p>
      )}
      {!loading && rows.map((q) => (
        <QuestionCard key={`${q.question_key}-${q.revision}`} q={q} onMoved={afterMove} />
      ))}
    </SectionCard>
  );
}
