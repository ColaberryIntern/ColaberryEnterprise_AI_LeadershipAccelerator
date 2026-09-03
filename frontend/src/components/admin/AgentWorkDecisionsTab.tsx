import React, { useEffect, useState, useCallback } from 'react';
import { SectionCard, StatusBadge } from './shell';
import { timeAgo } from './shell/trust';
import { ManagerInboxItem, approveInboxItem, rejectInboxItem } from '../../services/managerInboxApi';
import { getAgentExplainability, AgentExplainability } from '../../services/agentExplainabilityApi';

// AI Agent Dashboard redesign, Checkpoint B (2026-09-02) — Work & Decisions:
// real pending approvals (with an honest real-executor-vs-decorative label,
// never implying a downstream write happens unless target_table is really
// 'scheduled_emails') and a Decision Journal built from
// agentExplainabilityService.ts's real ai_events/ProposedAgentAction rows —
// every line here is a recorded fact, never a generated narrative.
//
// Fields the original design brief asked for that have NO real backing
// today (blast radius, reversibility, expected result, a per-proposal
// "policy reason approval was required") are deliberately NOT fabricated —
// see the "not tracked today" notes below instead. ProposedAgentAction has
// no such columns; inventing prose for them would violate the same
// never-fabricate rule this whole mission has followed throughout.

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

export default function AgentWorkDecisionsTab({ agentId, inboxItems, inboxLoading, inboxError, onInboxChanged }: Props) {
  const [explainability, setExplainability] = useState<AgentExplainability | null>(null);
  const [journalLoading, setJournalLoading] = useState(true);
  const [journalError, setJournalError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);

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

  return (
    <>
      <SectionCard
        title="Pending Approvals"
        icon="list-check-3"
        subtitle="Before you approve anything, this shows exactly what will (and won't) happen."
        padded={false}
      >
        {inboxLoading && (
          <div className="p-3 text-muted small">
            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
            Loading pending approvals…
          </div>
        )}
        {inboxError && (
          <div className="p-3">
            <div className="alert alert-warning py-2 mb-0 small">Could not load pending approvals: {inboxError}</div>
          </div>
        )}
        {decisionError && (
          <div className="p-3 pb-0">
            <div className="alert alert-danger py-2 mb-0 small">{decisionError}</div>
          </div>
        )}
        {!inboxLoading && !inboxError && inboxItems.length === 0 && (
          <p className="text-muted small text-center py-4 mb-0">No approvals waiting for review right now.</p>
        )}
        {!inboxLoading && !inboxError && inboxItems.map((item, i) => {
          const hasRealExecutor = item.targetTable !== null && REAL_EXECUTOR_TARGET_TABLES.has(item.targetTable);
          return (
            <div key={item.id} className={`p-3 ${i < inboxItems.length - 1 ? 'border-bottom' : ''}`}>
              <div className="d-flex align-items-start justify-content-between gap-2 flex-wrap mb-2">
                <div>
                  <StatusBadge label="Pending" tone="warning" />
                  <strong className="ms-2">{item.actionType}</strong>
                </div>
                {hasRealExecutor ? (
                  <StatusBadge label="Real executor wired" tone="success" icon="check-double-line" />
                ) : (
                  <StatusBadge label="No real executor yet" tone="warning" icon="alert-line" />
                )}
              </div>
              <dl className="row small mb-2">
                <dt className="col-sm-3">Business object</dt>
                <dd className="col-sm-9">{item.targetTable ? `${item.targetTable} (${item.targetId})` : 'Not tracked on this proposal'}</dd>
                <dt className="col-sm-3">Reason given</dt>
                <dd className="col-sm-9">{item.reason}</dd>
                <dt className="col-sm-3">Confidence</dt>
                <dd className="col-sm-9">{item.confidence}</dd>
                <dt className="col-sm-3">Risk / impact / priority score</dt>
                <dd className="col-sm-9">{item.riskScore ?? '—'} / {item.impactScore ?? '—'} / {item.priorityScore ?? '—'}</dd>
                <dt className="col-sm-3">Expires</dt>
                <dd className="col-sm-9">{item.expiresAt ? timeAgo(item.expiresAt) : 'No expiration set'}</dd>
                <dt className="col-sm-3">Blast radius / reversibility / expected result</dt>
                <dd className="col-sm-9 text-muted">Not tracked on this proposal today</dd>
              </dl>
              {hasRealExecutor ? (
                <div className="alert alert-success py-2 small mb-2">
                  <i className="ri-check-line" aria-hidden="true" /> If you approve, the {item.targetTable} record is updated immediately and automatically — a real, tested executor path.
                </div>
              ) : (
                <div className="alert alert-warning py-2 small mb-2">
                  <i className="ri-error-warning-line" aria-hidden="true" /> If you approve, only the decision status changes. This proposal type has no automatic downstream executor today.
                </div>
              )}
              <div className="d-flex gap-2">
                <button className="btn btn-primary btn-sm" disabled={decidingId === item.id} onClick={() => handleApprove(item.id)}>
                  {decidingId === item.id ? 'Working…' : 'Approve'}
                </button>
                <button className="btn btn-outline-danger btn-sm" disabled={decidingId === item.id} onClick={() => handleReject(item.id)}>
                  Reject
                </button>
              </div>
            </div>
          );
        })}
      </SectionCard>

      <SectionCard
        title="Decision Journal"
        icon="file-list-3-line"
        subtitle="Real recorded facts — business rationale and policy evidence, never a generated narrative or hidden reasoning trace."
        padded={false}
      >
        {journalLoading && (
          <div className="p-3 text-muted small">
            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
            Loading the decision journal…
          </div>
        )}
        {journalError && (
          <div className="p-3">
            <div className="alert alert-warning py-2 mb-0 small">Could not load the decision journal: {journalError}</div>
          </div>
        )}
        {!journalLoading && !journalError && explainability && explainability.events.length === 0 && explainability.proposedActions.length === 0 && (
          <p className="text-muted small text-center py-4 mb-0">No events or proposals recorded for this agent yet.</p>
        )}
        {!journalLoading && !journalError && explainability && (explainability.events.length > 0 || explainability.proposedActions.length > 0) && (
          <ul className="list-unstyled mb-0">
            {explainability.events.map((event, i) => (
              <li key={`e${i}`} className="d-flex gap-3 p-3 border-bottom small">
                <span className="text-muted flex-shrink-0" style={{ minWidth: '5.5rem', fontFamily: 'monospace', fontSize: '0.72rem' }}>{timeAgo(event.createdAt)}</span>
                <div style={{ minWidth: 0 }}>
                  {event.authorization ? (
                    <>
                      <StatusBadge label={event.authorization.verdict} tone={event.authorization.verdict === 'block' ? 'danger' : event.authorization.verdict === 'approval' ? 'warning' : 'success'} />
                      <span className="ms-2">{shadowEnforceLine(event.authorization)}</span>
                    </>
                  ) : (
                    <>
                      <StatusBadge label={event.outcome} tone={event.outcome === 'success' ? 'success' : event.outcome === 'failure' ? 'danger' : 'neutral'} />
                      <span className="ms-2 text-muted">{event.eventType}{event.model ? ` · ${event.model}` : ''}{event.costUsd !== null ? ` · $${event.costUsd.toFixed(4)}` : ''}{event.durationMs !== null ? ` · ${event.durationMs}ms` : ''}</span>
                    </>
                  )}
                </div>
              </li>
            ))}
            {explainability.proposedActions.map((action, i) => (
              <li key={`p${i}`} className="d-flex gap-3 p-3 border-bottom small">
                <span className="text-muted flex-shrink-0" style={{ minWidth: '5.5rem', fontFamily: 'monospace', fontSize: '0.72rem' }}>{timeAgo(action.createdAt)}</span>
                <div style={{ minWidth: 0 }}>
                  <StatusBadge label={action.status} tone={action.status === 'approved' || action.status === 'applied' ? 'success' : action.status === 'rejected' ? 'danger' : 'warning'} />
                  <span className="ms-2">{action.actionType} — "{action.reason}" (confidence {action.confidence})</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
