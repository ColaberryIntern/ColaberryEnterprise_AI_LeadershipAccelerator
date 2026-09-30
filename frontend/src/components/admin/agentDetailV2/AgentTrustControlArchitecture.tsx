import React, { useState } from 'react';
import { timeAgo } from '../shell/trust';
import { AgentDetail } from '../../../services/agentDetailApi';

// Track A2 (2026-09-22) — extracted out of AgentTrustControlTab.tsx (which
// hit this repo's 500-line ceiling once the 2 new Authority & controls cards
// were added) and reflowed to this page's adv2-* visual language. Pure
// extraction: zero logic change from the original Architecture drawer.

interface Props {
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

export default function AgentTrustControlArchitecture({ detail }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="adv2-card" style={{ marginTop: 22 }}>
      <h2>
        Architecture
        <span className="adv2-hint">Platform-level configuration for this agent — not shown anywhere else on this page.</span>
        <span className="adv2-right">
          <button className="adv2-btn" onClick={() => setDrawerOpen((o) => !o)}>{drawerOpen ? 'Collapse' : 'Expand'}</button>
        </span>
      </h2>
      {drawerOpen && (
        <div className="adv2-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <div>
            <div className="adv2-muted" style={{ fontSize: 12.5, textTransform: 'uppercase' }}>Department</div>
            <div>{detail.agent.department || 'Unclassified'}</div>
          </div>
          <div>
            <div className="adv2-muted" style={{ fontSize: 12.5, textTransform: 'uppercase' }}>Registry module</div>
            <div>{detail.agent.module || '—'}</div>
          </div>
          <div>
            <div className="adv2-muted" style={{ fontSize: 12.5, textTransform: 'uppercase' }}>Source file</div>
            <div>{detail.agent.source_file || '—'}</div>
          </div>
          <div>
            <div className="adv2-muted" style={{ fontSize: 12.5, textTransform: 'uppercase' }}>Max runs / hour</div>
            <div>{executionLimit(detail.agent.max_runs_per_hour, DEFAULT_MAX_RUNS_PER_HOUR)}</div>
          </div>
          <div>
            <div className="adv2-muted" style={{ fontSize: 12.5, textTransform: 'uppercase' }}>Max writes / execution</div>
            <div>{executionLimit(detail.agent.max_writes_per_execution, DEFAULT_MAX_WRITES_PER_EXECUTION)}</div>
          </div>
          <div>
            <div className="adv2-muted" style={{ fontSize: 12.5, textTransform: 'uppercase' }}>Max proposals / run</div>
            <div>{executionLimit(detail.agent.max_proposals_per_run, DEFAULT_MAX_PROPOSALS_PER_RUN)}</div>
          </div>
          <div>
            <div className="adv2-muted" style={{ fontSize: 12.5, textTransform: 'uppercase' }}>Autonomy level set</div>
            <div>
              {detail.agent.autonomy_level_set_at
                ? timeAgo(detail.agent.autonomy_level_set_at)
                : 'Never — sitting on the untouched default'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
