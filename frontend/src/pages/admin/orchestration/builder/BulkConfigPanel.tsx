import React, { useEffect, useState } from 'react';
import { getScoreColor } from './types';

interface MatrixRow {
  moduleId: string;
  moduleNumber: number;
  moduleTitle: string;
  lessonId: string;
  lessonNumber: number;
  lessonTitle: string;
  miniSectionCount: number;
  types: Record<string, number>;
  hasPrompts: boolean;
  hasSkills: boolean;
  hasVars: boolean;
  status: 'complete' | 'partial' | 'empty';
  warnings: string[];
  avgQualityScore?: number;
  miniSectionScores?: { id: string; title: string; score: number | null }[];
}

interface Props {
  token: string;
  apiUrl: string;
  onNavigateToLesson?: (lessonId: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  complete: 'bg-success',
  partial: 'bg-warning text-dark',
  empty: 'bg-danger',
};

const TYPE_ABBREV: Record<string, string> = {
  executive_reality_check: 'RC',
  ai_strategy: 'AI',
  prompt_template: 'PT',
  implementation_task: 'IT',
  knowledge_check: 'KC',
};

export default function BulkConfigPanel({ token, apiUrl, onNavigateToLesson }: Props) {
  const [matrix, setMatrix] = useState<MatrixRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [filter, setFilter] = useState<'all' | 'complete' | 'partial' | 'empty' | 'low-score'>('all');
  const [sortBy, setSortBy] = useState<'default' | 'score-asc' | 'score-desc'>('default');
  const [bulkAction, setBulkAction] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<any>(null);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  useEffect(() => { fetchMatrix(); }, []);

  const fetchMatrix = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/bulk/curriculum-matrix`, { headers });
      if (res.ok) setMatrix(await res.json());
    } catch { /* non-critical */ }
    setLoading(false);
  };

  const runValidateAll = async () => {
    setValidating(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/bulk/validate-all`, { method: 'POST', headers });
      if (res.ok) setValidationResult(await res.json());
    } catch { /* non-critical */ }
    setValidating(false);
  };

  const runBulkQualityScan = async () => {
    setBulkAction('quality-scan');
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/bulk/quality-scan`, { method: 'POST', headers });
      if (res.ok) setBulkResult({ type: 'quality-scan', data: await res.json() });
    } catch {}
    setBulkAction(null);
    fetchMatrix();
  };

  const runBulkAutoRepair = async () => {
    setBulkAction('auto-repair');
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/bulk/auto-repair-all`, { method: 'POST', headers, body: JSON.stringify({ dryRun: false }) });
      if (res.ok) setBulkResult({ type: 'auto-repair', data: await res.json() });
    } catch {}
    setBulkAction(null);
    fetchMatrix();
  };

  const runBulkDiagnostics = async () => {
    setBulkAction('diagnostics');
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/bulk/run-all-diagnostics`, { method: 'POST', headers });
      if (res.ok) setBulkResult({ type: 'diagnostics', data: await res.json() });
    } catch {}
    setBulkAction(null);
  };

  let filtered = filter === 'all' ? matrix
    : filter === 'low-score' ? matrix.filter(r => (r.avgQualityScore ?? 0) < 70)
    : matrix.filter(r => r.status === filter);

  if (sortBy === 'score-asc') filtered = [...filtered].sort((a, b) => (a.avgQualityScore ?? 0) - (b.avgQualityScore ?? 0));
  else if (sortBy === 'score-desc') filtered = [...filtered].sort((a, b) => (b.avgQualityScore ?? 0) - (a.avgQualityScore ?? 0));

  const avgScore = matrix.length > 0
    ? Math.round(matrix.reduce((sum, r) => sum + (r.avgQualityScore ?? 0), 0) / matrix.filter(r => r.avgQualityScore != null).length) || 0
    : 0;
  const lowScoreCount = matrix.filter(r => (r.avgQualityScore ?? 0) < 70).length;

  const stats = {
    total: matrix.length,
    complete: matrix.filter(r => r.status === 'complete').length,
    partial: matrix.filter(r => r.status === 'partial').length,
    empty: matrix.filter(r => r.status === 'empty').length,
    totalMiniSections: matrix.reduce((sum, r) => sum + r.miniSectionCount, 0),
  };

  if (loading) {
    return (
      <div className="text-center py-4">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Summary Cards */}
      <div className="d-flex gap-2 mb-3 flex-wrap">
        <div className="card border-0 shadow-sm" style={{ minWidth: 100 }}>
          <div className="card-body py-2 px-3 text-center">
            <div className="fw-bold" style={{ fontSize: 20 }}>{stats.total}</div>
            <div className="text-muted" style={{ fontSize: 10 }}>Sections</div>
          </div>
        </div>
        <div className="card border-0 shadow-sm" style={{ minWidth: 100 }}>
          <div className="card-body py-2 px-3 text-center">
            <div className="fw-bold text-success" style={{ fontSize: 20 }}>{stats.complete}</div>
            <div className="text-muted" style={{ fontSize: 10 }}>Complete</div>
          </div>
        </div>
        <div className="card border-0 shadow-sm" style={{ minWidth: 100 }}>
          <div className="card-body py-2 px-3 text-center">
            <div className="fw-bold text-warning" style={{ fontSize: 20 }}>{stats.partial}</div>
            <div className="text-muted" style={{ fontSize: 10 }}>Partial</div>
          </div>
        </div>
        <div className="card border-0 shadow-sm" style={{ minWidth: 100 }}>
          <div className="card-body py-2 px-3 text-center">
            <div className="fw-bold text-danger" style={{ fontSize: 20 }}>{stats.empty}</div>
            <div className="text-muted" style={{ fontSize: 10 }}>Empty</div>
          </div>
        </div>
        <div className="card border-0 shadow-sm" style={{ minWidth: 100 }}>
          <div className="card-body py-2 px-3 text-center">
            <div className="fw-bold" style={{ fontSize: 20 }}>{stats.totalMiniSections}</div>
            <div className="text-muted" style={{ fontSize: 10 }}>Mini-Sections</div>
          </div>
        </div>
        <div className="card border-0 shadow-sm" style={{ minWidth: 100 }}>
          <div className="card-body py-2 px-3 text-center">
            <div className={`fw-bold ${avgScore >= 70 ? 'text-success' : avgScore >= 40 ? 'text-warning' : 'text-danger'}`} style={{ fontSize: 20 }}>{avgScore}</div>
            <div className="text-muted" style={{ fontSize: 10 }}>Avg Score</div>
          </div>
        </div>
        {lowScoreCount > 0 && (
          <div className="card border-0 shadow-sm" style={{ minWidth: 100 }}>
            <div className="card-body py-2 px-3 text-center">
              <div className="fw-bold text-danger" style={{ fontSize: 20 }}>{lowScoreCount}</div>
              <div className="text-muted" style={{ fontSize: 10 }}>Below 70</div>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
        <div className="btn-group btn-group-sm">
          {(['all', 'complete', 'partial', 'empty'] as const).map(f => (
            <button key={f} className={`btn ${filter === f ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setFilter(f)} style={{ fontSize: 11 }}>
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)} ({f === 'all' ? stats.total : stats[f]})
            </button>
          ))}
        </div>
        <button
          className={`btn btn-sm ${filter === 'low-score' ? 'btn-danger' : 'btn-outline-danger'}`}
          onClick={() => setFilter(filter === 'low-score' ? 'all' : 'low-score')}
          style={{ fontSize: 11 }}
        >
          Score &lt; 70 ({lowScoreCount})
        </button>
        <div className="vr"></div>
        <button className="btn btn-sm btn-outline-success" onClick={runValidateAll} disabled={validating}>
          {validating ? (
            <><span className="spinner-border spinner-border-sm me-1" role="status"></span>Validating...</>
          ) : (
            <><i className="bi bi-check-circle me-1"></i>Validate All</>
          )}
        </button>
        <button className="btn btn-sm btn-outline-info" onClick={runBulkQualityScan} disabled={!!bulkAction}>
          {bulkAction === 'quality-scan' ? (
            <><span className="spinner-border spinner-border-sm me-1" role="status"></span>Scoring...</>
          ) : (
            <><i className="bi bi-graph-up me-1"></i>Score All</>
          )}
        </button>
        <button className="btn btn-sm btn-outline-warning" onClick={runBulkAutoRepair} disabled={!!bulkAction}>
          {bulkAction === 'auto-repair' ? (
            <><span className="spinner-border spinner-border-sm me-1" role="status"></span>Repairing...</>
          ) : (
            <><i className="bi bi-wrench me-1"></i>Repair All</>
          )}
        </button>
        <button className="btn btn-sm btn-outline-primary" onClick={runBulkDiagnostics} disabled={!!bulkAction}>
          {bulkAction === 'diagnostics' ? (
            <><span className="spinner-border spinner-border-sm me-1" role="status"></span>Diagnosing...</>
          ) : (
            <><i className="bi bi-clipboard2-pulse me-1"></i>Diagnose All</>
          )}
        </button>
        <button className="btn btn-sm btn-outline-secondary" onClick={fetchMatrix}>
          <i className="bi bi-arrow-clockwise me-1"></i>Refresh
        </button>
        <select className="form-select form-select-sm" style={{ width: 130, fontSize: 10 }} value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
          <option value="default">Default Order</option>
          <option value="score-asc">Score (Low→High)</option>
          <option value="score-desc">Score (High→Low)</option>
        </select>
      </div>

      {/* Bulk Action Result */}
      {bulkResult && (
        <div className="alert alert-info py-2 mb-3" style={{ fontSize: 11 }}>
          <div className="d-flex justify-content-between align-items-center">
            <strong>
              {bulkResult.type === 'quality-scan' && `Quality Scan: ${bulkResult.data.total} scored, avg ${bulkResult.data.average}`}
              {bulkResult.type === 'auto-repair' && `Auto-Repair: ${bulkResult.data.repaired}/${bulkResult.data.total} repaired`}
              {bulkResult.type === 'diagnostics' && `Diagnostics: ${bulkResult.data.total} checked, ${bulkResult.data.passed} passed, ${bulkResult.data.failed} failed`}
            </strong>
            <button className="btn-close" style={{ fontSize: 8 }} onClick={() => setBulkResult(null)} />
          </div>
        </div>
      )}

      {/* Validation Result */}
      {validationResult && (
        <div className={`alert ${validationResult.errors?.length > 0 ? 'alert-warning' : 'alert-success'} py-2 mb-3`} style={{ fontSize: 11 }}>
          <div className="d-flex justify-content-between align-items-center">
            <strong>Integrity Check: {validationResult.valid ? 'Passed' : `${validationResult.errors?.length || 0} Issues`}</strong>
            <button className="btn-close" style={{ fontSize: 8 }} onClick={() => setValidationResult(null)} />
          </div>
          {validationResult.errors?.length > 0 && (
            <ul className="mb-0 mt-1 ps-3">
              {validationResult.errors.slice(0, 10).map((e: string, i: number) => <li key={i}>{e}</li>)}
              {validationResult.errors.length > 10 && <li>...and {validationResult.errors.length - 10} more</li>}
            </ul>
          )}
        </div>
      )}

      {/* Matrix Table */}
      <div className="table-responsive">
        <table className="table table-hover mb-0" style={{ fontSize: 11 }}>
          <thead className="table-light">
            <tr>
              <th style={{ fontSize: 10 }}>Module</th>
              <th style={{ fontSize: 10 }}>Section</th>
              <th style={{ fontSize: 10 }}>Mini-Sections</th>
              <th style={{ fontSize: 10 }}>RC</th>
              <th style={{ fontSize: 10 }}>AI</th>
              <th style={{ fontSize: 10 }}>PT</th>
              <th style={{ fontSize: 10 }}>IT</th>
              <th style={{ fontSize: 10 }}>KC</th>
              <th style={{ fontSize: 10 }}>Links</th>
              <th style={{ fontSize: 10 }}>Score</th>
              <th style={{ fontSize: 10 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(row => (
              <tr key={row.lessonId} style={{ cursor: onNavigateToLesson ? 'pointer' : undefined }}
                onClick={() => onNavigateToLesson?.(row.lessonId)}>
                <td>
                  <span className="badge bg-light text-dark border" style={{ fontSize: 9 }}>M{row.moduleNumber}</span>
                </td>
                <td>
                  <span className="fw-medium" style={{ color: 'var(--color-primary-light, #2b6cb0)' }}>
                    {row.lessonNumber}. {row.lessonTitle}
                  </span>
                </td>
                <td className="text-center">
                  <span className="badge bg-info" style={{ fontSize: 9 }}>{row.miniSectionCount}</span>
                </td>
                {['executive_reality_check', 'ai_strategy', 'prompt_template', 'implementation_task', 'knowledge_check'].map(type => (
                  <td key={type} className="text-center">
                    {row.types[type] ? (
                      <span className="badge bg-success" style={{ fontSize: 8 }}>{row.types[type]}</span>
                    ) : (
                      <span className="badge bg-danger-subtle text-danger" style={{ fontSize: 8 }}>&mdash;</span>
                    )}
                  </td>
                ))}
                <td>
                  <div className="d-flex gap-1">
                    {row.hasPrompts && <span className="badge bg-success-subtle text-success border" style={{ fontSize: 7 }}>P</span>}
                    {row.hasSkills && <span className="badge bg-info-subtle text-info border" style={{ fontSize: 7 }}>S</span>}
                    {row.hasVars && <span className="badge bg-warning-subtle text-dark border" style={{ fontSize: 7 }}>V</span>}
                  </div>
                </td>
                <td className="text-center">
                  {row.avgQualityScore != null ? (
                    <span className={`badge ${getScoreColor(row.avgQualityScore)}`} style={{ fontSize: 9 }}>
                      {Math.round(row.avgQualityScore)}
                    </span>
                  ) : (
                    <span className="text-muted" style={{ fontSize: 9 }}>--</span>
                  )}
                </td>
                <td>
                  <span className={`badge ${STATUS_COLORS[row.status]}`} style={{ fontSize: 8 }}>
                    {row.status}
                  </span>
                  {row.warnings.length > 0 && (
                    <i className="bi bi-exclamation-triangle text-warning ms-1" style={{ fontSize: 10 }}
                      title={row.warnings.join(', ')}></i>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-2 border-top pt-2 d-flex gap-3" style={{ fontSize: 9 }}>
        <span><strong>RC</strong> = Reality Check</span>
        <span><strong>AI</strong> = AI Strategy</span>
        <span><strong>PT</strong> = Prompt Template</span>
        <span><strong>IT</strong> = Implementation Task</span>
        <span><strong>KC</strong> = Knowledge Check</span>
        <span><strong>P</strong> = Prompts linked</span>
        <span><strong>S</strong> = Skills linked</span>
        <span><strong>V</strong> = Variables linked</span>
      </div>
    </div>
  );
}
