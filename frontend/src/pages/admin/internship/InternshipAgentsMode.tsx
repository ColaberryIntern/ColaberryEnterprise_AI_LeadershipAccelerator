import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SectionCard, StatusBadge, EmptyState } from '../../../components/admin/shell';
import type { Tone } from '../../../components/admin/shell/StatusBadge';
import { fetchAgentFactory, errorMessage, type AgentFactoryCard } from '../../../services/agentFactoryApi';

/**
 * Agents mode — the admin Interns hub's agent-factory index (mgmt-portal M2).
 *
 * One card per agent domain: its title and builder, whether the AI agent is built (with a link into
 * the existing Agent Dashboard at /admin/agents/:id, where its config and the "talk to it" surface
 * live), and its GitHub sync signal — is a repo connected, and how far the build has verified.
 * This tab indexes the factory and links to the real dashboard; it does not re-embed it.
 *
 * Access is two-layered: the tab is gated `agents` (owner/admin today); the list the server returns
 * is already scoped — management sees every domain, a builder only their own. `scope === 'mine'`
 * says the list is the narrowed one.
 */

const BUILDER_STATE_META: Record<string, { label: string; tone: Tone }> = {
  verified_active: { label: 'Builder active', tone: 'success' },
  onboarding_pending: { label: 'Builder onboarding', tone: 'warning' },
  unassigned: { label: 'No builder yet', tone: 'neutral' },
};

const InternshipAgentsMode: React.FC = () => {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<AgentFactoryCard[] | null>(null);
  const [scope, setScope] = useState<'all' | 'mine'>('all');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAgentFactory();
      setAgents(res.agents);
      setScope(res.scope);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not load the agent factory.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="aint-state">Loading the agent factory…</div>;

  if (error) {
    return (
      <div className="aint-state error">
        <p>{error}</p>
        <button type="button" className="aint-btn" onClick={load}>Try again</button>
      </div>
    );
  }

  if (!agents || agents.length === 0) {
    return (
      <EmptyState
        icon="robot-2-line"
        title="No agents provisioned yet"
        description={
          scope === 'mine'
            ? 'You do not own an agent domain yet. Yours will appear here once it is provisioned.'
            : 'No agent domain has been provisioned yet.'
        }
      />
    );
  }

  return (
    <div className="d-flex flex-column gap-3">
      <p className="text-muted mb-0" style={{ fontSize: '0.85rem' }}>
        {scope === 'mine'
          ? 'Showing only the agent domains you own or build.'
          : 'Every agent domain in the factory. Open a built agent to see its configuration and talk to it.'}
      </p>
      {agents.map((a) => {
        const state = a.intendedBuilderState ? BUILDER_STATE_META[a.intendedBuilderState] : undefined;
        const buildPct = a.stories > 0 ? Math.round((a.storiesVerified / a.stories) * 100) : 0;
        return (
          <SectionCard
            key={a.domainKey}
            title={a.title}
            subtitle={a.intendedBuilder ? `Builder: ${a.intendedBuilder}` : 'Builder: unassigned'}
            icon="robot-2-line"
            actions={
              a.built && a.agentId ? (
                <button
                  type="button"
                  className="btn btn-outline-primary btn-sm"
                  onClick={() => navigate(`/admin/agents/${a.agentId}`)}
                >
                  Open dashboard
                </button>
              ) : (
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>Agent not built yet</span>
              )
            }
          >
            <div className="d-flex flex-wrap align-items-center gap-3">
              {state && <StatusBadge label={state.label} tone={state.tone} />}
              <StatusBadge
                label={a.repoConnected ? 'Repo connected' : 'No repo yet'}
                tone={a.repoConnected ? 'success' : 'neutral'}
              />
              {a.repoConnected && (
                <span className="text-muted" style={{ fontSize: '0.85rem' }}>
                  {a.storiesVerified}/{a.stories} stories verified{a.stories > 0 ? ` (${buildPct}%)` : ''}
                </span>
              )}
              {a.managerEmail && (
                <span className="text-muted" style={{ fontSize: '0.85rem' }}>Manager: {a.managerEmail}</span>
              )}
            </div>
          </SectionCard>
        );
      })}
    </div>
  );
};

export default InternshipAgentsMode;
