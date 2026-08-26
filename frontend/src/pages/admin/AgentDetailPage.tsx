import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getAgentDetail, AgentDetail } from '../../services/agentDetailApi';
import { resetAgents, reactivateAgent, AUTONOMY_LEVELS, AutonomyLevel, AUTONOMY_LEVEL_DESCRIPTIONS } from '../../services/workforceOrgChartApi';
import { PageHeader, StatCard, SectionCard, StatusBadge } from '../../components/admin/shell';
import { timeAgo } from '../../components/admin/shell/trust';
import AgentToolsCapabilitiesCard from '../../components/admin/AgentToolsCapabilitiesCard';
import AgentTicketActivityTable from '../../components/admin/AgentTicketActivityTable';
import AgentScheduledTasksCard from '../../components/admin/AgentScheduledTasksCard';
import { getTicketTypeLabel, getTicketTypeTone } from '../../utils/ticketTypeMeta';

// Agent Detail — Ali's requested transparency page: who this agent is, its real
// system prompt, its real tools/capabilities, its live status, and its linked
// ProofDesk ticket activity. Built generically (works for any AiAgent id) so it
// is the reusable blueprint for every future agent, not a one-off Reese page.
// Same independent-panel-failure posture as AdminWorkLedgerHealthPage.tsx.

const STATUS_TONE: Record<AgentDetail['live_status'], 'success' | 'warning' | 'neutral'> = {
  online: 'success',
  away: 'warning',
  offline: 'neutral',
  unknown: 'neutral',
};

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // AI Workforce Reset (2026-08-24) — Ali, live: deactivate an agent and
  // cancel its open tickets, reversible (enabled:false, real ticket
  // cancellation) — see workforceOrgChartApi.ts::resetAgents().
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  // AI Workforce Reset, Phase C (2026-08-24) — Ali, live: "add new ones
  // slowly... so I can see how they perform." Reactivating a deactivated
  // agent requires a deliberate autonomy-level choice — never a bare
  // confirm, never a silent flip back to unlimited trust. `''` (no
  // selection) is the initial state so "Reactivate" starts disabled.
  const [selectedAutonomyLevel, setSelectedAutonomyLevel] = useState<AutonomyLevel | ''>('');
  const [reactivating, setReactivating] = useState(false);
  const [reactivationMessage, setReactivationMessage] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!id) return;
    try {
      const data = await getAgentDetail(id);
      setDetail(data);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load agent detail');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
    const interval = setInterval(fetchDetail, 30000);
    return () => clearInterval(interval);
  }, [fetchDetail]);

  const handleDeactivate = useCallback(async () => {
    if (!id || !detail) return;
    const displayName = detail.identity?.display_name || detail.agent.agent_name;
    const confirmed = window.confirm(
      `Deactivate ${displayName} and cancel its open tickets? This sets enabled:false (reversible) and cancels every currently-open ticket via the real ticket status transition — not a delete.`,
    );
    if (!confirmed) return;
    setResetting(true);
    setResetMessage(null);
    try {
      const [result] = await resetAgents([id]);
      setResetMessage(
        result.error
          ? `Failed to deactivate: ${result.error}`
          : `Deactivated. ${result.ticketsCancelled} open ticket${result.ticketsCancelled === 1 ? '' : 's'} cancelled.`,
      );
      await fetchDetail();
    } catch (err: any) {
      setResetMessage(err?.response?.data?.error || 'Failed to deactivate agent.');
    } finally {
      setResetting(false);
    }
  }, [id, detail, fetchDetail]);

  const handleReactivate = useCallback(async () => {
    if (!id || !selectedAutonomyLevel) return;
    setReactivating(true);
    setReactivationMessage(null);
    try {
      const result = await reactivateAgent(id, selectedAutonomyLevel);
      setReactivationMessage(
        result.error ? `Failed to reactivate: ${result.error}` : `Reactivated at autonomy level "${result.autonomyLevel}".`,
      );
      setSelectedAutonomyLevel('');
      await fetchDetail();
    } catch (err: any) {
      setReactivationMessage(err?.response?.data?.error || 'Failed to reactivate agent.');
    } finally {
      setReactivating(false);
    }
  }, [id, selectedAutonomyLevel, fetchDetail]);

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return <div className="alert alert-danger">{error || 'Agent not found'}</div>;
  }

  const { agent, identity, live_status, tickets, ticket_breakdown, related_tasks, capabilities, trust_contract } = detail;
  // Agent Alias & Identity Fix — same fix as the Live Agents card list: prefer the
  // real AdminUser.display_name over the raw technical agent_name. Falls back to
  // agent_name for a non-blueprint agent (identity is null — no linked AdminUser).
  const displayName = identity?.display_name || agent.agent_name;

  return (
    <>
      <PageHeader
        title={displayName}
        icon="robot-2-line"
        subtitle={agent.description || undefined}
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: displayName }]}
        actions={
          <div className="d-flex gap-2">
            {agent.enabled && (
              <button className="btn btn-outline-danger btn-sm" onClick={handleDeactivate} disabled={resetting}>
                <i className="ri-shut-down-line" aria-hidden="true" /> {resetting ? 'Deactivating…' : 'Deactivate'}
              </button>
            )}
            <button className="btn btn-outline-primary btn-sm" onClick={fetchDetail} disabled={loading}>
              <i className="ri-refresh-line" aria-hidden="true" /> Refresh
            </button>
          </div>
        }
      >
        {resetMessage && (
          <div className={`alert ${resetMessage.startsWith('Failed') ? 'alert-danger' : 'alert-success'} py-2 mb-3`}>
            {resetMessage}
          </div>
        )}
        {reactivationMessage && (
          <div className={`alert ${reactivationMessage.startsWith('Failed') ? 'alert-danger' : 'alert-success'} py-2 mb-3`}>
            {reactivationMessage}
          </div>
        )}
        {/* AI Workforce Reset, Phase C (2026-08-24) — a deactivated agent gets a
            real form here, not a bare "Reactivate" confirm: an autonomy level
            must be chosen before the button enables, so bringing an agent back
            online is always a deliberate, visible act. */}
        {!agent.enabled && (
          <div className="alert alert-secondary py-2 mb-3">
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <span className="fw-semibold small">This agent is inactive.</span>
              <select
                className="form-select form-select-sm"
                style={{ width: 'auto' }}
                aria-label="Autonomy level"
                value={selectedAutonomyLevel}
                onChange={(e) => setSelectedAutonomyLevel(e.target.value as AutonomyLevel | '')}
              >
                <option value="">Choose an autonomy level…</option>
                {AUTONOMY_LEVELS.map((level) => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
              <button
                className="btn btn-success btn-sm"
                onClick={handleReactivate}
                disabled={!selectedAutonomyLevel || reactivating}
              >
                <i className="ri-play-circle-line" aria-hidden="true" /> {reactivating ? 'Reactivating…' : 'Reactivate'}
              </button>
            </div>
            {selectedAutonomyLevel && (
              <p className="text-muted small mb-0 mt-2">{AUTONOMY_LEVEL_DESCRIPTIONS[selectedAutonomyLevel]}</p>
            )}
          </div>
        )}
        <div className="row g-3">
          <div className="col-6 col-lg-3">
            <StatCard
              label="Live status"
              value={live_status}
              icon="pulse-line"
              tone={STATUS_TONE[live_status]}
            />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard label="Enabled" value={agent.enabled ? 'Yes' : 'No'} icon="toggle-line" tone={agent.enabled ? 'success' : 'neutral'} />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard label="Persona version" value={agent.persona_version || '—'} icon="git-commit-line" tone="neutral" />
          </div>
          <div className="col-6 col-lg-3">
            {/* Ticket Count Sync fix (2026-08-21) — was tickets.filter(open).length,
                which undercounts for any agent whose true ticket volume exceeds the
                tickets array's 50-row cap (e.g. InboxCaseEngine). open_ticket_count is
                the server's true count, via the same shared query the org chart's
                badges use — see agentDetailApi.ts's AgentDetail.open_ticket_count. */}
            <StatCard label="Open tickets" value={detail.open_ticket_count} icon="ticket-2-line" tone="neutral" />
          </div>
        </div>
      </PageHeader>

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

      <SectionCard title="System prompt" icon="chat-3-line" subtitle="The real, current text sent to the model for every conversation this agent has.">
        {agent.system_prompt ? (
          <pre className="bg-light p-3 rounded" style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', maxHeight: '420px', overflowY: 'auto' }}>
            {agent.system_prompt}
          </pre>
        ) : (
          <p className="text-muted mb-0">No system prompt recorded.</p>
        )}
      </SectionCard>

      <SectionCard
        title="Reports to"
        icon="git-branch-line"
        subtitle="This agent's real accountability chain — AI Leadership if direct, or through one or more AI Leadership agents to a real human (org-chart hierarchy)."
      >
        {detail.reports_to ? (
          <>
            {detail.reports_to.immediate_agent && (
              <p className="mb-2">
                Reports directly to{' '}
                <Link to={`/admin/agents/${detail.reports_to.immediate_agent.id}`}>
                  <strong>{detail.reports_to.immediate_agent.name}</strong>
                </Link>
                {' '}(AI Leadership) — open its own detail page for its tools, chain, and tickets.
              </p>
            )}
            <ol className="mb-3" style={{ paddingLeft: '1.1rem' }}>
              {detail.reports_to.trail.map((hop, i) => (
                <li key={i} className="mb-1"><code>{hop}</code></li>
              ))}
            </ol>
            {detail.reports_to.resolved_human ? (
              <p className="mb-0">
                Ultimately accountable to <strong>{detail.reports_to.resolved_human.name}</strong>
                {' '}({detail.reports_to.resolved_human.email}).
              </p>
            ) : (
              <p className="text-muted mb-0">
                <i className="ri-error-warning-line" aria-hidden="true" /> This chain does not currently resolve to a real human — disclosed honestly rather than guessed.
              </p>
            )}
          </>
        ) : (
          <p className="text-muted mb-0">No reports-to chain configured for this agent.</p>
        )}
      </SectionCard>

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
