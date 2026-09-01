import React from 'react';
import { AgentDetail } from '../../services/agentDetailApi';
import { SectionCard, StatCard, StatusBadge } from './shell';
import { timeAgo } from './shell/trust';
import AgentToolsCapabilitiesCard from './AgentToolsCapabilitiesCard';
import AgentTicketActivityTable from './AgentTicketActivityTable';
import AgentScheduledTasksCard from './AgentScheduledTasksCard';
import AgentTrustSummaryCard from './AgentTrustSummaryCard';
import AgentGoalsScoreCard from './AgentGoalsScoreCard';
import AgentReportsToCard from './AgentReportsToCard';
import { getTicketTypeLabel, getTicketTypeTone } from '../../utils/ticketTypeMeta';

// AI Workforce Management, Checkpoint B — the Overview tab. Everything that
// used to render unconditionally on AgentDetailPage.tsx, extracted verbatim
// (no behavior change) so the tab shell in AgentDetailPage.tsx stays under
// this repo's file-size guidance. See AgentCharterTab.tsx for the sibling tab.

interface Props {
  detail: AgentDetail;
}

export default function AgentOverviewTab({ detail }: Props) {
  const {
    agent, identity, tickets, ticket_breakdown, related_tasks,
    persona_version_history, cost_summary, authorization_summary, capabilities, trust_contract,
    goals, goals_overall,
  } = detail;

  return (
    <>
      <SectionCard title="Identity" icon="user-star-line">
        {identity ? (
          <dl className="row mb-0">
            <dt className="col-sm-3">Real staff account</dt>
            <dd className="col-sm-9">{identity.display_name || identity.email} ({identity.email})</dd>
            <dt className="col-sm-3">AI-operated</dt>
            <dd className="col-sm-9">
              {identity.is_ai_operated ? (
                <span className="badge bg-info-subtle text-info-emphasis">AI-operated (admin view only — never shown to students)</span>
              ) : (
                'No'
              )}
            </dd>
            <dt className="col-sm-3">Agent type</dt>
            <dd className="col-sm-9"><code>{agent.agent_type}</code>{agent.category && <> · <code>{agent.category}</code></>}</dd>
          </dl>
        ) : (
          <p className="text-muted mb-0">No linked staff identity yet.</p>
        )}
      </SectionCard>

      <SectionCard
        title="Trust Contract"
        icon="shield-check-line"
        subtitle="The Instant dimension — is this agent actually running, on schedule, reliably. Permitted, Transparent, and Contextual are covered by Tools, Reports to, and Reads/Produces below."
      >
        <p className="text-muted small mb-3">
          Grounded in Ram Katamaraja's{' '}
          <a href="https://www.amazon.com/dp/B0GX32N413" target="_blank" rel="noopener noreferrer">
            Trust Before Intelligence
          </a>{' '}
          INPACT™ framework — every value below is a real, pre-existing field, never invented.
        </p>
        <div className="row g-3 mb-1">
          <div className="col-6 col-lg-3">
            <StatCard
              label="Autonomy level (Permitted)"
              value={agent.autonomy_level || 'Not yet set'}
              icon="key-2-line"
              tone={agent.autonomy_level ? 'success' : 'neutral'}
            />
          </div>
        </div>
        {trust_contract.trigger_type ? (
          <div className="row g-3">
            <div className="col-6 col-lg-3">
              <StatCard label="Trigger" value={trust_contract.trigger_type} icon="timer-line" tone="neutral" />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard label="Schedule" value={trust_contract.schedule || '—'} icon="calendar-line" tone="neutral" />
            </div>
            <div className="col-6 col-lg-3">
              {/* Trust Contract fix (2026-08-24) — Ali, live, on Reese's real page:
                  "Reese has several tickets... but this says it's never been run."
                  `last_run_at` stays honestly null for an event-driven agent (it's
                  never invoked through the cron scheduler wrapper) — that part was
                  correct. What was wrong is showing bare "Never" with no other
                  signal, right above a ticket table full of recent activity. When
                  there's no scheduler run but there IS real ticket activity, show
                  THAT instead, labeled for what it actually is. */}
              <StatCard
                label={trust_contract.last_run_at || !trust_contract.last_activity_at ? 'Last run' : 'Last activity'}
                value={
                  trust_contract.last_run_at
                    ? timeAgo(trust_contract.last_run_at)
                    : trust_contract.last_activity_at
                      ? timeAgo(trust_contract.last_activity_at)
                      : 'Never'
                }
                icon={trust_contract.last_run_at || !trust_contract.last_activity_at ? 'history-line' : 'ticket-2-line'}
                tone="neutral"
              />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard
                label="Avg duration"
                value={trust_contract.avg_duration_ms ? `${(trust_contract.avg_duration_ms / 1000).toFixed(1)}s` : '—'}
                icon="speed-line"
                tone="neutral"
              />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard label="Total runs" value={trust_contract.run_count} icon="repeat-line" tone="neutral" />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard
                label="Errors"
                value={trust_contract.error_count}
                icon="error-warning-line"
                tone={trust_contract.error_count > 0 ? 'warning' : 'success'}
              />
            </div>
          </div>
        ) : (
          <p className="text-muted mb-0">
            <i className="ri-information-line" aria-hidden="true" /> This agent isn't invoked through the
            scheduled-run tracker (it's a real, identity-only or on-demand process) — no schedule/run data to
            show, disclosed honestly rather than a fabricated "no runs yet."
          </p>
        )}
        {trust_contract.last_error && (
          <div className="alert alert-warning mt-3 mb-0 py-2 small">
            <strong>Last error:</strong> {trust_contract.last_error}
            {trust_contract.last_error_at && <> — {timeAgo(trust_contract.last_error_at)}</>}
          </div>
        )}
      </SectionCard>

      <AgentTrustSummaryCard
        costSummary={cost_summary}
        authorizationSummary={authorization_summary}
        versionHistory={persona_version_history}
      />

      <AgentGoalsScoreCard goals={goals} goalsOverall={goals_overall} />

      <SectionCard title="System prompt" icon="chat-3-line" subtitle="The real, current text sent to the model for every conversation this agent has.">
        {agent.system_prompt ? (
          <pre className="bg-light p-3 rounded" style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', maxHeight: '420px', overflowY: 'auto' }}>
            {agent.system_prompt}
          </pre>
        ) : (
          <p className="text-muted mb-0">No system prompt recorded.</p>
        )}
      </SectionCard>

      <AgentReportsToCard reportsTo={detail.reports_to} />

      <AgentToolsCapabilitiesCard byTool={capabilities.by_tool} />

      <SectionCard
        title="What this agent reads / produces"
        icon="database-2-line"
        subtitle="Derived from this agent's real, live tools_granted plus the real ticket types it has actually created — never hand-written, so it can't drift from reality."
      >
        <div className="row g-4">
          <div className="col-md-6">
            <h6 className="text-uppercase text-muted small mb-2">Reads</h6>
            {capabilities.reads.length > 0 ? (
              <ul className="list-unstyled mb-0">
                {capabilities.reads.map((r) => (
                  <li key={r} className="mb-1">
                    <span className="badge bg-info-subtle text-info-emphasis me-2">
                      <i className="ri-eye-line" aria-hidden="true" />
                    </span>
                    {r}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted mb-0">This agent's granted tools don't read any external data source.</p>
            )}
          </div>
          <div className="col-md-6">
            <h6 className="text-uppercase text-muted small mb-2">Produces</h6>
            {capabilities.produces.length > 0 ? (
              <ul className="list-unstyled mb-0">
                {capabilities.produces.map((p) => (
                  <li key={p} className="mb-1">
                    <span className="badge bg-success-subtle text-success-emphasis me-2">
                      <i className="ri-add-circle-line" aria-hidden="true" />
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted mb-0">This agent's granted tools don't produce anything on their own.</p>
            )}
          </div>
        </div>

        {capabilities.produced_ticket_types.length > 0 && (
          <div className="mt-3">
            <h6 className="text-uppercase text-muted small mb-2">Ticket types actually created (live, unlimited)</h6>
            <div className="d-flex flex-wrap gap-2">
              {capabilities.produced_ticket_types.map((t) => (
                <StatusBadge key={t} label={getTicketTypeLabel(t)} tone={getTicketTypeTone(t)} />
              ))}
            </div>
          </div>
        )}

        {capabilities.undocumented_tools.length > 0 && (
          <div className="mt-3">
            <p className="text-muted small mb-0">
              <i className="ri-information-line" aria-hidden="true" /> {capabilities.undocumented_tools.length === 1 ? 'One tool' : `${capabilities.undocumented_tools.length} tools`} granted to this agent
              {' '}(<code>{capabilities.undocumented_tools.join(', ')}</code>) {capabilities.undocumented_tools.length === 1 ? 'has' : 'have'} no documented reads/produces yet — disclosed honestly rather than guessed.
            </p>
          </div>
        )}
      </SectionCard>

      <AgentScheduledTasksCard tasks={related_tasks} />

      <AgentTicketActivityTable tickets={tickets} ticketBreakdown={ticket_breakdown} />
    </>
  );
}
