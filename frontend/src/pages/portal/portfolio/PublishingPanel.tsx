import React from 'react';
import { CareerProfile } from '../../../services/careerApi';

/**
 * PublishingPanel — the honest publishing surface.
 *
 * The public portfolio, versioned snapshots, mentor review and the talent network
 * are later gates of the build plan (§10-§13) and are NOT implemented. This panel
 * exists so the Studio tells the truth about that rather than showing a
 * publish button that silently does nothing, or implying a portfolio is already
 * discoverable when it is not.
 *
 * It also encodes plan §23's core promise, which IS already true today: what a
 * learner sees here is private and continuously changing, and nothing becomes
 * public without a human approving a specific version.
 */
const PublishingPanel: React.FC<{ profile: CareerProfile }> = ({ profile }) => {
  const r = profile.readiness;

  return (
    <div className="cp-publishing">
      <section className="cp-card" aria-labelledby="cp-status-h">
        <div className="cp-status-row">
          <span className="cp-status-badge" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
              <rect x="5" y="10" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2.4" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <h2 id="cp-status-h">Your portfolio is private</h2>
            <p className="cp-muted">{profile.publication.note}</p>
          </div>
        </div>
      </section>

      <section className="cp-card" aria-labelledby="cp-how-h">
        <h2 id="cp-how-h">How publishing will work</h2>
        <ol className="cp-steps">
          <li>
            <strong>You keep building.</strong> Your private portfolio updates itself as you
            complete work — that part is live today.
          </li>
          <li>
            <strong>You request a review</strong> once your portfolio meets the readiness bar.
          </li>
          <li>
            <strong>A mentor reviews the exact version</strong> you submitted and approves,
            asks for changes, or declines.
          </li>
          <li>
            <strong>An approved version is published as a fixed snapshot.</strong> Later work
            grows your private portfolio without silently changing what an employer already saw.
          </li>
        </ol>
        <p className="cp-note">
          Review and publishing aren’t switched on yet. Nothing you do here can make your work
          public today.
        </p>
      </section>

      {r && (
        <section className="cp-card" aria-labelledby="cp-bar-h">
          <h2 id="cp-bar-h">Where you stand against the bar</h2>
          <p className="cp-muted">
            Readiness {r.score} of 100 · {r.met_count} of {r.total_count} steps done
          </p>
          {r.blocking.length > 0 ? (
            <>
              <h3 className="cp-sub-h">Still required</h3>
              <ul className="cp-blocking">
                {r.requirements.filter((x) => r.blocking.includes(x.key)).map((x) => (
                  <li key={x.key}><strong>{x.label}</strong><span className="cp-muted"> — {x.detail}</span></li>
                ))}
              </ul>
            </>
          ) : (
            <p className="cp-ok">
              You meet every required step{r.meets_policy ? '' : ', though your overall score is still below the bar'}.
              When review opens, you’ll be able to submit.
            </p>
          )}
        </section>
      )}
    </div>
  );
};

export default PublishingPanel;
