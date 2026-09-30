import React, { useState } from 'react';
import { SectionCard } from '../shell';
import { CASE_STUDY_CONTROLS } from './caseStudyDesk';
import { CASE_STUDY_REPO_ROLES } from '../../../services/caseStudyAdminTypes';
import type { CaseStudyCreateResult } from '../../../services/caseStudyAdminTypes';

/**
 * CaseStudyCreatePanel — spec §10's two ways in.
 *
 * §10.1 starts from a platform Project, so the record inherits what the system
 * already knows (repositories, delivery facts, taxonomy) and a human reviews it.
 * §10.2 starts from a pasted set of repository references for work that never
 * had a Project row. Both are candidate creation, NOT publication: neither
 * writes anything a visitor can see, and both surface their warnings rather than
 * reporting a clean success over a partial one.
 *
 * There is deliberately no Project PICKER. The admin API exposes no
 * candidate-discovery endpoint (spec §36's report-first scan is not built), and
 * a dropdown backed by a guess would be worse than a field that says exactly
 * what it needs.
 */

interface Props {
  busy: boolean;
  onCreateFromProject: (body: { projectId: string; title?: string }) => Promise<void>;
  onCreateFromRepositories: (body: { title: string; repositories: string[] }) => Promise<void>;
  /** Warnings from the last create. A create that half-worked says so. */
  result: CaseStudyCreateResult | null;
  error: string | null;
}

/** One reference per line, blank lines dropped. The backend parses each one. */
const splitRefs = (text: string): string[] =>
  text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);

export default function CaseStudyCreatePanel({
  busy, onCreateFromProject, onCreateFromRepositories, result, error,
}: Props): React.ReactElement {
  const [projectId, setProjectId] = useState('');
  const [projectTitle, setProjectTitle] = useState('');
  const [repoTitle, setRepoTitle] = useState('');
  const [repoRefs, setRepoRefs] = useState('');

  const fromProject = () => {
    if (!projectId.trim()) return;
    void onCreateFromProject({
      projectId: projectId.trim(),
      ...(projectTitle.trim() ? { title: projectTitle.trim() } : {}),
    });
  };

  const fromRepos = () => {
    const repositories = splitRefs(repoRefs);
    if (!repoTitle.trim() || repositories.length === 0) return;
    void onCreateFromRepositories({ title: repoTitle.trim(), repositories });
  };

  return (
    <SectionCard title="Create a candidate" icon="add-box-line" className="mb-4">
      {error && <div className="alert alert-danger" data-testid="cs-create-error">{error}</div>}
      {result && (
        <div className="alert alert-success" data-testid="cs-create-result">
          <div>
            Created <strong>{result.caseStudy.title}</strong> as a draft with{' '}
            {result.repositories.length} repositor{result.repositories.length === 1 ? 'y' : 'ies'}.
            Nothing is public until it is approved and published.
          </div>
          {result.warnings.length > 0 && (
            <ul className="mb-0 mt-2">
              {result.warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="row g-4">
        <div className="col-lg-6">
          <form onSubmit={(e) => { e.preventDefault(); fromProject(); }}>
            <h3 className="h6">From an existing Project</h3>
            <p className="small text-muted">
              Inherits the Project's repositories, delivery facts and taxonomy as a draft.
            </p>
            <label className="form-label" htmlFor="cs-project-id">Project id</label>
            <input
              id="cs-project-id" data-testid="cs-project-id" className="form-control"
              placeholder="00000000-0000-0000-0000-000000000000"
              value={projectId} onChange={(e) => setProjectId(e.target.value)}
            />
            <label className="form-label mt-2" htmlFor="cs-project-title">
              Title (optional, defaults to the Project's)
            </label>
            <input
              id="cs-project-title" data-testid="cs-project-title" className="form-control"
              value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)}
            />
            <button
              type="button" className="btn btn-danger btn-sm mt-3" disabled={busy}
              data-testid={CASE_STUDY_CONTROLS['create from Project']} onClick={fromProject}
            >
              Create from Project
            </button>
          </form>
        </div>

        <div className="col-lg-6">
          <form onSubmit={(e) => { e.preventDefault(); fromRepos(); }}>
            <h3 className="h6">From a repository collection</h3>
            <p className="small text-muted">
              One reference per line. A browser URL, an ssh remote or <code>owner/repo</code> all
              parse. Roles are detected on the first sync and can be overridden on the record.
              Accepted roles: {CASE_STUDY_REPO_ROLES.join(', ')}.
            </p>
            <label className="form-label" htmlFor="cs-repo-title">Candidate title</label>
            <input
              id="cs-repo-title" data-testid="cs-repo-title" className="form-control"
              value={repoTitle} onChange={(e) => setRepoTitle(e.target.value)}
            />
            <label className="form-label mt-2" htmlFor="cs-repo-refs">Repositories</label>
            <textarea
              id="cs-repo-refs" data-testid="cs-repo-refs" className="form-control" rows={3}
              value={repoRefs} onChange={(e) => setRepoRefs(e.target.value)}
            />
            <button
              type="button" className="btn btn-danger btn-sm mt-3" disabled={busy}
              data-testid={CASE_STUDY_CONTROLS['create from a repo collection']}
              onClick={fromRepos}
            >
              Create from repositories
            </button>
          </form>
        </div>
      </div>
    </SectionCard>
  );
}
