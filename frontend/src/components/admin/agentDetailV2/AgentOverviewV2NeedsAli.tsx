import React, { useCallback, useState } from 'react';
import { ManagerInboxItem, approveInboxItem, getInboxItemInspector, InboxItemInspector } from '../../../services/managerInboxApi';
import { SectionCard, StatusBadge } from '../shell';
import type { TabKey } from './AgentDetailV2Header';

// Dashboard redesign, Slice 2b (2026-09-19) — the mockup's "Needs Ali" card.
// Ali's own confirmed decision (Slice 1 STOP-AND-ASK): "Needs Ali" is
// ProposedAgentAction only, NOT ApprovalRequest (shadow-mode-only, never
// blocks anything today — folding it in would fabricate urgency that isn't
// real). Reuses the SAME inboxItems already fetched for the Decisions tab
// and At a Glance's tile — zero new fetch.
//
// Agent Detail polish round 5 (2026-09-30) — Ali, live: "Needs Ali section
// should make sure it has the functionality that you see in the screenshot."
// Adds an "Approval required" pill (real — every item shown here is, by
// construction, awaiting review), a "Why this action?" box (the real
// item.reason, already fetched), and 2 real per-item actions: "Review &
// decide" (the exact real approveInboxItem() already proven on the
// Decisions tab) and "See evidence" (the exact real getInboxItemInspector()
// 3-field inspector already proven on the Decisions tab, reused inline here
// rather than duplicated). Reject is reachable on the Decisions tab
// ("View all") — not duplicated here, keeping this card's own action
// surface to the one real decision path ("Review & decide" = approve) a
// manager most commonly takes from an at-a-glance summary.

interface Props {
  agentId: string;
  inboxItems: ManagerInboxItem[];
  inboxLoading: boolean;
  onInboxChanged: () => void;
  onNavigate: (tab: TabKey) => void;
}

const MAX_SHOWN = 3;

export default function AgentOverviewV2NeedsAli({ agentId, inboxItems, inboxLoading, onInboxChanged, onNavigate }: Props) {
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [inspectorById, setInspectorById] = useState<Record<string, InboxItemInspector>>({});
  const [inspectorLoadingId, setInspectorLoadingId] = useState<string | null>(null);
  const [inspectorErrorId, setInspectorErrorId] = useState<string | null>(null);

  const handleApprove = useCallback(async (proposalId: string) => {
    setDecidingId(proposalId);
    setDecisionError(null);
    try {
      await approveInboxItem(agentId, proposalId);
      onInboxChanged();
    } catch (err: any) {
      setDecisionError(err?.response?.data?.error || 'Failed to approve this proposal');
    } finally {
      setDecidingId(null);
    }
  }, [agentId, onInboxChanged]);

  const handleToggleEvidence = useCallback(async (proposalId: string) => {
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
    <SectionCard
      title="Needs Ali"
      icon="user-star-line"
      subtitle="Real proposals waiting for review — not decorative."
      actions={<button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => onNavigate('decisions')}>View all</button>}
      padded={false}
    >
      {inboxLoading && (
        <div className="p-3 text-muted small">
          <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
          Loading…
        </div>
      )}
      {decisionError && <div className="px-3 pt-3 small text-danger">{decisionError}</div>}
      {!inboxLoading && inboxItems.length === 0 && (
        <p className="text-muted small text-center py-4 mb-0">Nothing needs your attention right now.</p>
      )}
      {!inboxLoading && inboxItems.length > 0 && (
        <>
          <div className="px-3 pt-3 small text-muted">
            {inboxItems.length} item{inboxItems.length === 1 ? '' : 's'} need{inboxItems.length === 1 ? 's' : ''} your review
          </div>
          <ul className="list-unstyled mb-0">
            {inboxItems.slice(0, MAX_SHOWN).map((item, i) => {
              const isDeciding = decidingId === item.id;
              const isExpanded = expandedId === item.id;
              return (
                <li key={item.id} className={`p-3 ${i < Math.min(inboxItems.length, MAX_SHOWN) - 1 ? 'border-bottom' : ''}`}>
                  <div className="d-flex align-items-center gap-2 mb-1">
                    <StatusBadge label="Pending" tone="warning" />
                    <StatusBadge label="Approval required" tone="neutral" />
                    <strong>{item.actionType}</strong>
                  </div>
                  <div className="small text-muted mb-2">{item.reason} (confidence {item.confidence})</div>
                  <div className="bg-light rounded p-2 small mb-2">
                    <strong className="d-block mb-1">Why this action?</strong>
                    {item.reason}
                  </div>
                  <div className="d-flex gap-2">
                    <button type="button" className="btn btn-sm btn-primary" disabled={isDeciding} onClick={() => handleApprove(item.id)}>
                      {isDeciding ? 'Working…' : 'Review & decide'}
                    </button>
                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => handleToggleEvidence(item.id)}>
                      {isExpanded ? 'Hide evidence' : 'See evidence'}
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="mt-2 small">
                      {inspectorLoadingId === item.id && <span className="text-muted">Loading…</span>}
                      {inspectorErrorId === item.id && <span className="text-warning">Could not load this evidence.</span>}
                      {inspectorById[item.id] && (
                        <dl className="row mb-0">
                          <dt className="col-4 text-muted fw-normal">Blast radius</dt>
                          <dd className="col-8">{inspectorById[item.id].blastRadius}</dd>
                          <dt className="col-4 text-muted fw-normal">Reversibility</dt>
                          <dd className="col-8">{inspectorById[item.id].reversibility}</dd>
                          <dt className="col-4 text-muted fw-normal">Expected result</dt>
                          <dd className="col-8 mb-0">{inspectorById[item.id].expectedResult}</dd>
                        </dl>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </SectionCard>
  );
}
