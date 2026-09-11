import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader, SectionCard, StatusBadge } from '../../../components/admin/shell';
import api from '../../../utils/api';
import { cancelJob, errorMessage, retryJob, runQueueNow, type PublishingJob } from '../../../services/contentComposerApi';

/**
 * The publishing queue across every item: what is due, what is retrying, what dead-lettered
 * and why, with retry and cancel. The needs-attention queue links here with
 * `?dead_lettered=true` (failed) and `?state=pending` (late); before this page existed both
 * links fell to NotFoundPage (the T015 verifier's finding).
 */

type QueueJob = PublishingJob & { content_item_id: string; state: PublishingJob['state'] };

const STATES: PublishingJob['state'][] = ['pending', 'retrying', 'claimed', 'publishing', 'published', 'failed', 'cancelled', 'dead_lettered'];

function tone(state: PublishingJob['state']): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  if (state === 'published') return 'success';
  if (state === 'retrying' || state === 'claimed' || state === 'publishing') return 'info';
  if (state === 'failed' || state === 'dead_lettered') return 'danger';
  if (state === 'cancelled') return 'neutral';
  return 'warning';
}

export default function AdminPublishingQueuePage() {
  const [params, setParams] = useSearchParams();
  const stateParam = params.get('state');
  const state = (STATES as string[]).includes(stateParam ?? '') ? (stateParam as PublishingJob['state']) : null;
  const deadLettered = params.get('dead_lettered') === 'true';

  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/admin/publishing/jobs', {
        params: { limit: 200, ...(state ? { state } : {}), ...(deadLettered ? { dead_lettered: 'true' } : {}) },
      });
      setJobs(res.data.jobs ?? []);
    } catch (err) {
      setJobs([]);
      setError(errorMessage(err, 'The queue could not be loaded. This is a failed request, not an empty queue.'));
    } finally {
      setLoading(false);
    }
  }, [state, deadLettered]);

  useEffect(() => { void load(); }, [load]);

  const act = async (fn: () => Promise<unknown>, done: string, fallback: string) => {
    setBusy(true);
    try { await fn(); setNotice(done); await load(); } catch (err) { setNotice(errorMessage(err, fallback)); } finally { setBusy(false); }
  };

  const filterLabel = deadLettered ? 'Dead-lettered jobs' : state ? `Jobs in ${state.replace(/_/g, ' ')}` : 'All jobs';

  return (
    <div className="admin-page">
      <PageHeader
        title="Publishing queue"
        subtitle={`${filterLabel}. The worker runs every minute when enabled; the global kill switch halts it.`}
        icon="send-plane-line"
        breadcrumb={[{ label: 'Marketing', to: '/admin/marketing' }, { label: 'Publishing queue' }]}
        actions={<button type="button" className="btn btn-sm btn-outline-primary" disabled={busy} onClick={() => act(async () => {
          const r = await runQueueNow();
          setNotice(r.halted ? `Queue halted: ${r.haltReason}.` : `Queue ran: ${r.published} published, ${r.retried} retrying, ${r.failed + r.deadLettered} failed.`);
        }, 'Queue ran.', 'The queue could not be run.')}>Run queue now</button>}
      />
      <SectionCard>
        <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
          <div>
            <label className="form-label small mb-1" htmlFor="queue-state">State</label>
            <select id="queue-state" className="form-select form-select-sm" value={deadLettered ? 'dead_lettered_only' : (state ?? 'all')}
              onChange={(e) => {
                const v = e.target.value;
                setParams(v === 'all' ? {} : v === 'dead_lettered_only' ? { dead_lettered: 'true' } : { state: v });
              }}>
              <option value="all">All</option>
              <option value="dead_lettered_only">Dead-lettered (needs a person)</option>
              {STATES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
        </div>

        {notice && <div className="alert alert-info py-2 small" role="status">{notice}</div>}
        {error && <div className="alert alert-danger py-2 small" role="alert" data-testid="queue-error">{error}</div>}
        {!error && loading && <p className="text-muted small mb-0">Loading…</p>}
        {!error && !loading && jobs.length === 0 && <p className="text-muted mb-0" data-testid="queue-empty">Nothing here: {filterLabel.toLowerCase()} is empty.</p>}
        {!error && !loading && jobs.length > 0 && (
          <table className="table table-sm align-middle mb-0">
            <thead><tr><th>Network</th><th>State</th><th>Due (UTC)</th><th>Attempts</th><th>Reason</th><th /></tr></thead>
            <tbody>
              {jobs.map((j) => {
                const retryable = j.state === 'failed' || j.state === 'dead_lettered';
                const cancellable = j.state !== 'published' && j.state !== 'cancelled';
                return (
                  <tr key={j.id} data-testid={`job-${j.id}`}>
                    <td>{j.provider}</td>
                    <td><StatusBadge label={j.state.replace(/_/g, ' ')} tone={tone(j.state)} /></td>
                    <td className="small">{new Date(j.publish_at).toISOString().replace('T', ' ').slice(0, 16)}</td>
                    <td className="small">{j.attempts}/{j.max_attempts}</td>
                    <td className="small">
                      {j.dead_letter_reason && <div className="text-muted">{j.dead_letter_reason}</div>}
                      {j.last_error && <div className="text-danger">{j.last_error_class}: {j.last_error}</div>}
                    </td>
                    <td className="text-end text-nowrap">
                      <Link className="btn btn-sm btn-outline-secondary me-1" to={`/admin/marketing/composer/${j.content_item_id}`}>Item</Link>
                      {retryable && <button type="button" className="btn btn-sm btn-outline-primary me-1" disabled={busy} onClick={() => act(() => retryJob(j.id), 'Job returned to the queue.', 'Retry was refused.')}>Retry</button>}
                      {cancellable && <button type="button" className="btn btn-sm btn-outline-danger" disabled={busy} onClick={() => act(() => cancelJob(j.id, null), 'Job cancelled.', 'Cancel was refused.')}>Cancel</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </SectionCard>
    </div>
  );
}
