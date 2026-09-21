import React from 'react';
import { AgentDetail } from '../../../services/agentDetailApi';
import { AUTONOMY_LEVELS, AUTONOMY_LEVEL_DESCRIPTIONS, AutonomyLevel } from '../../../services/workforceOrgChartApi';
import { LEVEL_PILL_CLASS } from './AgentDetailV2Header';
import { timeAgo } from '../shell/trust';
import AgentOverviewV2Tickets from './AgentOverviewV2Tickets';
import AgentOverviewV2WorkExplained from './AgentOverviewV2WorkExplained';
import { scheduledWorkColors } from './agentDetailV2Correlation';
import type { TabKey } from './AgentDetailV2Header';

// Agent Detail V2, main column (2026-09-11) — Ali: "same content just a
// different view." Every established honest phrase from the pre-redesign
// Overview (Trust Contract's "Not yet set"/"isn't invoked through the
// scheduled-run tracker"/Last run vs Last activity fallback, Trust
// evidence's "Allowed: N"/"Would require approval: N"/"No authorization
// checks recorded", Scheduled tasks' empty-state disclosure) is kept
// verbatim here — only the visual language changed, per the mockup Ali
// pasted. Real content that mockup didn't show (last run/activity, avg
// duration, last error) still renders — it lives in the Trust Contract
// card's own rows rather than the mockup's 6-slot evidence strip, since
// dropping it would violate "same content." The mockup's "Tokens" and
// "Human-flagged risks" evidence stats have no real backing anywhere in
// this schema, so they're replaced with real neighbors (tracked runs,
// would block) rather than invented. "Guardrails" has no per-agent field —
// disclosed honestly, not a fake "Configure" link. "Kill switch" is real
// but global — links to the real /admin/trust control.

const RUNG_LABELS: Record<AutonomyLevel, string> = {
  observe: 'Observe', suggest: 'Suggest', act_audited: 'Act (Audited)', communicate: 'Communicate',
};

function formatCost(v: number): string {
  return `$${v.toFixed(2)}`;
}

interface Props {
  detail: AgentDetail;
  onNavigate: (tab: TabKey) => void;
}

export default function AgentOverviewV2MainColumn({ detail, onNavigate }: Props) {
  const { agent, trust_contract, cost_summary, authorization_summary, related_tasks, owned_behaviors, tickets, ticket_breakdown } = detail;
  const currentIndex = agent.autonomy_level ? AUTONOMY_LEVELS.indexOf(agent.autonomy_level) : -1;
  const workColor = scheduledWorkColors(detail);

  const shadowNote = authorization_summary.total === 0
    ? 'No authorization checks recorded for this agent yet — nothing to evaluate a promotion on.'
    : authorization_summary.enforced_count === 0
      ? `All ${authorization_summary.total} authorization decision${authorization_summary.total === 1 ? '' : 's'} in the last ${authorization_summary.window_days} days were evaluated in shadow mode only — none enforced, so there's no real-world evidence yet that this agent's judgment is safe to promote.`
      : `${authorization_summary.enforced_count} of ${authorization_summary.total} authorization decisions in the last ${authorization_summary.window_days} days were actually enforced (the rest shadow-mode only).`;

  // Trust Contract fix (2026-08-24, preserved verbatim from the pre-redesign
  // Overview): an event-driven agent (Reese) is never touched by the
  // scheduler wrapper, so last_run_at stays honestly null — but real ticket
  // activity still exists. Show THAT instead of a bare, misleading "Never".
  const useActivityFallback = !trust_contract.last_run_at && !!trust_contract.last_activity_at;
  const lastRunLabel = useActivityFallback ? 'Last activity' : 'Last run';
  const lastRunValue = trust_contract.last_run_at
    ? timeAgo(trust_contract.last_run_at)
    : trust_contract.last_activity_at
      ? timeAgo(trust_contract.last_activity_at)
      : 'Never';

  return (
    <div className="adv2-col">

      <section className="adv2-card">
        <h2>Trust Contract <span className="adv2-hint">Grounded in the Trust Before Intelligence framework</span></h2>
        <div className="adv2-body">
          <div className="adv2-ladder" role="list">
            {AUTONOMY_LEVELS.map((level, i) => (
              <div key={level} role="listitem" className={`adv2-rung${i === currentIndex ? ' adv2-here' : i < currentIndex ? ' adv2-done' : ''}`}>
                <div className="adv2-name">{RUNG_LABELS[level]}</div>
                <div className="adv2-desc">{AUTONOMY_LEVEL_DESCRIPTIONS[level]}</div>
              </div>
            ))}
          </div>
          <div className="adv2-ladder-note"><b>What's holding the next rung:</b> {shadowNote}</div>

          <dl className="adv2-rows" style={{ marginTop: 18 }}>
            <dt>Autonomy level (Permitted)</dt>
            <dd>{agent.autonomy_level ? <span className={`adv2-pill ${LEVEL_PILL_CLASS[agent.autonomy_level]}`}>{agent.autonomy_level}</span> : 'Not yet set'}</dd>
            {trust_contract.trigger_type ? (
              <>
                <dt>Trigger</dt><dd>{trust_contract.trigger_type}</dd>
                <dt>Schedule</dt><dd>{trust_contract.schedule || '—'}</dd>
                <dt>{lastRunLabel}</dt><dd>{lastRunValue}</dd>
                <dt>Avg duration</dt><dd>{trust_contract.avg_duration_ms ? `${(trust_contract.avg_duration_ms / 1000).toFixed(1)}s` : '—'}</dd>
                <dt>Total runs</dt><dd>{trust_contract.run_count}</dd>
                <dt>Errors</dt><dd>{trust_contract.error_count}</dd>
              </>
            ) : (
              <>
                <dt>Trigger</dt>
                <dd className="adv2-gap">This agent isn't invoked through the scheduled-run tracker — no schedule/run data to show.</dd>
              </>
            )}
            <dt>Guardrails</dt>
            <dd className="adv2-gap">No per-agent guardrails configuration exists yet</dd>
            <dt>Kill switch</dt>
            <dd><a className="adv2-link" href="/admin/trust">Global switch only — see Trust Center</a></dd>
          </dl>
          {trust_contract.last_error && (
            <p className="adv2-callout" style={{ marginTop: 14, border: '1px solid var(--adv2-warn-soft)', borderRadius: 8 }}>
              <span className="adv2-mark" /><span><b>Last error:</b> {trust_contract.last_error}{trust_contract.last_error_at && ` — ${timeAgo(trust_contract.last_error_at)}`}</span>
            </p>
          )}
        </div>
      </section>

      <section className="adv2-card">
        <h2>Trust evidence <span className="adv2-hint">Last {authorization_summary.window_days} days</span></h2>
        <div className="adv2-strip">
          <div className="adv2-stat"><div className="adv2-v">{cost_summary ? formatCost(cost_summary.cost_usd) : '—'}</div><div className="adv2-k">Cost (30d)</div></div>
          <div className="adv2-stat"><div className="adv2-v">{cost_summary ? cost_summary.runs : 0}</div><div className="adv2-k">Tracked runs</div></div>
          <div className="adv2-stat adv2-flag"><div className="adv2-v">{authorization_summary.total}</div><div className="adv2-k">Authorization requests</div></div>
          <div className="adv2-stat"><div className="adv2-v">{authorization_summary.enforced_count}</div><div className="adv2-k">Under real enforcement</div></div>
        </div>
        <div style={{ padding: '14px 18px', borderTop: '1px solid var(--adv2-rule)' }}>
          <span className="adv2-pill adv2-ok">Allowed: {authorization_summary.allow}</span>{' '}
          <span className="adv2-pill adv2-warn">Would require approval: {authorization_summary.approval}</span>{' '}
          <span className="adv2-pill adv2-bad">Would block: {authorization_summary.block}</span>
        </div>
        <p className="adv2-callout"><span className="adv2-mark" /><span>{shadowNote}</span></p>
      </section>

      {/* Agent Detail dashboard redesign, Slice 1, R18 (2026-09-19) —
          Capabilities relocated to AgentOverviewV2ToolsChannels.tsx, mounted
          under Performance & Settings' "Tools & channels" sub-tab, matching
          Ali's mockup. Real relocation, not a duplicate — this section no
          longer renders here. */}

      <AgentOverviewV2WorkExplained agentId={detail.agent.id} onNavigate={onNavigate} />

      <section className="adv2-card">
        <h2>Scheduled work <span className="adv2-hint">{related_tasks.length} task{related_tasks.length === 1 ? '' : 's'}</span></h2>
        {related_tasks.length === 0 ? (
          <p className="adv2-muted" style={{ padding: '16px 18px', margin: 0 }}>No other scheduled tasks are registered for this agent.</p>
        ) : related_tasks.map((task) => (
          // Reese Product Phase 1 follow-up (2026-09-18) — a purely additive
          // anchor id (real for every agent, not just Reese) so the Employee
          // facts card's "Scheduled work" links land on the exact matching
          // row instead of just the top of the section. Zero behaviour or
          // visual change for any agent.
          <div className="adv2-task" id={`task-${task.agent_name}`} key={task.id}>
            <div>
              <h3>
                <span className="adv2-dot" style={{ background: workColor[task.agent_name] }} />
                {task.agent_name} <span className={`adv2-pill ${task.enabled ? 'adv2-trust' : 'adv2-neutral'}`}>{task.enabled ? 'Enabled' : 'Disabled'}</span>
              </h3>
              {task.description && <p>{task.description}</p>}
              <div className="adv2-meta">
                {task.schedule && <div><span>Schedule</span> <code>{task.schedule}</code></div>}
                <div><span>Last run</span> {task.last_run_at ? timeAgo(task.last_run_at) : 'Never'}</div>
                <div>
                  <span>Last ticket</span>{' '}
                  {task.last_ticket ? (
                    <a className="adv2-link" href={`/admin/tickets?open=${task.last_ticket.id}`} target="_blank" rel="noopener noreferrer">
                      {task.last_ticket.ticket_number ? `#${task.last_ticket.ticket_number}` : task.last_ticket.title} · {timeAgo(task.last_ticket.at)}
                    </a>
                  ) : 'None'}
                </div>
              </div>
            </div>
            <div className="adv2-side"><div className="adv2-v">{task.run_count} / {task.error_count}</div>runs / errors</div>
          </div>
        ))}
      </section>

      {/* AI Employee Consolidation Program (2026-09-15/16) — mission Section
          13: legacy workflows appear inside the employee's own "Capabilities
          & Automations" area, never as peers pretending to be separate
          employees. Real ownership via parent_agent_id
          (agentDetailService.ts's owned_behaviors), not the same-module
          inference "Scheduled work" above uses. Honest-empty for the whole
          fleet on day one except Dara — never hidden, so an employee whose
          absorption hasn't happened yet reads as genuinely empty, not broken. */}
      <section className="adv2-card">
        <h2>Capabilities &amp; Automations <span className="adv2-hint">{owned_behaviors.length} owned</span></h2>
        {owned_behaviors.length === 0 ? (
          <p className="adv2-muted" style={{ padding: '16px 18px', margin: 0 }}>This agent doesn't own any absorbed legacy behaviors or tools yet.</p>
        ) : owned_behaviors.map((b) => (
          <div className="adv2-task" key={b.id}>
            <div>
              <h3>
                {b.agent_name}{' '}
                <span className={`adv2-pill ${b.enabled ? 'adv2-trust' : 'adv2-neutral'}`}>{b.enabled ? 'Enabled' : 'Disabled'}</span>{' '}
                {b.record_kind && <span className="adv2-pill adv2-neutral">{b.record_kind}</span>}
              </h3>
              {b.description && <p>{b.description}</p>}
              <div className="adv2-meta">
                {b.schedule && <div><span>Schedule</span> <code>{b.schedule}</code></div>}
                <div><span>Migration status</span> {b.migration_status ?? 'unclassified'}</div>
              </div>
            </div>
          </div>
        ))}
      </section>

      <AgentOverviewV2Tickets tickets={tickets} ticketBreakdown={ticket_breakdown} openTicketCount={detail.open_ticket_count} />

    </div>
  );
}
