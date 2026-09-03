import React from 'react';
import { AgentDetail } from '../../services/agentDetailApi';
import { ManagerInboxItem } from '../../services/managerInboxApi';
import { SectionCard, StatCard, StatusBadge } from './shell';
import { Tone } from './shell/StatusBadge';
import { timeAgo } from './shell/trust';
import { deriveOperationalState, OperationalState } from '../../utils/agentOperationalState';
import { deriveAttentionItems, deriveRecentOutcome, AttentionSeverity } from '../../utils/agentAttentionRequired';
import AgentOverviewTab from './AgentOverviewTab';

// AI Workforce Management, Checkpoint A (2026-09-01) — the Command Center
// tab: "is this agent healthy, what's it working on, what needs me." Every
// value here comes from the same GET /api/admin/agents/:id payload
// AgentOverviewTab already renders, plus the real per-agent Manager Inbox
// (GET /api/admin/agents/:id/inbox) — no new backend endpoint, no new write
// capability. See docs design review agentDashboardRedesignV2.html for the
// full 5-section vision; this checkpoint builds Command Center only.
//
// Deliberately absent from this slice (see agentAttentionRequired.ts's own
// header comment): goal-at-risk and report-delivery-failure items, since
// Command Center doesn't fetch AgentGoal or AgentReportRun yet. Those land
// with Checkpoint D.

interface Props {
  detail: AgentDetail;
  inboxItems: ManagerInboxItem[];
  inboxLoading: boolean;
  inboxError: string | null;
}

const OPERATIONAL_STATE_TONE: Record<OperationalState, Tone> = {
  working: 'info',
  waiting: 'neutral',
  needs_approval: 'warning',
  blocked: 'danger',
  idle: 'neutral',
  paused: 'neutral',
  offline: 'danger',
  unknown: 'neutral',
};

const SEVERITY_TONE: Record<AttentionSeverity, Tone> = {
  high: 'danger',
  medium: 'warning',
  info: 'info',
  none: 'success',
};

const SEVERITY_ICON: Record<AttentionSeverity, string> = {
  high: 'shield-cross-line',
  medium: 'time-line',
  info: 'information-line',
  none: 'checkbox-circle-line',
};

export default function AgentCommandCenterTab({ detail, inboxItems, inboxLoading, inboxError }: Props) {
  const operationalState = deriveOperationalState(detail, inboxItems.length);
  const recentOutcome = deriveRecentOutcome(detail);
  const attentionItems = inboxLoading || inboxError ? [] : deriveAttentionItems(detail, inboxItems);

  return (
    <>
      <SectionCard
        title={
          <>
            Operational state{' '}
            <StatusBadge label={operationalState.label} tone={OPERATIONAL_STATE_TONE[operationalState.state]} />
          </>
        }
        icon="pulse-line"
        subtitle={operationalState.reason}
        padded={false}
      >
        {null}
      </SectionCard>

      <SectionCard
        title="Attention Required"
        icon="alarm-warning-line"
        subtitle="Every item cites the real evidence it's derived from."
        padded={false}
      >
        {inboxLoading && (
          <div className="p-3 text-muted small">
            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
            Checking pending approvals…
          </div>
        )}
        {inboxError && (
          <div className="p-3">
            <div className="alert alert-warning py-2 mb-0 small">
              Could not load pending approvals: {inboxError}. Everything below reflects what could be checked.
            </div>
          </div>
        )}
        {!inboxLoading && !inboxError && (
          <ul className="list-unstyled mb-0">
            {attentionItems.map((item, i) => (
              <li key={i} className={`d-flex gap-3 p-3 ${i < attentionItems.length - 1 ? 'border-bottom' : ''}`}>
                <span className="flex-shrink-0">
                  <StatusBadge label="" tone={SEVERITY_TONE[item.severity]} icon={SEVERITY_ICON[item.severity]} />
                </span>
                <div className="flex-grow-1" style={{ minWidth: 0 }}>
                  <div className="fw-semibold small">{item.title}</div>
                  <div className="text-muted small">{item.body}</div>
                  <div className="text-muted small font-monospace mt-1" style={{ fontSize: '0.72rem' }}>
                    {item.evidence}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <div className="row g-3 mb-1">
        <div className="col-lg-6">
          <SectionCard title="Current Work" icon="play-circle-line" className="h-100">
            <p className="text-muted small fst-italic text-center py-3 mb-0">
              Current work is not yet instrumented.
              <br />
              No concept of "the task this agent is doing right now" is persisted in the backend today —
              this is intentionally not inferred from unrelated recent events.
            </p>
          </SectionCard>
        </div>
        <div className="col-lg-6">
          <SectionCard title="Recent Outcome" icon="checkbox-circle-line" subtitle="The most recent verified outcome, not just recent activity." className="h-100">
            {recentOutcome ? (
              <dl className="row mb-0 small">
                <dt className="col-sm-4">What changed</dt>
                <dd className="col-sm-8">Ticket #{recentOutcome.ticket_number ?? recentOutcome.id} — {recentOutcome.title}</dd>
                <dt className="col-sm-4">Verification</dt>
                <dd className="col-sm-8"><StatusBadge label="Done — ticket closed" tone="success" /></dd>
                <dt className="col-sm-4">Updated</dt>
                <dd className="col-sm-8">{timeAgo(recentOutcome.updated_at)}</dd>
              </dl>
            ) : (
              <p className="text-muted small mb-0">No verified ("done") ticket yet — activity may exist, but nothing has been confirmed complete.</p>
            )}
          </SectionCard>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-md-4">
          <StatCard
            label="Cost (30d)"
            value={detail.cost_summary ? `$${detail.cost_summary.cost_usd.toFixed(2)}` : '—'}
            icon="money-dollar-circle-line"
            tone="primary"
            hint={detail.cost_summary ? 'Real, ai_events sum' : 'No cost-tracked events in the last 30 days'}
          />
        </div>
        <div className="col-md-4">
          <StatCard
            label="Next scheduled action"
            value={detail.trust_contract.schedule || 'None'}
            icon="calendar-event-line"
            tone="neutral"
            hint={detail.trust_contract.trigger_type === 'on_demand' ? 'On-demand trigger — no cron schedule' : undefined}
          />
        </div>
        <div className="col-md-4">
          <StatCard
            label="Open items needing you"
            value={inboxLoading ? '—' : inboxItems.length}
            icon="inbox-line"
            tone={!inboxLoading && inboxItems.length > 0 ? 'warning' : 'neutral'}
            hint="Pending approvals, from the manager inbox"
          />
        </div>
      </div>

      {/* At a Glance, Checkpoint F (2026-09-03) — Overview's own identity/
          tools/reports-to/system-prompt content, unchanged, relocated here
          as supporting context below Command Center's own real-time status.
          "At a Glance" is now the default tab; this is where Overview lives. */}
      <AgentOverviewTab detail={detail} />
    </>
  );
}
