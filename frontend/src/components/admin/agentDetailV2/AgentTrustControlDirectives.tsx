import React, { useEffect, useState, useCallback } from 'react';
import { timeAgo } from '../shell/trust';
import { adv2PillClass } from './adv2PillTone';
import {
  ManagerDirective, DirectivePosture, listDirectivesWithPosture, revokeDirective,
} from '../../../services/managerDirectiveApi';

// Track A2 (2026-09-22) — extracted out of AgentTrustControlTab.tsx (which
// hit this repo's 500-line ceiling once the 2 new Authority & controls cards
// were added) and reflowed to this page's adv2-* visual language. Pure
// extraction: zero logic change from the original Standing Directives
// section (view + revoke; creating a new directive stays in Talk's
// Ask/Direct composer, its natural home).

interface Props {
  agentId: string;
}

/** Surface keys come from the backend; a manager should not have to read snake_case. */
function surfaceLabel(surface: string): string {
  if (surface === 'manager_conversation') return 'manager conversations';
  if (surface === 'own_reply_runtime') return "this agent's own replies";
  return surface;
}

export default function AgentTrustControlDirectives({ agentId }: Props) {
  const [directives, setDirectives] = useState<ManagerDirective[]>([]);
  const [posture, setPosture] = useState<DirectivePosture | null>(null);
  const [directivesLoading, setDirectivesLoading] = useState(true);
  const [directivesError, setDirectivesError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const fetchDirectives = useCallback(async () => {
    setDirectivesLoading(true);
    setDirectivesError(null);
    try {
      const { directives: rows, posture: p } = await listDirectivesWithPosture(agentId);
      setDirectives(rows);
      setPosture(p);
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
      {/*
        AF12.8 — a list of "Active" directives reads as a list of rules in force, and it is not
        one. This says so before the list rather than after it, and it names any live surface
        the directives do not reach, because that is the part a manager cannot otherwise find
        out. Derived server-side from the prompt wiring; see services/agentBlueprint/directivePosture.ts.
      */}
      {posture && (
        <div style={{ marginBottom: 16 }}>
          <span className={adv2PillClass(posture.notInjectedBy.length > 0 ? 'warning' : 'info')}>
            {posture.mechanism === 'advisory' ? 'Advisory' : 'Enforced'}
          </span>
          <p className="adv2-body adv2-muted" style={{ margin: '8px 0 0', fontSize: 13.5 }}>
            {posture.mechanismReason}
          </p>
          <p className="adv2-body adv2-muted" style={{ margin: '6px 0 0', fontSize: 13.5 }}>
            Reaches {posture.injectedBy.map(surfaceLabel).join(' and ') || 'no surface'}.
            {posture.notInjectedBy.length > 0 && (
              <> Does <strong>not</strong> reach {posture.notInjectedBy.map(surfaceLabel).join(' or ')}, so a directive here will not change what this agent says there.</>
            )}
          </p>
        </div>
      )}
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
