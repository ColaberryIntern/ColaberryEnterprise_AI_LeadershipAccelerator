import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getAgentDetail, AgentDetail } from '../../services/agentDetailApi';
import { PageHeader, StatCard, SectionCard } from '../../components/admin/shell';

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

  const { agent, identity, live_status, tickets } = detail;

  return (
    <>
      <PageHeader
        title={agent.agent_name}
        icon="robot-2-line"
        subtitle={agent.description || undefined}
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: agent.agent_name }]}
        actions={
          <button className="btn btn-outline-primary btn-sm" onClick={fetchDetail} disabled={loading}>
            <i className="ri-refresh-line" aria-hidden="true" /> Refresh
          </button>
        }
      >
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
            <StatCard label="Open tickets" value={tickets.filter((t) => t.status !== 'done' && t.status !== 'cancelled').length} icon="ticket-2-line" tone="neutral" />
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

      <SectionCard title="System prompt" icon="chat-3-line" subtitle="The real, current text sent to the model for every conversation this agent has.">
        {agent.system_prompt ? (
          <pre className="bg-light p-3 rounded" style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', maxHeight: '420px', overflowY: 'auto' }}>
            {agent.system_prompt}
          </pre>
        ) : (
          <p className="text-muted mb-0">No system prompt recorded.</p>
        )}
      </SectionCard>

      <SectionCard title="Tools & capabilities" icon="tools-line" subtitle="What this agent is actually permitted to do today — not an aspirational list.">
        {agent.tools_granted && agent.tools_granted.length > 0 ? (
          <ul className="list-unstyled mb-0">
            {agent.tools_granted.map((tool) => (
              <li key={tool} className="mb-1">
                <span className="badge bg-secondary-subtle text-secondary-emphasis me-2">
                  <i className="ri-checkbox-circle-line" aria-hidden="true" />
                </span>
                <code>{tool}</code>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted mb-0">No tools recorded.</p>
        )}
      </SectionCard>

      <SectionCard title="Ticket activity" icon="ticket-2-line" subtitle="Every ProofDesk ticket assigned to this agent — real, linked, followable to closure." padded={false}>
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead className="table-light">
              <tr>
                <th>Ticket</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Type</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {tickets.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-muted text-center py-3">No ticket activity yet.</td>
                </tr>
              ) : (
                tickets.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <Link to={`/admin/tickets?open=${t.id}`}>
                        {t.ticket_number ? `#${t.ticket_number}` : ''} {t.title}
                      </Link>
                    </td>
                    <td><span className="badge bg-light text-dark border">{t.status}</span></td>
                    <td>{t.priority}</td>
                    <td><code>{t.type}</code></td>
                    <td>{t.updated_at ? new Date(t.updated_at).toLocaleString() : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </>
  );
}
