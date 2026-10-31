import React, { useCallback, useEffect, useState } from 'react';

import KnowledgeDocumentReview, { confidenceBadge } from './KnowledgeDocumentReview';
import {
  listKnowledgeDocuments,
  type KnowledgeConfidence,
  type KnowledgeDocument,
} from '../../services/explorerKnowledgeApi';

/**
 * The review queue — which uploaded documents are waiting on a human.
 *
 * ## The default filter is the work, not the archive
 *
 * It opens on `unstated`, because that is the set somebody has to act on. Landing on "all"
 * would bury four unreviewed documents in eighty approved ones, and the number a reviewer
 * actually needs is "how many are waiting on me".
 *
 * ## Retired documents are hidden until asked for
 *
 * A withdrawn document is not work. It stays reachable behind a checkbox so retirement is
 * auditable rather than a disappearance — the same reason the server defaults the filter
 * the same way rather than deleting the row.
 */

const PAGE = 20;

/** The filter tabs, in the order a reviewer works through them. */
const FILTERS: Array<{ key: KnowledgeConfidence | 'all'; label: string }> = [
  { key: 'unstated', label: 'Waiting on you' },
  { key: 'drafted-verify', label: 'Needs checking' },
  { key: 'grounded', label: 'Approved' },
  { key: 'all', label: 'All' },
];

export default function KnowledgeReviewPanel({ reloadKey = 0 }: { reloadKey?: number }) {
  const [filter, setFilter] = useState<KnowledgeConfidence | 'all'>('unstated');
  const [includeRetired, setIncludeRetired] = useState(false);
  const [offset, setOffset] = useState(0);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const page = await listKnowledgeDocuments({
        confidence: filter === 'all' ? undefined : filter,
        includeRetired,
        limit: PAGE,
        offset,
      });
      setDocuments(page.documents);
      setTotal(page.total);
    } catch {
      // An empty list and a failed request look identical to a reader, so they are not
      // allowed to render the same way.
      setFailed(true);
      setDocuments([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filter, includeRetired, offset]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  function changeFilter(key: KnowledgeConfidence | 'all') {
    setFilter(key);
    // Page 3 of one filter is rarely page 3 of the next, and an offset carried across
    // shows an empty list for a filter that has results.
    setOffset(0);
    setOpenId(null);
  }

  return (
    <div className="card border-0 shadow-sm mb-4">
      <div className="card-header bg-white fw-semibold d-flex flex-wrap align-items-center gap-2">
        <span>Knowledge review</span>
        <span className="text-muted small fw-normal">
          Nothing an upload stores can be quoted until it is approved here.
        </span>
      </div>

      <div className="card-body">
        <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
          <div className="btn-group btn-group-sm" role="group" aria-label="Filter by review state">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`btn ${filter === f.key ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => changeFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="form-check form-switch ms-auto">
            <input
              className="form-check-input"
              type="checkbox"
              id="kr-include-retired"
              checked={includeRetired}
              onChange={(e) => {
                setIncludeRetired(e.target.checked);
                setOffset(0);
              }}
            />
            <label className="form-check-label small" htmlFor="kr-include-retired">
              Show retired
            </label>
          </div>
        </div>

        {failed && (
          <div className="alert alert-danger py-2 px-3 small" role="alert">
            The queue could not be loaded. This is not the same as there being nothing to review.
          </div>
        )}

        {loading && documents.length === 0 && !failed && (
          <div className="text-muted small">Loading…</div>
        )}

        {!loading && !failed && documents.length === 0 && (
          <div className="text-muted small">
            {filter === 'unstated'
              ? 'Nothing is waiting on you.'
              : 'No documents in this state.'}
          </div>
        )}

        {documents.length > 0 && (
          <div className="list-group">
            {documents.map((doc) => {
              const badge = confidenceBadge(doc.confidence, doc.retired_at);
              const open = openId === doc.id;

              return (
                <div key={doc.id} className="list-group-item p-0">
                  <button
                    type="button"
                    className="btn btn-link text-reset text-decoration-none w-100 text-start p-3"
                    aria-expanded={open}
                    onClick={() => setOpenId(open ? null : doc.id)}
                  >
                    <div className="d-flex flex-wrap align-items-center gap-2">
                      <span className="fw-semibold">{doc.title}</span>
                      <span className={`badge ${badge.tone}`}>{badge.label}</span>
                      {/* Said per row, not only on the open document: a queue that shows
                          only "Approved" invites the reading that the rest are live too. */}
                      {doc.quotable && <span className="badge bg-success-subtle text-success-emphasis">In use</span>}
                    </div>
                    <div className="small text-muted mt-1">
                      {doc.chunk_count} passage{doc.chunk_count === 1 ? '' : 's'} ·{' '}
                      {doc.ingested_by ?? 'unknown'} ·{' '}
                      {new Date(doc.created_at).toLocaleDateString()}
                    </div>
                  </button>

                  {open && (
                    <KnowledgeDocumentReview
                      documentId={doc.id}
                      onChanged={() => void load()}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {total > PAGE && (
          <div className="d-flex align-items-center gap-2 mt-3">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              disabled={offset === 0 || loading}
              onClick={() => setOffset(Math.max(0, offset - PAGE))}
            >
              Previous
            </button>
            <span className="small text-muted">
              {offset + 1}–{Math.min(offset + PAGE, total)} of {total}
            </span>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              disabled={offset + PAGE >= total || loading}
              onClick={() => setOffset(offset + PAGE)}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
