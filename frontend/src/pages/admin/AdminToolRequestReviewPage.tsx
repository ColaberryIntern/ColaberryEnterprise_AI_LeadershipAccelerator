import React, { useCallback, useEffect, useState } from 'react';
import { EmptyState, PageHeader, SectionCard } from '../../components/admin/shell';
import DecisionHistory from '../../components/admin/toolReview/DecisionHistory';
import DecisionPanel from '../../components/admin/toolReview/DecisionPanel';
import DuplicateCandidatesPanel from '../../components/admin/toolReview/DuplicateCandidatesPanel';
import ToolRequestFacts from '../../components/admin/toolReview/ToolRequestFacts';
import {
  errorMessage,
  fetchAllChangeRequests,
  type ChangeRequest,
} from '../../services/agentDomainApi';
import {
  decideToolRequest,
  decisionRefusals,
  fetchToolRequestDecisions,
  type DecisionIssue,
  type ProposedToolRequestDecision,
  type ToolRequestDecision,
} from '../../services/toolRequestReviewApi';

/**
 * AF11.3 — "Tool Requests". The screen on which a tool request is actually read and settled.
 *
 * Ali, 3 Nov 2026: *"I should have the ability to review, approve, deny or grant access to their
 * agent the tool."*
 *
 * ## Why a page of its own rather than more rows on Change Requests
 *
 * A tool grant is the moment an agent stops observing and starts acting, and 255 of 257 agents are
 * deliberately held at observe. The six field groups, the duplicate candidates and four verbs do
 * not fit in a queue row, and the one thing this screen must not become is a list where a grant is
 * settled from a title. `/admin/change-requests` keeps the approve/decline queue it was built for.
 *
 * ## Nothing on this page grants anything
 *
 * `assign_existing_tool` records an INTENT; AF11.4 performs the grant against
 * `ai_agents.tools_granted`. There is no autonomy control on this screen at all, because a console
 * that grants a tool and lifts an autonomy level in one action means nobody separately decided the
 * agent may act more freely. `toolRequestDecisionGrantsNothing.test.ts` asserts that by name
 * against the backend, and this page has no call that could reach those columns.
 *
 * ## A 403 is not an error here
 *
 * The queue is admin-only at the API. A non-admin who reaches this route sees "not for you" rather
 * than a red failure, for the same reason `AdminChangeRequestsPage` does it: asking the server
 * beats guessing from a client-side role, so the page cannot drift out of agreement with
 * `requireAdmin`.
 */

function when(iso: string | null): string {
  if (!iso) return '';
  return `${new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT`;
}

const STATUS_BADGE: Record<ChangeRequest['status'], string> = {
  submitted: 'bg-warning text-dark',
  approved: 'bg-success',
  declined: 'bg-secondary',
  withdrawn: 'bg-light text-dark',
};

export default function AdminToolRequestReviewPage() {
  const [queue, setQueue] = useState<ChangeRequest[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedId, setSelectedId] = useState('');
  const [decisions, setDecisions] = useState<ToolRequestDecision[]>([]);
  const [historyProblem, setHistoryProblem] = useState('');

  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<DecisionIssue[]>([]);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const all = await fetchAllChangeRequests();
        if (!alive) return;
        // Only tool requests. A change request is decided the way it always was, and the four
        // verbs are refused on one by the server anyway.
        const tools = all.filter((r) => r.kind === 'tool');
        setQueue(tools);
        // Prefer the first undecided one, because that is the work. But fall back to the first
        // of any status rather than selecting nothing: a queue whose requests are all decided
        // would otherwise render a list beside "choose a request" and no way to read the record.
        const open = tools.find((r) => r.status === 'submitted') ?? tools[0];
        if (open) setSelectedId(open.id);
      } catch (e) {
        if (!alive) return;
        const status = (e as { response?: { status?: number } })?.response?.status;
        if (status === 403) setForbidden(true);
        else setError(errorMessage(e, 'Could not load the tool requests.'));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const loadHistory = useCallback(async (id: string) => {
    setHistoryProblem('');
    try {
      setDecisions(await fetchToolRequestDecisions(id));
    } catch (e) {
      // A history that failed to load is said so, never rendered as "nothing decided yet" — those
      // are different facts and one of them would hide a decision somebody made.
      setDecisions([]);
      setHistoryProblem(errorMessage(e, 'Could not load the decisions on this request.'));
    }
  }, []);

  useEffect(() => {
    if (!selectedId) { setDecisions([]); return; }
    setIssues([]);
    setProblem('');
    void loadHistory(selectedId);
  }, [selectedId, loadHistory]);

  const selected = (queue ?? []).find((r) => r.id === selectedId) ?? null;

  async function onDecide(proposed: ProposedToolRequestDecision) {
    if (!selected) return;
    setIssues([]);
    setProblem('');
    setBusy(true);
    try {
      const recorded = await decideToolRequest(selected.id, proposed);
      // The server owns what the verb did to the request's status — `send_back` leaves it
      // `submitted` on purpose — so take its answer rather than computing one here.
      setQueue((q) => (q ? q.map((r) => (
        r.id === recorded.change_request_id
          ? { ...r, status: recorded.request_status as ChangeRequest['status'] }
          : r
      )) : q));
      await loadHistory(selected.id);
    } catch (e) {
      setIssues(decisionRefusals(e));
      setProblem(errorMessage(e, 'Could not record that decision.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Tool Requests"
        subtitle="Read what is being asked for, see whether a tool already does it, and decide."
      />

      {loading && (
        <SectionCard>
          <div className="d-flex align-items-center gap-2 text-muted small">
            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
            Loading tool requests…
          </div>
        </SectionCard>
      )}

      {!loading && forbidden && (
        <SectionCard>
          <EmptyState
            icon="shield-keyhole-line"
            title="This queue is not for you"
            description="Settling a tool grant is admin-only. You can still file a tool request for your own agent from Change Requests."
          />
        </SectionCard>
      )}

      {!loading && !forbidden && error && (
        <SectionCard>
          <div className="alert alert-danger mb-0" role="alert">
            <div className="fw-semibold">Could not load tool requests</div>
            <div className="small">{error}</div>
          </div>
        </SectionCard>
      )}

      {!loading && !forbidden && !error && queue && queue.length === 0 && (
        <SectionCard>
          <EmptyState
            icon="tools-line"
            title="No tool requests"
            description="When a builder asks for a tool their agent does not have, it arrives here."
          />
        </SectionCard>
      )}

      {!loading && !forbidden && queue && queue.length > 0 && (
        <div className="row g-3">
          <div className="col-12 col-xl-4">
            <SectionCard title="The queue" subtitle={`${queue.length} tool request${queue.length === 1 ? '' : 's'}`}>
              <div className="list-group list-group-flush">
                {queue.map((r) => (
                  <button
                    type="button"
                    key={r.id}
                    className={`list-group-item list-group-item-action${r.id === selectedId ? ' active' : ''}`}
                    aria-current={r.id === selectedId}
                    onClick={() => setSelectedId(r.id)}
                  >
                    <div className="d-flex gap-2 align-items-start">
                      <span className={`badge ${r.id === selectedId ? 'bg-light text-dark' : STATUS_BADGE[r.status]}`}>
                        {r.status}
                      </span>
                      <span className="flex-grow-1 text-start">
                        <span className="d-block fw-semibold small">{r.title}</span>
                        <span className={`d-block small ${r.id === selectedId ? '' : 'text-muted'}`}>
                          {r.tool_request ? r.tool_request.tool_name : 'no details stored'}
                          {' · '}
                          {r.requested_by_identity}
                        </span>
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </SectionCard>
          </div>

          <div className="col-12 col-xl-8">
            {!selected && (
              <SectionCard>
                <div className="text-muted small">Choose a request from the queue.</div>
              </SectionCard>
            )}

            {selected && (
              <>
                <SectionCard
                  title={selected.title}
                  subtitle={`${selected.domain_key} · filed by ${selected.requested_by_identity}${selected.requested_at ? ` · ${when(selected.requested_at)}` : ''}`}
                >
                  {selected.tool_request ? (
                    <ToolRequestFacts detail={selected.tool_request} />
                  ) : (
                    <div className="alert alert-warning mb-0" role="alert">
                      This request is marked as a tool request but carries no details, so there is
                      nothing here to judge. Send it back rather than deciding it.
                    </div>
                  )}
                </SectionCard>

                <SectionCard
                  title="Does a tool already do this?"
                  subtitle="The duplicate check as it was computed when the request was filed"
                >
                  <DuplicateCandidatesPanel check={selected.duplicate_check ?? null} />
                </SectionCard>

                <SectionCard title="Your decision">
                  {/* KEYED ON THE REQUEST, so the panel remounts when the selection changes.
                      Without it the panel keeps its own verb and reason across requests: choose
                      one, type a denial reason, switch to another, and that reason is still in
                      the box ready to be recorded against a request it was never written about. */}
                  <DecisionPanel
                    key={selected.id}
                    check={selected.duplicate_check ?? null}
                    settled={selected.status !== 'submitted'}
                    busy={busy}
                    issues={issues}
                    problem={problem}
                    onDecide={onDecide}
                  />
                </SectionCard>

                <SectionCard title="What has already been decided">
                  {/* The error REPLACES the history rather than sitting above it. Rendering both
                      put "could not load" directly above "nothing has been decided yet", which
                      is the confusion the error exists to prevent: an empty history and a failed
                      read are different facts, and the second must not be readable as the first. */}
                  {historyProblem ? (
                    <div className="alert alert-danger small mb-0" role="alert">{historyProblem}</div>
                  ) : (
                    <DecisionHistory decisions={decisions} />
                  )}
                </SectionCard>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
