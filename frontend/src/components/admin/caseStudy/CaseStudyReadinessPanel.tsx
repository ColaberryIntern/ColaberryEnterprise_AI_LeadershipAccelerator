import React from 'react';
import { SectionCard, StatCard } from '../shell';
import { CASE_STUDY_CONTROLS } from './caseStudyDesk';
import type { CaseStudyReadinessReport } from '../../../services/caseStudyAdminTypes';

/**
 * CaseStudyReadinessPanel — spec §13's rubric, rendered as a WORKLIST.
 *
 * READINESS IS ADVISORY AND NOTHING HERE GATES ON IT. The score authorises
 * nothing, the band is descriptive, and no control on this page is enabled or
 * disabled by either. The publish gate is the sole authority on whether a record
 * may go live, and it lives in `CaseStudyPublishPanel`; a second, softer
 * "are we ready" judgement that could disagree with it is precisely the thing
 * that turns a hard rule into a suggestion.
 *
 * What the score IS good for is ordering the work: every gap names the category
 * it costs points in, what is missing, and what would close it.
 */

interface Props {
  readiness: CaseStudyReadinessReport | null;
  busy: boolean;
  onRecheck: () => void;
}

export default function CaseStudyReadinessPanel({
  readiness, busy, onRecheck,
}: Props): React.ReactElement {
  return (
    <SectionCard
      title="Readiness (advisory)" icon="dashboard-3-line" className="mb-4"
      actions={
        <button
          type="button" className="btn btn-sm btn-outline-secondary"
          data-testid={CASE_STUDY_CONTROLS['readiness gaps']} onClick={onRecheck} disabled={busy}
        >
          Recheck readiness
        </button>
      }
    >
      <p className="small text-muted" data-testid="cs-readiness-advisory">
        Advisory only. This score decides nothing: publication is decided by the publish gate
        below, and a low score never blocks a publish any more than a high one permits it.
      </p>

      {!readiness ? (
        <p className="text-muted mb-0" data-testid="cs-readiness-none">
          No readiness report. It is computed from a snapshot, and this candidate has none yet, so
          nothing has been assessed — which is not the same as nothing being wrong.
        </p>
      ) : (
        <>
          <div className="row g-3 mb-3">
            <div className="col-6 col-lg-3">
              <StatCard
                label="SCORE" value={readiness.score} unit={`/ ${readiness.maxScore}`}
                icon="speed-line" tone="info" hint={`band: ${readiness.band}`}
              />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard
                label="OPEN GAPS" value={readiness.gaps.length} icon="list-check"
                tone={readiness.gaps.length > 0 ? 'warning' : 'success'}
                hint="each names what would close it"
              />
            </div>
          </div>

          <div className="row g-3 mb-3">
            {readiness.categories.map((category) => (
              <div className="col-md-6 col-lg-3" key={category.category}>
                <div className="small fw-semibold">{category.summary}</div>
                <div className="small text-muted">
                  {category.gaps.length === 0
                    ? 'no gaps'
                    : `${category.gaps.length} gap${category.gaps.length === 1 ? '' : 's'}`}
                </div>
              </div>
            ))}
          </div>

          {readiness.gaps.length === 0 ? (
            <p className="text-muted mb-0">Every rubric point is awarded.</p>
          ) : (
            <ul className="mb-0">
              {readiness.gaps.map((gap) => (
                <li key={gap.checkKey} data-testid={`cs-readiness-gap-${gap.checkKey}`}>
                  <strong>{gap.categoryLabel}</strong> — {gap.detail}
                  {' '}
                  <span className="text-muted">
                    (-{gap.pointsLost} of {gap.pointsPossible})
                  </span>
                  <div className="small">To close: {gap.remedy}</div>
                </li>
              ))}
            </ul>
          )}

          <p className="small text-muted mt-3 mb-0">{readiness.advisory}</p>
        </>
      )}
    </SectionCard>
  );
}
