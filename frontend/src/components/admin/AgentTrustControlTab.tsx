import React, { useEffect, useState, useCallback } from 'react';
import { SectionCard, StatusBadge } from './shell';
import { timeAgo } from './shell/trust';
import AgentCharterTab from './AgentCharterTab';
import { AgentDetail } from '../../services/agentDetailApi';
import {
  AgentMemoryProposal,
  listMemoryProposals,
  proposeMemory,
  approveMemoryProposal,
  rejectMemoryProposal,
} from '../../services/agentMemoryProposalApi';
import { ManagerDirective, listDirectives, revokeDirective } from '../../services/managerDirectiveApi';

// AI Agent Dashboard redesign, Checkpoint E: Trust & Control, slice 1
// (2026-09-03) — the fifth and last design section. Consolidates the
// previously-standalone Charter tab (reused wholesale, unchanged) plus two
// genuinely new-to-any-UI pieces: Governed Memory (the approval gate that
// makes an agent's runtime memory real rather than a dead flag — status
// must visually read as an actual gate, not decoration) and a consolidated
// Directives view (view + revoke; creating a new directive stays in Talk's
// Ask/Direct composer, its natural home). Deliberately does NOT re-render
// authorization_summary/tools capabilities/persona_version_history a second
// time — AgentOverviewTab's AgentTrustSummaryCard + tools cards already show
// all of that, live and tested; duplicating it here would drift. An
// Architecture Drawer (execution limits, department/scope — real AiAgent
// columns not yet surfaced anywhere) is real, deliberately deferred scope
// for the next slice.

interface Props {
  agentId: string;
  agentName: string;
  detail: AgentDetail;
}

// The real defaults agentPermissionService.ts falls back to when the
// database column is null (an on-demand agent like CoryStrategicAgent never
// goes through the registry-seed default-assignment path) — disclosed
// explicitly here rather than silently substituted, so the drawer never
// shows a fabricated number or a confusing blank for a real null.
const DEFAULT_MAX_RUNS_PER_HOUR = 60;
const DEFAULT_MAX_WRITES_PER_EXECUTION = 100;
const DEFAULT_MAX_PROPOSALS_PER_RUN = 50;

function executionLimit(value: number | null, fallback: number): string {
  return value === null ? `Not set — ${fallback} applies` : String(value);
}

function goalsDimensionSource(source: 'live' | 'fixed') {
  return source === 'live'
    ? <StatusBadge label="Live" tone="success" icon="pulse-line" />
    : <StatusBadge label="Declared" tone="neutral" icon="file-list-3-line" />;
}

function memoryStatusBadge(status: AgentMemoryProposal['status']) {
  if (status === 'pending') return <StatusBadge label="Pending review" tone="warning" icon="time-line" />;
  if (status === 'approved') return <StatusBadge label="Approved" tone="success" />;
  return <StatusBadge label="Rejected" tone="neutral" />;
}

export default function AgentTrustControlTab({ agentId, agentName, detail }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [proposals, setProposals] = useState<AgentMemoryProposal[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(true);
  const [proposalsError, setProposalsError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const [content, setContent] = useState('');
  const [evidence, setEvidence] = useState('');
  const [proposing, setProposing] = useState(false);
  const [proposeError, setProposeError] = useState<string | null>(null);

  const [directives, setDirectives] = useState<ManagerDirective[]>([]);
  const [directivesLoading, setDirectivesLoading] = useState(true);
  const [directivesError, setDirectivesError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const fetchProposals = useCallback(async () => {
    setProposalsLoading(true);
    setProposalsError(null);
    try {
      setProposals(await listMemoryProposals(agentId));
    } catch (err: any) {
      setProposalsError(err?.response?.data?.error || 'Failed to load memory proposals');
    } finally {
      setProposalsLoading(false);
    }
  }, [agentId]);

  const fetchDirectives = useCallback(async () => {
    setDirectivesLoading(true);
    setDirectivesError(null);
    try {
      setDirectives(await listDirectives(agentId));
    } catch (err: any) {
      setDirectivesError(err?.response?.data?.error || 'Failed to load directives');
    } finally {
      setDirectivesLoading(false);
    }
  }, [agentId]);

  useEffect(() => { fetchProposals(); }, [fetchProposals]);
  useEffect(() => { fetchDirectives(); }, [fetchDirectives]);

  const handlePropose = useCallback(async () => {
    if (!content.trim()) return;
    setProposing(true);
    setProposeError(null);
    try {
      await proposeMemory(agentId, content.trim(), evidence.trim() || undefined);
      setContent('');
      setEvidence('');
      await fetchProposals();
    } catch (err: any) {
      setProposeError(err?.response?.data?.error || 'Failed to propose memory');
    } finally {
      setProposing(false);
    }
  }, [agentId, content, evidence, fetchProposals]);

  const handleDecide = useCallback(async (proposalId: string, decision: 'approve' | 'reject') => {
    setDecidingId(proposalId);
    try {
      if (decision === 'approve') {
        await approveMemoryProposal(agentId, proposalId);
      } else {
        await rejectMemoryProposal(agentId, proposalId);
      }
      await fetchProposals();
    } catch (err: any) {
      setProposalsError(err?.response?.data?.error || `Failed to ${decision} memory proposal`);
    } finally {
      setDecidingId(null);
    }
  }, [agentId, fetchProposals]);

  const handleRevoke = useCallback(async (directiveId: string) => {
    setRevokingId(directiveId);
    try {
      await revokeDirective(agentId, directiveId);
      await fetchDirectives();
    } catch (err: any) {
      setDirectivesError(err?.response?.data?.error || 'Failed to revoke directive');
    } finally {
      setRevokingId(null);
    }
  }, [agentId, fetchDirectives]);

  const activeDirectives = directives.filter((d) => d.status === 'active');
  const revokedDirectives = directives.filter((d) => d.status === 'revoked');

  return (
    <>
      <SectionCard
        title="GOALS™ Score"
        icon="shield-star-line"
        subtitle="Colaberry's operational-excellence framework, from Ram Katamaraja's Trust Before Intelligence — how you measure whether an agent stays trustworthy after it's built. Real score, computed from this agent's own real data."
        padded={false}
      >
        <div className="p-3 border-bottom d-flex align-items-baseline gap-3">
          <span style={{ fontSize: '2.25rem', fontWeight: 700, lineHeight: 1 }}>
            {detail.goals_overall.toFixed(1)}
          </span>
          <span className="text-muted">/ 5 overall</span>
        </div>
        <div className="row g-0">
          {detail.goals.map((g, i) => (
            <div
              key={g.key}
              className={`col-md-6 p-3 ${i % 2 === 0 ? 'border-end' : ''} ${i < detail.goals.length - 2 ? 'border-bottom' : ''}`}
            >
              <div className="d-flex align-items-center justify-content-between mb-1">
                <span className="fw-semibold">{g.label}</span>
                <span className="d-flex align-items-center gap-2">
                  <span className="fw-semibold">{g.score}/5</span>
                  {goalsDimensionSource(g.source)}
                </span>
              </div>
              <p className="text-muted small mb-0">{g.evidence}</p>
            </div>
          ))}
        </div>
        <p className="text-muted small px-3 py-2 mb-0 border-top">
          G-O-A-L-S maps back to the book's own INPACT™ needs: Governance→Permitted, Observability→Transparent, Availability→Instant, Lexicon→Natural/Contextual, Solid→Adaptive.
        </p>
      </SectionCard>

      <AgentCharterTab agentId={agentId} agentName={agentName} />

      <SectionCard
        title="Governed Memory"
        icon="brain-line"
        subtitle="A proposed fact only reaches this agent's real runtime context after a separate, explicit approval here — never automatically."
        padded={false}
      >
        {proposalsError && <div className="p-3"><div className="alert alert-warning py-2 mb-0 small">{proposalsError}</div></div>}
        {proposalsLoading && <div className="p-3 text-muted small">Loading…</div>}
        {!proposalsLoading && proposals.length === 0 && (
          <p className="text-muted small text-center py-4 mb-0">No memory has been proposed for this agent yet.</p>
        )}
        {!proposalsLoading && proposals.map((p, i) => (
          <div key={p.id} className={`p-3 ${i < proposals.length - 1 ? 'border-bottom' : ''}`}>
            <div className="d-flex align-items-start justify-content-between gap-2">
              <div>
                {memoryStatusBadge(p.status)}
                <p className="mb-1 mt-2">{p.content}</p>
                {p.evidence && <p className="text-muted small mb-1"><strong>Evidence:</strong> {p.evidence}</p>}
                <div className="text-muted small">
                  Proposed by {p.proposedByEmail}, {timeAgo(p.createdAt)}
                  {p.status !== 'pending' && p.reviewedByEmail && (
                    <> · {p.status} by {p.reviewedByEmail}{p.reviewedAt ? `, ${timeAgo(p.reviewedAt)}` : ''}</>
                  )}
                </div>
              </div>
              {p.status === 'pending' && (
                <div className="d-flex gap-2 flex-shrink-0">
                  <button
                    className="btn btn-success btn-sm"
                    disabled={decidingId === p.id}
                    onClick={() => handleDecide(p.id, 'approve')}
                  >
                    {decidingId === p.id ? 'Working…' : 'Approve'}
                  </button>
                  <button
                    className="btn btn-outline-danger btn-sm"
                    disabled={decidingId === p.id}
                    onClick={() => handleDecide(p.id, 'reject')}
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        <div className="p-3 border-top">
          {proposeError && <div className="alert alert-danger py-2 small">{proposeError}</div>}
          <label className="form-label small fw-semibold">Propose a fact</label>
          <textarea
            className="form-control form-control-sm mb-2"
            rows={2}
            placeholder="What should this agent remember?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={2000}
          />
          <label className="form-label small fw-semibold">Evidence (optional)</label>
          <textarea
            className="form-control form-control-sm mb-2"
            rows={2}
            placeholder="Why is this true? Link, quote, or context."
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            maxLength={4000}
          />
          <button className="btn btn-primary btn-sm" disabled={proposing || !content.trim()} onClick={handlePropose}>
            {proposing ? 'Proposing…' : 'Propose'}
          </button>
        </div>
      </SectionCard>

      <SectionCard
        title="Standing Directives"
        icon="flag-line"
        subtitle="Review and revoke this agent's active directives here. To create a new one, use Ask/Direct on the Talk tab."
        padded={false}
      >
        {directivesError && <div className="p-3"><div className="alert alert-warning py-2 mb-0 small">{directivesError}</div></div>}
        {directivesLoading && <div className="p-3 text-muted small">Loading…</div>}
        {!directivesLoading && directives.length === 0 && (
          <p className="text-muted small text-center py-4 mb-0">No directives have been given to this agent yet.</p>
        )}
        {!directivesLoading && activeDirectives.map((d, i) => (
          <div key={d.id} className={`d-flex align-items-start justify-content-between gap-2 p-3 ${i < activeDirectives.length - 1 || revokedDirectives.length > 0 ? 'border-bottom' : ''}`}>
            <div>
              <StatusBadge label="Active" tone="success" />
              <p className="mb-1 mt-2">{d.directiveText}</p>
              <div className="text-muted small">Set by {d.createdByEmail}, {timeAgo(d.createdAt)}</div>
            </div>
            <button
              className="btn btn-outline-secondary btn-sm flex-shrink-0"
              disabled={revokingId === d.id}
              onClick={() => handleRevoke(d.id)}
            >
              {revokingId === d.id ? 'Working…' : 'Revoke'}
            </button>
          </div>
        ))}
        {!directivesLoading && revokedDirectives.map((d, i) => (
          <div key={d.id} className={`p-3 ${i < revokedDirectives.length - 1 ? 'border-bottom' : ''}`}>
            <StatusBadge label="Revoked" tone="neutral" />
            <p className="mb-1 mt-2 text-muted">{d.directiveText}</p>
            <div className="text-muted small">
              Set by {d.createdByEmail}, {timeAgo(d.createdAt)}
              {d.revokedByEmail && d.revokedAt && <> · Revoked by {d.revokedByEmail}, {timeAgo(d.revokedAt)}</>}
            </div>
          </div>
        ))}
      </SectionCard>

      <SectionCard
        title="Architecture"
        icon="settings-3-line"
        subtitle="Platform-level configuration for this agent — not shown anywhere else on this page."
        padded={false}
        actions={
          <button className="btn btn-outline-secondary btn-sm" onClick={() => setDrawerOpen((o) => !o)}>
            {drawerOpen ? 'Collapse' : 'Expand'}
          </button>
        }
      >
        {drawerOpen && (
          <div className="p-3">
            <div className="row g-3">
              <div className="col-md-4">
                <div className="text-muted small text-uppercase">Department</div>
                <div>{detail.agent.department || 'Unclassified'}</div>
              </div>
              <div className="col-md-4">
                <div className="text-muted small text-uppercase">Registry module</div>
                <div>{detail.agent.module || '—'}</div>
              </div>
              <div className="col-md-4">
                <div className="text-muted small text-uppercase">Source file</div>
                <div>{detail.agent.source_file || '—'}</div>
              </div>
              <div className="col-md-4">
                <div className="text-muted small text-uppercase">Max runs / hour</div>
                <div>{executionLimit(detail.agent.max_runs_per_hour, DEFAULT_MAX_RUNS_PER_HOUR)}</div>
              </div>
              <div className="col-md-4">
                <div className="text-muted small text-uppercase">Max writes / execution</div>
                <div>{executionLimit(detail.agent.max_writes_per_execution, DEFAULT_MAX_WRITES_PER_EXECUTION)}</div>
              </div>
              <div className="col-md-4">
                <div className="text-muted small text-uppercase">Max proposals / run</div>
                <div>{executionLimit(detail.agent.max_proposals_per_run, DEFAULT_MAX_PROPOSALS_PER_RUN)}</div>
              </div>
              <div className="col-md-4">
                <div className="text-muted small text-uppercase">Autonomy level set</div>
                <div>
                  {detail.agent.autonomy_level_set_at
                    ? timeAgo(detail.agent.autonomy_level_set_at)
                    : 'Never — sitting on the untouched default'}
                </div>
              </div>
            </div>
          </div>
        )}
      </SectionCard>
    </>
  );
}
