import React from 'react';
import { Link } from 'react-router-dom';

/**
 * BaselineBanner — shown inside the Career Studio when a learner has no resume
 * on file.
 *
 * Replaces the blocking `ResumePrerequisite` screen (product decision
 * 2026-08-24). The hard gate was hiding real, earned evidence: production had
 * 6,503 skill-evidence rows and 332 artifacts against only 26 resumes, so the
 * learner with the most evidence in the platform saw a locked door instead of
 * their own work. That inverts the product's founding principle — "make their
 * work become the portfolio" — so the resume became a prompt, not a wall.
 *
 * Also states the thing students do not know: **a LinkedIn PDF export IS a
 * resume here.** The uploader accepts `application/pdf` and the parser treats it
 * identically, so "I don't have a resume ready" is not a reason to be stuck.
 */
const BaselineBanner: React.FC = () => (
  <section className="cp-baseline" aria-labelledby="cp-baseline-h">
    <div className="cp-baseline-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" width="24" height="24">
        <path d="M6 3h8l4 4v14H6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M14 3v4h4M9 12h6M9 16h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
    <div className="cp-baseline-body">
      <h2 id="cp-baseline-h">Add your professional baseline</h2>
      <p>
        Everything below is what you have earned here. Adding your existing experience puts it
        alongside that, so your Colaberry work adds to your career instead of starting it over.
      </p>
      <p className="cp-baseline-tip">
        <strong>No resume handy? Use LinkedIn.</strong> Your LinkedIn profile exported as a PDF
        works exactly the same way — open your profile, choose <strong>More → Save to PDF</strong>,
        and upload that file. We read it the same as a resume.
      </p>
      <Link className="cp-btn cp-btn-primary" to="/portal/settings?tab=profile">
        Add resume or LinkedIn PDF →
      </Link>
    </div>
  </section>
);

export default BaselineBanner;
