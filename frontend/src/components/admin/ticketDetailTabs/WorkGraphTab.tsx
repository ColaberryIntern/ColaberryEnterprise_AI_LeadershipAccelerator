import React, { useState, useEffect, useCallback } from 'react';
import MermaidDiagram from '../../visuals/MermaidDiagram';

// ProofDesk Milestone 3 — Work Graph tab goes live (spec §15.3). M2 shipped this as
// a static, no-fetch placeholder ("coming in a future milestone"); this wires it to
// the real `GET /api/admin/tickets/:id/work-graph` (T010) and reuses the existing
// `MermaidDiagram` component (frontend/src/components/visuals/MermaidDiagram.tsx —
// already used elsewhere in this repo, CDN-loaded, brand-themed, graceful fallback)
// for the DAG visualization rather than building a new diagram library from
// scratch, per this milestone's execution contract.
//
// Split into a data-fetching shell (WorkGraphTab, default export) and a pure
// presentational component (WorkGraphContent, named export) so the DAG-rendering
// logic is testable synchronously with `renderToStaticMarkup` (this repo's
// established frontend-test convention — no @testing-library/react installed in
// this environment, see kitConfig/__tests__/*.smoke.test.tsx) without needing to
// await the fetch/useEffect cycle.

export interface WorkUnit {
  id: string;
  title: string;
  status: string;
  required_capability: string;
  risk_tier: string;
  assigned_agent_name: string | null;
  assigned_run_id: string | null;
  activeLease: { id: string; lease_owner: string; expires_at: string } | null;
}

export interface WorkUnitDependencyEdge {
  id: string;
  work_unit_id: string;
  depends_on_work_unit_id: string;
  dependency_type: string;
}

const STATUS_BADGES: Record<string, string> = {
  pending: 'secondary',
  ready: 'info',
  in_progress: 'primary',
  blocked: 'warning',
  done: 'success',
  failed: 'danger',
  cancelled: 'secondary',
};

const STATUS_CLASSDEFS = [
  'classDef status_pending fill:#e2e8f0,stroke:#718096,color:#2d3748',
  'classDef status_ready fill:#bee3f8,stroke:#2b6cb0,color:#2d3748',
  'classDef status_in_progress fill:#fefcbf,stroke:#d69e2e,color:#2d3748',
  'classDef status_blocked fill:#fed7d7,stroke:#e53e3e,color:#2d3748',
  'classDef status_done fill:#c6f6d5,stroke:#38a169,color:#2d3748',
  'classDef status_failed fill:#fed7d7,stroke:#e53e3e,color:#2d3748',
  'classDef status_cancelled fill:#e2e8f0,stroke:#718096,color:#2d3748',
];

/** Builds a Mermaid `flowchart TD` string from work units + dependency edges.
 * Edge direction: depends_on_work_unit_id -> work_unit_id (the prerequisite
 * points at the thing it unblocks), matching how a reader expects a DAG to read
 * top-to-bottom. Pure function — no fetch, no React — so it's directly unit
 * testable without rendering anything. */
export function buildMermaidChart(workUnits: WorkUnit[], dependencies: WorkUnitDependencyEdge[]): string {
  const idToNode = new Map(workUnits.map((u, i) => [u.id, `n${i}`]));
  const lines: string[] = ['flowchart TD'];

  for (const u of workUnits) {
    const nodeId = idToNode.get(u.id);
    const safeLabel = u.title.replace(/"/g, "'");
    lines.push(`  ${nodeId}["${safeLabel}"]:::status_${u.status}`);
  }
  for (const d of dependencies) {
    const from = idToNode.get(d.depends_on_work_unit_id);
    const to = idToNode.get(d.work_unit_id);
    if (from && to) lines.push(`  ${from} --> ${to}`);
  }
  lines.push(...STATUS_CLASSDEFS.map((c) => `  ${c}`));

  return lines.join('\n');
}

function formatExpiry(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface ContentProps {
  ticketId: string;
  workUnits: WorkUnit[];
  dependencies: WorkUnitDependencyEdge[];
}

/** Pure presentational rendering — no fetch, no state. Handles the empty state
 * (most tickets: no work units, since they're opt-in) honestly, same
 * no-fabrication discipline M2's summary generator established, rather than
 * pretending there's a graph to show. */
export function WorkGraphContent({ ticketId, workUnits, dependencies }: ContentProps) {
  if (workUnits.length === 0) {
    return (
      <div className="text-muted small py-4">
        No work units on this ticket yet. Work units are created explicitly for
        tickets that need multi-step, multi-agent coordination — most tickets don't
        need one, and none is created automatically.
      </div>
    );
  }

  const chart = buildMermaidChart(workUnits, dependencies);
  const unitWord = workUnits.length === 1 ? 'unit' : 'units';
  const depWord = dependencies.length === 1 ? 'dependency' : 'dependencies';

  return (
    <div>
      <MermaidDiagram
        chart={chart}
        caption={`${workUnits.length} work ${unitWord}, ${dependencies.length} ${depWord}`}
        id={`work-graph-${ticketId}`}
      />
      <h6 className="fw-semibold small mb-2 mt-3">Work units</h6>
      <div className="list-group list-group-flush">
        {workUnits.map((u) => (
          <div key={u.id} className="list-group-item px-0 py-2 small">
            <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
              <span
                className={`badge bg-${STATUS_BADGES[u.status] || 'secondary'}`}
                style={{ fontSize: '0.65rem', minWidth: 70 }}
              >
                {u.status.replace('_', ' ')}
              </span>
              <span className="fw-medium">{u.title}</span>
            </div>
            <div className="text-muted d-flex gap-3 flex-wrap" style={{ fontSize: '0.75rem' }}>
              <span>Capability: {u.required_capability}</span>
              {u.assigned_agent_name && <span>Agent: {u.assigned_agent_name}</span>}
              {u.activeLease ? (
                <span className="badge bg-info text-dark">
                  Active lease: {u.activeLease.lease_owner} (expires {formatExpiry(u.activeLease.expires_at)})
                </span>
              ) : (
                u.status === 'in_progress' && <span>No active lease</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface Props {
  ticketId: string;
  token: string | null;
}

export default function WorkGraphTab({ ticketId, token }: Props) {
  const [workUnits, setWorkUnits] = useState<WorkUnit[]>([]);
  const [dependencies, setDependencies] = useState<WorkUnitDependencyEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchWorkGraph = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/admin/tickets/${ticketId}/work-graph`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Work graph request failed: ${res.status}`);
      const data = await res.json();
      setWorkUnits(data.workUnits || []);
      setDependencies(data.dependencies || []);
    } catch (err) {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [ticketId, token]);

  useEffect(() => {
    fetchWorkGraph();
  }, [fetchWorkGraph]);

  if (loading) {
    return <div className="text-muted small py-4">Loading work graph...</div>;
  }

  if (error) {
    return (
      <div className="text-muted small py-4">Work graph unavailable right now — try reopening this ticket.</div>
    );
  }

  return <WorkGraphContent ticketId={ticketId} workUnits={workUnits} dependencies={dependencies} />;
}
