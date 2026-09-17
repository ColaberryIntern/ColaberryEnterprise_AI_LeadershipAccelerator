import React from 'react';
import { useReview } from './reviewContext';
import { RecommendationBadge, RequirementDot } from './badges';

const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase' };

/**
 * AI assessment tab — a summary and a recommendation the reviewer reads, never a
 * decision. Requirement dots are deterministic; the summary and posture are the
 * model's, generated on demand.
 */
const TabAssessment: React.FC = () => {
  const r = useReview();
  return (
    <div>
      <p className="text-muted" style={{ fontSize: 12.5, marginTop: 0 }}>A recommendation, not a decision. You decide on the Decide tab.</p>
      {r.assessError && <div className="alert alert-danger py-2" role="alert">{r.assessError}</div>}

      {!r.assessment && (
        <div className="d-flex align-items-center gap-3">
          <button type="button" className="btn btn-sm btn-dark" onClick={r.runAssessment} disabled={r.assessing}>
            {r.assessing ? 'Reading the application…' : 'Generate AI assessment'}
          </button>
          <span className="text-muted" style={{ fontSize: 13 }}>
            Summarises the applicant, checks each requirement, and suggests a posture.
          </span>
        </div>
      )}

      {r.assessment && (
        <div className="d-flex flex-column gap-3">
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <RecommendationBadge value={r.assessment.recommendation} />
            {!r.assessment.model_generated && (
              <span className="badge bg-secondary" title="The language model was unavailable; showing the requirement check only.">
                requirement check only
              </span>
            )}
            <button type="button" className="btn btn-sm btn-outline-secondary ms-auto" onClick={r.runAssessment} disabled={r.assessing}>
              {r.assessing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          <p className="mb-0" style={{ fontSize: 14, lineHeight: 1.55 }}>{r.assessment.summary}</p>

          {r.assessment.rationale && (
            <p className="text-muted mb-0" style={{ fontSize: 13.5, lineHeight: 1.55 }}>
              <strong>Why:</strong> {r.assessment.rationale}
            </p>
          )}

          <div>
            <div className="text-muted mb-2" style={eyebrow}>Requirements</div>
            <div className="d-flex flex-column gap-1">
              {r.assessment.requirements.map((req) => (
                <div key={req.key} className="d-flex align-items-start gap-2" style={{ fontSize: 13.5 }}>
                  <RequirementDot status={req.status} />
                  <span>{req.label}{req.evidence && <span className="text-muted"> — {req.evidence}</span>}</span>
                </div>
              ))}
            </div>
          </div>

          {r.assessment.conditions.length > 0 && (
            <div>
              <div className="text-muted mb-1" style={eyebrow}>Suggested conditions</div>
              <ul className="mb-0" style={{ fontSize: 13.5 }}>
                {r.assessment.conditions.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          )}

          {r.assessment.follow_up_questions.length > 0 && (
            <div>
              <div className="text-muted mb-1" style={eyebrow}>Questions to get answered</div>
              <ul className="mb-0" style={{ fontSize: 13.5 }}>
                {r.assessment.follow_up_questions.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TabAssessment;
