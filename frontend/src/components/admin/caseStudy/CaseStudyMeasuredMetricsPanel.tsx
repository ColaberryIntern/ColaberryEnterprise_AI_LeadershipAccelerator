import React from 'react';
import { SectionCard, StatusBadge } from '../shell';
import type {
  MeasuredMetric, MetricRunReport, MetricVerificationClass,
} from '../../../services/caseStudyMetricApi';

/**
 * CaseStudyMeasuredMetricsPanel — the figures the pipeline measured, and the
 * control that lets a person decide whether any of them may be published.
 *
 * A SEPARATE PANEL FROM `CaseStudyMetricsPanel`, and the separation is the
 * point. That one reads metrics out of SNAPSHOT CONTENT and lets an author edit
 * how a figure reads. This one reads the `case_study_metrics` TABLE — the rows
 * `resolveChart` actually resolves against, and the rows nothing in the product
 * has ever been able to display. Merging them would hide the fact that they are
 * different populations, which is precisely the confusion that let a measured
 * metric sit invisible in the database.
 *
 * NOTHING HERE DECIDES ANYTHING. Every rule — a self-report cannot be called
 * verified, a verified figure needs evidence, a pending figure cannot be
 * publishable — lives on the server and is enforced there. This panel renders
 * the refusal it gets back rather than predicting it, so the two can never
 * disagree about what is allowed.
 */

interface Props {
  metrics: readonly MeasuredMetric[];
  definitionKeys: readonly string[];
  busy: boolean;
  /** Null until a run has happened in this session. */
  lastRun: MetricRunReport | null;
  error: string | null;
  onRun: (definitionKey: string) => void;
  onPromote: (metricKey: string, next: {
    verificationClass: MetricVerificationClass;
    publishable: boolean;
    isHeadline: boolean;
  }) => void;
}

const CLASS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  verified: 'success',
  anonymized: 'info',
  illustrative: 'warning',
  pending: 'danger',
};

const CLASSES: readonly MetricVerificationClass[] = [
  'pending', 'illustrative', 'anonymized', 'verified',
];

export default function CaseStudyMeasuredMetricsPanel({
  metrics, definitionKeys, busy, lastRun, error, onRun, onPromote,
}: Props): React.ReactElement {
  const [definitionKey, setDefinitionKey] = React.useState<string>(definitionKeys[0] ?? '');

  React.useEffect(() => {
    if (!definitionKey && definitionKeys.length > 0) setDefinitionKey(definitionKeys[0]);
  }, [definitionKeys, definitionKey]);

  return (
    <SectionCard title="Measured figures" icon="ruler-line" className="mb-4">

      <div className="d-flex flex-wrap align-items-end gap-2 mb-3">
        <div style={{ minWidth: '260px' }}>
          <label className="form-label small fw-semibold mb-1" htmlFor="cs-metric-definition">
            Definition
          </label>
          <select
            id="cs-metric-definition"
            className="form-select form-select-sm"
            value={definitionKey}
            disabled={busy || definitionKeys.length === 0}
            onChange={(e) => setDefinitionKey(e.target.value)}
            data-testid="cs-measured-definition"
          >
            {definitionKeys.map((key) => <option key={key} value={key}>{key}</option>)}
          </select>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={busy || !definitionKey}
          onClick={() => onRun(definitionKey)}
          data-testid="cs-measured-run"
        >
          {busy ? 'Measuring…' : 'Run measurement'}
        </button>
        <p className="small text-muted mb-0 ms-auto" style={{ maxWidth: '38ch' }}>
          A run reads the attached repositories and writes a pending figure. It never publishes.
        </p>
      </div>

      {error && (
        <div className="alert alert-danger py-2 small" role="alert" data-testid="cs-measured-error">
          {error}
        </div>
      )}

      {lastRun && (
        <div
          className={`alert py-2 small ${lastRun.status === 'refused' ? 'alert-warning' : 'alert-success'}`}
          role="status"
          data-testid="cs-measured-runreport"
        >
          {lastRun.status === 'refused' ? (
            // A refusal is not a failure: the run found a figure a human had
            // published and left it alone. Showing it as an error would teach an
            // operator to read a working safeguard as a fault.
            <>
              <strong>Left the published figure alone.</strong>{' '}
              {lastRun.write.message}
            </>
          ) : (
            <>
              <strong>{lastRun.write.created ? 'Measured.' : 'Re-measured.'}</strong>{' '}
              Read {lastRun.repoStats.analysed} of {lastRun.repoStats.attempted} repositories
              {lastRun.repoStats.unreadable > 0
                && `, ${lastRun.repoStats.unreadable} unreadable and excluded`}.
            </>
          )}
        </div>
      )}

      {metrics.length === 0 ? (
        <p className="text-muted mb-0" data-testid="cs-measured-empty">
          Nothing has been measured on this record yet. A measurement reads the attached
          repositories at the commit the approved snapshot pinned, and writes a figure that stays
          unpublishable until someone verifies it.
        </p>
      ) : (
        <div className="d-flex flex-column gap-3" data-testid="cs-measured-list">
          {metrics.map((metric) => (
            <MetricCard
              key={metric.metricKey}
              metric={metric}
              busy={busy}
              onPromote={onPromote}
            />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function MetricCard({
  metric, busy, onPromote,
}: {
  metric: MeasuredMetric;
  busy: boolean;
  onPromote: Props['onPromote'];
}): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  // Controlled, so the decision the button sends is the decision the operator
  // can see on screen. Reading the DOM back at click time would let the two
  // drift apart the moment anything else re-rendered.
  const [cls, setCls] = React.useState<MetricVerificationClass>(metric.verificationClass);
  const [publishable, setPublishable] = React.useState(metric.publishable);
  const [headline, setHeadline] = React.useState(metric.isHeadline);

  // Depends on the METRIC OBJECT, not on its individual values — and that
  // distinction is the whole behaviour. A refused promotion leaves the server's
  // state unchanged, so a value-keyed effect never fires and the control goes on
  // displaying a choice the server rejected. Keying on the object means every
  // refetch resets the controls, because the parent hands down a freshly parsed
  // row whether or not anything about it changed. A test covers exactly this.
  React.useEffect(() => {
    setCls(metric.verificationClass);
    setPublishable(metric.publishable);
    setHeadline(metric.isHeadline);
  }, [metric]);

  return (
    <div className="border rounded p-3" data-testid={`cs-measured-${metric.metricKey}`}>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2">
        <div>
          <div className="fs-4 fw-semibold font-monospace">
            {metric.valueDisplay || '—'}
          </div>
          <div className="fw-semibold">{metric.label || metric.metricKey}</div>
          <div className="small text-muted font-monospace">
            {metric.metricKey} · {metric.metricType} · method: {metric.verificationMethod}
          </div>
        </div>
        <div className="d-flex flex-column align-items-end gap-1">
          <StatusBadge
            label={metric.verificationClass}
            tone={CLASS_TONE[metric.verificationClass] ?? 'neutral'}
          />
          <StatusBadge
            label={metric.publishable ? 'publishable' : 'not publishable'}
            tone={metric.publishable ? 'success' : 'neutral'}
          />
          {metric.isHeadline && <StatusBadge label="headline" tone="info" />}
        </div>
      </div>

      <p className="small text-muted mt-2 mb-2" data-testid={`cs-measured-${metric.metricKey}-who`}>
        {metric.verifiedBy
          ? <>Verified by {metric.verifiedBy}{metric.verifiedAt ? ` on ${metric.verifiedAt.slice(0, 10)}` : ''}.</>
          : <>Nobody has verified this figure. Until someone does, no surface will show it.</>}
        {!metric.hasEvidence && ' No evidence is linked, so it cannot be marked verified.'}
      </p>

      <button
        type="button"
        className="btn btn-sm btn-link p-0 small"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid={`cs-measured-${metric.metricKey}-toggle`}
      >
        {open ? 'Hide how it was measured' : 'How it was measured'}
      </button>

      {open && (
        <div className="mt-2 small" data-testid={`cs-measured-${metric.metricKey}-detail`}>
          {/* The methodology and the limitations are what make a figure judgeable.
              Offering a promote control without them would ask someone to
              approve a number they cannot evaluate. */}
          {metric.methodology && <p className="mb-2">{metric.methodology}</p>}
          {metric.sample && <p className="text-muted mb-2">Sample: {metric.sample}</p>}
          {metric.limitations.length > 0 && (
            <>
              <div className="fw-semibold">Limitations</div>
              <ul className="mb-2 ps-3">
                {metric.limitations.map((l) => <li key={l}>{l}</li>)}
              </ul>
            </>
          )}
          {metric.baseline
            ? <p className="text-muted mb-0">Baseline: {metric.baseline}</p>
            : <p className="text-muted mb-0">No baseline — this is a level metric with nothing to compare against.</p>}
        </div>
      )}

      <div className="d-flex flex-wrap align-items-end gap-2 mt-3">
        <div>
          <label
            className="form-label small fw-semibold mb-1"
            htmlFor={`cs-class-${metric.metricKey}`}
          >
            Verification
          </label>
          <select
            id={`cs-class-${metric.metricKey}`}
            className="form-select form-select-sm"
            value={cls}
            onChange={(e) => setCls(e.target.value as MetricVerificationClass)}
            disabled={busy}
            data-testid={`cs-measured-${metric.metricKey}-class`}
          >
            {CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="form-check">
          <input
            className="form-check-input"
            type="checkbox"
            id={`cs-pub-${metric.metricKey}`}
            checked={publishable}
            onChange={(e) => setPublishable(e.target.checked)}
            disabled={busy}
            data-testid={`cs-measured-${metric.metricKey}-publishable`}
          />
          <label className="form-check-label small" htmlFor={`cs-pub-${metric.metricKey}`}>
            Publishable
          </label>
        </div>

        <div className="form-check">
          <input
            className="form-check-input"
            type="checkbox"
            id={`cs-head-${metric.metricKey}`}
            checked={headline}
            onChange={(e) => setHeadline(e.target.checked)}
            disabled={busy}
            data-testid={`cs-measured-${metric.metricKey}-headline`}
          />
          <label className="form-check-label small" htmlFor={`cs-head-${metric.metricKey}`}>
            Headline
          </label>
        </div>

        <button
          type="button"
          className="btn btn-sm btn-outline-primary"
          disabled={busy}
          data-testid={`cs-measured-${metric.metricKey}-save`}
          onClick={() => onPromote(metric.metricKey, {
            verificationClass: cls, publishable, isHeadline: headline,
          })}
        >
          Record decision
        </button>

        <p className="small text-muted mb-0">
          Your name is recorded against this.
        </p>
      </div>
    </div>
  );
}
