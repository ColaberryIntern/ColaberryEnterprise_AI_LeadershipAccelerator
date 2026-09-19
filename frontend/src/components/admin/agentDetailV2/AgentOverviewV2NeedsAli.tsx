import React from 'react';
import { ManagerInboxItem } from '../../../services/managerInboxApi';
import { SectionCard, StatusBadge } from '../shell';
import type { TabKey } from './AgentDetailV2Header';

// Dashboard redesign, Slice 2b (2026-09-19) — the mockup's "Needs Ali" card.
// Ali's own confirmed decision (Slice 1 STOP-AND-ASK): "Needs Ali" is
// ProposedAgentAction only, NOT ApprovalRequest (shadow-mode-only, never
// blocks anything today — folding it in would fabricate urgency that isn't
// real). Reuses the SAME inboxItems already fetched for the Decisions tab
// and At a Glance's tile — zero new fetch.

interface Props {
  inboxItems: ManagerInboxItem[];
  inboxLoading: boolean;
  onNavigate: (tab: TabKey) => void;
}

const MAX_SHOWN = 3;

export default function AgentOverviewV2NeedsAli({ inboxItems, inboxLoading, onNavigate }: Props) {
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
      {!inboxLoading && inboxItems.length === 0 && (
        <p className="text-muted small text-center py-4 mb-0">Nothing needs your attention right now.</p>
      )}
      {!inboxLoading && inboxItems.length > 0 && (
        <>
          <div className="px-3 pt-3 small text-muted">
            {inboxItems.length} item{inboxItems.length === 1 ? '' : 's'} need{inboxItems.length === 1 ? 's' : ''} your review
          </div>
          <ul className="list-unstyled mb-0">
            {inboxItems.slice(0, MAX_SHOWN).map((item, i) => (
              <li key={item.id} className={`p-3 ${i < Math.min(inboxItems.length, MAX_SHOWN) - 1 ? 'border-bottom' : ''}`}>
                <div className="d-flex align-items-center gap-2 mb-1">
                  <StatusBadge label="Pending" tone="warning" />
                  <strong>{item.actionType}</strong>
                </div>
                <div className="small text-muted">{item.reason} (confidence {item.confidence})</div>
              </li>
            ))}
          </ul>
        </>
      )}
    </SectionCard>
  );
}
