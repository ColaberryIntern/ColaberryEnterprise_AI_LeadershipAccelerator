import React from 'react';
import { RecordForReview } from '../../services/careerApi';

/**
 * ReviewRecordPreview — the Capstone Record as the reviewer sees it, inside admin.
 *
 * Renders the STORED snapshot, so a reviewer approves the thing that will actually go
 * live rather than a fresh render that may already have moved on.
 *
 * Follows the Capstone author's own display rules rather than inventing new ones:
 *
 *  - **Absent bands render as absent**, never as empty or zero. A page of blank sections
 *    reads as abandonment, and a reviewer would be judging the renderer rather than the
 *    learner's work.
 *  - **Nothing is invented.** Every value here is present in the snapshot or omitted.
 *  - **Artifact links are pinned to a commit SHA**; an artifact without one shows the
 *    filename as plain text rather than guessing a branch URL that would rot.
 */

const has = (v: unknown) => v !== null && v !== undefined && v !== '';

const Band: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="rp-band">
    <h4 className="rp-band-h">{title}</h4>
    {children}
  </section>
);

const ReviewRecordPreview: React.FC<{ record: RecordForReview }> = ({ record }) => {
  const c: any = record.content;
  if (!c) return <p className="cr-muted">This record has no compiled content yet.</p>;

  const identity = c.identity || {};
  const system = c.system || {};
  const artifacts: any[] = Array.isArray(c.artifacts) ? c.artifacts : [];
  const competencies: any[] = Array.isArray(c.competencies) ? c.competencies : [];
  const posts: any[] = Array.isArray(c.posts) ? c.posts : [];
  const bookend = c.bookend || {};

  return (
    <div className="rp">
      <div className="rp-head">
        <div>
          <div className="rp-name">{identity.full_name || 'Unnamed'}</div>
          {has(identity.headline) && <div className="rp-headline">{identity.headline}</div>}
          {has(identity.cohort_name) && <div className="rp-meta">{identity.cohort_name}</div>}
        </div>
        <div className="rp-links">
          {has(identity.repo_url) && <a href={identity.repo_url} target="_blank" rel="noopener noreferrer">Repository</a>}
          {has(identity.demo_url) && <a href={identity.demo_url} target="_blank" rel="noopener noreferrer">Demo</a>}
          {has(identity.certification) && <span className="rp-cert">{identity.certification}</span>}
        </div>
      </div>

      {has(bookend.opening) && <p className="rp-bookend">{bookend.opening}</p>}

      {(has(system.project_name) || has(system.descriptor)) && (
        <Band title="The system they built">
          {has(system.project_name) && <div className="rp-project">{system.project_name}</div>}
          {has(system.descriptor) && <p className="rp-body">{system.descriptor}</p>}
          {/* hours_reclaimed is a real measured claim or it is absent. Never rendered as 0. */}
          {typeof system.hours_reclaimed === 'number' && system.hours_reclaimed > 0 && (
            <p className="rp-metric">{system.hours_reclaimed} hours reclaimed</p>
          )}
          {has(system.architecture_mermaid) && (
            <details className="rp-details">
              <summary>Architecture diagram source</summary>
              <pre className="rp-pre">{system.architecture_mermaid}</pre>
            </details>
          )}
        </Band>
      )}

      {competencies.length > 0 && (
        <Band title={`What they can prove (${competencies.length})`}>
          <ul className="rp-comps">
            {competencies.map((k, i) => (
              <li key={`${k.domain}-${i}`}>
                <span className="rp-comp-label">{k.label || k.domain}</span>
                {typeof k.evidence_count === 'number' && k.evidence_count > 0 && (
                  <span className="rp-muted"> · {k.evidence_count} piece{k.evidence_count === 1 ? '' : 's'} of evidence</span>
                )}
              </li>
            ))}
          </ul>
        </Band>
      )}

      {artifacts.length > 0 && (
        <Band title={`Artifacts (${artifacts.length})`}>
          <ul className="rp-arts">
            {artifacts.map((a, i) => (
              <li key={`${a.filename}-${i}`}>
                <div className="rp-art-top">
                  <span className="rp-week">Week {a.week}</span>
                  <span className="rp-art-title">{a.title || a.filename}</span>
                  {a.is_sample && <span className="rp-sample">sample</span>}
                </div>
                <div className="rp-muted rp-art-meta">
                  {/* A link is pinned to a commit SHA or it is not a link. A branch URL
                      rots into a 404 and a portfolio with dead links is worse than none. */}
                  {has(a.commit_sha) && has(a.path)
                    ? <span className="rp-mono">{a.path} @ {String(a.commit_sha).slice(0, 7)}</span>
                    : <span className="rp-mono">{a.filename}</span>}
                  {has(a.built_on) && <> · built {a.built_on}</>}
                  {has(a.verification) && <> · {a.verification}</>}
                </div>
              </li>
            ))}
          </ul>
        </Band>
      )}

      {posts.length > 0 && (
        <Band title={`In their own words (${posts.length})`}>
          <ul className="rp-posts">
            {posts.map((p, i) => (
              <li key={`${p.week}-${i}`}>
                <div className="rp-post-top">
                  <span className="rp-week">Week {p.week}</span>
                  {has(p.ritual) && <span className="rp-ritual">{p.ritual}</span>}
                  {p.shared === false && <span className="rp-unshared">not shared</span>}
                </div>
                {has(p.headline) && <div className="rp-post-h">{p.headline}</div>}
                {has(p.body) && <p className="rp-body">{p.body}</p>}
              </li>
            ))}
          </ul>
        </Band>
      )}

      {has(bookend.closing) && <p className="rp-bookend">{bookend.closing}</p>}

      {/* An entirely empty record is itself a reviewable fact, so say so rather than
          rendering nothing and leaving the reviewer wondering if the page broke. */}
      {!artifacts.length && !competencies.length && !posts.length
        && !has(system.project_name) && !has(system.descriptor) && (
        <p className="cr-muted">
          This record compiled with no artifacts, competencies or posts. There is nothing here
          for a reader to judge yet.
        </p>
      )}
    </div>
  );
};

export default ReviewRecordPreview;
