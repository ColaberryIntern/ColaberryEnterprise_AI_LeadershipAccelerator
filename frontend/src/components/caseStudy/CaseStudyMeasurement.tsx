import React from 'react';
import { Metric } from '../publicV2/Claim';
import CaseStudyVerificationBadge from './CaseStudyVerificationBadge';
import type {
  PublicCaseStudyMeasurement,
  PublicCaseStudyMetric,
} from '../../services/caseStudyPublicTypes';
import './caseStudy.css';

/**
 * CaseStudyMeasurement - the figures, with the context that makes them readable.
 *
 * A HIGH-IMPACT NUMBER WITHOUT EVIDENCE CONTEXT IS INCOMPLETE (spec section 23).
 * Baseline, sample, unit, methodology and limitations render whenever the record
 * carries them, as a definition list beside the figure rather than as a footnote
 * somewhere below it. A null field is omitted, never filled with "n/a" - the
 * absence is information, and inventing a plausible baseline would be the single
 * most damaging fabrication available on this page.
 *
 * EVERY FIGURE GOES THROUGH `<Metric>`. Its `evidence` prop is required with no
 * default, which is what makes an unlabelled number a compile error instead of a
 * review finding. `badgeHidden` is set because
 * `CaseStudyVerificationBadge` renders the richer two-axis badge beside it -
 * the class AND the method - rather than the class alone.
 *
 * NO ARITHMETIC. `valueDisplay` is printed exactly as the snapshot approved it,
 * and `unit` is shown as its own term rather than concatenated onto the value:
 * gluing "41%" to "%" is how a figure becomes wrong in a way nobody notices.
 */

export interface CaseStudyMeasurementProps {
  measurement: PublicCaseStudyMeasurement;
  className?: string;
}

interface ContextRow {
  readonly term: string;
  readonly value: string;
}

/** Only the fields the record actually carries, in reading order. */
export function contextRowsFor(metric: PublicCaseStudyMetric): ContextRow[] {
  const rows: ContextRow[] = [];
  if (metric.baseline) rows.push({ term: 'Baseline', value: metric.baseline });
  if (metric.unit) rows.push({ term: 'Unit', value: metric.unit });
  if (metric.sample) rows.push({ term: 'Sample', value: metric.sample });
  if (metric.methodology) rows.push({ term: 'Methodology', value: metric.methodology });
  return rows;
}

export function CaseStudyMeasurement({
  measurement,
  className,
}: CaseStudyMeasurementProps): React.ReactElement | null {
  if (measurement.narrative.length === 0 && measurement.metrics.length === 0) return null;

  return (
    <div className={`cbv2-cs-measure${className ? ` ${className}` : ''}`}>
      {measurement.narrative.length > 0 ? (
        <div className="cbv2-cs-arch__prose">
          {measurement.narrative.map((paragraph, index) => (
            <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
          ))}
        </div>
      ) : null}

      {measurement.metrics.map((metric, index) => {
        const rows = contextRowsFor(metric);
        return (
          <section
            className="cbv2-cs-measure__metric"
            key={`${metric.label}-${index}`}
            aria-label={metric.label}
            data-verification-class={metric.verificationClass}
          >
            {/* Named with `aria-label` rather than a hidden heading: `Metric`
                already prints the label, and a heading carrying the same words
                would make a screen reader say them twice. */}
            <Metric
              value={metric.valueDisplay}
              label={metric.label}
              evidence={metric.verificationClass}
              badgeHidden
            />
            <CaseStudyVerificationBadge
              verificationClass={metric.verificationClass}
              verificationMethod={metric.verificationMethod}
            />

            {rows.length > 0 ? (
              <dl className="cbv2-cs-measure__context">
                {rows.map((row) => (
                  <div key={row.term}>
                    <dt className="cbv2-cs-measure__term">{row.term}</dt>
                    <dd className="cbv2-cs-measure__value">{row.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            {metric.limitations.length > 0 ? (
              <div>
                <span className="cbv2-cs-measure__term">Limitations</span>
                <ul className="cbv2-cs-measure__limits">
                  {metric.limitations.map((limitation) => (
                    <li key={limitation}>{limitation}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

export default CaseStudyMeasurement;
