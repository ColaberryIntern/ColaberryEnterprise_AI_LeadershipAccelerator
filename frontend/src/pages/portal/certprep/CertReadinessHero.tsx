import React from 'react';
import {
  CertReadiness,
  CertTrackInfo,
  readinessLabel,
  readinessExplanation,
} from '../../../services/certPrepApi';

/**
 * CertReadinessHero — the readiness number and what it actually means.
 *
 * THE HONESTY RULES THIS COMPONENT ENFORCES, because they are product
 * requirements and not styling preferences:
 *
 *   1. The score is always captioned "Colaberry readiness estimate". Anthropic
 *      produces its scaled score through equating we cannot reproduce; ours is a
 *      published linear transform on the same axis. Presenting it as a predicted
 *      exam score would be a claim we cannot support.
 *   2. `not_measured` renders as "Not measured", never as 0 or a floor score. A
 *      student who has answered nothing has no score, and showing one would be a
 *      number the UI then has to explain away.
 *   3. Sample confidence is shown whenever it is low, because a high score on a
 *      narrow sample is the most misleading thing this page could display.
 *   4. When blueprint weights are unavailable the copy says the score is an
 *      unweighted coverage estimate rather than implying exam weighting.
 */

const SCALE_MIN = 100;
const SCALE_MAX = 1000;

/** Where the score sits on the 100–1000 axis, as a 0..1 fraction for the dial. */
function dialFraction(scaled: number | null): number {
  if (scaled === null) return 0;
  return Math.max(0, Math.min(1, (scaled - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)));
}

interface Props {
  readiness: CertReadiness | null;
  track: CertTrackInfo | null;
  onSeeWhy: () => void;
  onNextAction: () => void;
  nextActionLabel: string;
}

const CertReadinessHero: React.FC<Props> = ({ readiness, track, onSeeWhy, onNextAction, nextActionLabel }) => {
  const state = readiness?.overall_state ?? 'not_measured';
  const measured = state !== 'not_measured' && readiness?.overall_scaled !== null;
  const scaled = measured ? readiness!.overall_scaled : null;
  const bar = track?.passing_scaled_score ?? 720;
  const fraction = dialFraction(scaled);
  const lowConfidence = (readiness?.sample_confidence ?? 0) < 0.6;

  return (
    <section className="cp-hero" aria-labelledby="cp-hero-title">
      <div className="cp-dial-wrap">
        <div
          className={`cp-dial cp-dial--${state}`}
          style={{ ['--cp-fill' as string]: `${(fraction * 100).toFixed(1)}%` }}
          role="img"
          aria-label={
            measured
              ? `Colaberry readiness estimate ${scaled} out of ${SCALE_MAX}. Target ${bar}.`
              : 'Readiness not measured yet'
          }
        >
          <div className="cp-dial-inner">
            {measured ? (
              <>
                <b className="cp-dial-num">{scaled}</b>
                <small>of {SCALE_MAX}</small>
              </>
            ) : (
              <b className="cp-dial-none">Not<br />measured</b>
            )}
          </div>
        </div>
        <div className="cp-dial-caption">Colaberry readiness estimate</div>
      </div>

      <div className="cp-hero-body">
        <div className="cp-eyebrow">{readinessLabel(state)}</div>
        <h2 id="cp-hero-title">
          {measured && scaled! < bar
            ? `${bar - scaled!} points from the ${bar} target`
            : measured
              ? `At or above the ${bar} target`
              : 'Start with the baseline diagnostic'}
        </h2>
        <p className="cp-hero-copy">{readinessExplanation(readiness)}</p>

        {readiness && measured && (
          <ul className="cp-ingredients">
            <li>
              <b>{readiness.knowledge_scaled ?? '—'}</b>
              <span>Knowledge</span>
            </li>
            <li>
              <b>{readiness.evidence_coverage_pct.toFixed(0)}%</b>
              <span>Build evidence</span>
            </li>
            <li>
              <b>{readiness.answered_total}</b>
              <span>Questions answered</span>
            </li>
          </ul>
        )}

        {/* A high score on a narrow sample is the most misleading thing this page
            could show, so it is called out rather than left for the student to
            infer from a number they cannot see. */}
        {readiness && measured && lowConfidence && (
          <p className="cp-caveat" role="note">
            Your practice has not covered every domain yet, so this estimate is
            provisional. Breadth moves it more than volume.
          </p>
        )}

        {readiness && !readiness.weights_available && (
          <p className="cp-caveat" role="note">
            Official domain weights are not configured, so this is a coverage
            estimate rather than an exam-weighted one.
          </p>
        )}

        <div className="cp-hero-actions">
          <button type="button" className="cp-btn cp-btn--primary" onClick={onNextAction}>
            {nextActionLabel}
          </button>
          <button type="button" className="cp-btn cp-btn--ghost" onClick={onSeeWhy}>
            See why
          </button>
        </div>
      </div>
    </section>
  );
};

export default CertReadinessHero;
