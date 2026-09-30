/**
 * AgentOrphansPage — admin tool for adopting untagged agent files.
 *
 * Lists every agent .ts file that has neither a SERVES_CAPABILITY export
 * (D2 declarative metadata) nor an active row in capability_agent_maps
 * for the current project. For each row, surfaces D3 import-graph
 * suggestions (top 5) with score + evidence. Operator can:
 *   - Click Adopt to attach the agent to the top-scoring suggested cap
 *   - Use the dropdown to pick a different cap from the full project list
 *   - Bulk-adopt all rows whose top suggestion score is >= 3 (high confidence)
 *
 * Default project is Ali's Accelerator (fcce50ef…) — operator can override
 * via the input. All writes go to capability_agent_maps with
 * linked_by='orphan-adoption-2026-05-26'.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listOrphans, listProjectCapabilities, adoptOrphan,
  type OrphanAgent, type CapabilityRef, type AdoptInput,
} from '../../services/agentOrphanApi';
import { PageHeader, StatCard, StatusBadge, SectionCard } from '../../components/admin/shell';
import { TrustSignal } from '../../components/admin/shell/trust';

const DEFAULT_PROJECT_ID = 'fcce50ef-fe01-471d-a3ff-cd6948d092c2'; // Colaberry Enterprise AI Accelerator

type AdoptionStatus = 'idle' | 'adopting' | 'adopted' | 'error';

interface RowState {
  status: AdoptionStatus;
  message?: string;
  // The cap actually adopted (so we can show "Adopted to X")
  adoptedCapName?: string;
}

const AgentOrphansPage: React.FC = () => {
  const [projectId, setProjectId] = useState(DEFAULT_PROJECT_ID);
  const [projectIdInput, setProjectIdInput] = useState(DEFAULT_PROJECT_ID);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orphans, setOrphans] = useState<OrphanAgent[]>([]);
  const [stats, setStats] = useState<{ scanned: number; declared: number; alreadyMapped: number } | null>(null);
  const [caps, setCaps] = useState<CapabilityRef[]>([]);
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const [filter, setFilter] = useState('');
  const [bulkRunning, setBulkRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orphanRes, capRes] = await Promise.all([
        listOrphans(projectId),
        listProjectCapabilities(projectId),
      ]);
      setOrphans(orphanRes.orphans);
      setStats({
        scanned: orphanRes.scannedCount,
        declared: orphanRes.skippedDeclared,
        alreadyMapped: orphanRes.skippedAlreadyMapped,
      });
      setCaps(capRes);
      setRowStates({});
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load orphans');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const filteredOrphans = useMemo(() => {
    const q = filter.toLowerCase().trim();
    if (!q) return orphans;
    return orphans.filter(o =>
      o.agentName.toLowerCase().includes(q)
      || o.sourcePath.toLowerCase().includes(q)
      || o.suggestions.some(s => s.capName.toLowerCase().includes(q))
    );
  }, [orphans, filter]);

  const adopt = async (orphan: OrphanAgent, capabilityId: string, capName: string) => {
    setRowStates(s => ({ ...s, [orphan.agentName]: { status: 'adopting' } }));
    try {
      const input: AdoptInput = { projectId, agentName: orphan.agentName, capabilityId };
      const res = await adoptOrphan(input);
      setRowStates(s => ({
        ...s,
        [orphan.agentName]: {
          status: 'adopted',
          message: res.action === 'inserted' ? 'Adopted' : res.action === 'reactivated' ? 'Reactivated' : 'Already active',
          adoptedCapName: capName,
        },
      }));
    } catch (e: any) {
      setRowStates(s => ({
        ...s,
        [orphan.agentName]: { status: 'error', message: e?.response?.data?.error || e?.message || 'Adoption failed' },
      }));
    }
  };

  const bulkAdoptHighConfidence = async () => {
    if (bulkRunning) return;
    setBulkRunning(true);
    const candidates = filteredOrphans.filter(o => {
      const top = o.suggestions[0];
      const state = rowStates[o.agentName];
      return top && top.score >= 3 && (!state || state.status === 'idle');
    });
    for (const o of candidates) {
      const top = o.suggestions[0];
      // eslint-disable-next-line no-await-in-loop
      await adopt(o, top.capId, top.capName);
    }
    setBulkRunning(false);
  };

  const eligibleForBulk = useMemo(
    () => filteredOrphans.filter(o => (o.suggestions[0]?.score || 0) >= 3 && !rowStates[o.agentName]).length,
    [filteredOrphans, rowStates],
  );

  // Per-page trust signal (Basecamp todo 10027085963) derived from the live orphan scan.
  const trust: TrustSignal = useMemo(() => {
    const scanned = stats?.scanned ?? 0;
    const open = orphans.length;
    return {
      level: 'live',
      source: 'agent orphans',
      updatedAt: new Date().toISOString(),
      summary: `${open} unmapped agent${open === 1 ? '' : 's'} across ${scanned} scanned file${scanned === 1 ? '' : 's'}.`,
      href: '/admin/trust',
      pillars: [
        {
          name: 'Coverage',
          status: 'live',
          evidence: [
            { label: 'Orphans', value: String(open) },
            { label: 'Scanned', value: String(scanned) },
          ],
        },
      ],
    };
  }, [stats, orphans]);

  return (
    <>
      <PageHeader
        title="Agent Orphans"
        icon="robot-2-line"
        subtitle="Agent files in the codebase that aren't mapped to a capability yet. Each row shows the import-graph's best guesses; confirm or pick a different cap."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Agent Orphans' }]}
        trust={trust}
        actions={
          <button className="btn btn-outline-secondary btn-sm" onClick={load} disabled={loading}>
            <i className="ri-refresh-line me-1" aria-hidden="true" />
            {loading ? 'Loading…' : 'Reload'}
          </button>
        }
      >
        {stats && (
          <div className="row g-3">
            <div className="col-6 col-lg-3">
              <StatCard label="Open orphans" value={orphans.length} icon="robot-2-line" tone="warning" />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard label="Scanned" value={stats.scanned} icon="file-search-line" tone="info" />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard label="Skipped (D2 declared)" value={stats.declared} icon="checkbox-circle-line" tone="success" />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard label="Skipped (already mapped)" value={stats.alreadyMapped} icon="links-line" tone="neutral" />
            </div>
          </div>
        )}
      </PageHeader>

      <div className="mb-3">
        <SectionCard>
          <div className="row g-2 align-items-center">
            <div className="col-md-6">
              <label className="form-label small fw-semibold text-muted mb-1" htmlFor="orphan-project-id">Project ID</label>
              <div className="input-group input-group-sm">
                <input
                  id="orphan-project-id"
                  type="text" className="form-control font-monospace"
                  value={projectIdInput}
                  onChange={(e) => setProjectIdInput(e.target.value)}
                  placeholder="uuid"
                />
                <button
                  className="btn btn-outline-primary"
                  onClick={() => setProjectId(projectIdInput.trim())}
                  disabled={!projectIdInput.trim() || projectIdInput.trim() === projectId}
                >
                  Load
                </button>
              </div>
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-semibold text-muted mb-1" htmlFor="orphan-filter">Filter</label>
              <input
                id="orphan-filter"
                type="text" className="form-control form-control-sm"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="agent name, file path, or cap name…"
              />
            </div>
          </div>
        </SectionCard>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
        <div className="small text-muted">
          Showing <strong className="text-dark">{filteredOrphans.length}</strong>
          {filter ? ` of ${orphans.length} orphans (filter applied)` : ' orphans'}
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={bulkAdoptHighConfidence}
          disabled={bulkRunning || eligibleForBulk === 0}
          title="Adopt every visible orphan whose top suggestion has score >= 3 (high confidence: 2+ matches or 1 match + name-stem boost)"
        >
          <i className="ri-sparkling-line me-1" aria-hidden="true" />
          {bulkRunning ? 'Adopting…' : `Confirm all high-confidence (${eligibleForBulk})`}
        </button>
      </div>

      <SectionCard padded={false}>
        <div className="table-responsive">
          <table className="table table-sm align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th style={{ width: '24%' }}>Agent</th>
                <th style={{ width: '34%' }}>Top suggestion (D3 import graph)</th>
                <th style={{ width: '10%' }} className="text-center">Score</th>
                <th style={{ width: '32%' }} className="text-end">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrphans.length === 0 && !loading && (
                <tr><td colSpan={4} className="text-center text-muted py-4">No orphans match.</td></tr>
              )}
              {filteredOrphans.map(o => {
                const state = rowStates[o.agentName];
                const top = o.suggestions[0];
                const adopted = state?.status === 'adopted';
                return (
                  <tr key={o.agentName} className={adopted ? 'table-success' : undefined}>
                    <td>
                      <div className="fw-semibold small">{o.agentName}</div>
                      <div className="text-muted font-monospace" style={{ fontSize: 11 }}>{o.sourcePath}</div>
                    </td>
                    <td>
                      {top ? (
                        <>
                          <div className="fw-semibold small">
                            {top.capName}
                            {top.nameStemBoost && (
                              <span className="ms-2"><StatusBadge label="name match" tone="info" /></span>
                            )}
                          </div>
                          <div className="text-muted" style={{ fontSize: 11 }}>
                            {top.evidence.length} import{top.evidence.length === 1 ? '' : 's'}
                            {o.suggestions.length > 1 && ` · ${o.suggestions.length - 1} other suggestion${o.suggestions.length - 1 === 1 ? '' : 's'}`}
                          </div>
                        </>
                      ) : (
                        <span className="text-muted fst-italic small">No import-graph signal — pick a cap manually</span>
                      )}
                    </td>
                    <td className="text-center">
                      {top ? (
                        <StatusBadge
                          label={String(top.score)}
                          tone={top.score >= 3 ? 'success' : top.score >= 2 ? 'warning' : 'neutral'}
                        />
                      ) : <span className="text-muted">—</span>}
                    </td>
                    <td className="text-end">
                      {adopted ? (
                        <span className="text-success small">
                          <i className="ri-checkbox-circle-fill-line me-1" aria-hidden="true" />
                          {state?.message}: <strong>{state?.adoptedCapName}</strong>
                        </span>
                      ) : state?.status === 'error' ? (
                        <span className="text-danger small">
                          <i className="ri-error-warning-line me-1" aria-hidden="true" />
                          {state?.message}
                        </span>
                      ) : (
                        <div className="d-inline-flex gap-2 align-items-center">
                          {top && (
                            <button
                              className="btn btn-outline-primary btn-sm"
                              onClick={() => adopt(o, top.capId, top.capName)}
                              disabled={state?.status === 'adopting'}
                              title={`Adopt as agent of "${top.capName}"`}
                            >
                              {state?.status === 'adopting' ? 'Adopting…' : 'Adopt'}
                            </button>
                          )}
                          <select
                            className="form-select form-select-sm"
                            style={{ maxWidth: 220 }}
                            value=""
                            onChange={(e) => {
                              const capId = e.target.value;
                              if (!capId) return;
                              const cap = caps.find(c => c.id === capId);
                              if (cap) adopt(o, capId, cap.name);
                            }}
                            disabled={state?.status === 'adopting'}
                          >
                            <option value="">Other cap…</option>
                            {caps.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {loading && (
        <div className="text-center py-4 text-muted">
          <div className="spinner-border spinner-border-sm me-2" role="status" />
          Scanning the agent universe… (one DB round-trip + filesystem walk)
        </div>
      )}
    </>
  );
};

export default AgentOrphansPage;
