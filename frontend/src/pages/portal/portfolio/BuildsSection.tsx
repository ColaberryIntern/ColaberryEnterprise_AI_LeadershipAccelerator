import React from 'react';
import { CareerArtifact, CareerProject, CareerGithub } from '../../../services/careerApi';

/**
 * BuildsSection — artifacts, projects and connected repositories
 * (build plan §15, §13).
 *
 * Note what is deliberately NOT rendered: no "Led", "Architected" or "Built"
 * verb on any project. Plan §16 requires those be selected from contribution
 * evidence, and no team-composition or per-member contribution data exists on
 * `main` yet (see CAREER_EVIDENCE_MAP.md). Choosing one stylistically is exactly
 * the inflation §57 forbids, so the UI states what the data supports and stops.
 *
 * Repositories are likewise presented as *connected work*, not as portfolio
 * projects — plan §13: "a repo is not automatically a portfolio project."
 */

const KIND_LABEL: Record<string, string> = {
  architecture_doc: 'Architecture doc',
  prompt_library: 'Prompt library',
  case_study: 'Case study',
  reflection: 'Reflection',
  implementation_notes: 'Implementation notes',
  presentation: 'Presentation',
};

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : null);

const BuildsSection: React.FC<{
  artifacts: CareerArtifact[];
  projects: CareerProject[];
  github: CareerGithub | null;
}> = ({ artifacts, projects, github }) => (
  <div className="cp-builds">
    <section className="cp-card" aria-labelledby="cp-artifacts-h">
      <h2 id="cp-artifacts-h">Build artifacts</h2>
      {artifacts.length === 0 ? (
        <p className="cp-empty">
          No artifacts yet. Completing a lab, build task, demo or reflection generates one
          automatically — you never have to write a portfolio entry by hand.
        </p>
      ) : (
        <>
          <p className="cp-muted">
            {artifacts.length} artifact{artifacts.length === 1 ? '' : 's'}, generated from work you
            already completed.
          </p>
          <ul className="cp-artifacts">
            {artifacts.map((a) => (
              <li key={a.id} className="cp-artifact">
                <div className="cp-artifact-head">
                  <span className="cp-kind">{KIND_LABEL[a.kind] || a.kind.replace(/_/g, ' ')}</span>
                  {fmt(a.created_at) && <span className="cp-muted cp-date">{fmt(a.created_at)}</span>}
                </div>
                <h3 className="cp-artifact-title">{a.title}</h3>
                {a.summary && <p className="cp-artifact-sum">{a.summary}</p>}
                {a.competencies.length > 0 && (
                  <ul className="cp-chips" aria-label="Competencies demonstrated">
                    {a.competencies.slice(0, 6).map((c) => <li key={c} className="cp-chip">{c}</li>)}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>

    <section className="cp-card" aria-labelledby="cp-projects-h">
      <h2 id="cp-projects-h">Projects</h2>
      {projects.length === 0 ? (
        <p className="cp-empty">No projects yet.</p>
      ) : (
        <ul className="cp-projects">
          {projects.map((p) => (
            <li key={p.id} className="cp-project">
              <h3 className="cp-project-title">{p.name}</h3>
              <p className="cp-muted cp-project-meta">
                {[p.organization_name, p.industry, p.stage].filter(Boolean).join(' · ') || 'No details recorded'}
              </p>
              {p.business_problem && <p className="cp-project-prob">{p.business_problem}</p>}
              {p.github_repo_url && (
                <a className="cp-link" href={p.github_repo_url} target="_blank" rel="noopener noreferrer">
                  View repository
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>

    <section className="cp-card" aria-labelledby="cp-repos-h">
      <h2 id="cp-repos-h">Connected repositories</h2>
      {!github || github.repos.length === 0 ? (
        <p className="cp-empty">
          No repositories connected. Connecting one adds your real code as evidence.
        </p>
      ) : (
        <>
          <p className="cp-muted">
            Connected as evidence of your work. A repository doesn’t become a portfolio project on
            its own — that needs a review of what you actually contributed.
          </p>
          <ul className="cp-repos">
            {github.repos.map((r) => (
              <li key={r.repo_url} className="cp-repo">
                <a className="cp-repo-name" href={r.repo_url} target="_blank" rel="noopener noreferrer">
                  {r.repo_owner}/{r.repo_name}
                </a>
                <span className="cp-muted">
                  {[r.language, r.file_count ? `${r.file_count} files` : null].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {github?.activity && (
        <p className="cp-muted cp-activity">
          {github.activity.commits_last_7d} commit{github.activity.commits_last_7d === 1 ? '' : 's'} in
          the last 7 days · {github.activity.open_prs} open PR{github.activity.open_prs === 1 ? '' : 's'}
        </p>
      )}
    </section>
  </div>
);

export default BuildsSection;
