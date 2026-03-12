import React, { useState, useRef, useEffect } from 'react';
import {
  coryExplain, coryResearch, coryRecommend, corySimulate, coryExecute,
  type SimulationResult,
} from '../../../services/reportingApi';

interface CoryExplainMenuProps {
  chartData?: any;
  chartType?: string;
  chartTitle?: string;
  entityType?: string;
  entityId?: string;
  insightId?: string;
  onResult?: (result: string) => void;
  size?: number;
}

export default function CoryExplainMenu({
  chartData, chartType, chartTitle,
  entityType, entityId, insightId,
  onResult, size = 20,
}: CoryExplainMenuProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [showSimPanel, setShowSimPanel] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleExplain = async () => {
    setOpen(false);
    setLoading(true);
    try {
      const result = await coryExplain(chartData, chartType || 'unknown', chartTitle || 'Chart');
      onResult?.(result.explanation);
    } catch { onResult?.('Failed to generate explanation.'); }
    setLoading(false);
  };

  const handleResearch = async () => {
    setOpen(false);
    setLoading(true);
    try {
      const result = await coryResearch(entityType || 'system', entityId || 'global');
      onResult?.(result.research);
    } catch { onResult?.('Failed to perform research.'); }
    setLoading(false);
  };

  const handleRecommend = async () => {
    setOpen(false);
    setLoading(true);
    try {
      if (insightId) {
        const result = await coryRecommend(insightId);
        onResult?.(result.recommendations);
      } else {
        onResult?.('No insight selected for recommendations.');
      }
    } catch { onResult?.('Failed to generate recommendations.'); }
    setLoading(false);
  };

  const handleSimulate = async () => {
    setOpen(false);
    setLoading(true);
    try {
      const result = await corySimulate(
        entityType || 'system',
        entityId || 'global',
        chartType || 'general',
        chartData ? { chartData } : undefined,
        insightId,
      );
      setSimulationResult(result);
      setShowSimPanel(true);
    } catch {
      onResult?.('Failed to run simulation.');
    }
    setLoading(false);
  };

  const handleExecute = async () => {
    if (!simulationResult) return;
    setLoading(true);
    try {
      const result = await coryExecute(simulationResult.simulation_id);
      setShowSimPanel(false);
      setSimulationResult(null);
      onResult?.(
        `Strategy executed. Ticket: TK-${result.ticket_number}. ` +
        `${result.tasks.length} tasks queued. ETA: ${result.eta}. ` +
        `Predicted: ${result.predicted_results.leads} leads, ` +
        `${result.predicted_results.conversions} conversions, ` +
        `${result.predicted_results.enrollments} enrollments, ` +
        `$${result.predicted_results.revenue.toLocaleString()} revenue.`
      );
    } catch {
      onResult?.('Failed to execute strategy.');
    }
    setLoading(false);
  };

  const confidenceColor = (v: number) => v >= 0.7 ? 'success' : v >= 0.4 ? 'warning' : 'danger';
  const riskColor = (v: number) => v >= 0.7 ? 'danger' : v >= 0.4 ? 'warning' : 'success';

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        className="btn btn-link p-0 border-0"
        onClick={() => setOpen(!open)}
        disabled={loading}
        title="Ask Cory"
        style={{
          width: size, height: size, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'var(--color-primary, #1a365d)', color: '#fff',
          fontSize: size * 0.55, fontWeight: 700, textDecoration: 'none',
          cursor: 'pointer', lineHeight: 1,
        }}
      >
        {loading ? (
          <span className="spinner-border spinner-border-sm" style={{ width: size * 0.5, height: size * 0.5 }} role="status">
            <span className="visually-hidden">Loading...</span>
          </span>
        ) : 'C'}
      </button>

      {open && (
        <div className="dropdown-menu show shadow" style={{ position: 'absolute', top: size + 4, right: 0, minWidth: 180, zIndex: 1050 }}>
          <button className="dropdown-item small" onClick={handleExplain}>
            <strong>Explain</strong>
            <div className="text-muted" style={{ fontSize: 11 }}>Describe this chart</div>
          </button>
          <button className="dropdown-item small" onClick={handleResearch}>
            <strong>Research</strong>
            <div className="text-muted" style={{ fontSize: 11 }}>Graph investigation</div>
          </button>
          <button className="dropdown-item small" onClick={handleRecommend}>
            <strong>Recommend</strong>
            <div className="text-muted" style={{ fontSize: 11 }}>Suggest actions</div>
          </button>
          <div className="dropdown-divider" />
          <button className="dropdown-item small" onClick={handleSimulate}>
            <strong>Simulate</strong>
            <div className="text-muted" style={{ fontSize: 11 }}>Predict outcomes</div>
          </button>
          <button
            className="dropdown-item small"
            onClick={handleExecute}
            disabled={!simulationResult}
            style={{ opacity: simulationResult ? 1 : 0.5 }}
          >
            <strong>Execute</strong>
            <div className="text-muted" style={{ fontSize: 11 }}>Run simulated strategy</div>
          </button>
        </div>
      )}

      {simulationResult && showSimPanel && (
        <div
          className="card border-0 shadow"
          style={{
            position: 'absolute', top: size + 4, right: 0,
            width: 420, zIndex: 1060,
          }}
        >
          <div className="card-header bg-white d-flex justify-content-between align-items-center py-2">
            <span className="fw-semibold small" style={{ color: 'var(--color-primary)' }}>
              Simulation Results
            </span>
            <button className="btn-close btn-close-sm" style={{ fontSize: 10 }} onClick={() => setShowSimPanel(false)} aria-label="Close" />
          </div>
          <div className="card-body p-3">
            {/* Metric cards */}
            <div className="row g-2 mb-3">
              {[
                { label: 'Predicted Leads', value: simulationResult.predicted_leads },
                { label: 'Conversions', value: simulationResult.predicted_conversions },
                { label: 'Enrollments', value: simulationResult.predicted_enrollments },
                { label: 'Revenue', value: `$${simulationResult.predicted_revenue.toLocaleString()}` },
              ].map(m => (
                <div key={m.label} className="col-6">
                  <div className="border rounded p-2 text-center" style={{ backgroundColor: 'var(--color-bg-alt, #f7fafc)' }}>
                    <div className="small text-muted">{m.label}</div>
                    <div className="fw-bold" style={{ color: 'var(--color-primary)' }}>{m.value}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Confidence & Risk */}
            <div className="d-flex gap-2 mb-3">
              <span className={`badge bg-${confidenceColor(simulationResult.confidence)}`}>
                Confidence: {(simulationResult.confidence * 100).toFixed(0)}%
              </span>
              <span className={`badge bg-${riskColor(simulationResult.risk_score)}`}>
                Risk: {(simulationResult.risk_score * 100).toFixed(0)}%
              </span>
            </div>

            {/* Assumptions */}
            {simulationResult.assumptions.length > 0 && (
              <div className="mb-3">
                <div className="small fw-medium mb-1">Assumptions</div>
                <ul className="small mb-0 ps-3" style={{ color: 'var(--color-text-light)' }}>
                  {simulationResult.assumptions.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </div>
            )}

            {/* Task breakdown */}
            {simulationResult.breakdown.length > 0 && (
              <div className="mb-3">
                <div className="small fw-medium mb-1">Task Breakdown</div>
                <div className="table-responsive">
                  <table className="table table-sm table-hover mb-0" style={{ fontSize: 12 }}>
                    <thead className="table-light">
                      <tr>
                        <th>Task</th>
                        <th>Agent</th>
                        <th>Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {simulationResult.breakdown.map((row, i) => (
                        <tr key={i}>
                          <td>{row.task}</td>
                          <td><span className="badge bg-light text-dark">{row.agent}</span></td>
                          <td>{row.duration}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Timeline */}
            <div className="small text-muted mb-3">
              Estimated: <strong>{simulationResult.timeline_days} days</strong>
            </div>

            {/* Action buttons */}
            <div className="d-flex gap-2">
              <button className="btn btn-primary btn-sm" onClick={handleExecute} disabled={loading}>
                {loading ? 'Executing...' : 'Execute This Strategy'}
              </button>
              <button className="btn btn-outline-secondary btn-sm" onClick={() => {
                setShowSimPanel(false);
                setSimulationResult(null);
              }}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
