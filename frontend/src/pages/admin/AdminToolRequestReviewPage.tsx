import React, { useCallback, useEffect, useState } from 'react';
import { EmptyState, PageHeader, SectionCard } from '../../components/admin/shell';
import DecisionHistory from '../../components/admin/toolReview/DecisionHistory';
import DecisionPanel from '../../components/admin/toolReview/DecisionPanel';
import GrantOutcomePanel from '../../components/admin/toolReview/GrantOutcomePanel';
import DuplicateCandidatesPanel from '../../components/admin/toolReview/DuplicateCandidatesPanel';
import ToolRequestFacts from '../../components/admin/toolReview/ToolRequestFacts';
import DecideOverview from '../../components/admin/toolReview/DecideOverview';
import QueueCard from '../../components/admin/toolReview/QueueCard';
import TaskPanel from '../../components/admin/toolReview/TaskPanel';
import InstructionsInForce from '../../components/admin/toolReview/InstructionsInForce';
import AgentDashboardWalkthrough, { DECIDER_STEPS } from '../../components/admin/agentDashboard/AgentDashboardWalkthrough';
import ReportAProblem from './marketing/bugReport/ReportAProblem';
import { decideOrder } from '../../components/admin/toolReview/queueSignals';
import RequestPackage, { PackageBounced } from '../../components/admin/toolReview/RequestPackage';
import {
  errorMessage,
  fetchAgentDomainTasks,
  fetchAllChangeRequests,
  type ChangeRequest,
  type GroupedTask,
} from '../../services/agentDomainApi';
import {
  assignExistingTool,
  decideToolRequest,
  decisionRefusals,
  fetchToolRequestDecisions,
  refusalCode,
  type AssignExistingToolResult,
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
 * ## What this page grants, as of AF11.4, and what it still cannot
 *
 * Choosing `assign_existing_tool` now records the decision AND asks the server to carry it out,
 * in that order, as two calls. The second one sends NO BODY: the tool comes from the decision
 * just recorded, the agent and capability from the request the intern filed, and the approver
 * from the verified token, so this screen cannot grant a different tool from the one it shows.
 *
 * The order is load-bearing. The decision commits first, so a grant the server refuses — most
 * often an unconfirmed capability — leaves the decision on the record with a reason beside it
 * rather than erasing a decision somebody did make. `GrantOutcomePanel` says exactly that.
 *
 * There is still no autonomy control on this screen, and no way to enable an agent. A console
 * that granted a tool and lifted an autonomy level in one action would mean nobody separately
 * decided the agent may act more freely — so a grant here routinely ends with the agent holding
 * the tool and still unable to use it, which the outcome panel reports rather than hides.
 *
 * ## AF12.3 — the overview, and why the detail did not change
 *
 * Ali, 17 Nov 2026, looking at the OTHER screen: *"When the request comes in make sure I can see
 * an overview and click on it to get the highly formatted details... Conditional formatting,
 * icons, emojis, visuals etc to help me decide what the next step should be and allow me to add my
 * own input like it says in the desc instead of just approving like the old design."*
 *
 * The screenshot behind that sentence was `/admin/change-requests`, which does have only Approve
 * and Decline. The highly formatted detail he was asking for is this page and he had never seen
 * it, because nothing in the product linked here from the queue he was working out of. So the
 * detail below is unchanged on purpose and the work was on the way IN: a queue of plain text rows
 * became an overview with the three facts that decide whether to open a request at all, the five
 * verbs were taken off the other screen, and the two pages now point at each other.
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
  /**
   * AF12.1. Null until the task read answers, which is NOT the same as no tasks: `TaskPanel`
   * renders those two differently, because a failed lookup shown as "no task" would invite a
   * decision made without the siblings it needed.
   */
  const [tasks, setTasks] = useState<GroupedTask[] | null>(null);
  const [taskProblem, setTaskProblem] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedId, setSelectedId] = useState('');
  const [decisions, setDecisions] = useState<ToolRequestDecision[]>([]);
  const [historyProblem, setHistoryProblem] = useState('');

  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<DecisionIssue[]>([]);
  const [problem, setProblem] = useState('');

  // AF11.4. Kept separate from `issues`/`problem` above, which belong to the DECISION. A grant
  // that was refused after a decision that was recorded is two different outcomes at once, and
  // one set of error state could only have shown one of them.
  const [grant, setGrant] = useState<AssignExistingToolResult | null>(null);
  const [grantIssues, setGrantIssues] = useState<DecisionIssue[]>([]);
  const [grantCode, setGrantCode] = useState('');
  const [grantProblem, setGrantProblem] = useState('');

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

        // AF12.1. Its own try, and a failure here must not fail the page: the queue and the
        // detail are readable without the grouping, and losing the whole console because one
        // projection was unavailable would be a worse outcome than deciding one tool at a time.
        try {
          const t = await fetchAgentDomainTasks();
          if (alive) setTasks(t.tasks);
        } catch (e) {
          if (alive) {
            setTasks([]);
            setTaskProblem(errorMessage(e, 'Could not read which task these tools belong to.'));
          }
        }
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
    // Clear the grant outcome with the selection, for the same reason `DecisionPanel` is keyed on
    // the request id: a panel reading "granted send_email to Maya" left standing beside a
    // different request is a sentence about work that was never done on it.
    setGrant(null);
    setGrantIssues([]);
    setGrantCode('');
    setGrantProblem('');
    void loadHistory(selectedId);
  }, [selectedId, loadHistory]);

  const selected = (queue ?? []).find((r) => r.id === selectedId) ?? null;

  /**
   * Which task a request belongs to, found in the list already loaded rather than by asking the
   * server again with `?request_id=`.
   *
   * The endpoint accepts that parameter and this page deliberately does not use it: resolving the
   * siblings in a second call would let the panel disagree with the overview beside it, which is
   * exactly the kind of drift the grouping was centralised to prevent.
   */
  const taskOf = (id: string): GroupedTask | null =>
    (tasks ?? []).find((t) => t.tools.some((x) => x.request_id === id)) ?? null;

  /**
   * AF11.4 — carry out an assignment that has just been recorded.
   *
   * Its own function, and deliberately not inside the `try` that records the decision: a failure
   * here must not be reported as a failure to decide. The decision has committed by this point,
   * so the history below will show it either way, and the grant's own outcome is reported in its
   * own panel with its own sentences.
   */
  async function carryOutAssignment(id: string) {
    setGrant(null);
    setGrantIssues([]);
    setGrantCode('');
    setGrantProblem('');
    try {
      setGrant(await assignExistingTool(id));
    } catch (e) {
      setGrantIssues(decisionRefusals(e));
      setGrantCode(refusalCode(e));
      setGrantProblem(errorMessage(e, 'Could not carry out that assignment.'));
    }
  }

  async function onDecide(proposed: ProposedToolRequestDecision) {
    if (!selected) return;
    setIssues([]);
    setProblem('');
    setGrant(null);
    setGrantIssues([]);
    setGrantCode('');
    setGrantProblem('');
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
      // THE GRANT. Keyed on the verb the SERVER says it recorded, not on the one submitted: the
      // decision that actually landed is the one worth acting on, and reading it back is free.
      if (recorded.verb === 'assign_existing_tool') {
        await carryOutAssignment(selected.id);
      }
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
        <>
          {/* AF12.3 — THE OVERVIEW, above everything, because the first question is not
              "which request" but "how many of these can I act on at all". */}
          <SectionCard
            title="Where the queue stands"
            subtitle="What is waiting, what can actually be decided, and what each one needs next"
          >
            <DecideOverview requests={queue} tasks={tasks} />
          </SectionCard>

          {/* The decider's walkthrough. Five steps, pointing at real elements on this page. */}
          <AgentDashboardWalkthrough audience="decider" steps={DECIDER_STEPS} />

          <div className="row g-3">
          <div className="col-12 col-xl-4">
            <SectionCard
              title="The queue"
              subtitle={`${queue.length} tool request${queue.length === 1 ? '' : 's'}, oldest waiting first`}
            >
              {/* Oldest waiting first, settled after. The API returns newest first, which put the
                  request most needing a decision at the bottom of the page. */}
              <div data-testid="queue-cards">
                {[...queue].sort(decideOrder).map((r) => (
                  <QueueCard
                    key={r.id}
                    request={r}
                    task={taskOf(r.id)}
                    selected={r.id === selectedId}
                    onOpen={() => setSelectedId(r.id)}
                  />
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
                {/* AF11.8 — THE CASE, ABOVE THE FACTS.
                    The ten blocks are what you are being asked to decide; the six field groups
                    below are the specification of the thing. Reading the specification first is
                    how a decision gets made on whether the tool is well described rather than
                    on whether it is worth building. */}
                <SectionCard
                  title="The case for deciding this"
                  subtitle="The ten blocks an agent has to bring before it asks you for anything"
                >
                  {selected.readiness?.ready_for_a_human && selected.decision_package ? (
                    <RequestPackage pkg={selected.decision_package} />
                  ) : (
                    <PackageBounced readiness={selected.readiness ?? {
                      has_package: false,
                      ready_for_a_human: false,
                      bounced_blocks: [],
                      bounce_reasons: [],
                    }}
                    />
                  )}
                </SectionCard>

                {/* AF12.1 — THE TASK, before the specification of one tool.
                    Deciding tool 2 of 3 without seeing the other two is deciding blind, and this
                    is the only place it is visible before the decision rather than after it. */}
                <SectionCard
                  title="The task this tool is part of"
                  subtitle="A task often needs several tools, and they are decided together or they are decided blind"
                >
                  <TaskPanel
                    task={taskOf(selected.id)}
                    requestId={selected.id}
                    problem={taskProblem || undefined}
                  />
                </SectionCard>

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
                  {/* AF11.14's first screen. The instruction box below APPENDS to a log, so a
                      decider typing into it without seeing what is already recorded is adding to
                      rules they cannot read. The record has had an API since AF11.14 and nothing
                      has ever displayed it. */}
                  <InstructionsInForce
                    agentId={selected.tool_request?.agent_id ?? null}
                    capabilityId={selected.tool_request?.capability_id ?? null}
                  />

                  {/* KEYED ON THE REQUEST, so the panel remounts when the selection changes.
                      Without it the panel keeps its own verb and reason across requests: choose
                      one, type a denial reason, switch to another, and that reason is still in
                      the box ready to be recorded against a request it was never written about. */}
                  <DecisionPanel
                    key={selected.id}
                    options={selected.decision_package?.options ?? []}
                    check={selected.duplicate_check ?? null}
                    settled={selected.status !== 'submitted'}
                    busy={busy}
                    issues={issues}
                    problem={problem}
                    onDecide={onDecide}
                  />
                </SectionCard>

                {/* AF11.4. Rendered only once an assignment has actually been attempted, so an
                    untouched request does not carry a panel about a grant nobody asked for. */}
                {(grant || grantIssues.length > 0 || grantProblem) && (
                  <SectionCard
                    title="What the grant did"
                    subtitle="The write, and whether the agent can use the tool it now holds"
                  >
                    <GrantOutcomePanel
                      result={grant}
                      issues={grantIssues}
                      code={grantCode}
                      problem={grantProblem}
                    />
                  </SectionCard>
                )}

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

          {/* AF12.1 — the reporter, on the console as well as the hub. The person deciding hits a
              broken screen as often as the person filing, and a decision abandoned because a panel
              would not load is the kind of thing that never gets reported at all. */}
          <ReportAProblem
            brandLabel={selected?.domain_key ?? null}
            endpoint="/api/admin/agent-domain/bug-report"
            extra={{ area: 'tool-request-review', requestId: selectedId || null }}
          />
        </>
      )}
    </>
  );
}
