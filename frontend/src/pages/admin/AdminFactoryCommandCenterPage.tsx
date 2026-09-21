import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader, StatCard, SectionCard } from '../../components/admin/shell';
import { getFactorySample, getFactoryContract, type FactoryCommandCenterView, type CcFlowNode } from '../../services/factoryApi';

/**
 * AdminFactoryCommandCenterPage — the AI Project Factory Command Center (read-only, Phase 3).
 *
 * Renders one delivery contract's decomposition from the factory read API: the two-track contract,
 * the process flow, the human/AI allocation (every AI task showing its accountable human), the
 * workforce roster, the compliance matrix, the old→new role map, and the gate/approval panel. Serves
 * the Phase-1 sample by default (`?contract=<id>` loads a real one). The approve / request-changes
 * controls are present but DISABLED — the write path lands in Phase 4. Design system: Bootstrap 5 +
 * admin-shell primitives + RemixIcon; no hardcoded hex.
 */

const EXEC_BADGE: Record<string, string> = {
  human: 'bg-secondary-subtle text-secondary-emphasis',
  ai_with_approval: 'bg-info-subtle text-info-emphasis',
  ai_autonomous: 'bg-warning-subtle text-warning-emphasis',
  deterministic_software: 'bg-dark-subtle text-dark-emphasis',
};
const KIND_BADGE: Record<string, string> = {
  DECISION: 'bg-warning-subtle text-warning-emphasis',
  TASK: 'bg-light text-secondary',
  START: 'bg-dark-subtle text-dark-emphasis',
  END: 'bg-dark-subtle text-dark-emphasis',
};
const humanize = (s: string): string => s.replace(/_/g, ' ');

export default function AdminFactoryCommandCenterPage(): React.ReactElement {
  const [params] = useSearchParams();
  const contractId = params.get('contract');
  const [view, setView] = useState<FactoryCommandCenterView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = contractId ? await getFactoryContract(contractId) : await getFactorySample();
      setView(data);
    } catch {
      setError(contractId
        ? 'No decomposition has been generated for this contract yet.'
        : 'Could not load the factory sample. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="admin-page">
      <PageHeader
        title="Factory Command Center"
        subtitle="One delivery contract's process, workforce, and compliance — decomposed and gated."
        icon="node-tree"
      />

      {loading && (
        <div className="text-center py-5">
          <div className="spinner-border text-secondary" role="status"><span className="visually-hidden">Loading…</span></div>
        </div>
      )}

      {error && !loading && (
        <div className="alert alert-danger" role="alert">{error}</div>
      )}

      {view && !loading && (
        <>
          {view.isSample && (
            <div className="alert alert-info d-flex align-items-center" role="alert">
              <i className="ri-information-line me-2" aria-hidden="true" />
              Sample preview — rendered from the Phase-1 factory sample. A real contract appears here once one is generated.
            </div>
          )}

          <div className="row g-3 mb-1">
            <div className="col-6 col-lg-3"><StatCard label="Contract" value={view.contractName} icon="government-line" tone="neutral" /></div>
            <div className="col-6 col-lg-3">
              <StatCard
                label="Gate"
                value={view.gate.ok ? 'Passed' : `${view.gate.errorCount} error${view.gate.errorCount === 1 ? '' : 's'}`}
                icon={view.gate.ok ? 'checkbox-circle-line' : 'error-warning-line'}
                tone={view.gate.ok ? 'success' : 'danger'}
              />
            </div>
            <div className="col-6 col-lg-3"><StatCard label="Tasks" value={view.flow.nodes.filter((n) => n.kind === 'TASK' || n.kind === 'DECISION').length} icon="list-check-2" tone="info" /></div>
            <div className="col-6 col-lg-3"><StatCard label="Workforce" value={`${view.workforce.people} ppl · ${view.workforce.agents} AI`} icon="team-line" tone="primary" /></div>
          </div>

          <SectionCard title="Two-track contract" subtitle="one requirement spine, two workstreams" icon="git-branch-line" className="mb-3">
            <div className="row g-3">
              {view.tracks.map((t) => (
                <div className="col-md-6" key={t.trackType}>
                  <div className="border rounded-3 p-3 h-100">
                    <div className="d-flex justify-content-between align-items-center">
                      <span className="fw-semibold text-capitalize">{humanize(t.trackType)}</span>
                      <span className="badge rounded-pill bg-light text-secondary">{t.status || '—'}</span>
                    </div>
                    <div className="small text-muted mt-2">Owner: {t.owner ?? '—'}</div>
                    <div className="small text-muted">Requirements: {t.requirementIds.join(', ') || '—'}</div>
                    {t.linkedStudentProjectId && (
                      <div className="small text-muted">Solution build → student project {t.linkedStudentProjectId.slice(0, 8)}…</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Process" subtitle={view.process?.businessOutcome} icon="flow-chart" className="mb-3">
            <div className="d-flex gap-2 overflow-auto pb-2">
              {view.flow.nodes.map((n) => <FlowCard key={n.id} n={n} />)}
            </div>
            {view.flow.edges.some((e) => e.condition) && (
              <div className="small text-muted mt-2">
                Decision branches: {view.flow.edges.filter((e) => e.condition).map((e) => e.condition).join(' · ')}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Human / AI allocation" subtitle="who does each task, and who is accountable" icon="scales-3-line" className="mb-3" padded={false}>
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead><tr><th>Task</th><th>Execution</th><th>Performer</th><th>Accountable</th></tr></thead>
                <tbody>
                  {view.allocation.map((a) => (
                    <tr key={a.taskId}>
                      <td><div className="fw-semibold">{a.taskTitle}</div><div className="small text-muted">{a.rationale}</div></td>
                      <td><span className={`badge rounded-pill ${EXEC_BADGE[a.executionClass] ?? 'bg-light text-secondary'}`}>{humanize(a.executionClass)}</span></td>
                      <td>{a.performer ?? '—'}</td>
                      <td>{a.accountable ?? <span className="text-muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <div className="row g-3 mb-3">
            <div className="col-lg-7">
              <SectionCard title="Workforce" subtitle="this process" icon="team-line">
                {view.roster.map((r) => (
                  <div key={r.roleId} className="py-2 border-bottom">
                    <div className="fw-semibold">
                      {r.name}
                      {r.isAgent && <span className="badge rounded-pill bg-info-subtle text-info-emphasis ms-2">AI employee</span>}
                    </div>
                    <div className="small text-muted">{r.definition}</div>
                    {r.isAgent && r.accountableHuman && (
                      <div className="small text-info mt-1"><i className="ri-shield-check-line me-1" aria-hidden="true" />Accountable human: <strong>{r.accountableHuman}</strong></div>
                    )}
                  </div>
                ))}
              </SectionCard>
            </div>
            <div className="col-lg-5">
              <SectionCard title="Gate & approval" icon="shield-check-line">
                <ul className="list-unstyled mb-3">
                  {view.gate.checks.map((c) => (
                    <li key={c.code} className="d-flex align-items-start gap-2 py-1">
                      <i className={c.ok ? 'ri-check-line text-success' : 'ri-close-line text-danger'} aria-hidden="true" />
                      <span className="small">{c.label}</span>
                    </li>
                  ))}
                </ul>
                {view.approval ? (
                  <div className="small text-muted">
                    Approval: <strong className="text-capitalize">{view.approval.level ?? view.approval.status}</strong> · v{view.approval.version} · enrichment {view.approval.enrichmentStatus ?? '—'}
                  </div>
                ) : (
                  <div className="small text-muted">Not yet persisted (sample preview).</div>
                )}
                <div className="d-flex gap-2 mt-3">
                  <button type="button" className="btn btn-success btn-sm flex-fill" disabled title="Available when a live contract is loaded (Phase 4)">Approve process</button>
                  <button type="button" className="btn btn-outline-secondary btn-sm flex-fill" disabled title="Available in Phase 4">Request changes</button>
                </div>
              </SectionCard>
            </div>
          </div>

          <SectionCard title="How the role changed" subtitle="old function → AI contribution → retained human work" icon="exchange-line" className="mb-3">
            {view.roleMap.map((m, i) => (
              <div key={i} className="row g-2 align-items-center mb-2">
                <div className="col-md-4">
                  <div className="border rounded-3 p-2 bg-light h-100">
                    <div className="small text-muted text-uppercase">Was</div>{m.previousFunction}
                  </div>
                </div>
                <div className="col-md-1 text-center text-info fs-4" aria-hidden="true">→</div>
                <div className="col-md-7">
                  <div className="border rounded-3 p-2 h-100">
                    <div className="small text-info text-uppercase">Now · {m.newRole}</div>
                    {m.aiContribution}
                    <div className="small mt-1">Human keeps: {m.retained.join('; ')}</div>
                  </div>
                </div>
              </div>
            ))}
          </SectionCard>

          <SectionCard title="Compliance matrix" subtitle={`${view.compliance.length} requirements`} icon="file-list-3-line" padded={false}>
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead><tr><th>Requirement</th><th>Kind</th><th>Evidence</th><th>Covered by</th></tr></thead>
                <tbody>
                  {view.compliance.map((r) => (
                    <tr key={r.id}>
                      <td><span className="fw-semibold text-info">{r.id}</span> {r.statement}</td>
                      <td className="small">{r.kind} · {r.priority}</td>
                      <td><span className="badge rounded-pill bg-light text-secondary">{r.evidenceState}</span></td>
                      <td className="small">{r.citedBy.join('; ') || <span className="text-danger">uncited</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}

function FlowCard({ n }: { n: CcFlowNode }): React.ReactElement {
  const isTerminal = n.kind === 'START' || n.kind === 'END';
  const style: React.CSSProperties = { minWidth: '156px', maxWidth: '184px' };
  return (
    <div className={`border rounded-3 p-2 flex-shrink-0 ${isTerminal ? 'bg-dark text-white' : ''}`} style={style}>
      <div className="small fw-semibold">{n.title}</div>
      {!isTerminal && (
        <div className="mt-1">
          <span className={`badge rounded-pill ${KIND_BADGE[n.kind] ?? 'bg-light text-secondary'}`}>{n.kind.toLowerCase()}</span>
          {n.method && <span className="badge rounded-pill bg-light text-secondary ms-1">{n.method.toLowerCase()}</span>}
        </div>
      )}
      {!isTerminal && n.executorType && (
        <div className="small text-muted mt-1">
          {n.executorType === 'agent' ? <span className="text-info fw-semibold">AI</span> : 'Human'}: {n.performerRole ?? '—'}
          {n.executorType === 'agent' && n.accountableRole && <div className="text-info">↳ {n.accountableRole} accountable</div>}
        </div>
      )}
    </div>
  );
}
