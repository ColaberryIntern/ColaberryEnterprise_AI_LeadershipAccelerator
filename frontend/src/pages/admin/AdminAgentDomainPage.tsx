import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/admin/shell';
import { fetchAgentFactory, AgentFactoryCard, errorMessage } from '../../services/agentFactoryApi';

/**
 * AdminAgentDomainPage — the per-agent "dashboard" for an agent domain, reached from the left-nav
 * "Interns → Agents" sub-items. Every one of the agents gets one, so an UNBUILT domain (no live agent)
 * still has a real page showing its owner/builder, repo and build progress. A BUILT agent's nav item
 * deep-links straight to its immersive live dashboard (/admin/agents/:agentId); this page is its
 * fallback and still offers a button into that dashboard. Fed by the existing GET /api/admin/agent-factory
 * (gated `agents`); the route is a child of /admin/internship so it inherits the `internship` route gate.
 */
type State =
  | { k: 'loading' }
  | { k: 'ready'; card: AgentFactoryCard }
  | { k: 'not_found' }
  | { k: 'error'; message: string };

function AgentDomainBody({ card, onOpenDashboard }: { card: AgentFactoryCard; onOpenDashboard: (agentId: string) => void }): React.ReactElement {
  const owner = card.intendedBuilder ?? card.managerEmail ?? 'Unassigned';
  return (
    <div className="d-flex flex-column gap-3" style={{ maxWidth: 720 }}>
      <div className="card">
        <div className="card-body">
          <h2 className="h5 mb-1">{card.title}</h2>
          <div className="text-muted small mb-3">{card.built ? 'Agent is live' : 'Agent not built yet'}</div>
          <dl className="row mb-0 small">
            <dt className="col-sm-4">Owner / builder</dt><dd className="col-sm-8">{owner}</dd>
            <dt className="col-sm-4">Builder state</dt><dd className="col-sm-8">{card.intendedBuilderState ?? '—'}</dd>
            <dt className="col-sm-4">Manager</dt><dd className="col-sm-8">{card.managerEmail ?? '—'}</dd>
            <dt className="col-sm-4">Repo</dt>
            <dd className="col-sm-8">
              {card.repoConnected && card.repoUrl
                ? <a href={card.repoUrl} target="_blank" rel="noopener noreferrer">{card.repoUrl}</a>
                : 'Not connected'}
            </dd>
            <dt className="col-sm-4">Build progress</dt>
            <dd className="col-sm-8">{card.storiesVerified}/{card.stories} stories verified{card.releases ? ` · ${card.releases} releases` : ''}</dd>
          </dl>
        </div>
      </div>
      {card.built && card.agentId && (
        <div>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onOpenDashboard(card.agentId as string)}>
            Open the live agent dashboard
          </button>
        </div>
      )}
    </div>
  );
}

const AdminAgentDomainPage: React.FC = () => {
  const { domainKey = '' } = useParams<{ domainKey: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ k: 'loading' });

  const load = useCallback(() => {
    let live = true;
    setState({ k: 'loading' });
    fetchAgentFactory()
      .then((r) => {
        if (!live) return;
        const card = r.agents.find((a) => a.domainKey === domainKey);
        setState(card ? { k: 'ready', card } : { k: 'not_found' });
      })
      .catch((e: unknown) => { if (live) setState({ k: 'error', message: errorMessage(e, 'Could not load this agent.') }); });
    return () => { live = false; };
  }, [domainKey]);

  useEffect(() => load(), [load]);

  return (
    <div>
      <PageHeader
        title="Agent"
        subtitle="The agent's status, owner, repo and build progress"
        icon="robot-2-line"
        breadcrumb={[
          { label: 'Admin', to: '/admin/dashboard' },
          { label: 'Interns', to: '/admin/internship' },
          { label: 'Agents' },
        ]}
      />
      {state.k === 'loading' && <div className="text-muted p-4">Loading the agent…</div>}
      {state.k === 'not_found' && (
        <div className="p-4">
          <p className="text-muted">That agent domain was not found.</p>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => navigate('/admin/internship?view=agents')}>
            Back to Agents
          </button>
        </div>
      )}
      {state.k === 'error' && (
        <div className="p-4">
          <p className="text-danger">{state.message}</p>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={load}>Try again</button>
        </div>
      )}
      {state.k === 'ready' && <AgentDomainBody card={state.card} onOpenDashboard={(id) => navigate(`/admin/agents/${id}`)} />}
    </div>
  );
};

export default AdminAgentDomainPage;
