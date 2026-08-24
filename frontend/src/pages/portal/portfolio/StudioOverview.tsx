import React from 'react';
import { CareerProfile } from '../../../services/careerApi';

/**
 * StudioOverview — the Career Studio landing view (build plan §19): readiness,
 * what changed recently, and the evidence-grounded narrative draft.
 *
 * The readiness number is described as PORTFOLIO readiness throughout, never as
 * job or career readiness. Plan §20 forbids labelling a person job-ready from a
 * portfolio rule, and the wording here is the enforcement.
 */

const Ring: React.FC<{ score: number }> = ({ score }) => {
  const r = 42;
  const c = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(100, score)) / 100;
  return (
    <svg className="cp-ring" viewBox="0 0 100 100" width="104" height="104" role="img"
      aria-label={`Portfolio readiness ${score} out of 100`}>
      <circle cx="50" cy="50" r={r} className="cp-ring-track" />
      <circle
        cx="50" cy="50" r={r} className="cp-ring-fill"
        strokeDasharray={`${c * filled} ${c}`}
        transform="rotate(-90 50 50)"
      />
      <text x="50" y="49" className="cp-ring-num" textAnchor="middle" dominantBaseline="central">{score}</text>
      <text x="50" y="66" className="cp-ring-unit" textAnchor="middle" dominantBaseline="central">of 100</text>
    </svg>
  );
};

const StudioOverview: React.FC<{
  profile: CareerProfile;
  onJump: (t: 'capabilities' | 'builds' | 'publishing') => void;
}> = ({ profile, onJump }) => {
  const { readiness, recent_activity: recent, narrative, capabilities, artifacts, projects, github } = profile;
  const verified = capabilities.filter((c) => c.evidence_level !== 'resume').length;

  return (
    <div className="cp-overview">
      <section className="cp-card cp-readiness" aria-labelledby="cp-readiness-h">
        <div className="cp-readiness-main">
          <Ring score={readiness?.score ?? 0} />
          <div>
            <h2 id="cp-readiness-h">Portfolio readiness</h2>
            <p className="cp-muted">
              How complete your portfolio is — not a judgement of whether you’re ready for a job.
            </p>
            {readiness && (
              <p className="cp-readiness-count">
                {readiness.met_count} of {readiness.total_count} steps done
              </p>
            )}
          </div>
        </div>

        {readiness && (
          <ul className="cp-checklist">
            {readiness.requirements.map((r) => (
              <li key={r.key} className={r.met ? 'met' : 'unmet'}>
                <span className="cp-check" aria-hidden="true">
                  {r.met ? (
                    <svg viewBox="0 0 24 24" fill="none" width="14" height="14"><path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" width="14" height="14"><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2.5" /></svg>
                  )}
                </span>
                <span className="cp-check-body">
                  {/* Text, not colour alone, carries the state (WCAG 1.4.1). */}
                  <span className="cp-sr">{r.met ? 'Done: ' : 'Not yet: '}</span>
                  <strong>{r.label}</strong>
                  <span className="cp-muted"> — {r.detail}</span>
                  {r.required && !r.met && <span className="cp-req-badge">Required</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="cp-two">
        <section className="cp-card" aria-labelledby="cp-changed-h">
          <h2 id="cp-changed-h">What changed</h2>
          {recent && (recent.new_artifacts > 0 || recent.capabilities_advanced > 0) ? (
            <>
              <p className="cp-muted">In the last {recent.window_days} days</p>
              <ul className="cp-changed">
                {recent.new_artifacts > 0 && (
                  <li><span className="cp-plus">+{recent.new_artifacts}</span> build artifact{recent.new_artifacts === 1 ? '' : 's'}</li>
                )}
                {recent.capabilities_advanced > 0 && (
                  <li><span className="cp-plus">+{recent.capabilities_advanced}</span> capabilit{recent.capabilities_advanced === 1 ? 'y' : 'ies'} with new evidence</li>
                )}
              </ul>
              <ul className="cp-changed-items">
                {recent.items.slice(0, 5).map((it, i) => (
                  <li key={`${it.kind}-${i}`}>
                    <span className={`cp-dot cp-dot-${it.kind}`} aria-hidden="true" />
                    <span className="cp-sr">{it.kind === 'artifact' ? 'Artifact: ' : 'Capability: '}</span>
                    {it.label}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="cp-empty">
              Nothing new in the last {recent?.window_days ?? 7} days. Finish a lab, a build task or a
              reflection and it shows up here automatically.
            </p>
          )}
        </section>

        <section className="cp-card" aria-labelledby="cp-snapshot-h">
          <h2 id="cp-snapshot-h">Your evidence</h2>
          <ul className="cp-stats">
            <li>
              <button type="button" className="cp-stat" onClick={() => onJump('capabilities')}>
                <span className="cp-stat-n">{verified}</span>
                <span className="cp-stat-l">verified capabilities</span>
              </button>
            </li>
            <li>
              <button type="button" className="cp-stat" onClick={() => onJump('builds')}>
                <span className="cp-stat-n">{artifacts.length}</span>
                <span className="cp-stat-l">build artifacts</span>
              </button>
            </li>
            <li>
              <button type="button" className="cp-stat" onClick={() => onJump('builds')}>
                <span className="cp-stat-n">{projects.length}</span>
                <span className="cp-stat-l">projects</span>
              </button>
            </li>
            <li>
              <button type="button" className="cp-stat" onClick={() => onJump('builds')}>
                <span className="cp-stat-n">{github?.repos.length ?? 0}</span>
                <span className="cp-stat-l">repositories</span>
              </button>
            </li>
          </ul>
        </section>
      </div>

      {narrative && (
        <section className="cp-card" aria-labelledby="cp-narrative-h">
          <h2 id="cp-narrative-h">Your headline</h2>
          {narrative.headline ? (
            <p className="cp-headline">{narrative.headline}</p>
          ) : (
            <p className="cp-empty">
              You haven’t set a professional title yet. We won’t invent one for you — add it in
              Settings and it becomes your portfolio headline.
            </p>
          )}
          {narrative.suggested_about && (
            <>
              <h3 className="cp-sub-h">Draft summary</h3>
              <p className="cp-about">{narrative.suggested_about}</p>
              <p className="cp-note">
                Built only from facts already on file — your own title and the evidence counted
                above. Nothing here is generated about you.
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
};

export default StudioOverview;
