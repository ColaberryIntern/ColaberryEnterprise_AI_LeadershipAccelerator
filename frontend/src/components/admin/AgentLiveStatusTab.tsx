import React from 'react';
import { AgentDetail } from '../../services/agentDetailApi';
import { ManagerInboxItem } from '../../services/managerInboxApi';
import { Tone } from './shell/StatusBadge';
import { timeAgo } from './shell/trust';
import { adv2PillClass } from './agentDetailV2/adv2PillTone';
import { deriveOperationalState, OperationalState } from '../../utils/agentOperationalState';
import { deriveAttentionItems, deriveRecentOutcome, AttentionSeverity } from '../../utils/agentAttentionRequired';

// AI Workforce Management, Checkpoint A (2026-09-01) — originally built as
// "Command Center": "is this agent healthy, what's it working on, what
// needs me." Every value here comes from the same GET /api/admin/agents/:id
// payload AgentOverviewTab renders, plus the real per-agent Manager Inbox
// (GET /api/admin/agents/:id/inbox) — no new backend endpoint, no new write
// capability.
//
// Split from Command Center, Checkpoint G (2026-09-10) — Ali, on Reese's own
// page: "The command center is too big and can be broken out into more
// tabs." This file keeps the real-time half (operational state, attention
// required, current work, recent outcome, the stat row) and is renamed to
// match what it actually is now that the reference/identity content (moved
// to AgentDetailPage.tsx as its own "Overview" tab, unfolding the Checkpoint
// F fold in the same reversible way Checkpoint F folded it) no longer lives
// here. Same data, same props, same tab key ('command') — only the label,
// file name, and component name changed, so At a Glance's own click-through
// target (AgentAtAGlanceTab.tsx's onNavigate('command')) needed no change.
//
// Deliberately absent from this slice (see agentAttentionRequired.ts's own
// header comment): goal-at-risk and report-delivery-failure items, since
// this tab doesn't fetch AgentGoal or AgentReportRun yet. Those land with
// Checkpoint D.
//
// Agent Detail redesign, Track D (2026-09-28) — reflowed from SectionCard/
// StatCard/StatusBadge to this page's adv2-* visual language, matching
// every other tab. This isn't one of the mockup's own 5 tabs, so there's no
// literal mockup section to match — the fix is porting it to the same
// visual system, not chasing a design that doesn't exist for it. Also fixes
// a real bug: "Operational state" previously rendered with children={null}
// — a header-only card with no body — now shows the real reason text.
// Zero data/logic change; every derived value is unchanged.

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

const SEVERITY_LABEL: Record<AttentionSeverity, string> = {
  high: 'High',
  medium: 'Medium',
  info: 'Info',
  none: 'OK',
};

export default function AgentLiveStatusTab({ detail, inboxItems, inboxLoading, inboxError }: Props) {
  const operationalState = deriveOperationalState(detail, inboxItems.length);
  const recentOutcome = deriveRecentOutcome(detail);
  const attentionItems = inboxLoading || inboxError ? [] : deriveAttentionItems(detail, inboxItems);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div className="adv2-card">
        <h2>
          Operational state <span className={adv2PillClass(OPERATIONAL_STATE_TONE[operationalState.state])}>{operationalState.label}</span>
        </h2>
        <p className="adv2-body adv2-muted" style={{ margin: 0 }}>{operationalState.reason}</p>
      </div>

      <div className="adv2-card">
        <h2>
          Attention Required
          <span className="adv2-hint">Every item cites the real evidence it's derived from.</span>
        </h2>
        {inboxLoading && <p className="adv2-body adv2-muted">Checking pending approvals…</p>}
        {inboxError && (
          <p className="adv2-body" style={{ color: 'var(--adv2-warn)' }}>
            Could not load pending approvals: {inboxError}. Everything below reflects what could be checked.
          </p>
        )}
        {!inboxLoading && !inboxError && attentionItems.map((item, i) => (
          <div key={i} className="adv2-task">
            <div>
              <span className={adv2PillClass(SEVERITY_TONE[item.severity])}>{SEVERITY_LABEL[item.severity]}</span>
              <div style={{ fontWeight: 600, marginTop: 8 }}>{item.title}</div>
              <p className="adv2-muted" style={{ margin: '4px 0 0' }}>{item.body}</p>
              <p className="adv2-mono adv2-muted" style={{ margin: '6px 0 0', fontSize: 12.5 }}>{item.evidence}</p>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
        <div className="adv2-card">
          <h2>Current Work</h2>
          <p className="adv2-body adv2-muted" style={{ margin: 0 }}>
            Current work is not yet instrumented. No concept of "the task this agent is doing right
            now" is persisted in the backend today — this is intentionally not inferred from
            unrelated recent events.
          </p>
        </div>
        <div className="adv2-card">
          <h2>
            Recent Outcome
            <span className="adv2-hint">The most recent verified outcome, not just recent activity.</span>
          </h2>
          {recentOutcome ? (
            <dl className="adv2-rows adv2-body" style={{ margin: 0 }}>
              <dt>What changed</dt>
              <dd>Ticket #{recentOutcome.ticket_number ?? recentOutcome.id} — {recentOutcome.title}</dd>
              <dt>Verification</dt>
              <dd><span className={adv2PillClass('success')}>Done — ticket closed</span></dd>
              <dt>Updated</dt>
              <dd>{timeAgo(recentOutcome.updated_at)}</dd>
            </dl>
          ) : (
            <p className="adv2-body adv2-muted" style={{ margin: 0 }}>
              No verified ("done") ticket yet — activity may exist, but nothing has been confirmed complete.
            </p>
          )}
        </div>
      </div>

      <div className="adv2-metrics" style={{ margin: 0 }}>
        <div className="adv2-metric">
          <span className="adv2-k">Cost (30d)</span>
          <div className="adv2-v">{detail.cost_summary ? `$${detail.cost_summary.cost_usd.toFixed(2)}` : '—'}</div>
          <span className="adv2-hint">{detail.cost_summary ? 'Real, ai_events sum' : 'No cost-tracked events in the last 30 days'}</span>
        </div>
        <div className="adv2-metric">
          <span className="adv2-k">Next scheduled action</span>
          <div className="adv2-v" style={{ fontSize: 18 }}>{detail.trust_contract.schedule || 'None'}</div>
          {detail.trust_contract.trigger_type === 'on_demand' && <span className="adv2-hint">On-demand trigger — no cron schedule</span>}
        </div>
        <div className="adv2-metric">
          <span className="adv2-k">Open items needing you</span>
          <div className="adv2-v">{inboxLoading ? '—' : inboxItems.length}</div>
          <span className="adv2-hint">Pending approvals, from the manager inbox</span>
        </div>
      </div>
    </div>
  );
}
