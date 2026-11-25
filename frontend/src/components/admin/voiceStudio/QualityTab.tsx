import React from 'react';
import { Link } from 'react-router-dom';
import { SectionCard, StatusBadge } from '../shell';
import { getQuality } from '../../../services/voiceStudioApi';
import { ENGINE_LABEL } from './voiceStudioFormat';
import { centralTime, useStudioLoad } from './studioLoad';

/** Quality & Release (VS3.5). A run is green only with a pass verdict AND a recorded evidence reference. */
const PASS = new Set(['pass', 'passed']);
const FAIL = new Set(['fail', 'failed']);

/** Green needs a pass verdict AND recorded evidence. */
export function runTone(r: { verdict: string; evidence_ref: string | null }): 'success' | 'danger' | 'neutral' {
  if (PASS.has(r.verdict) && r.evidence_ref) return 'success';
  return FAIL.has(r.verdict) ? 'danger' : 'neutral';
}

export default function QualityTab(): React.ReactElement {
  const { data, blocked } = useStudioLoad(getQuality, [], 'Quality data could not be loaded.');
  if (blocked || !data) return blocked as React.ReactElement;
  const blind = data.runs.filter((r) => r.scenario_set === 'voice_ab');
  const runs = data.runs.filter((r) => r.scenario_set !== 'voice_ab');
  const failures = runs.filter((r) => FAIL.has(r.verdict));
  return (
    <div className="row g-3">
      <div className="col-lg-5">
        <SectionCard title="Rubric" icon="list-check" subtitle={`A test run passes at ${data.passMark} of 100 with no failed critical check.`}>
          <table className="table table-sm small mb-0"><thead className="table-light"><tr><th scope="col">Dimension</th><th scope="col" className="text-end">Weight</th><th scope="col">Critical</th></tr></thead>
            <tbody>{data.rubric.map((d) => <tr key={d.key}><td>{d.key.replace(/_/g, ' ')}</td><td className="text-end">{d.weight}</td><td>{d.critical ? 'Yes' : 'No'}</td></tr>)}</tbody></table>
        </SectionCard>
      </div>
      <div className="col-lg-7">
        <SectionCard title="Evaluation runs" icon="test-tube-line">
          {runs.length === 0 ? <p className="text-muted small mb-0" data-testid="runs-empty">No evaluation has been recorded, so nothing here has passed.</p> : (
            <ul className="list-unstyled d-grid gap-2 mb-0">
              {runs.map((r) => {
                return (
                  <li key={r.id} className="d-flex justify-content-between gap-2 small" data-testid={`run-${r.id}`}>
                    <span>{r.scenario_set}, {ENGINE_LABEL[r.engine] ?? r.engine}, {r.environment}<br /><span className="text-muted">{centralTime(r.created_at)}, evidence {r.evidence_ref ?? 'missing'}</span></span>
                    <StatusBadge label={PASS.has(r.verdict) && !r.evidence_ref ? 'no evidence' : r.verdict} tone={runTone(r)} />
                  </li>
                );
              })}
            </ul>
          )}
          <p className="small mt-2 mb-0" data-testid="failures">Scenario failures: {failures.length}. Blind voice comparisons: {blind.length} ({blind.filter((r) => r.verdict === 'scored').length} scored).</p>
        </SectionCard>
        <p className="small text-muted mt-3 mb-0">To promote or roll back an agent, publish or retire a version in <Link to="/admin/voice-studio/agents">Agents</Link>. To move a route, use <Link to="/admin/voice-studio/numbers">Numbers &amp; Routing</Link>.</p>
      </div>
    </div>
  );
}
