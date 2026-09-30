import React from 'react';
import { SectionCard } from '../shell';
import CaseStudyOverrideField from './CaseStudyOverrideField';
import { controlIdAt } from './caseStudyDesk';
import type { MetricView } from './caseStudySnapshotView';

/**
 * CaseStudyEvidencePanel — spec §18's Measurement section: the context that
 * makes a figure readable, and the record that backs it.
 *
 * Spec §15 refuses a publish when a high-impact figure has no baseline, sample
 * and methodology (`proof_metadata_missing`), so this panel names each of those
 * three per metric and says plainly which are absent. It shows only WHETHER an
 * evidence record exists, never the evidence row's id: the id is internal and
 * has no meaning to a reviewer, while its presence is exactly what they are
 * checking.
 */

interface Props {
  metrics: readonly MetricView[];
  busy: boolean;
  onApplyOverride: (path: string, value: string, note?: string) => void;
}

const Missing = (): React.ReactElement => (
  <span className="text-danger">missing</span>
);

export default function CaseStudyEvidencePanel({
  metrics, busy, onApplyOverride,
}: Props): React.ReactElement {
  return (
    <SectionCard title="Evidence" icon="search-eye-line" className="mb-4">
      {metrics.length === 0 ? (
        <p className="text-muted mb-0" data-testid="cs-evidence-empty">
          No metrics, so there is no evidence to review yet. Sync the repositories or add a metric
          before asking for approval.
        </p>
      ) : (
        metrics.map((metric, index) => (
          <div
            className="border-bottom pb-3 mb-3"
            key={`evidence-${metric.path}`}
            data-testid={`cs-evidence-${metric.path}`}
          >
            <h3 className="h6 mb-1">{metric.label || metric.key || metric.path}</h3>
            <dl className="row small mb-2">
              <dt className="col-sm-3">Verification</dt>
              <dd className="col-sm-9">
                {metric.verificationClass}
                {metric.verificationMethod ? ` via ${metric.verificationMethod}` : ''}
                {metric.verifiedAt ? ` on ${metric.verifiedAt}` : ' — not yet verified'}
              </dd>
              <dt className="col-sm-3">Evidence record</dt>
              <dd className="col-sm-9">
                {metric.hasEvidenceRecord
                  ? 'linked'
                  : <span className="text-danger">no evidence record is linked to this figure</span>}
              </dd>
              <dt className="col-sm-3">Baseline</dt>
              <dd className="col-sm-9">{metric.baseline || <Missing />}</dd>
              <dt className="col-sm-3">Sample</dt>
              <dd className="col-sm-9">{metric.sample || <Missing />}</dd>
              <dt className="col-sm-3">Measured</dt>
              <dd className="col-sm-9">{metric.measured || <Missing />}</dd>
              <dt className="col-sm-3">Methodology</dt>
              <dd className="col-sm-9">{metric.methodology || <Missing />}</dd>
              <dt className="col-sm-3">Limitations</dt>
              <dd className="col-sm-9">
                {metric.limitations.length > 0 ? metric.limitations.join('; ') : 'none recorded'}
              </dd>
            </dl>
            <CaseStudyOverrideField
              label="Methodology"
              path={`${metric.path}.measurement.methodology`}
              generated={metric.methodology}
              testId={controlIdAt('evidence', index)}
              busy={busy}
              onApply={onApplyOverride}
              help="How the figure was measured. The publish gate refuses a high-impact figure without it."
              rows={2}
            />
          </div>
        ))
      )}
    </SectionCard>
  );
}
