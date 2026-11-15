import React, { useCallback, useEffect, useState } from 'react';
import { EmptyState, PageHeader, SectionCard, StatusBadge } from '../../components/admin/shell';
import {
  approveOutboundMessage, getOutboundMessage, listOutboundQueue, mayaErrorMessage,
  rejectOutboundMessage, type MayaOutboundDetail, type MayaOutboundSummary,
} from '../../services/mayaConsoleApi';

/**
 * T15 - "Outbound approvals". Every message Maya composed for a real person, waiting on a
 * decision. One message at a time.
 *
 * Ali's choice, 13 Nov 2026, from four options: *on, outbound held for your approval.* She is
 * switched on and her in-product surfaces are live, and every message she writes for a real
 * person stops here until he reads that exact message and says yes.
 *
 * ## THERE IS NO BULK APPROVE ON THIS SCREEN, AND THAT IS THE FEATURE
 *
 * Not a checkbox column, not an "approve all", not an approve button on a list row. The queue
 * rows carry an OPEN button and nothing else, so a decision cannot be made from a subject line.
 * `AdminOutboundApprovalsPage.test.tsx` asserts it by counting controls, because this is exactly
 * the property that would be lost to a well-meaning tidy-up.
 *
 * The reason is a measured one rather than a principle. `approvalRequestTimeoutJob.ts` approved
 * every expired pending row on a fifteen-minute cron, and `reeseOutreachHolds.ts` records what
 * that cost: 851 replayed DMs to 52 students between 7 Oct and 12 Nov 2026, one student 37 times.
 * A bulk button is the same decision made by a human in one click instead of by a timer.
 *
 * ## WHY THE BODY IS SHOWN AS SOURCE AND NOT RENDERED
 *
 * `body` holds the exact bytes the provider will receive, and for email that is HTML. It is
 * displayed as text in a `<pre>`, not injected with `dangerouslySetInnerHTML`, for two reasons:
 * the review has to be of the bytes that will actually leave - the server re-hashes them before
 * transmitting and refuses if anything moved - and content Maya composed should not become live
 * markup inside the admin app. Reading the source is the stricter review, not the weaker one.
 *
 * ## WHAT THE SERVER STILL REFUSES AFTER A CLICK HERE
 *
 * Four things, each with its own sentence shown verbatim: the body changed since it was composed,
 * the message is no longer awaiting a decision, the decider is not a person we hold a record of,
 * and the provider would not take it. The last one is NOT retried, here or anywhere.
 */

function when(iso: string | null): string {
  if (!iso) return '-';
  return `${new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT`;
}

/** Days from now, floored. Negative means it already expired and is no longer sendable. */
function daysLeft(iso: string): number {
  return Math.floor((new Date(iso).getTime() - Date.now()) / 86400000);
}

export default function AdminOutboundApprovalsPage(): React.ReactElement {
  const [queue, setQueue] = useState<MayaOutboundSummary[]>([]);
  const [open, setOpen] = useState<MayaOutboundDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listOutboundQueue();
      setQueue(res.pending);
      setError(null);
    } catch (e) {
      setError(mayaErrorMessage(e, 'Could not read the outbound queue.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openOne = useCallback(async (id: string) => {
    setOpening(true);
    setOutcome(null);
    setNote('');
    try {
      setOpen(await getOutboundMessage(id));
      setError(null);
    } catch (e) {
      setError(mayaErrorMessage(e, 'Could not read that message.'));
    } finally {
      setOpening(false);
    }
  }, []);

  /**
   * One decision, on the one message on screen. The id comes from the opened message rather than
   * from a row, so there is no path on this page that decides something the reader did not read.
   */
  const decide = useCallback(async (verb: 'approve' | 'reject') => {
    if (!open) return;
    setBusy(true);
    try {
      const res = verb === 'approve'
        ? await approveOutboundMessage(open.id, note.trim() || undefined)
        : await rejectOutboundMessage(open.id, note.trim());
      setOutcome({
        ok: true,
        text: verb === 'approve'
          ? `Sent. The message is ${res.status}.`
          : `Rejected. Nothing was sent.`,
      });
      setOpen(null);
      await load();
    } catch (e) {
      // The server's own sentence, not a generic failure: "this message changed after it was
      // composed", "this message is sent, not awaiting approval", "delivery failed, nothing was
      // sent" each tell the reader a different thing to do next.
      setOutcome({ ok: false, text: mayaErrorMessage(e, 'The decision was refused. Nothing was sent.') });
    } finally {
      setBusy(false);
    }
  }, [open, note, load]);

  return (
    <div>
      <PageHeader
        title="Outbound approvals"
        icon="mail-send-line"
        subtitle="Every message Maya composed for a real person. Nothing leaves until you approve that exact message."
        breadcrumb={[{ label: 'Admin', to: '/admin' }, { label: 'Maya', to: '/admin/maya' }, { label: 'Outbound approvals' }]}
        actions={(
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => void load()} disabled={loading}>
            <i className="ri-refresh-line" aria-hidden="true" /> Refresh
          </button>
        )}
      />

      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {outcome && (
        <div className={`alert ${outcome.ok ? 'alert-success' : 'alert-warning'}`} role="status">
          {outcome.text}
        </div>
      )}

      <SectionCard
        title={`Waiting for you${queue.length ? ` (${queue.length})` : ''}`}
        icon="time-line"
        subtitle="Open a message to read it. There is no way to decide one from this list, on purpose."
      >
        {loading && <p className="text-muted mb-0">Loading the queue...</p>}
        {!loading && queue.length === 0 && (
          <EmptyState
            icon="checkbox-circle-line"
            title="Nothing is waiting"
            description="Maya has composed no messages for a real person that need a decision."
          />
        )}
        {!loading && queue.length > 0 && (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th scope="col">To</th>
                  <th scope="col">Subject</th>
                  <th scope="col">What composed it</th>
                  <th scope="col">Composed</th>
                  <th scope="col">Expires</th>
                  <th scope="col" className="text-end">Review</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((row) => {
                  const left = daysLeft(row.expires_at);
                  return (
                    <tr key={row.id}>
                      <td>
                        <div className="fw-semibold">{row.recipient_display || row.recipient_masked}</div>
                        <div className="small text-muted font-monospace">{row.recipient_ref}</div>
                      </td>
                      <td>
                        <div>{row.subject || <span className="text-muted">no subject</span>}</div>
                        <div className="small text-muted">{row.body_preview}</div>
                      </td>
                      <td>
                        <div className="small font-monospace">{row.composed_by}</div>
                        <div className="small text-muted">{row.capability}</div>
                      </td>
                      <td className="small text-muted">{when(row.created_at)}</td>
                      <td className="small">
                        {left <= 0
                          ? <StatusBadge label="expiring" tone="danger" />
                          : <span className="text-muted">{left} day{left === 1 ? '' : 's'}</span>}
                      </td>
                      <td className="text-end">
                        {/* The ONLY control on a queue row. No checkbox, no approve, no reject:
                            a decision requires opening the message and reading it. */}
                        <button
                          type="button"
                          className="btn btn-outline-primary btn-sm"
                          onClick={() => void openOne(row.id)}
                          disabled={opening}
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {open && (
        <SectionCard
          title="One message, for your decision"
          icon="draft-line"
          className="mt-4"
          actions={<StatusBadge label={open.status.replace(/_/g, ' ')} tone="warning" />}
        >
          <dl className="row small mb-3">
            <dt className="col-sm-3">To</dt>
            <dd className="col-sm-9">
              {open.recipient_display ? `${open.recipient_display} ` : ''}
              <span className="font-monospace">{open.recipient_masked}</span>
              <span className="text-muted ms-2">({open.recipient_ref})</span>
            </dd>
            <dt className="col-sm-3">Channel</dt>
            <dd className="col-sm-9">{open.channel}</dd>
            <dt className="col-sm-3">Subject</dt>
            <dd className="col-sm-9">{open.subject || <span className="text-muted">no subject</span>}</dd>
            <dt className="col-sm-3">Composed by</dt>
            <dd className="col-sm-9">
              <span className="font-monospace">{open.composed_by}</span>
              <span className="text-muted ms-2">capability {open.capability}</span>
            </dd>
            <dt className="col-sm-3">Composed at</dt>
            <dd className="col-sm-9">{when(open.created_at)}</dd>
            <dt className="col-sm-3">Trace</dt>
            <dd className="col-sm-9 font-monospace text-muted">{open.correlation_id}</dd>
          </dl>

          <p className="small text-muted">
            These are the exact bytes that would be sent, shown as source. The server re-checks
            them against this hash before transmitting and refuses if anything changed.
            <span className="font-monospace ms-1">{open.body_hash.slice(0, 16)}</span>
          </p>
          <pre
            className="border rounded p-3 small"
            style={{ maxHeight: '22rem', overflow: 'auto', whiteSpace: 'pre-wrap', background: 'var(--color-bg-alt)' }}
          >
            {open.body}
          </pre>

          <label className="form-label small fw-medium mt-3" htmlFor="maya-decision-note">
            Note (required to reject)
          </label>
          <textarea
            id="maya-decision-note"
            className="form-control form-control-sm"
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          <div className="d-flex gap-2 mt-3">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void decide('approve')} disabled={busy}>
              {busy ? 'Working...' : 'Approve and send this message'}
            </button>
            <button
              type="button"
              className="btn btn-outline-danger btn-sm"
              onClick={() => void decide('reject')}
              disabled={busy || note.trim().length < 3}
            >
              Reject
            </button>
            <button type="button" className="btn btn-link btn-sm ms-auto" onClick={() => setOpen(null)} disabled={busy}>
              Close without deciding
            </button>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
