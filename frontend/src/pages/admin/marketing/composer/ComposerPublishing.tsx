import React, { useState } from 'react';
import { StatusBadge } from '../../../../components/admin/shell';
import type { ExternalPublication, PublishingJob } from '../../../../services/contentComposerApi';

/**
 * What happened after the operator clicked Schedule / Publish now: the queue, per network.
 *
 * Three things a person needs here and nowhere else:
 *   - a HANDOFF package - the text, link and instructions to post by hand, with a copy
 *     button, and the form that completes the receipt with the real post id (spec 8.2);
 *   - the dead-letter queue for this item, with retry and cancel (spec 9);
 *   - the plain state of each job, with the reason if it is not where it should be.
 *
 * A dry-run receipt is labelled as one. Nothing on this panel can make a dry run look live.
 */

export interface ComposerPublishingProps {
  jobs: PublishingJob[];
  publications: ExternalPublication[];
  busy: boolean;
  onRetry: (jobId: string) => void;
  onCancel: (jobId: string) => void;
  onCompleteHandoff: (publicationId: string, externalId: string, permalink: string | null) => void;
  onRunNow: () => void;
}

function jobTone(state: PublishingJob['state']): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  if (state === 'published') return 'success';
  if (state === 'retrying' || state === 'claimed' || state === 'publishing') return 'info';
  if (state === 'failed' || state === 'dead_lettered') return 'danger';
  if (state === 'cancelled') return 'neutral';
  return 'warning';
}

function HandoffCard({ pub, busy, onComplete }: { pub: ExternalPublication; busy: boolean; onComplete: (externalId: string, permalink: string | null) => void }) {
  const [externalId, setExternalId] = useState('');
  const [permalink, setPermalink] = useState('');
  const [copied, setCopied] = useState(false);
  const pkg = pub.metadata.handoff;
  if (!pkg) return null;

  const copy = async () => {
    try { await navigator.clipboard.writeText(pkg.text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { setCopied(false); }
  };

  return (
    <div className="border border-warning rounded p-3 mb-3" data-testid={`handoff-${pub.provider}`}>
      <div className="d-flex align-items-center gap-2 mb-2">
        <strong>{pkg.displayName}</strong>
        <StatusBadge label="Handoff required" tone="warning" />
        <span className="small text-muted">{pkg.reasons[0]}</span>
      </div>
      <textarea className="form-control form-control-sm mb-2" rows={4} readOnly value={pkg.text} aria-label={`${pkg.displayName} handoff text`} />
      <div className="d-flex flex-wrap gap-2 align-items-center mb-2">
        <button type="button" className="btn btn-sm btn-outline-dark" onClick={copy}>{copied ? 'Copied' : 'Copy text'}</button>
        {pkg.linkUrl && <span className="small">Link: <code>{pkg.linkUrl}</code></span>}
        {pkg.disclosureText && <span className="small">Disclosure: {pkg.disclosureText}</span>}
      </div>
      <pre className="small bg-light p-2 rounded mb-2" style={{ whiteSpace: 'pre-wrap' }}>{pkg.instructions}</pre>
      <form className="d-flex flex-wrap gap-2 align-items-end" onSubmit={(e) => { e.preventDefault(); if (externalId.trim()) onComplete(externalId.trim(), permalink.trim() || null); }}>
        <div>
          <label className="form-label small mb-1" htmlFor={`ext-${pub.id}`}>Post id from {pkg.displayName}</label>
          <input id={`ext-${pub.id}`} className="form-control form-control-sm" value={externalId} disabled={busy} onChange={(e) => setExternalId(e.target.value)} />
        </div>
        <div>
          <label className="form-label small mb-1" htmlFor={`perma-${pub.id}`}>Post URL (optional)</label>
          <input id={`perma-${pub.id}`} type="url" className="form-control form-control-sm" value={permalink} disabled={busy} onChange={(e) => setPermalink(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-sm btn-success" disabled={busy || !externalId.trim()}>Mark posted</button>
      </form>
    </div>
  );
}

export default function ComposerPublishing({ jobs, publications, busy, onRetry, onCancel, onCompleteHandoff, onRunNow }: ComposerPublishingProps) {
  if (jobs.length === 0) return <p className="text-muted mb-0">Nothing queued yet. Schedule or publish from the confirmation above.</p>;
  const pendingHandoffs = publications.filter((p) => p.current_status === 'handoff_pending');

  return (
    <div className="composer-publishing">
      <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
        <button type="button" className="btn btn-sm btn-outline-primary" disabled={busy} onClick={onRunNow}>Run queue now</button>
        <span className="small text-muted">The queue also runs every minute when the worker is enabled. A global kill switch halts it.</span>
      </div>

      {pendingHandoffs.map((p) => (
        <HandoffCard key={p.id} pub={p} busy={busy} onComplete={(ext, perma) => onCompleteHandoff(p.id, ext, perma)} />
      ))}

      <table className="table table-sm align-middle mb-0">
        <thead><tr><th>Network</th><th>State</th><th>Due</th><th>Attempts</th><th>Receipt</th><th /></tr></thead>
        <tbody>
          {jobs.map((j) => {
            const pub = publications.find((p) => p.publishing_job_id === j.id);
            const retryable = j.state === 'failed' || j.state === 'dead_lettered';
            const cancellable = j.state !== 'published' && j.state !== 'cancelled';
            return (
              <tr key={j.id} data-testid={`job-${j.provider}`}>
                <td>{j.provider}</td>
                <td>
                  <StatusBadge label={j.state.replace(/_/g, ' ')} tone={jobTone(j.state)} />
                  {j.last_error && <div className="small text-danger">{j.last_error_class}: {j.last_error}</div>}
                  {j.dead_letter_reason && <div className="small text-muted">{j.dead_letter_reason}</div>}
                </td>
                <td className="small">{new Date(j.publish_at).toISOString().replace('T', ' ').slice(0, 16)} UTC</td>
                <td className="small">{j.attempts}/{j.max_attempts}</td>
                <td className="small">
                  {pub ? (
                    <>
                      {pub.metadata.mode === 'dry_run' && <StatusBadge label="Dry run" tone="neutral" />}
                      {pub.current_status === 'handoff_pending' && <StatusBadge label="Awaiting handoff" tone="warning" />}
                      {pub.current_status === 'live' && (pub.permalink ? <a href={pub.permalink} target="_blank" rel="noreferrer">{pub.external_id}</a> : <code>{pub.external_id}</code>)}
                    </>
                  ) : <span className="text-muted">-</span>}
                </td>
                <td className="text-end">
                  {retryable && <button type="button" className="btn btn-sm btn-outline-primary me-1" disabled={busy} onClick={() => onRetry(j.id)}>Retry</button>}
                  {cancellable && <button type="button" className="btn btn-sm btn-outline-danger" disabled={busy} onClick={() => onCancel(j.id)}>Cancel</button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
