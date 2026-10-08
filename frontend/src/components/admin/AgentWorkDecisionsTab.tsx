import React, { useEffect, useState, useCallback } from 'react';
import { timeAgo } from './shell/trust';
import { adv2PillClass } from './agentDetailV2/adv2PillTone';
import { ManagerInboxItem, approveInboxItem, rejectInboxItem, getInboxItemInspector, InboxItemInspector } from '../../services/managerInboxApi';
import { getAgentExplainability, AgentExplainability } from '../../services/agentExplainabilityApi';

// AI Agent Dashboard redesign, Checkpoint B (2026-09-02) — Work & Decisions:
// real pending approvals (with an honest real-executor-vs-decorative label,
// never implying a downstream write happens unless target_table is really
// 'scheduled_emails') and a Decision Journal built from
// agentExplainabilityService.ts's real ai_events/ProposedAgentAction rows —
// every line here is a recorded fact, never a generated narrative.
//
// Dashboard redesign, Slice 2c (2026-09-20) — blast radius / reversibility /
// expected result ARE now tracked, computed on demand via
// proposedActionInspectorFields.ts + the new inspector endpoint (a "View
// details" toggle below, not fetched for every item up front — reversibility
// needs one real live DB read per proposal, so it's fetched only for the
// one item a manager actually opens). A per-proposal "policy reason
// approval was required" still has no real backing anywhere and is still
// deliberately NOT fabricated.
//
// Agent Detail redesign, Track E (2026-09-28) — reflowed to this page's
// adv2-* visual language, and the flat inspector <dl> became a real
// 4-quadrant card grid matching Ali's mockup (reusing .adv2-io-grid, already
// proven elsewhere). Honestly filled per this run's own execution-contract.md:
// quadrants 3-4 (why / what happened) are real, unchanged data; quadrants 1-2
// (what started this / what Reese knows) have no real backing anywhere in
// this codebase, so they disclose that plainly rather than inventing a
// trigger or a "known facts" narrative — quadrant 2 shows the real
// confidence/risk/impact/priority scores instead, honestly labeled as
// scores, not narrated as facts. The Decision Journal is NOT forced into
// this shape — ExplainabilityProposedAction (agentExplainabilityApi.ts) has
// no `id` field, so a historical journal entry has no real inspector data to
// show even if it were structured as a quadrant grid. Zero change to any
// fetch/cache/approve/reject logic below — only what renders once data
// arrives.
//
// Decision Journal enrichment (2026-10-03) — a third card, "Approval
// Requests," surfaces this agent's own approval_requests rows (the real
// human-review lifecycle for its authorization-gated sends — status, who
// decided, when, how), now that the FK bug blocking that table is fixed and
// the real approve/reject/replay pipeline is live. Deliberately NAMED
// differently from "Pending Approvals" above — that section is the separate
// ProposedAgentAction/manager-inbox queue; this one is Reese's own
// ticket-dispatch authorization history. Read-only: a still-pending row links
// out to the real /admin/approval-requests page to act on it rather than
// duplicating that page's approve/reject logic here. `approvalRequests` is
// optional on AgentExplainability (so existing consumers/fixtures of that
// type stay valid) — every read below treats a missing value as empty.

interface Props {
  agentId: string;
  inboxItems: ManagerInboxItem[];
  inboxLoading: boolean;
  inboxError: string | null;
  onInboxChanged: () => void;
}

const REAL_EXECUTOR_TARGET_TABLES = new Set(['scheduled_emails']);

function shadowEnforceLine(authorization: { verdict: string; reason: string; mode: string; enforced: boolean }): string {
  const enforcement = authorization.mode === 'enforce' ? 'enforce' : 'observation only (shadow)';
  const actualResult = authorization.enforced
    ? (authorization.verdict === 'block' ? 'blocked' : authorization.verdict === 'approval' ? 'queued for approval' : 'allowed')
    : 'continued regardless of the verdict';
  return `Policy result: ${authorization.verdict}. Enforcement: ${enforcement}. Actual result: ${actualResult}.`;
}

// Decision Journal enrichment (2026-10-03) — approval_requests' own real status
// vocabulary, mapped to this page's existing pill tones (adv2PillClass).
function approvalRequestStatusTone(status: string): 'warning' | 'success' | 'danger' | 'neutral' {
  if (status === 'pending') return 'warning';
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'danger';
  return 'neutral'; // expired, shadow_logged
}

export default function AgentWorkDecisionsTab({ agentId, inboxItems, inboxLoading, inboxError, onInboxChanged }: Props) {
  const [explainability, setExplainability] = useState<AgentExplainability | null>(null);
  const [journalLoading, setJournalLoading] = useState(true);
  const [journalError, setJournalError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [inspectorById, setInspectorById] = useState<Record<string, InboxItemInspector>>({});
  const [inspectorLoadingId, setInspectorLoadingId] = useState<string | null>(null);
  const [inspectorErrorId, setInspectorErrorId] = useState<string | null>(null);

  const fetchJournal = useCallback(async () => {
    setJournalLoading(true);
    setJournalError(null);
    try {
      const result = await getAgentExplainability(agentId);
      setExplainability(result);
    } catch (err: any) {
      setJournalError(err?.response?.data?.error || 'Failed to load the decision journal');
    } finally {
      setJournalLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetchJournal();
  }, [fetchJournal]);

  const handleApprove = useCallback(async (proposalId: string) => {
    setDecidingId(proposalId);
    setDecisionError(null);
    try {
      await approveInboxItem(agentId, proposalId);
      onInboxChanged();
      await fetchJournal();
    } catch (err: any) {
      setDecisionError(err?.response?.data?.error || 'Failed to approve this proposal');
    } finally {
      setDecidingId(null);
    }
  }, [agentId, onInboxChanged, fetchJournal]);

  const handleReject = useCallback(async (proposalId: string) => {
    setDecidingId(proposalId);
    setDecisionError(null);
    try {
      await rejectInboxItem(agentId, proposalId);
      onInboxChanged();
      await fetchJournal();
    } catch (err: any) {
      setDecisionError(err?.response?.data?.error || 'Failed to reject this proposal');
    } finally {
      setDecidingId(null);
    }
  }, [agentId, onInboxChanged, fetchJournal]);

  // Dashboard redesign, Slice 2c — fetches only once per proposal id
  // (cached in inspectorById), only when a manager actually opens it.
  const handleToggleDetails = useCallback(async (proposalId: string) => {
    if (expandedId === proposalId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(proposalId);
    if (inspectorById[proposalId]) return;
    setInspectorLoadingId(proposalId);
    setInspectorErrorId(null);
    try {
      const data = await getInboxItemInspector(agentId, proposalId);
      setInspectorById((prev) => ({ ...prev, [proposalId]: data }));
    } catch {
      setInspectorErrorId(proposalId);
    } finally {
      setInspectorLoadingId(null);
    }
  }, [agentId, expandedId, inspectorById]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div className="adv2-card">
        <h2>
          Pending Approvals
          <span className="adv2-hint">Before you approve anything, this shows exactly what will (and won't) happen.</span>
        </h2>
        {inboxLoading && <p className="adv2-body adv2-muted">Loading pending approvals…</p>}
        {inboxError && <p className="adv2-body" style={{ color: 'var(--adv2-warn)' }}>Could not load pending approvals: {inboxError}</p>}
        {decisionError && <p className="adv2-body" style={{ color: 'var(--adv2-bad)' }}>{decisionError}</p>}
        {!inboxLoading && !inboxError && inboxItems.length === 0 && (
          <p className="adv2-body adv2-muted">No approvals waiting for review right now.</p>
        )}
        {!inboxLoading && !inboxError && inboxItems.map((item) => {
          const hasRealExecutor = item.targetTable !== null && REAL_EXECUTOR_TARGET_TABLES.has(item.targetTable);
          return (
            <div key={item.id} className="adv2-task">
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  <div>
                    <span className={adv2PillClass('warning')}>Pending</span>
                    <strong style={{ marginLeft: 8 }}>{item.actionType}</strong>
                  </div>
                  <span className={adv2PillClass(hasRealExecutor ? 'success' : 'warning')}>
                    {hasRealExecutor ? 'Real executor wired' : 'No real executor yet'}
                  </span>
                </div>
                <dl className="adv2-rows">
                  <dt>Business object</dt>
                  <dd>{item.targetTable ? `${item.targetTable} (${item.targetId})` : 'Not tracked on this proposal'}</dd>
                  <dt>Reason given</dt>
                  <dd>{item.reason}</dd>
                  <dt>Confidence</dt>
                  <dd>{item.confidence}</dd>
                  <dt>Risk / impact / priority score</dt>
                  <dd>{item.riskScore ?? '—'} / {item.impactScore ?? '—'} / {item.priorityScore ?? '—'}</dd>
                  <dt>Expires</dt>
                  <dd>{item.expiresAt ? timeAgo(item.expiresAt) : 'No expiration set'}</dd>
                </dl>
                <button type="button" className="adv2-btn" style={{ marginTop: 12 }} onClick={() => handleToggleDetails(item.id)}>
                  {expandedId === item.id ? 'Hide details' : 'View details'}
                </button>
                {expandedId === item.id && (
                  <div style={{ marginTop: 14 }}>
                    {inspectorLoadingId === item.id && <p className="adv2-muted">Loading…</p>}
                    {inspectorErrorId === item.id && <p style={{ color: 'var(--adv2-warn)' }}>Could not load these details.</p>}
                    {inspectorById[item.id] && (
                      <div className="adv2-io-grid">
                        <div className="adv2-card">
                          <div className="adv2-body">
                            <h3><span className="adv2-number">1</span>What started this?</h3>
                            <p className="adv2-muted">Not tracked — this codebase does not record what triggered this proposal.</p>
                            <p className="adv2-muted">{item.targetTable ? `Business object: ${item.targetTable} (${item.targetId})` : 'No business object recorded on this proposal.'}</p>
                          </div>
                        </div>
                        <div className="adv2-card">
                          <div className="adv2-body">
                            <h3><span className="adv2-number">2</span>What does Reese know?</h3>
                            <p className="adv2-muted">Not tracked as a facts list — the real structured signals behind this proposal:</p>
                            <p className="adv2-muted">Confidence {item.confidence} · Risk {item.riskScore ?? '—'} · Impact {item.impactScore ?? '—'} · Priority {item.priorityScore ?? '—'}</p>
                          </div>
                        </div>
                        <div className="adv2-card">
                          <div className="adv2-body">
                            <h3><span className="adv2-number">3</span>Why this next step?</h3>
                            <p className="adv2-muted">{item.reason}</p>
                            <p className="adv2-evidence"><strong>Blast radius:</strong> {inspectorById[item.id].blastRadius}<br /><strong>Reversibility:</strong> {inspectorById[item.id].reversibility}</p>
                          </div>
                        </div>
                        <div className="adv2-card">
                          <div className="adv2-body">
                            <h3><span className="adv2-number">4</span>What actually happened?</h3>
                            <p className="adv2-muted">Expected outcome if approved (this proposal is still pending — nothing has happened yet):</p>
                            <p className="adv2-evidence">{inspectorById[item.id].expectedResult}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {hasRealExecutor ? (
                  <p className="adv2-evidence" style={{ color: 'var(--adv2-ok)', marginTop: 12 }}>
                    If you approve, the {item.targetTable} record is updated immediately and automatically — a real, tested executor path.
                  </p>
                ) : (
                  <p className="adv2-evidence" style={{ color: 'var(--adv2-warn)', marginTop: 12 }}>
                    If you approve, only the decision status changes. This proposal type has no automatic downstream executor today.
                  </p>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="adv2-btn adv2-primary" disabled={decidingId === item.id} onClick={() => handleApprove(item.id)}>
                    {decidingId === item.id ? 'Working…' : 'Approve'}
                  </button>
                  <button className="adv2-btn adv2-danger" disabled={decidingId === item.id} onClick={() => handleReject(item.id)}>
                    Reject
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="adv2-card">
        <h2>
          Decision Journal
          <span className="adv2-hint">A chronological log of Reese's own automated checks and proposals across all of her work — not specific to any one ticket. Every line is a real recorded fact, never a generated narrative or hidden reasoning trace.</span>
        </h2>
        {journalLoading && <p className="adv2-body adv2-muted">Loading the decision journal…</p>}
        {journalError && <p className="adv2-body" style={{ color: 'var(--adv2-warn)' }}>Could not load the decision journal: {journalError}</p>}
        {!journalLoading && !journalError && explainability && explainability.events.length === 0 && explainability.proposedActions.length === 0 && (
          <p className="adv2-body adv2-muted">No events or proposals recorded for this agent yet.</p>
        )}
        {!journalLoading && !journalError && explainability && (explainability.events.length > 0 || explainability.proposedActions.length > 0) && (
          <div>
            {explainability.events.map((event, i) => (
              <div key={`e${i}`} className="adv2-body" style={{ display: 'flex', gap: 12, borderTop: i === 0 ? undefined : '1px solid var(--adv2-rule)' }}>
                <span className="adv2-mono adv2-muted" style={{ flex: 'none', minWidth: 88, fontSize: 12.5 }}>{timeAgo(event.createdAt)}</span>
                <div style={{ minWidth: 0 }}>
                  {event.authorization ? (
                    <>
                      <span className="adv2-pill adv2-neutral" style={{ marginRight: 8 }}>Authorization check</span>
                      <span className={adv2PillClass(event.authorization.verdict === 'block' ? 'danger' : event.authorization.verdict === 'approval' ? 'warning' : 'success')}>{event.authorization.verdict}</span>
                      <span style={{ marginLeft: 8 }}>{shadowEnforceLine(event.authorization)}</span>
                    </>
                  ) : (
                    <>
                      <span className="adv2-pill adv2-neutral" style={{ marginRight: 8 }}>System event</span>
                      <span className={adv2PillClass(event.outcome === 'success' ? 'success' : event.outcome === 'failure' ? 'danger' : 'neutral')}>{event.outcome}</span>
                      <span className="adv2-muted" style={{ marginLeft: 8 }}>{event.eventType}{event.model ? ` · ${event.model}` : ''}{event.costUsd !== null ? ` · $${event.costUsd.toFixed(4)}` : ''}{event.durationMs !== null ? ` · ${event.durationMs}ms` : ''}</span>
                    </>
                  )}
                </div>
              </div>
            ))}
            {explainability.proposedActions.map((action, i) => (
              <div key={`p${i}`} className="adv2-body" style={{ display: 'flex', gap: 12, borderTop: '1px solid var(--adv2-rule)' }}>
                <span className="adv2-mono adv2-muted" style={{ flex: 'none', minWidth: 88, fontSize: 12.5 }}>{timeAgo(action.createdAt)}</span>
                <div style={{ minWidth: 0 }}>
                  <span className="adv2-pill adv2-neutral" style={{ marginRight: 8 }}>Proposal outcome</span>
                  <span className={adv2PillClass(action.status === 'approved' || action.status === 'applied' ? 'success' : action.status === 'rejected' ? 'danger' : 'warning')}>{action.status}</span>
                  <span style={{ marginLeft: 8 }}>{action.actionType} — "{action.reason}" (confidence {action.confidence})</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="adv2-card">
        <h2>
          Approval Requests
          <span className="adv2-hint">Reese's own ticket-dispatch authorization history — what happened when one of her sends was held for human review. Separate from "Pending Approvals" above (that's the general proposal inbox).</span>
        </h2>
        {journalLoading && <p className="adv2-body adv2-muted">Loading approval requests…</p>}
        {journalError && <p className="adv2-body" style={{ color: 'var(--adv2-warn)' }}>Could not load approval requests: {journalError}</p>}
        {!journalLoading && !journalError && (!explainability || (explainability.approvalRequests ?? []).length === 0) && (
          <p className="adv2-body adv2-muted">No approval requests recorded for this agent yet.</p>
        )}
        {!journalLoading && !journalError && explainability && (explainability.approvalRequests ?? []).length > 0 && (
          <div>
            {(explainability.approvalRequests ?? []).map((ar, i) => (
              <div key={`a${i}`} className="adv2-body" style={{ display: 'flex', gap: 12, borderTop: i === 0 ? undefined : '1px solid var(--adv2-rule)' }}>
                <span className="adv2-mono adv2-muted" style={{ flex: 'none', minWidth: 88, fontSize: 12.5 }}>{timeAgo(ar.createdAt)}</span>
                <div style={{ minWidth: 0 }}>
                  <span className={adv2PillClass(approvalRequestStatusTone(ar.status))} style={{ marginRight: 8 }}>{ar.status}</span>
                  <strong>{ar.action}</strong>
                  <span className="adv2-muted" style={{ marginLeft: 8 }}>
                    {ar.verdict} · risk {ar.riskTier}{ar.autonomyLevel ? ` · ${ar.autonomyLevel}` : ''}{ar.reasonCode ? ` · ${ar.reasonCode}` : ''}
                  </span>
                  <div className="adv2-muted" style={{ marginTop: 4 }}>
                    {ar.decidedBy ? (
                      <>Decided by {ar.decidedBy} via {ar.decisionChannel ?? 'unknown channel'} {timeAgo(ar.decidedAt!)}{ar.replayedAt ? ' · replayed' : ''}</>
                    ) : ar.expiresAt ? (
                      <>Awaiting review — expires {timeAgo(ar.expiresAt)}. <a href="/admin/approval-requests">Review in Approval Requests</a></>
                    ) : (
                      <>No review recorded.</>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
