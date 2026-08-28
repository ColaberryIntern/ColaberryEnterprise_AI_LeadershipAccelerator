import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { getAgentDetail, AgentDetail } from '../../services/agentDetailApi';
import { resetAgents, reactivateAgent, AUTONOMY_LEVELS, AutonomyLevel, AUTONOMY_LEVEL_DESCRIPTIONS } from '../../services/workforceOrgChartApi';
import { PageHeader, StatCard } from '../../components/admin/shell';
import AgentOverviewTab from '../../components/admin/AgentOverviewTab';
import AgentCharterTab from '../../components/admin/AgentCharterTab';

// Agent Detail — Ali's requested transparency page: who this agent is, its real
// system prompt, its real tools/capabilities, its live status, and its linked
// ProofDesk ticket activity. Built generically (works for any AiAgent id) so it
// is the reusable blueprint for every future agent, not a one-off Reese page.
// Same independent-panel-failure posture as AdminWorkLedgerHealthPage.tsx.
//
// AI Workforce Management, Checkpoint B (2026-08-28) — tab shell, minimal-first
// slice (Ali's explicit choice over building all 10 planned tabs at once):
// "Overview" is everything this page already had, extracted verbatim into
// AgentOverviewTab.tsx; "Charter" is the one new real capability
// (AgentRoleCharter, PR #1898). The other 8 tabs from
// docs/architecture/ai-workforce-management/TARGET_ARCHITECTURE.md
// (Talk/Work/Decisions/Reports/Trust/Goals/Memory/Tools & Access/Activity)
// are NOT stubbed in here — a grayed-out tab for a capability that doesn't
// exist yet would misrepresent what this page can actually do. Add a tab only
// when its backend is real, per this repo's own "never fabricate" posture.

type TabKey = 'overview' | 'charter';
const TABS: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'overview', label: 'Overview', icon: 'dashboard-line' },
  { key: 'charter', label: 'Charter', icon: 'briefcase-4-line' },
];

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
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
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

  if (error || !detail || !id) {
    return <div className="alert alert-danger">{error || 'Agent not found'}</div>;
  }

  const { agent, identity, live_status } = detail;
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

      <ul className="nav nav-tabs mb-4">
        {TABS.map((tab) => (
          <li key={tab.key} className="nav-item">
            <button
              className={`nav-link ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <i className={`ri-${tab.icon} me-1`} aria-hidden="true" />
              {tab.label}
            </button>
          </li>
        ))}
      </ul>

      {activeTab === 'overview' && <AgentOverviewTab detail={detail} />}
      {activeTab === 'charter' && <AgentCharterTab agentId={id} agentName={displayName} />}
    </>
  );
}
