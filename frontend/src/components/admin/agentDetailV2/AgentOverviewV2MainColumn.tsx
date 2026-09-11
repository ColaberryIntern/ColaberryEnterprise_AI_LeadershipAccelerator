import React from 'react';
import { AgentDetail } from '../../../services/agentDetailApi';
import { AUTONOMY_LEVELS, AUTONOMY_LEVEL_DESCRIPTIONS, AutonomyLevel } from '../../../services/workforceOrgChartApi';
import { timeAgo } from '../shell/trust';
import { getTicketTypeLabel } from '../../../utils/ticketTypeMeta';
import AgentOverviewV2Tickets from './AgentOverviewV2Tickets';

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
}

export default function AgentOverviewV2MainColumn({ detail }: Props) {
  const { agent, trust_contract, cost_summary, authorization_summary, capabilities, related_tasks, tickets, ticket_breakdown } = detail;
  const currentIndex = agent.autonomy_level ? AUTONOMY_LEVELS.indexOf(agent.autonomy_level) : -1;

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
            <dd>{agent.autonomy_level || 'Not yet set'}</dd>
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

      <section className="adv2-card">
        <h2>Capabilities <span className="adv2-hint">{capabilities.by_tool.length} tool{capabilities.by_tool.length === 1 ? '' : 's'}</span></h2>
        <div className="adv2-body" style={{ paddingBottom: 8 }}>
          <div className="adv2-io-grid">
            <div>
              <h3>Reads</h3>
              {capabilities.reads.length > 0 ? (
                <ul>{capabilities.reads.map((r) => <li key={r}>{r}</li>)}</ul>
              ) : <p className="adv2-muted">Granted tools don't read any external data source.</p>}
            </div>
            <div>
              <h3>Produces</h3>
              {capabilities.produces.length > 0 ? (
                <ul>{capabilities.produces.map((p) => <li key={p}>{p}</li>)}</ul>
              ) : <p className="adv2-muted">Granted tools don't produce anything on their own.</p>}
            </div>
          </div>
          {capabilities.produced_ticket_types.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Ticket types actually created</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {capabilities.produced_ticket_types.map((t) => <span key={t} className="adv2-pill adv2-neutral">{getTicketTypeLabel(t)}</span>)}
              </div>
            </div>
          )}
          {capabilities.undocumented_tools.length > 0 && (
            <p className="adv2-muted" style={{ marginTop: 14, fontSize: 12.5 }}>
              {capabilities.undocumented_tools.length === 1 ? 'One tool' : `${capabilities.undocumented_tools.length} tools`} granted to this agent
              {' '}(<code>{capabilities.undocumented_tools.join(', ')}</code>) {capabilities.undocumented_tools.length === 1 ? 'has' : 'have'} no documented reads/produces yet — disclosed honestly rather than guessed.
            </p>
          )}
        </div>
        {capabilities.by_tool.length === 0 ? (
          <p className="adv2-muted" style={{ padding: '0 18px 16px' }}>No tools recorded.</p>
        ) : capabilities.by_tool.map((tool) => (
          <div className="adv2-tool" key={tool.tool}>
            <div><code>{tool.tool}</code>{!tool.documented && <span className="adv2-pill adv2-warn" style={{ marginLeft: 8 }}>undocumented</span>}</div>
            <div className="adv2-what">
              {tool.documented ? (
                <>{tool.reads.length > 0 && `Reads: ${tool.reads.join(', ')}. `}{tool.produces.length > 0 && `Produces: ${tool.produces.join(', ')}.`}</>
              ) : <span className="adv2-gap">No documented reads/produces yet for this tool</span>}
            </div>
          </div>
        ))}
      </section>

      <section className="adv2-card">
        <h2>Scheduled work <span className="adv2-hint">{related_tasks.length} task{related_tasks.length === 1 ? '' : 's'}</span></h2>
        {related_tasks.length === 0 ? (
          <p className="adv2-muted" style={{ padding: '16px 18px', margin: 0 }}>No other scheduled tasks are registered for this agent.</p>
        ) : related_tasks.map((task) => (
          <div className="adv2-task" key={task.id}>
            <div>
              <h3>{task.agent_name} <span className={`adv2-pill ${task.enabled ? 'adv2-trust' : 'adv2-neutral'}`}>{task.enabled ? 'Enabled' : 'Disabled'}</span></h3>
              {task.description && <p>{task.description}</p>}
              <div className="adv2-meta">
                {task.schedule && <div><span>Schedule</span> <code>{task.schedule}</code></div>}
                <div><span>Last run</span> {task.last_run_at ? timeAgo(task.last_run_at) : 'Never'}</div>
              </div>
            </div>
            <div className="adv2-side"><div className="adv2-v">{task.run_count} / {task.error_count}</div>runs / errors</div>
          </div>
        ))}
      </section>

      <AgentOverviewV2Tickets tickets={tickets} ticketBreakdown={ticket_breakdown} openTicketCount={detail.open_ticket_count} />

    </div>
  );
}
