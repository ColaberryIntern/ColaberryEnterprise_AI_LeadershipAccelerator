import React, { useState } from 'react';
import { SectionCard } from '../shell';
import { CASE_STUDY_STUDIO_CONTROLS } from './caseStudyStudioTabs';
import type {
  CaseStudyArtifactRecord, CaseStudyChartResolution, CaseStudyChartType,
} from '../../../services/caseStudyStudioApi';

/**
 * CaseStudyVisualsPanel — artifact promotion (D-0) and charts.
 *
 * TWO THINGS THIS PANEL DELIBERATELY DOES NOT OFFER:
 *
 * 1. `presentation`. Whether a picture counts as evidence or as atmosphere is
 *    DERIVED from `artifact_type` and is shown here as a read-only fact. An
 *    author-set flag would make "is this evidence?" an editorial field, which
 *    is exactly the decision that must not be editable. `artifact_type` is not
 *    editable here either, for the same reason wearing a different hat.
 *
 * 2. A number. The chart form has a title, a type and a list of METRIC KEYS,
 *    and there is no field into which a value could be typed. That is the whole
 *    asset: a chart references numbers the metric table has already verified,
 *    and resolves them at render through the same function the measurement
 *    section uses. A chart that carried its own `values[]` would sit outside
 *    `verifiedFigures()` entirely, and nothing would compare it to anything.
 *
 * THE UNRESOLVED LIST IS THE HONEST HALF. A chart naming four metric keys of
 * which two are unpublishable renders two bars, and an author who is not told
 * that will believe it shows four. Each omission is named with its reason,
 * following the repository-link rule's precedent of an honest count over a
 * silent drop.
 */

interface Props {
  artifacts: readonly CaseStudyArtifactRecord[];
  charts: readonly CaseStudyChartResolution[];
  /** Metric keys on this record, offered so a chart is built from real ones. */
  availableMetricKeys: readonly string[];
  loading: boolean;
  busy: boolean;
  error: string | null;
  onSetArtifactStatus: (
    artifactId: string,
    status: 'candidate' | 'approved' | 'rejected',
    visibility: 'public' | 'request_only' | 'private',
  ) => void;
  onSaveChart: (body: {
    chartType: CaseStudyChartType; title: string; metricKeys: readonly string[];
  }) => void;
  onSetChartApproval: (chartId: string, approved: boolean) => void;
}

export default function CaseStudyVisualsPanel({
  artifacts, charts, availableMetricKeys, loading, busy, error,
  onSetArtifactStatus, onSaveChart, onSetChartApproval,
}: Props): React.ReactElement {
  const [chartTitle, setChartTitle] = useState('');
  const [chartType, setChartType] = useState<CaseStudyChartType>('bar');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  const toggleKey = (key: string): void => setSelectedKeys(
    (keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]),
  );

  return (
    <>
      <SectionCard title="Artifacts" icon="image-line" className="mb-4">
        <p className="small text-muted">
          Until this control existed, no application code could move an artifact off{' '}
          <code>candidate</code>, so the hero, carousel and figure surface could not populate at
          all. Whether a picture reads as evidence is derived from its type and is not editable.
        </p>

        {error ? (
          <div className="alert alert-danger py-2" data-testid="cs-visuals-error">{error}</div>
        ) : null}

        {artifacts.length === 0 ? (
          <p className="text-muted mb-0" data-testid="cs-artifacts-empty">
            {loading ? 'Loading artifacts...' : 'No artifacts on this record yet.'}
          </p>
        ) : (
          <table className="table table-sm align-middle">
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Type</th>
                <th scope="col">Reads as</th>
                <th scope="col">Status</th>
                <th scope="col">Visibility</th>
                <th scope="col">Set</th>
              </tr>
            </thead>
            <tbody>
              {artifacts.map((artifact, index) => (
                <tr key={artifact.id} data-testid={`cs-artifact-row-${artifact.id}`}>
                  <td className="small">{artifact.title}</td>
                  <td className="small"><code>{artifact.artifactType}</code></td>
                  <td className="small" data-testid={`cs-artifact-presentation-${artifact.id}`}>
                    {artifact.presentationIsEvidence ? 'evidence' : 'atmosphere'}
                    <span className="text-muted"> (derived)</span>
                  </td>
                  <td className="small">{artifact.status}</td>
                  <td className="small">{artifact.visibility}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary"
                      data-testid={index === 0
                        ? CASE_STUDY_STUDIO_CONTROLS['promote artifact']
                        : `${CASE_STUDY_STUDIO_CONTROLS['promote artifact']}-${index}`}
                      disabled={busy}
                      onClick={() => onSetArtifactStatus(
                        artifact.id,
                        artifact.status === 'approved' ? 'candidate' : 'approved',
                        artifact.status === 'approved' ? 'private' : 'public',
                      )}
                    >
                      {artifact.status === 'approved' ? 'Withdraw' : 'Approve + publish'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      <SectionCard title="Charts" icon="bar-chart-2-line" className="mb-4">
        <div className="alert alert-secondary py-2 small" data-testid="cs-chart-disclaimer">
          <strong>A chart references metrics. It never carries numbers.</strong>{' '}
          There is no field here for a value, and the request schema rejects one. Every figure a
          chart shows is resolved from <code>case_study_metrics</code> at render, through the same
          check the measurement section uses — so a chart cannot show a number the measurement
          section would refuse to show.
        </div>

        {availableMetricKeys.length === 0 ? (
          <p className="text-muted" data-testid="cs-chart-no-metrics">
            This record has no metrics, so there is nothing a chart could reference. Add and verify
            a metric first. A chart is never the place a number is introduced.
          </p>
        ) : (
          <div className="border rounded p-3 mb-3">
            <div className="row g-2 mb-2">
              <div className="col-sm-6">
                <label className="form-label small fw-semibold" htmlFor="cs-chart-title">Title</label>
                <input
                  id="cs-chart-title"
                  className="form-control form-control-sm"
                  value={chartTitle}
                  data-testid="cs-chart-title"
                  onChange={(event) => setChartTitle(event.target.value)}
                />
              </div>
              <div className="col-sm-6">
                <label className="form-label small fw-semibold" htmlFor="cs-chart-type">Type</label>
                <select
                  id="cs-chart-type"
                  className="form-select form-select-sm"
                  value={chartType}
                  data-testid="cs-chart-type"
                  onChange={(event) => setChartType(event.target.value as CaseStudyChartType)}
                >
                  <option value="bar">Bar</option>
                  <option value="ranking">Ranking</option>
                </select>
              </div>
            </div>

            <fieldset className="mb-2">
              <legend className="form-label small fw-semibold">Metrics to reference</legend>
              {availableMetricKeys.map((key) => (
                <div className="form-check form-check-inline" key={key}>
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id={`cs-chart-key-${key}`}
                    data-testid={`cs-chart-key-${key}`}
                    checked={selectedKeys.includes(key)}
                    onChange={() => toggleKey(key)}
                  />
                  <label className="form-check-label small" htmlFor={`cs-chart-key-${key}`}>
                    {key}
                  </label>
                </div>
              ))}
            </fieldset>

            <button
              type="button"
              className="btn btn-sm btn-primary"
              data-testid={CASE_STUDY_STUDIO_CONTROLS.chart}
              disabled={busy || chartTitle.trim().length === 0 || selectedKeys.length === 0}
              onClick={() => {
                onSaveChart({ chartType, title: chartTitle.trim(), metricKeys: selectedKeys });
                setChartTitle('');
                setSelectedKeys([]);
              }}
            >
              Save chart
            </button>
          </div>
        )}

        {charts.length === 0 ? (
          <p className="text-muted mb-0" data-testid="cs-charts-empty">No charts on this record.</p>
        ) : (
          charts.map((resolution) => (
            <div
              className="border-bottom pb-3 mb-3"
              key={resolution.chart.id}
              data-testid={`cs-chart-${resolution.chart.id}`}
            >
              <h3 className="h6 mb-1">
                {resolution.chart.title}{' '}
                <span className="badge bg-secondary">{resolution.chart.chartType}</span>{' '}
                {resolution.chart.approved
                  ? <span className="badge bg-success">approved</span>
                  : <span className="badge bg-warning text-dark">not approved</span>}
              </h3>

              <p className="small mb-1" data-testid={`cs-chart-resolved-${resolution.chart.id}`}>
                <strong>Renders:</strong>{' '}
                {resolution.resolved.length === 0
                  ? 'nothing — no metric it names is publishable and verified.'
                  : resolution.resolved.map((r) => `${r.label} (${r.valueDisplay})`).join(', ')}
              </p>

              {resolution.unresolved.length > 0 ? (
                <ul className="small text-danger mb-2" data-testid={`cs-chart-unresolved-${resolution.chart.id}`}>
                  {resolution.unresolved.map((u) => (
                    <li key={u.metricKey}><code>{u.metricKey}</code> &mdash; {u.reason}</li>
                  ))}
                </ul>
              ) : null}

              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                data-testid={`cs-chart-approval-${resolution.chart.id}`}
                disabled={busy}
                onClick={() => onSetChartApproval(resolution.chart.id, !resolution.chart.approved)}
              >
                {resolution.chart.approved ? 'Withdraw approval' : 'Approve chart'}
              </button>
            </div>
          ))
        )}
      </SectionCard>
    </>
  );
}
