import React, { useCallback, useEffect, useState } from 'react';
import api from '../../../../utils/api';

/**
 * DEMOS WAITING ON A STAFF DECISION.
 *
 * The approve endpoint has existed since the showcase lifecycle shipped, and the
 * queue service since 2026-10-18. Neither had a screen. A learner switching a
 * take to Public got "Waiting for staff approval — still private" and then
 * nothing, because the only way to find their request was to query the database
 * by hand. That is how both demos live in production today were approved.
 *
 * THE VIDEO IS THE POINT OF THE SCREEN. A reviewer is vouching for footage of a
 * person that a cohort is about to see; approving from a name and a timestamp is
 * not reviewing. Each row plays inline, through a signed staff ticket minted by
 * the queue endpoint.
 *
 * DECLINE NEEDS A REASON and the form will not submit without one. "No" with no
 * sentence attached is indistinguishable from being ignored, which is the exact
 * failure this screen exists to end.
 */

interface PendingShowcase {
  showcaseId: string;
  recordingId: string | null;
  summary: string | null;
  requestedAt: string | null;
  learnerName: string | null;
  learnerEmail: string | null;
  cohortName: string | null;
  storyId: string | null;
  typeLabel: string | null;
  recordingCount: number;
  durationSeconds: number | null;
  playbackUrl: string | null;
  thumbnailUrl: string | null;
  stale: boolean;
}

const mmss = (s: number | null): string | null => {
  if (typeof s !== 'number' || !Number.isFinite(s) || s <= 0) return null;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

const waitingFor = (iso: string | null): string => {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days >= 1) return `waiting ${days} day${days === 1 ? '' : 's'}`;
  const hours = Math.floor((Date.now() - then) / 3600000);
  return hours >= 1 ? `waiting ${hours}h` : 'just now';
};

function errText(e: unknown, fallback: string): string {
  const err = e as { response?: { data?: { error?: string } } };
  return err?.response?.data?.error || fallback;
}

const ShowcaseReviewQueue: React.FC = () => {
  const [rows, setRows] = useState<PendingShowcase[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await api.get<{ pending: PendingShowcase[] }>('/api/admin/presentation/showcases/pending');
      setRows(r.data?.pending || []);
    } catch (e) {
      setError(errText(e, 'Could not load the review queue.'));
      // NOT an empty list. Setting [] here rendered "Nothing is waiting"
      // underneath the error, which tells a reviewer the queue is clear at the
      // exact moment the screen has no idea what is in it — the same false
      // all-clear this screen exists to end.
      setRows(null);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const approve = async (id: string) => {
    setBusyId(id); setError(''); setNotice('');
    try {
      await api.post(`/api/admin/presentation/showcases/${id}/approve`, { audience: 'cohort' });
      setNotice('Approved and posted to the cohort feed.');
      await load();
    } catch (e) {
      setError(errText(e, 'Could not approve that demo.'));
    } finally { setBusyId(null); }
  };

  const decline = async (id: string) => {
    if (!reason.trim()) return;
    setBusyId(id); setError(''); setNotice('');
    try {
      await api.post(`/api/admin/presentation/showcases/${id}/decline`, { reason: reason.trim() });
      setNotice('Declined. The learner can fix it and ask again.');
      setDecliningId(null);
      setReason('');
      await load();
    } catch (e) {
      setError(errText(e, 'Could not decline that demo.'));
    } finally { setBusyId(null); }
  };

  return (
    <div data-testid="ps-review-queue" style={{ marginTop: 22 }}>
      <h3 style={{ fontSize: 15, margin: '0 0 4px' }}>
        Demos awaiting approval{rows ? ` (${rows.length})` : ''}
      </h3>
      <p style={{ fontSize: 13, color: 'var(--muted, #667085)', margin: '0 0 12px' }}>
        A learner has asked for one of their takes to go out to the cohort. Nobody but
        them and staff can see it until someone here says yes.
      </p>

      {error && <p role="alert" data-testid="ps-review-error" style={{ color: '#B42318', fontSize: 13 }}>{error}</p>}
      {notice && <p role="status" data-testid="ps-review-notice" style={{ color: '#027A48', fontSize: 13 }}>{notice}</p>}

      {rows === null && !error && <p data-testid="ps-review-loading" style={{ fontSize: 13 }}>Loading the queue&hellip;</p>}

      {rows !== null && rows.length === 0 && (
        <p data-testid="ps-review-empty" style={{ fontSize: 13, color: 'var(--muted, #667085)' }}>
          Nothing is waiting. When a learner asks to share a demo it appears here.
        </p>
      )}

      {(rows || []).map((row) => (
        <article
          key={row.showcaseId}
          data-testid={`ps-review-row-${row.showcaseId}`}
          style={{
            border: '1px solid var(--line, #E3E8EF)', borderRadius: 8, padding: 14,
            marginBottom: 12, display: 'flex', gap: 14, flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: '0 0 240px' }}>
            {row.playbackUrl ? (
              <video
                data-testid={`ps-review-player-${row.showcaseId}`}
                controls
                preload="none"
                poster={row.thumbnailUrl || undefined}
                src={row.playbackUrl}
                style={{ width: '100%', aspectRatio: '16 / 9', background: '#000', borderRadius: 6 }}
              />
            ) : (
              // Said plainly rather than hidden: a request with no video attached
              // cannot be approved on its merits, and the reviewer needs to know
              // that is what they are looking at.
              <p data-testid={`ps-review-novideo-${row.showcaseId}`} style={{ fontSize: 12, color: '#B42318' }}>
                No recording is attached to this request. There is nothing to watch, so
                there is nothing to approve.
              </p>
            )}
          </div>

          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <strong>{row.learnerName || row.learnerEmail || 'Unknown learner'}</strong>
              {row.typeLabel && <span style={{ fontSize: 12, color: 'var(--muted, #667085)' }}>{row.typeLabel}</span>}
              {mmss(row.durationSeconds) && <span style={{ fontSize: 12, color: 'var(--muted, #667085)' }}>{mmss(row.durationSeconds)}</span>}
              <span style={{ fontSize: 12, color: 'var(--muted, #667085)' }}>{waitingFor(row.requestedAt)}</span>
            </div>

            <p style={{ fontSize: 12, color: 'var(--muted, #667085)', margin: '2px 0 8px' }}>
              {[row.cohortName, row.storyId, row.recordingCount > 1 ? `${row.recordingCount} takes on this task` : null]
                .filter(Boolean).join(' · ')}
            </p>

            {/* The reviewer is approving these words too — they go out with the post. */}
            <blockquote
              data-testid={`ps-review-summary-${row.showcaseId}`}
              style={{ margin: '0 0 10px', padding: '8px 10px', background: 'var(--bg-alt, #F9FAFB)', borderRadius: 6, fontSize: 13 }}
            >
              {row.summary || <em>No summary written.</em>}
            </blockquote>

            {row.stale && (
              <p data-testid={`ps-review-stale-${row.showcaseId}`} style={{ fontSize: 12, color: '#B54708', margin: '0 0 8px' }}>
                The take changed after this was requested. Approving would vouch for
                footage nobody has reviewed — ask the learner to request again.
              </p>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                data-testid={`ps-review-approve-${row.showcaseId}`}
                disabled={busyId === row.showcaseId || !row.recordingId}
                onClick={() => void approve(row.showcaseId)}
              >
                {busyId === row.showcaseId ? 'Working…' : 'Approve and post'}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                data-testid={`ps-review-decline-open-${row.showcaseId}`}
                disabled={busyId === row.showcaseId}
                onClick={() => {
                  setDecliningId(decliningId === row.showcaseId ? null : row.showcaseId);
                  setReason('');
                }}
              >
                Decline
              </button>
            </div>

            {decliningId === row.showcaseId && (
              <div style={{ marginTop: 10 }}>
                <label htmlFor={`reason-${row.showcaseId}`} style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                  What should they change? The learner sees this.
                </label>
                <textarea
                  id={`reason-${row.showcaseId}`}
                  data-testid={`ps-review-reason-${row.showcaseId}`}
                  value={reason}
                  rows={2}
                  maxLength={2000}
                  onChange={(e) => setReason(e.target.value)}
                  style={{ width: '100%', fontSize: 13, padding: '6px 8px', borderRadius: 6 }}
                />
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  data-testid={`ps-review-decline-confirm-${row.showcaseId}`}
                  disabled={!reason.trim() || busyId === row.showcaseId}
                  onClick={() => void decline(row.showcaseId)}
                  style={{ marginTop: 6 }}
                >
                  Send decline
                </button>
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  );
};

export default ShowcaseReviewQueue;
