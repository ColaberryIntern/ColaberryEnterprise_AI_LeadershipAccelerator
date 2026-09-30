import React from 'react';
import { SectionCard, StatusBadge } from '../shell';
import CaseStudyOverrideField from './CaseStudyOverrideField';
import { CASE_STUDY_CONTROLS, controlIdAt } from './caseStudyDesk';
import type { MetricView } from './caseStudySnapshotView';

/**
 * CaseStudyMetricsPanel — spec §18's Metrics section, and the reason the publish
 * gate exists.
 *
 * `pending` is not a publishable state. A metric whose verification class is
 * `pending` has no shape in the public contract at all, so it cannot be rendered
 * to a visitor — and if it is marked headline, the gate refuses the whole
 * publish rather than dropping the number quietly. This panel therefore shows
 * verification class and `publishable` per metric, because those two fields are
 * what decide whether the record can go live.
 */

interface Props {
  metrics: readonly MetricView[];
  busy: boolean;
  onApplyOverride: (path: string, value: string, note?: string) => void;
}

const CLASS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  verified: 'success',
  anonymized: 'info',
  illustrative: 'warning',
  pending: 'danger',
};

export default function CaseStudyMetricsPanel({
  metrics, busy, onApplyOverride,
}: Props): React.ReactElement {
  return (
    <SectionCard title="Metrics" icon="bar-chart-box-line" className="mb-4">
      {metrics.length === 0 ? (
        <p className="text-muted mb-0" data-testid="cs-metrics-empty">
          This snapshot carries no metrics. A record with no verified figure publishes a proof
          point rather than an invented number, and a headline metric is required before the
          enterprise surface will accept it.
        </p>
      ) : (
        <>
          <div className="table-responsive mb-3">
            <table className="table table-sm align-middle mb-0">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Value</th>
                  <th>Type</th>
                  <th>Verification</th>
                  <th>Method</th>
                  <th>Headline</th>
                  <th>Publishable</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((metric) => (
                  <tr key={metric.path} data-testid={`cs-metric-${metric.path}`}>
                    <td>
                      <div className="fw-semibold">{metric.label || metric.key || '—'}</div>
                      <div className="small text-muted font-monospace">{metric.path}</div>
                    </td>
                    <td>{metric.valueDisplay || '—'}{metric.unit ? ` ${metric.unit}` : ''}</td>
                    <td className="small">{metric.metricType || '—'}</td>
                    <td>
                      <StatusBadge
                        label={metric.verificationClass}
                        tone={CLASS_TONE[metric.verificationClass] ?? 'neutral'}
                      />
                    </td>
                    <td className="small">{metric.verificationMethod || '—'}</td>
                    <td className="small">{metric.isHeadline ? 'yes' : 'no'}</td>
                    <td className="small">
                      {metric.publishable ? 'yes' : (
                        <span className="text-danger">
                          no — this figure cannot reach a visitor
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* EVERY metric, not the first three. The cap was arbitrary — three
              is not a property of anything — and on a record with four metrics it
              silently withheld editorial control of the fourth, with nothing on
              screen to say so. Keeping the instrument and dropping the cap is the
              narrow fix; the measured-figures panel below governs a different
              population (the case_study_metrics table) and does not replace this. */}
          <h3 className="h6">Human editorial copy</h3>
          <div className="row g-3">
            {metrics.map((metric, index) => (
              <div className="col-lg-4" key={`override-${metric.path}`}>
                <CaseStudyOverrideField
                  label={`Displayed value — ${metric.label || metric.key || metric.path}`}
                  path={`${metric.path}.valueDisplay`}
                  generated={metric.valueDisplay}
                  testId={controlIdAt('metrics', index)}
                  busy={busy}
                  onApply={onApplyOverride}
                  help="How the figure reads on the page. The underlying measurement is not changed by this."
                />
              </div>
            ))}
          </div>
          <p className="small text-muted mb-0" data-testid={`${CASE_STUDY_CONTROLS.metrics}-note`}>
            Editing how a figure READS does not verify it. Verification class and evidence are
            changed on the evidence record, not here.
          </p>
        </>
      )}
    </SectionCard>
  );
}
