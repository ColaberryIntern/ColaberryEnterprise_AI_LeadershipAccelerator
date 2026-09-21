import React, { useEffect, useState, useCallback } from 'react';
import { getAgentExplainability, AgentExplainability } from '../../../services/agentExplainabilityApi';
import { timeAgo } from '../shell/trust';
import type { TabKey } from './AgentDetailV2Header';

// Dashboard redesign — "Work, explained": the Overview tab's narrative
// preview of the same real Decision Journal already on the Work &
// Decisions tab (AgentWorkDecisionsTab.tsx's getAgentExplainability()
// call) — no new backend data, no generated narrative, same real
// ai_events/ProposedAgentAction rows, just the most recent few surfaced
// where an "at a glance" reader lands first. "View full decision journal"
// hands off to the real tab via the same onNavigate(TabKey) mechanism
// AgentOverviewV2NeedsAli.tsx already uses.

const PREVIEW_COUNT = 6;

interface TimelineEntry {
  key: string;
  createdAt: string;
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
  detail: string;
}

function toTimelineEntries(data: AgentExplainability): TimelineEntry[] {
  const events: TimelineEntry[] = data.events.map((e, i) => {
    if (e.authorization) {
      const tone = e.authorization.verdict === 'block' ? 'danger' : e.authorization.verdict === 'approval' ? 'warning' : 'success';
      return { key: `e${i}`, createdAt: e.createdAt, label: e.authorization.verdict, tone, detail: `Authorization check — ${e.authorization.reason}` };
    }
    const tone = e.outcome === 'success' ? 'success' : e.outcome === 'failure' ? 'danger' : 'neutral';
    return { key: `e${i}`, createdAt: e.createdAt, label: e.outcome, tone, detail: e.eventType };
  });
  const proposals: TimelineEntry[] = data.proposedActions.map((a, i) => {
    const tone = a.status === 'approved' || a.status === 'applied' ? 'success' : a.status === 'rejected' ? 'danger' : 'warning';
    return { key: `p${i}`, createdAt: a.createdAt, label: a.status, tone, detail: `${a.actionType} — "${a.reason}"` };
  });
  return [...events, ...proposals].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

const TONE_DOT: Record<TimelineEntry['tone'], string> = {
  success: 'var(--adv2-ok, #1a7f37)',
  warning: 'var(--adv2-warn, #9a6700)',
  danger: 'var(--adv2-bad, #cf222e)',
  neutral: 'var(--adv2-muted, #6e7781)',
};

interface Props {
  agentId: string;
  onNavigate: (tab: TabKey) => void;
}

export default function AgentOverviewV2WorkExplained({ agentId, onNavigate }: Props) {
  const [data, setData] = useState<AgentExplainability | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getAgentExplainability(agentId));
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load work history');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const entries = data ? toTimelineEntries(data).slice(0, PREVIEW_COUNT) : [];

  return (
    <section className="adv2-card">
      <h2>
        Work, explained <span className="adv2-hint">Real recorded decisions, most recent first</span>
      </h2>
      {loading && (
        <div style={{ padding: '16px 18px' }} className="adv2-muted">
          <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
          Loading…
        </div>
      )}
      {error && (
        <div style={{ padding: '16px 18px' }}>
          <div className="alert alert-warning py-2 mb-0 small">{error}</div>
        </div>
      )}
      {!loading && !error && entries.length === 0 && (
        <p className="adv2-muted" style={{ padding: '16px 18px', margin: 0 }}>
          No decisions or events recorded for this agent yet.
        </p>
      )}
      {!loading && !error && entries.length > 0 && (
        <ul className="list-unstyled mb-0">
          {entries.map((entry) => (
            <li key={entry.key} className="d-flex gap-3" style={{ padding: '10px 18px', borderTop: '1px solid var(--adv2-rule)' }}>
              <span
                aria-hidden="true"
                style={{ width: 8, height: 8, borderRadius: '50%', background: TONE_DOT[entry.tone], marginTop: 6, flexShrink: 0 }}
              />
              <div style={{ minWidth: 0 }}>
                <span className="text-muted small" style={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>{timeAgo(entry.createdAt)}</span>
                <span className="ms-2 small text-capitalize fw-semibold">{entry.label}</span>
                <span className="ms-2 small text-muted">{entry.detail}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div style={{ padding: '12px 18px', borderTop: '1px solid var(--adv2-rule)' }}>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => onNavigate('decisions')}>
          View full decision journal
        </button>
      </div>
    </section>
  );
}
