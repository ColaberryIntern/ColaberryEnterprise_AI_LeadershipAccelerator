import React, { useEffect, useState } from 'react';
import { getCaseStudyFoundation, type CaseStudyFoundation, type CaseStudyMaturity } from '../../../services/sbpApi';

// Where this build sits on the ladder from "an idea" to "a case study", and
// what the next rung needs. Read-only, deliberately: there is no publish
// control on the student side, the response says `publishable: false`, and
// the top two rungs are shown as what they are: not reachable from a build
// alone. A student who reads this learns that a passing build is a build
// record, not a case study, before anyone has to tell them.

const RUNG_LABEL: Record<CaseStudyMaturity, string> = {
  story_hypothesis: 'Story hypothesis',
  build_record: 'Build record',
  capability_demonstration: 'Capability demonstration',
  operational_result: 'Operational result',
  impact_case_study: 'Impact case study',
};

/** Rungs a build cannot climb to on its own; they need something measured in use. */
const NEEDS_MEASUREMENT: CaseStudyMaturity[] = ['operational_result', 'impact_case_study'];

export const CaseStudyLadder: React.FC<{ foundation: CaseStudyFoundation }> = ({ foundation }) => {
  const at = foundation.ladder.indexOf(foundation.maturity);
  return (
    <ol className="pj-ladder" data-testid="case-study-ladder">
      {foundation.ladder.map((rung, i) => {
        const state = i < at ? 'done' : i === at ? 'here' : NEEDS_MEASUREMENT.includes(rung) ? 'measured' : 'next';
        return (
          <li key={rung} className={`pj-rung ${state}`} data-rung={rung} data-state={state}>
            <span className="pj-rung-dot" aria-hidden="true" />
            <span className="pj-rung-name">{RUNG_LABEL[rung]}</span>
            {state === 'here' && <span className="chip sm">You are here</span>}
            {state === 'measured' && <span className="pj-rung-note">needs a measured result</span>}
          </li>
        );
      })}
    </ol>
  );
};

const CaseStudyReadinessCard: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [foundation, setFoundation] = useState<CaseStudyFoundation | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'none' | 'error'>('loading');

  useEffect(() => {
    let live = true;
    setState('loading');
    void getCaseStudyFoundation(projectId).then((res) => {
      if (!live) return;
      if (!res.ok) { setState('error'); return; }
      if (!res.foundation) { setState('none'); return; }
      setFoundation(res.foundation);
      setState('ready');
    });
    return () => { live = false; };
  }, [projectId]);

  // A project with no intake has no hypothesis to sit on the ladder, and a
  // server that cannot be reached is not a reason to show a wrong rung. Both
  // render nothing rather than a guess.
  if (state !== 'ready' || !foundation) return null;

  const f = foundation;
  return (
    <div className="te-card te-scard" data-testid="case-study-readiness">
      <h3>
        <svg viewBox="0 0 24 24" fill="none"><path d="M4 20h16M6 16V8M12 16V4M18 16v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        Case study readiness
      </h3>
      <CaseStudyLadder foundation={f} />
      <div className="small" style={{ margin: '8px 0 10px' }}>{f.maturityReason}{f.nextRungNeeds ? ` Next: ${f.nextRungNeeds}` : ''}</div>

      <div className="te-stat"><span className="lab">Facts your build showed</span><span className="num">{f.buildEvidence.facts.length}</span></div>
      <div className="te-stat"><span className="lab">Stories verified</span><span className="num">{f.buildEvidence.verifiedStories}</span></div>
      <div className="te-stat"><span className="lab">Demonstrations pointed at</span><span className="num">{f.demonstrationEvidence.length}</span></div>
      <div className="te-stat"><span className="lab">Outcomes measured in use</span><span className="num">{f.outcomeEvidence.items.length}</span></div>
      {f.openQuestions > 0 && (
        <div className="te-stat"><span className="lab">Questions a story raised</span><span className="num" style={{ color: '#B5710A' }}>{f.openQuestions}</span></div>
      )}

      <div className="small" style={{ marginTop: 10, opacity: .75 }} data-testid="case-study-not-published">
        Nothing here is published, and nothing on this page can publish it. What you said, what the build showed, and what was measured are kept apart on purpose.
      </div>
    </div>
  );
};

export default CaseStudyReadinessCard;
