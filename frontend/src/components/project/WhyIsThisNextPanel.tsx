/**
 * WhyIsThisNextPanel — explainability surface for the authoritative queue.
 *
 * Renders the full DecisionTrace returned by GET /system-state/explain/:taskId.
 * Designed as a side panel / modal — caller controls open state.
 *
 * Sections, top to bottom:
 *   1. Task summary  — title, state, dependency chain
 *   2. Score breakdown bar — components of calculated_rank
 *   3. Why this task   — readiness/coverage/maturity gaps
 *   4. Expected outcomes — what the user will gain
 *   5. Affected systems  — BPs/files that change
 *   6. Confidence + telemetry sources used
 *   7. Related contradictions
 *   8. Reasoning chain (raw)
 *
 * Phase 4 §8.
 */
import React from 'react';
import { useTaskExplain, type DecisionTraceShape } from '../../hooks/useTaskExplain';

interface Props {
  taskId: string | null;
  onClose?: () => void;
}

export const WhyIsThisNextPanel: React.FC<Props> = ({ taskId, onClose }) => {
  const { data, loading, error, refresh } = useTaskExplain(taskId);

  if (!taskId) return null;

  return (
    <div
      className="card border-0 shadow-sm"
      style={{ maxWidth: 480 }}
      role="dialog"
      aria-label="Why is this next?"
    >
      <div className="card-header d-flex justify-content-between align-items-center bg-white fw-semibold">
        <span><i className="bi bi-question-diamond me-2"></i>Why is this next?</span>
        <div className="d-flex gap-2">
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={() => void refresh()}
            disabled={loading}
            aria-label="Refresh"
          ><i className="bi bi-arrow-clockwise"></i></button>
          {onClose && (
            <button
              className="btn btn-sm btn-outline-secondary"
              onClick={onClose}
              aria-label="Close panel"
            ><i className="bi bi-x-lg"></i></button>
          )}
        </div>
      </div>

      <div className="card-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        {loading && <SkeletonLoader />}
        {error && <div className="alert alert-warning small mb-0">{error}</div>}
        {!loading && !error && data && <PanelBody data={data} />}
      </div>
    </div>
  );
};

const SkeletonLoader: React.FC = () => (
  <div role="status" aria-live="polite">
    <span className="visually-hidden">Loading explanation…</span>
    <div className="placeholder-glow">
      <div className="placeholder col-9 mb-3"></div>
      <div className="placeholder col-7 mb-3"></div>
      <div className="placeholder col-12 mb-3"></div>
      <div className="placeholder col-10"></div>
    </div>
  </div>
);

const PanelBody: React.FC<{ data: NonNullable<ReturnType<typeof useTaskExplain>['data']> }> = ({ data }) => {
  const trace = data.decision_trace as DecisionTraceShape;

  return (
    <>
      <Section title="Task">
        <div className="fw-semibold mb-1">{data.task?.title}</div>
        <div className="small text-muted">
          State: <span className="badge bg-secondary">{data.task?.state}</span>{' '}
          {data.task?.bp_id && <span>· BP {data.task.bp_id.slice(0, 8)}</span>}
        </div>
        {trace.dependency_chain && trace.dependency_chain.length > 0 && (
          <div className="small text-muted mt-2">
            <i className="bi bi-link-45deg me-1"></i>
            depends on: {trace.dependency_chain.join(' → ')}
          </div>
        )}
      </Section>

      {trace.score_breakdown && Object.keys(trace.score_breakdown).length > 0 && (
        <Section title="Score breakdown">
          <ScoreBars breakdown={trace.score_breakdown} />
        </Section>
      )}

      <Section title="Where this task moves the needle">
        <GapRow label="Readiness" current={trace.readiness_inputs.current} target={trace.readiness_inputs.target} gap={trace.readiness_inputs.gap} />
        <GapRow label="Coverage" current={trace.coverage_inputs.current} target={trace.coverage_inputs.target} gap={trace.coverage_inputs.gap} />
        <GapRow label="Maturity" current={trace.maturity_inputs.current_level} target={trace.maturity_inputs.target_level} gap={trace.maturity_inputs.target_level - trace.maturity_inputs.current_level} unit="L" />
      </Section>

      {trace.expected_outcomes && trace.expected_outcomes.length > 0 && (
        <Section title="Expected outcomes">
          <ul className="small mb-0 ps-3">
            {trace.expected_outcomes.map((o, i) => <li key={i}>{o}</li>)}
          </ul>
        </Section>
      )}

      {trace.projected_maturity_gain && trace.projected_maturity_gain.delta > 0 && (
        <Section title="Projected maturity gain">
          <div className="small">
            L{trace.projected_maturity_gain.current_level} → L{trace.projected_maturity_gain.projected_level}
            {' '}<span className="badge bg-success">+{trace.projected_maturity_gain.delta}</span>
          </div>
        </Section>
      )}

      {trace.affected_systems && trace.affected_systems.length > 0 && (
        <Section title="Affected systems">
          <ul className="small mb-0 ps-3">
            {trace.affected_systems.map((s, i) => <li key={i}><code>{s}</code></li>)}
          </ul>
        </Section>
      )}

      <Section title="Confidence">
        <div className="d-flex align-items-center gap-2">
          <ConfidenceBadge value={trace.confidence_inputs.confidence} />
          <span className="small text-muted">{trace.confidence_inputs.basis}</span>
        </div>
      </Section>

      {trace.telemetry_sources_used && trace.telemetry_sources_used.length > 0 && (
        <Section title="Telemetry sources used">
          <div className="d-flex flex-wrap gap-1">
            {trace.telemetry_sources_used.map((s) => (
              <span key={s} className="badge bg-light text-dark border">{s.replace(/_/g, ' ')}</span>
            ))}
          </div>
        </Section>
      )}

      {data.blocked_by && data.blocked_by.length > 0 && (
        <Section title="Blocked by">
          <ul className="small mb-0 ps-3">
            {data.blocked_by.map((b, i) => <li key={i}><code>{b}</code></li>)}
          </ul>
        </Section>
      )}

      {data.related_contradictions && data.related_contradictions.length > 0 && (
        <Section title={`Related warnings (${data.related_contradictions.length})`}>
          <ul className="small mb-0 ps-3">
            {data.related_contradictions.map((c, i) => (
              <li key={i}>
                <span className={`badge me-1 ${severityClass(c.severity)}`}>{c.severity}</span>
                <span>{c.message}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {data.reasoning && data.reasoning.length > 0 && (
        <Section title="Reasoning">
          <ul className="small mb-0 ps-3">
            {data.reasoning.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </Section>
      )}

      <div className="text-muted small mt-3">Generated {new Date(data.generated_at).toLocaleString()}</div>
    </>
  );
};

const Section: React.FC<React.PropsWithChildren<{ title: string }>> = ({ title, children }) => (
  <div className="mb-3">
    <div className="fw-semibold small text-uppercase text-muted mb-2" style={{ letterSpacing: 0.4 }}>{title}</div>
    {children}
  </div>
);

const GapRow: React.FC<{ label: string; current: number; target: number; gap: number; unit?: string }> = ({ label, current, target, gap, unit }) => (
  <div className="d-flex justify-content-between align-items-center small mb-1">
    <span>{label}</span>
    <span className="text-muted">
      {unit ?? ''}{current} → {unit ?? ''}{target}
      {' '}<span className={`badge ${gap > 0 ? 'bg-warning text-dark' : 'bg-success'}`}>
        {gap > 0 ? `+${gap} gap` : 'no gap'}
      </span>
    </span>
  </div>
);

const ScoreBars: React.FC<{ breakdown: Record<string, number> }> = ({ breakdown }) => {
  const entries = Object.entries(breakdown);
  const max = Math.max(...entries.map(([, v]) => Math.abs(v)), 1);
  return (
    <div>
      {entries.map(([key, v]) => {
        const pct = (Math.abs(v) / max) * 100;
        const negative = v < 0;
        return (
          <div key={key} className="small mb-1">
            <div className="d-flex justify-content-between">
              <span className="text-capitalize">{key.replace(/_/g, ' ')}</span>
              <span className={`fw-semibold ${negative ? 'text-danger' : ''}`}>{v}</span>
            </div>
            <div className="progress" style={{ height: 6 }} aria-label={`${key} contribution`}>
              <div
                className={`progress-bar ${negative ? 'bg-danger' : 'bg-primary'}`}
                role="progressbar"
                style={{ width: `${pct}%` }}
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

const ConfidenceBadge: React.FC<{ value: number }> = ({ value }) => {
  let cls = 'bg-success';
  if (value < 70) cls = 'bg-warning text-dark';
  if (value < 40) cls = 'bg-danger';
  return <span className={`badge ${cls}`}>{value}%</span>;
};

function severityClass(severity: string): string {
  if (severity === 'error') return 'bg-danger';
  if (severity === 'warning') return 'bg-warning text-dark';
  return 'bg-light text-dark border';
}

export default WhyIsThisNextPanel;
