import React, { useEffect, useState } from 'react';
import { PageHeader, SectionCard } from '../../components/admin/shell';
import {
  CHANGE_REQUEST_DESCRIPTION_MAX,
  CHANGE_REQUEST_TITLE_MAX,
  DECLINED_REASON_MAX,
  decideChangeRequest,
  errorMessage,
  fetchAllChangeRequests,
  fetchMyChangeRequests,
  fetchMyDomains,
  fileChangeRequest,
  type ChangeRequest,
  type AgentDomainRow,
} from '../../services/agentDomainApi';

/**
 * AF4.2 — "Change Requests". An intern asks for a platform change; a named human decides it.
 *
 * ## One page, two audiences, and the API decides which one you are
 *
 * Everyone who can open this page can file a request and see their own. The decision queue is
 * rendered **only if the API returns it**: `fetchAllChangeRequests` is admin-only at the route, so
 * a 403 here means "not for you" and is deliberately NOT shown as an error.
 *
 * That is the honest way round. This page sits on `section: 'dashboard'`, which is the one section
 * every mgmt role carries — the override an intern needs or they get a 403 on the whole surface.
 * So a mentor, a support rep and a community organizer can all open it. **The route's visibility is
 * not the access control**; `requireAdmin` on the decide and queue routes is, and asking the server
 * rather than guessing from a client-side role means this page cannot drift out of agreement with
 * it.
 *
 * ## Nothing here starts any work
 *
 * An approval records a decision. No build is triggered, scheduled or queued — that is the
 * ticket's fourth acceptance criterion, asserted on the backend by
 * `agentChangeRequestNoTrigger.test.ts`. The copy says so plainly, because a button labelled
 * "Approve" invites the reader to assume otherwise.
 *
 * ## The server's sentence is shown verbatim
 *
 * A refused decision answers 409 carrying its own explanation — the four-hour timer identity,
 * self-approval, an already-decided request. "The person who filed a change request cannot be the
 * person who approves it" tells somebody what to do next; "Could not save" does not.
 */

const STATUS_BADGE: Record<ChangeRequest['status'], string> = {
  submitted: 'bg-warning',
  approved: 'bg-success',
  declined: 'bg-secondary',
  withdrawn: 'bg-light text-dark',
};

function when(iso: string | null): string {
  if (!iso) return '';
  // Central, written out, because every time in this product is Central.
  return new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago' }) + ' CT';
}

function RequestRow({ r, children }: { r: ChangeRequest; children?: React.ReactNode }) {
  return (
    <div className="border-bottom py-3">
      <div className="d-flex gap-2 align-items-start flex-wrap">
        <span className={`badge ${STATUS_BADGE[r.status]}`}>{r.status}</span>
        <div className="flex-grow-1">
          <div className="fw-semibold">{r.title}</div>
          <div className="text-muted small">
            <code>{r.domain_key}</code>
            {' · filed by '}{r.requested_by_identity}
            {r.requested_at ? ` · ${when(r.requested_at)}` : ''}
          </div>
          {r.description && <div className="small mt-1">{r.description}</div>}
          {/* The acceptance criterion, on screen: a decided request names the human and the time. */}
          {r.approved_by_identity && (
            <div className="small mt-1">
              <span className="text-muted">
                {r.status === 'approved' ? 'Approved by ' : 'Declined by '}
              </span>
              <strong>{r.approved_by_identity}</strong>
              {r.approved_at ? <span className="text-muted">{` on ${when(r.approved_at)}`}</span> : null}
            </div>
          )}
          {r.declined_reason && (
            <div className="small mt-1 text-muted">Reason: {r.declined_reason}</div>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

export default function AdminChangeRequestsPage() {
  const [domains, setDomains] = useState<AgentDomainRow[]>([]);
  const [mine, setMine] = useState<ChangeRequest[]>([]);
  const [queue, setQueue] = useState<ChangeRequest[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form state.
  const [domainKey, setDomainKey] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [filing, setFiling] = useState(false);
  const [fileProblem, setFileProblem] = useState('');
  const [filed, setFiled] = useState('');

  // Per-row decision state, so one refusal does not blank the whole queue.
  const [busyId, setBusyId] = useState('');
  const [decideProblem, setDecideProblem] = useState('');
  const [declineFor, setDeclineFor] = useState('');
  const [declineReason, setDeclineReason] = useState('');

  async function load(live: () => boolean) {
    try {
      const [d, m] = await Promise.all([fetchMyDomains(), fetchMyChangeRequests()]);
      if (!live()) return;
      setDomains(d.domains);
      setMine(m);
      if (d.domains.length === 1) setDomainKey(d.domains[0].domain_key);
    } catch (e) {
      if (live()) setError(errorMessage(e, 'Could not load your change requests.'));
    }
    try {
      // Admin-only. A 403 means this viewer is not the decider, which is not an error.
      const all = await fetchAllChangeRequests();
      if (live()) setQueue(all);
    } catch {
      if (live()) setQueue(null);
    }
    if (live()) setLoading(false);
  }

  useEffect(() => {
    let alive = true;
    void load(() => alive);
    return () => { alive = false; };
  }, []);

  async function onFile(e: React.FormEvent) {
    e.preventDefault();
    setFileProblem('');
    setFiled('');
    setFiling(true);
    try {
      const created = await fileChangeRequest({
        domain_key: domainKey,
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      setMine((prev) => [created, ...prev]);
      setTitle('');
      setDescription('');
      setFiled('Filed. Nothing is built yet — somebody will read it and decide.');
    } catch (err) {
      // The form stays filled so a one-character fix does not mean retyping it.
      setFileProblem(errorMessage(err, 'Could not file that request.'));
    } finally {
      setFiling(false);
    }
  }

  async function onDecide(id: string, decision: 'approved' | 'declined', reason?: string) {
    setDecideProblem('');
    setBusyId(id);
    try {
      const updated = await decideChangeRequest(id, decision, reason);
      const swap = (rows: ChangeRequest[]) => rows.map((r) => (r.id === id ? updated : r));
      setQueue((q) => (q ? swap(q) : q));
      setMine(swap);
      setDeclineFor('');
      setDeclineReason('');
    } catch (err) {
      setDecideProblem(errorMessage(err, 'Could not record that decision.'));
    } finally {
      setBusyId('');
    }
  }

  return (
    <>
      <PageHeader title="Change Requests" />

      {loading && (
        <SectionCard>
          <div className="d-flex align-items-center gap-2 text-muted small">
            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
            Loading change requests…
          </div>
        </SectionCard>
      )}

      {/* A failure says so, and is never rendered as an empty state. */}
      {!loading && error && (
        <SectionCard>
          <div className="alert alert-danger mb-0" role="alert">
            <div className="fw-semibold">Could not load change requests</div>
            <div className="small">{error}</div>
          </div>
        </SectionCard>
      )}

      {!loading && !error && (
        <>
          <SectionCard title="Ask for a change">
            {domains.length === 0 ? (
              <p className="text-muted small mb-0">
                A change request is filed against a domain you own, and no domain is assigned to you
                yet. Ask Kes, then come back.
              </p>
            ) : (
              <form onSubmit={onFile}>
                <p className="text-muted small">
                  Describe what you need changed and why. An approval records a decision; it does
                  not start the work.
                </p>
                <div className="mb-3">
                  <label className="form-label small fw-medium" htmlFor="cr-domain">Domain</label>
                  <select
                    id="cr-domain"
                    className="form-select form-select-sm"
                    style={{ maxWidth: 360 }}
                    value={domainKey}
                    onChange={(e) => setDomainKey(e.target.value)}
                    required
                  >
                    <option value="">Choose a domain…</option>
                    {domains.map((d) => (
                      <option key={d.domain_key} value={d.domain_key}>{d.domain_key}</option>
                    ))}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label small fw-medium" htmlFor="cr-title">What should change</label>
                  <input
                    id="cr-title"
                    className="form-control form-control-sm"
                    maxLength={CHANGE_REQUEST_TITLE_MAX}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                  <div className="form-text">{title.length} of {CHANGE_REQUEST_TITLE_MAX}</div>
                </div>
                <div className="mb-3">
                  <label className="form-label small fw-medium" htmlFor="cr-desc">Why, and anything a reviewer needs</label>
                  <textarea
                    id="cr-desc"
                    className="form-control form-control-sm"
                    rows={4}
                    maxLength={CHANGE_REQUEST_DESCRIPTION_MAX}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                {fileProblem && (
                  <div className="alert alert-danger small" role="alert">{fileProblem}</div>
                )}
                {filed && <div className="alert alert-success small" role="alert">{filed}</div>}
                <button className="btn btn-primary btn-sm" type="submit" disabled={filing || !domainKey}>
                  {filing ? 'Filing…' : 'File this request'}
                </button>
              </form>
            )}
          </SectionCard>

          <SectionCard title="Your requests">
            {mine.length === 0 ? (
              <p className="text-muted small mb-0">You have not filed any yet.</p>
            ) : (
              mine.map((r) => <RequestRow key={r.id} r={r} />)
            )}
          </SectionCard>

          {/* Rendered only when the API returned the queue, which means this viewer may decide. */}
          {queue !== null && (
            <SectionCard title="Decide">
              <p className="text-muted small">
                Approving records that you approved it, and when. It does not start any work.
              </p>
              {decideProblem && (
                <div className="alert alert-danger small" role="alert">{decideProblem}</div>
              )}
              {queue.filter((r) => r.status === 'submitted').length === 0 ? (
                <p className="text-muted small mb-0">Nothing is waiting on a decision.</p>
              ) : (
                queue.filter((r) => r.status === 'submitted').map((r) => (
                  <RequestRow key={r.id} r={r}>
                    <div className="d-flex flex-column gap-2" style={{ minWidth: 220 }}>
                      <div className="d-flex gap-2">
                        <button
                          className="btn btn-success btn-sm"
                          disabled={busyId === r.id}
                          onClick={() => onDecide(r.id, 'approved')}
                        >
                          Approve
                        </button>
                        <button
                          className="btn btn-outline-secondary btn-sm"
                          disabled={busyId === r.id}
                          onClick={() => setDeclineFor(declineFor === r.id ? '' : r.id)}
                        >
                          Decline
                        </button>
                      </div>
                      {declineFor === r.id && (
                        <div>
                          <textarea
                            className="form-control form-control-sm"
                            rows={2}
                            maxLength={DECLINED_REASON_MAX}
                            placeholder="Why, in words they can read"
                            value={declineReason}
                            onChange={(e) => setDeclineReason(e.target.value)}
                          />
                          <button
                            className="btn btn-outline-danger btn-sm mt-2"
                            disabled={busyId === r.id || !declineReason.trim()}
                            onClick={() => onDecide(r.id, 'declined', declineReason.trim())}
                          >
                            Record decline
                          </button>
                        </div>
                      )}
                    </div>
                  </RequestRow>
                ))
              )}
            </SectionCard>
          )}
        </>
      )}
    </>
  );
}
