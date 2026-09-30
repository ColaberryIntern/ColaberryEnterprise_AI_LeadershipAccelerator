import React, { useEffect, useState, useCallback } from 'react';
import { timeAgo } from '../shell/trust';
import { adv2PillClass } from './adv2PillTone';
import { ManagerDirective, listDirectives, revokeDirective } from '../../../services/managerDirectiveApi';

// Track A2 (2026-09-22) — extracted out of AgentTrustControlTab.tsx (which
// hit this repo's 500-line ceiling once the 2 new Authority & controls cards
// were added) and reflowed to this page's adv2-* visual language. Pure
// extraction: zero logic change from the original Standing Directives
// section (view + revoke; creating a new directive stays in Talk's
// Ask/Direct composer, its natural home).

interface Props {
  agentId: string;
}

export default function AgentTrustControlDirectives({ agentId }: Props) {
  const [directives, setDirectives] = useState<ManagerDirective[]>([]);
  const [directivesLoading, setDirectivesLoading] = useState(true);
  const [directivesError, setDirectivesError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

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

  useEffect(() => { fetchDirectives(); }, [fetchDirectives]);

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
    <div className="adv2-card" style={{ marginTop: 22 }}>
      <h2>Standing Directives<span className="adv2-hint">Review and revoke this agent's active directives here. To create a new one, use Ask/Direct on the Talk tab.</span></h2>
      <div>
        {directivesError && <p className="adv2-body" style={{ color: 'var(--adv2-bad)' }}>{directivesError}</p>}
        {directivesLoading && <p className="adv2-body adv2-muted">Loading…</p>}
        {!directivesLoading && directives.length === 0 && (
          <p className="adv2-body adv2-muted">No directives have been given to this agent yet.</p>
        )}
        {!directivesLoading && activeDirectives.map((d) => (
          <div key={d.id} className="adv2-task">
            <div>
              <span className={adv2PillClass('success')}>Active</span>
              <p style={{ margin: '8px 0 4px' }}>{d.directiveText}</p>
              <p className="adv2-muted" style={{ margin: 0, fontSize: 13.5 }}>Set by {d.createdByEmail}, {timeAgo(d.createdAt)}</p>
            </div>
            <button className="adv2-btn" disabled={revokingId === d.id} onClick={() => handleRevoke(d.id)}>
              {revokingId === d.id ? 'Working…' : 'Revoke'}
            </button>
          </div>
        ))}
        {!directivesLoading && revokedDirectives.map((d) => (
          <div key={d.id} className="adv2-body" style={{ borderTop: '1px solid var(--adv2-rule)' }}>
            <span className={adv2PillClass('neutral')}>Revoked</span>
            <p className="adv2-muted" style={{ margin: '8px 0 4px' }}>{d.directiveText}</p>
            <p className="adv2-muted" style={{ margin: 0, fontSize: 13.5 }}>
              Set by {d.createdByEmail}, {timeAgo(d.createdAt)}
              {d.revokedByEmail && d.revokedAt && <> · Revoked by {d.revokedByEmail}, {timeAgo(d.revokedAt)}</>}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
