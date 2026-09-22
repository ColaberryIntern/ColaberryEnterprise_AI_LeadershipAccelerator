import React, { useEffect, useState, useCallback } from 'react';
import { timeAgo } from '../shell/trust';
import { adv2PillClass } from './adv2PillTone';
import {
  AgentMemoryProposal,
  listMemoryProposals,
  proposeMemory,
  approveMemoryProposal,
  rejectMemoryProposal,
} from '../../../services/agentMemoryProposalApi';

// Track A2 (2026-09-22) — extracted out of AgentTrustControlTab.tsx (which
// hit this repo's 500-line ceiling once the 2 new Authority & controls cards
// were added) and reflowed to this page's adv2-* visual language. Pure
// extraction: zero logic change from the original Governed Memory section —
// the approval gate that makes an agent's runtime memory real rather than a
// dead flag; status must visually read as an actual gate, not decoration.

interface Props {
  agentId: string;
}

function memoryStatusBadge(status: AgentMemoryProposal['status']) {
  if (status === 'pending') return <span className={adv2PillClass('warning')}>Pending review</span>;
  if (status === 'approved') return <span className={adv2PillClass('success')}>Approved</span>;
  return <span className={adv2PillClass('neutral')}>Rejected</span>;
}

export default function AgentTrustControlMemory({ agentId }: Props) {
  const [proposals, setProposals] = useState<AgentMemoryProposal[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(true);
  const [proposalsError, setProposalsError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const [content, setContent] = useState('');
  const [evidence, setEvidence] = useState('');
  const [proposing, setProposing] = useState(false);
  const [proposeError, setProposeError] = useState<string | null>(null);

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

  useEffect(() => { fetchProposals(); }, [fetchProposals]);

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

  return (
    <div className="adv2-card" style={{ marginTop: 22 }}>
      <h2>Governed Memory<span className="adv2-hint">A proposed fact only reaches this agent's real runtime context after a separate, explicit approval here — never automatically.</span></h2>
      <div>
        {proposalsError && <p className="adv2-body" style={{ color: 'var(--adv2-bad)' }}>{proposalsError}</p>}
        {proposalsLoading && <p className="adv2-body adv2-muted">Loading…</p>}
        {!proposalsLoading && proposals.length === 0 && (
          <p className="adv2-body adv2-muted">No memory has been proposed for this agent yet.</p>
        )}
        {!proposalsLoading && proposals.map((p) => (
          <div key={p.id} className="adv2-task">
            <div>
              {memoryStatusBadge(p.status)}
              <p style={{ margin: '8px 0 4px' }}>{p.content}</p>
              {p.evidence && <p className="adv2-muted" style={{ margin: '0 0 4px', fontSize: 13.5 }}><strong>Evidence:</strong> {p.evidence}</p>}
              <p className="adv2-muted" style={{ margin: 0, fontSize: 13.5 }}>
                Proposed by {p.proposedByEmail}, {timeAgo(p.createdAt)}
                {p.status !== 'pending' && p.reviewedByEmail && (
                  <> · {p.status} by {p.reviewedByEmail}{p.reviewedAt ? `, ${timeAgo(p.reviewedAt)}` : ''}</>
                )}
              </p>
            </div>
            {p.status === 'pending' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="adv2-btn" disabled={decidingId === p.id} onClick={() => handleDecide(p.id, 'approve')}>
                  {decidingId === p.id ? 'Working…' : 'Approve'}
                </button>
                <button className="adv2-btn adv2-danger" disabled={decidingId === p.id} onClick={() => handleDecide(p.id, 'reject')}>
                  Reject
                </button>
              </div>
            )}
          </div>
        ))}

        <div className="adv2-body" style={{ borderTop: '1px solid var(--adv2-rule)' }}>
          {proposeError && <p style={{ color: 'var(--adv2-bad)' }}>{proposeError}</p>}
          <label className="adv2-muted" style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Propose a fact</label>
          <textarea
            rows={2}
            style={{ width: '100%', marginBottom: 8 }}
            placeholder="What should this agent remember?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={2000}
          />
          <label className="adv2-muted" style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Evidence (optional)</label>
          <textarea
            rows={2}
            style={{ width: '100%', marginBottom: 8 }}
            placeholder="Why is this true? Link, quote, or context."
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            maxLength={4000}
          />
          <button className="adv2-btn adv2-primary" disabled={proposing || !content.trim()} onClick={handlePropose}>
            {proposing ? 'Proposing…' : 'Propose'}
          </button>
        </div>
      </div>
    </div>
  );
}
