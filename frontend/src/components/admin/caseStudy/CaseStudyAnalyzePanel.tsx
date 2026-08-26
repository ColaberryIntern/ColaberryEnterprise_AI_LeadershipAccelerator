import React, { useState } from 'react';
import { SectionCard } from '../shell';
import { CASE_STUDY_STUDIO_CONTROLS } from './caseStudyStudioTabs';
import type { CaseStudyRepoProof } from '../../../services/caseStudyStudioApi';

/**
 * CaseStudyAnalyzePanel — step 3: what the repository proves, and what it
 * cannot.
 *
 * THE TWO COLUMNS ARE THE DESIGN. An analyze step that lists twenty findings
 * and no limits reads as a completed investigation, and the operator's next
 * move is to write a story as though the repository had established the whole
 * thing. So "Cannot prove" is not a footnote, an accordion or a tooltip: it is
 * the same width, the same weight and the same position as "Proves", and it is
 * never empty — four limits are structural to what a git repository IS and are
 * present on every result, including failures.
 *
 * ONE REPOSITORY IS NOT ONE STORY. The form accepts any owner/repo, not only
 * ones already attached, because a story can span several repositories and can
 * be informed by one that will never be cited. Analysis is a read: it writes
 * nothing, attaches nothing, and reaching this panel does not add a source.
 */

interface Props {
  proofs: readonly CaseStudyRepoProof[];
  analyzing: boolean;
  error: string | null;
  onAnalyze: (owner: string, repo: string) => void;
}

function ProofColumns({ proof }: { proof: CaseStudyRepoProof }): React.ReactElement {
  return (
    <div className="row" data-testid={`cs-proof-${proof.owner}-${proof.repo}`}>
      <div className="col-md-6 mb-3">
        <h4 className="h6 text-success" data-testid="cs-proof-proves-heading">
          What this repository proves
        </h4>
        {proof.proves.length === 0 ? (
          <p className="small text-muted mb-0" data-testid="cs-proof-proves-empty">
            Nothing. The repository could not be read, so it establishes no fact at all.
          </p>
        ) : (
          <ul className="small mb-0">
            {proof.proves.map((line) => <li key={line}>{line}</li>)}
          </ul>
        )}
      </div>
      <div className="col-md-6 mb-3">
        <h4 className="h6 text-danger" data-testid="cs-proof-cannot-heading">
          What it cannot prove
        </h4>
        <ul className="small mb-0" data-testid="cs-proof-cannot-list">
          {proof.cannotProve.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </div>
    </div>
  );
}

export default function CaseStudyAnalyzePanel({
  proofs, analyzing, error, onAnalyze,
}: Props): React.ReactElement {
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');

  return (
    <SectionCard title="Analyze a repository" icon="git-repository-line" className="mb-4">
      <p className="small text-muted">
        Reads a repository and reports both halves of what it found. This is a read: nothing is
        attached, nothing is written, and running it twice costs nothing but time. One repository
        is not one story — analyse as many as the story spans.
      </p>

      <div className="row g-2 align-items-end mb-3">
        <div className="col-sm-4">
          <label className="form-label small fw-semibold" htmlFor="cs-analyze-owner">Owner</label>
          <input
            id="cs-analyze-owner"
            className="form-control form-control-sm"
            value={owner}
            data-testid="cs-analyze-owner"
            disabled={analyzing}
            onChange={(event) => setOwner(event.target.value)}
          />
        </div>
        <div className="col-sm-4">
          <label className="form-label small fw-semibold" htmlFor="cs-analyze-repo">Repository</label>
          <input
            id="cs-analyze-repo"
            className="form-control form-control-sm"
            value={repo}
            data-testid="cs-analyze-repo"
            disabled={analyzing}
            onChange={(event) => setRepo(event.target.value)}
          />
        </div>
        <div className="col-sm-4">
          <button
            type="button"
            className="btn btn-outline-primary btn-sm"
            data-testid={CASE_STUDY_STUDIO_CONTROLS['analyze repository']}
            disabled={analyzing || owner.trim().length === 0 || repo.trim().length === 0}
            onClick={() => onAnalyze(owner.trim(), repo.trim())}
          >
            {analyzing ? 'Reading...' : 'Analyze'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="alert alert-danger py-2" data-testid="cs-analyze-error">{error}</div>
      ) : null}

      {proofs.length === 0 && !analyzing ? (
        <p className="text-muted mb-0" data-testid="cs-analyze-idle">
          Nothing analysed in this session yet.
        </p>
      ) : null}

      {proofs.map((proof) => (
        <div className="border-top pt-3 mt-3" key={`${proof.owner}/${proof.repo}`}>
          <h3 className="h6 mb-1">
            {proof.owner}/{proof.repo}{' '}
            <span className="badge bg-secondary" data-testid="cs-proof-access">
              {proof.accessStatus}
            </span>
          </h3>
          {proof.technologies.length > 0 ? (
            <p className="small text-muted mb-2" data-testid="cs-proof-tech">
              Technologies detected: {proof.technologies.join(', ')}.
            </p>
          ) : null}
          <ProofColumns proof={proof} />
          {proof.candidateArtifacts.length > 0 ? (
            <p className="small text-muted mb-0" data-testid="cs-proof-candidates">
              Candidate artifacts noticed: {proof.candidateArtifacts.join(', ')}. Candidates only —
              nothing here is approved or attached by analysing.
            </p>
          ) : null}
        </div>
      ))}
    </SectionCard>
  );
}
