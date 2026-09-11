import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader, SectionCard, StatusBadge } from '../../../components/admin/shell';
import { errorMessage, listItems, type ContentItem, type ContentItemStatus } from '../../../services/contentComposerApi';

/**
 * The content review queue: every item, filtered by lifecycle status, each opening in the
 * composer. The needs-attention queue's "content items awaiting approval" links here with
 * `?status=ready_for_review`; before this page existed that link fell to NotFoundPage (the
 * T015 verifier's finding).
 *
 * Absence is stated: an empty list under a filter says "nothing in <status>", a failed
 * request says so, and neither renders as the other.
 */

const STATUSES: ContentItemStatus[] = [
  'draft', 'ready_for_review', 'changes_requested', 'approved', 'scheduled', 'publishing', 'published',
  'validation_failed', 'publish_failed', 'partially_published', 'cancelled', 'expired', 'removed_by_provider', 'archived', 'idea',
];

function isStatus(s: string | null): s is ContentItemStatus {
  return s !== null && (STATUSES as string[]).includes(s);
}

function tone(status: ContentItemStatus): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  if (status === 'published' || status === 'approved') return 'success';
  if (status === 'ready_for_review' || status === 'scheduled' || status === 'publishing') return 'info';
  if (status === 'changes_requested' || status === 'partially_published' || status === 'expired') return 'warning';
  if (status === 'validation_failed' || status === 'publish_failed' || status === 'removed_by_provider') return 'danger';
  return 'neutral';
}

export default function AdminContentQueuePage() {
  const [params, setParams] = useSearchParams();
  const statusParam = params.get('status');
  const status: ContentItemStatus | 'all' = isStatus(statusParam) ? statusParam : 'all';

  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listItems({ ...(status === 'all' ? {} : { status }), limit: 200 }));
    } catch (err) {
      setItems([]);
      setError(errorMessage(err, 'The content queue could not be loaded. This is a failed request, not an empty queue.'));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const subtitle = useMemo(() => (status === 'all' ? 'Every content item.' : `Items in ${status.replace(/_/g, ' ')}.`), [status]);

  return (
    <div className="admin-page">
      <PageHeader
        title="Content queue"
        subtitle={subtitle}
        icon="list-check-2"
        breadcrumb={[{ label: 'Marketing', to: '/admin/marketing' }, { label: 'Content queue' }]}
        actions={<Link to="/admin/marketing/composer" className="btn btn-sm btn-primary">New post</Link>}
      />
      <SectionCard>
        <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
          <div>
            <label className="form-label small mb-1" htmlFor="content-status">Status</label>
            <select
              id="content-status"
              className="form-select form-select-sm"
              value={status}
              onChange={(e) => setParams(e.target.value === 'all' ? {} : { status: e.target.value })}
            >
              <option value="all">All</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
        </div>

        {error && <div className="alert alert-danger py-2 small" role="alert" data-testid="queue-error">{error}</div>}
        {!error && loading && <p className="text-muted small mb-0">Loading…</p>}
        {!error && !loading && items.length === 0 && (
          <p className="text-muted mb-0" data-testid="queue-empty">
            {status === 'all' ? 'No content items yet.' : `Nothing in ${status.replace(/_/g, ' ')}.`}
          </p>
        )}
        {!error && !loading && items.length > 0 && (
          <table className="table table-sm align-middle mb-0">
            <thead><tr><th>Title</th><th>Status</th><th>Rev</th><th>Scheduled (UTC)</th><th>Updated</th><th /></tr></thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} data-testid={`item-${it.id}`}>
                  <td>{it.title}</td>
                  <td><StatusBadge label={it.status.replace(/_/g, ' ')} tone={tone(it.status)} /></td>
                  <td className="small">{it.revision}</td>
                  <td className="small">{it.scheduled_for ? it.scheduled_for.replace('T', ' ').slice(0, 16) : '-'}</td>
                  <td className="small">{it.updated_at ? it.updated_at.replace('T', ' ').slice(0, 16) : '-'}</td>
                  <td className="text-end"><Link className="btn btn-sm btn-outline-primary" to={`/admin/marketing/composer/${it.id}`}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </div>
  );
}
