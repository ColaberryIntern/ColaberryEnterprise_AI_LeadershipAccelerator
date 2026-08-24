import React from 'react';
import { Link } from 'react-router-dom';

/**
 * ResumePrerequisite — the "paid, but no resume yet" gate (build plan §6.2).
 *
 * Deliberately does NOT ship its own uploader. Enterprise already owns resume
 * upload at /portal/settings (POST /api/portal/settings/resume), and plan §2.1 is
 * explicit: "Do not build a second resume upload system." So this screen states
 * why the resume matters and hands off to the one uploader that exists.
 */
const ResumePrerequisite: React.FC<{ firstName: string | null }> = ({ firstName }) => {
  const first = firstName?.trim().split(/\s+/)[0] || null;

  return (
    <>
      <div className="te-page-h">
        <div className="crumb">Your career</div>
        <h1>Your portfolio starts with who you are today</h1>
      </div>

      <div className="cp-prereq">
        <div className="cp-prereq-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" width="34" height="34">
            <path d="M6 3h8l4 4v14H6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <path d="M14 3v4h4M9 12h6M9 16h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>

        <h2>{first ? `${first}, upload your current resume` : 'Upload your current resume'}</h2>
        <p className="cp-prereq-lede">
          We use it as your professional baseline. Everything you go on to build and prove here
          grows the portfolio from there, so your Colaberry work adds to your career rather than
          starting it over.
        </p>

        <ul className="cp-prereq-list">
          <li>
            <strong>Your existing experience is kept as your own.</strong> It stays labelled as
            resume evidence, separate from what Colaberry has verified.
          </li>
          <li>
            <strong>Nothing is invented.</strong> We never add employers, dates, titles or skills
            that aren’t already in your resume.
          </li>
          <li>
            <strong>It stays private.</strong> Uploading a resume publishes nothing.
          </li>
        </ul>

        <Link className="cp-btn cp-btn-primary" to="/portal/settings?tab=profile">
          Upload your resume →
        </Link>
        <p className="cp-prereq-foot">
          Already uploaded one? <button type="button" className="cp-link" onClick={() => window.location.reload()}>Refresh this page</button>
        </p>
      </div>
    </>
  );
};

export default ResumePrerequisite;
