import React from 'react';
import { Metric } from '../publicV2/Claim';
import CaseStudyMetricShape from './CaseStudyMetricShape';
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
 * carries them, beside the figure rather than as a footnote somewhere below it.
 * A null field is omitted, never filled with "n/a" - the absence is information,
 * and inventing a plausible baseline would be the single most damaging
 * fabrication available on this page.
 *
 * TWO CARD LAYOUTS, ONE CHOSEN PER METRIC:
 *
 *   SHAPED    hero number, then a picture drawn from the payload, then the
 *             three plain-language answers. This is the layout a figure earns
 *             by carrying structure a renderer can honestly draw.
 *   UNSHAPED  hero number, then the definition list every record used before
 *             shapes existed: baseline, unit, sample, methodology.
 *
 * The fallback is not a degraded mode, it is the correct rendering for a figure
 * a human typed. Most of the published library is unshaped and must keep
 * looking exactly as it looks today.
 *
 * EVERY FIGURE GOES THROUGH `<Metric>`. Its `evidence` prop is required with no
 * default, which is what makes an unlabelled number a compile error instead of a
 * review finding. `badgeHidden` is set because `CaseStudyVerificationBadge`
 * renders the richer two-axis badge beside it - the class AND the method.
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

/**
 * Whether `valueDisplay` already says the unit, in which case printing a UNIT
 * row makes the card say it twice.
 *
 * MEASURED, NOT SUSPECTED: 13 of the 14 metrics published across the three live
 * records do this - "14 decision records" above a row reading UNIT: records,
 * "6 phases" above UNIT: phases. It is not an authoring slip repeated fourteen
 * times; a display value that reads as a complete phrase almost always contains
 * its own noun, which is exactly what the authoring skill asks for. So the card
 * suppresses the redundant row instead of every author remembering to.
 *
 * Word-boundary matched, so "records" is caught in "14 decision records" but
 * "s" would not match anything, and a unit that genuinely adds something -
 * "41%" with unit "percentage points" - still prints.
 */
export function unitAlreadyInValue(valueDisplay: string, unit: string): boolean {
  if (!unit.trim() || !valueDisplay.trim()) return false;
  const escaped = unit.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(valueDisplay);
}

/** Only the fields the record actually carries, in reading order. */
export function contextRowsFor(metric: PublicCaseStudyMetric): ContextRow[] {
  const rows: ContextRow[] = [];
  if (metric.baseline) rows.push({ term: 'Baseline', value: metric.baseline });
  if (metric.unit && !unitAlreadyInValue(metric.valueDisplay ?? '', metric.unit)) {
    rows.push({ term: 'Unit', value: metric.unit });
  }
  if (metric.sample) rows.push({ term: 'Sample', value: metric.sample });
  if (metric.methodology) rows.push({ term: 'Methodology', value: metric.methodology });
  return rows;
}

/**
 * The three questions a reader has about any number, answered in their words.
 *
 * ALL THREE OR NONE. The API only ever sends a complete set, because two thirds
 * of an answer reads as more certain than the number is: a figure that says what
 * it counts and where it came from, but not what it cannot show, is the exact
 * shape of an overclaim.
 */
function PlainLanguage({ metric }: { metric: PublicCaseStudyMetric }): React.ReactElement | null {
  if (!metric.plain) return null;
  const blocks: readonly ContextRow[] = [
    { term: 'What this counts', value: metric.plain.counts },
    { term: 'Where it came from', value: metric.plain.from },
    { term: "What it doesn't tell you", value: metric.plain.cannotShow },
  ];
  return (
    <dl className="cbv2-cs-measure__plain">
      {blocks.map((block) => (
        <div className="cbv2-cs-measure__plain-block" key={block.term}>
          <dt className="cbv2-cs-measure__term">{block.term}</dt>
          <dd className="cbv2-cs-measure__value">{block.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Limitations as ONE muted paragraph in the footer, not a bulleted list.
 *
 * A bulleted list of caveats under a big number reads as a disclaimer somebody
 * was made to write. A sentence or two in the footer reads as the author being
 * straight with you, and gets read. The words are unchanged either way.
 */
function Limitations({ lines }: { lines: readonly string[] }): React.ReactElement | null {
  if (lines.length === 0) return null;
  return <p className="cbv2-cs-measure__limits">{lines.join(' ')}</p>;
}

/**
 * The command, closed by default.
 *
 * OPEN WOULD BE WRONG. Almost nobody wants to read a git invocation, and
 * putting one in the flow of the page makes the record look like a terminal
 * session. Closed, it costs one line and says something the rest of the card
 * cannot: this number is checkable, and here is how.
 */
function Reproduce({ command }: { command: string }): React.ReactElement {
  return (
    <details className="cbv2-cs-measure__repro">
      <summary>How this was counted</summary>
      <code>{command}</code>
    </details>
  );
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

      <div className="cbv2-cs-measure__grid">
        {measurement.metrics.map((metric, index) => {
          // A shape without a payload draws nothing, so the definition list is
          // the fallback for both an unshaped record and a half-written one.
          const shaped = Boolean(metric.shape && metric.payload);
          const rows = shaped && metric.plain ? [] : contextRowsFor(metric);
          return (
            <section
              className="cbv2-cs-measure__metric"
              key={`${metric.label}-${index}`}
              aria-label={metric.label}
              data-verification-class={metric.verificationClass}
              data-shaped={shaped ? 'yes' : 'no'}
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

              <CaseStudyMetricShape metric={metric} />
              <PlainLanguage metric={metric} />

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

              <footer className="cbv2-cs-measure__foot">
                <Limitations lines={metric.limitations} />
                {metric.reproduceCommand ? <Reproduce command={metric.reproduceCommand} /> : null}
              </footer>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export default CaseStudyMeasurement;
