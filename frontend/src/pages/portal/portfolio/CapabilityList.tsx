import React, { useState } from 'react';
import { CareerCapability, CareerEvidenceLevel, EVIDENCE_LEVEL_LABEL, isVerifiedLevel } from '../../../services/careerApi';

/**
 * CapabilityList — verified capabilities with clickable provenance
 * (build plan §10, §11).
 *
 * Two rules from the plan are load-bearing here:
 *
 * - **No raw gamification.** Plan §24: "Do not expose raw XP." What renders is a
 *   capability, its evidence level, and how much evidence backs it — never a
 *   points total or a band score dressed up as seniority.
 *
 * - **Evidence, not seniority.** Plan §10: "A repo containing React proves React
 *   evidence, not automatically 'Senior React Engineer'." Nothing in this
 *   component upgrades a capability's wording based on score.
 */

const LEVEL_ORDER: Record<CareerEvidenceLevel, number> = {
  delivery_verified: 0,
  colaberry_verified: 1,
  resume: 2,
  none: 3,
};

const SOURCE_LABEL: Record<string, string> = {
  timeline: 'Classroom activity',
  classroom: 'Classroom submission',
  diagnostic: 'Diagnostic',
  resume: 'Resume',
};

const CapabilityRow: React.FC<{ cap: CareerCapability }> = ({ cap }) => {
  const [open, setOpen] = useState(false);
  const panelId = `cp-ev-${cap.skill_id}`;
  const sources = Object.entries(cap.source_breakdown).sort((a, b) => b[1] - a[1]);
  const pct = Math.max(0, Math.min(100, Math.round(cap.proficiency)));

  return (
    <li className="cp-cap">
      <button
        type="button"
        className="cp-cap-head"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="cp-cap-title">
          <span className="cp-cap-name">{cap.name}</span>
          {/* A capability with nothing behind it gets no provenance badge at all.
              Labelling it "Resume evidence" next to "0 pieces of evidence" was a
              real defect caught by looking at the rendered page — it asserted a
              source the learner never supplied. */}
          {cap.evidence_level !== 'none' && (
            <span className={`cp-level cp-level-${cap.evidence_level}`}>
              {EVIDENCE_LEVEL_LABEL[cap.evidence_level]}
            </span>
          )}
        </span>
        <span className="cp-cap-meta">
          <span className="cp-muted">
            {cap.evidence_count} piece{cap.evidence_count === 1 ? '' : 's'} of evidence
          </span>
          <svg className={`cp-chev${open ? ' open' : ''}`} viewBox="0 0 24 24" fill="none" width="16" height="16" aria-hidden="true">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      <div className="cp-cap-bar" role="img" aria-label={`Proficiency ${pct} out of 100`}>
        <span className={`cp-cap-fill cp-fill-${cap.evidence_level}`} style={{ width: `${pct}%` }} />
      </div>

      {open && (
        <div id={panelId} className="cp-cap-body">
          {cap.evidence_count === 0 ? (
            <p className="cp-empty">
              No evidence recorded yet for this capability. It appears here as soon as you complete
              work that demonstrates it.
            </p>
          ) : (
            <>
              <h4 className="cp-sub-h">Where this evidence came from</h4>
              <ul className="cp-sources">
                {sources.map(([src, n]) => (
                  <li key={src}>
                    <span className="cp-source-n">{n}</span>
                    {SOURCE_LABEL[src] || src}
                  </li>
                ))}
              </ul>
              {cap.last_demonstrated_at && (
                <p className="cp-muted cp-last">
                  Last demonstrated {new Date(cap.last_demonstrated_at).toLocaleDateString()}
                </p>
              )}
              {cap.evidence_level === 'resume' && (
                <p className="cp-note">
                  This comes from your resume, so it’s recorded as your own experience — Colaberry
                  hasn’t verified it. Completing work that uses this skill moves it to Colaberry
                  Verified.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
};

const CapabilityList: React.FC<{ capabilities: CareerCapability[] }> = ({ capabilities }) => {
  if (!capabilities.length) {
    return (
      <div className="cp-card">
        <h2>Capabilities</h2>
        <p className="cp-empty">
          No capabilities tracked yet. They appear as you complete class work, labs and builds —
          each one carrying the evidence that earned it.
        </p>
      </div>
    );
  }

  const sorted = capabilities.slice().sort(
    (a, b) => LEVEL_ORDER[a.evidence_level] - LEVEL_ORDER[b.evidence_level] || b.proficiency - a.proficiency,
  );
  const verified = sorted.filter((c) => isVerifiedLevel(c.evidence_level));

  return (
    <div className="cp-card">
      <h2>Capabilities</h2>
      <p className="cp-muted cp-cap-lede">
        {verified.length} of {capabilities.length} verified by Colaberry. Open any capability to see
        exactly what evidence stands behind it.
        {verified.length === 0 && capabilities.every((c) => c.evidence_level === 'none') && (
          <> Nothing is evidenced yet — these are the capabilities we track, not claims about you.</>
        )}
      </p>
      <ul className="cp-caps">
        {sorted.map((c) => <CapabilityRow key={c.skill_id} cap={c} />)}
      </ul>
    </div>
  );
};

export default CapabilityList;
