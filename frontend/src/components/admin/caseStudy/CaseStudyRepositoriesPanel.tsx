import React, { useState } from 'react';
import { SectionCard, StatusBadge } from '../shell';
import {
  CASE_STUDY_CONTROLS, controlIdAt, formatDate, repoIsLinkable, repoLabel,
} from './caseStudyDesk';
import { CASE_STUDY_REPO_ROLES } from '../../../services/caseStudyAdminTypes';
import type {
  CaseStudyRepoRole, CaseStudyRepositoryRecord,
} from '../../../services/caseStudyAdminTypes';

/**
 * CaseStudyRepositoriesPanel — spec §10.2's repository collection, plus the sync
 * that reads it.
 *
 * A PRIVATE REPOSITORY IS NEVER NAMED HERE. It is listed, its role can be
 * changed and it can be detached, but it is addressed by the opaque row handle
 * rather than by owner/name (see `repoLabel`). The admin still has everything
 * they need — which row, what role, whether it could be read — without this
 * screen holding an identity it has no reason to hold.
 *
 * SYNC IS IDEMPOTENT AND SAFE TO REPEAT. Running it twice against unchanged
 * repositories produces `unchanged` and no new snapshot, so the retry strategy
 * for a failed sync is simply pressing the button again.
 */

const ACCESS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  connected: 'success',
  read_only: 'success',
  rate_limited: 'warning',
  unknown: 'warning',
  unavailable: 'danger',
  deleted: 'danger',
};

interface Props {
  repositories: readonly CaseStudyRepositoryRecord[];
  busy: boolean;
  syncing: boolean;
  onAttach: (body: { reference: string; role?: CaseStudyRepoRole }) => void;
  onSetRole: (repositoryId: string, role: CaseStudyRepoRole) => void;
  onRemove: (repositoryId: string, label: string) => void;
  onSync: () => void;
}

export default function CaseStudyRepositoriesPanel({
  repositories, busy, syncing, onAttach, onSetRole, onRemove, onSync,
}: Props): React.ReactElement {
  const [reference, setReference] = useState('');
  const [role, setRole] = useState<CaseStudyRepoRole>('primary');

  const attach = () => {
    if (!reference.trim()) return;
    onAttach({ reference: reference.trim(), role });
  };

  return (
    <SectionCard
      title="Repositories" icon="git-repository-line" className="mb-4"
      actions={
        <button
          type="button" className="btn btn-sm btn-outline-danger"
          data-testid={CASE_STUDY_CONTROLS.sync} onClick={onSync} disabled={syncing}
        >
          {syncing ? 'Syncing...' : 'Sync repositories'}
        </button>
      }
    >
      {repositories.length === 0 ? (
        <p className="text-muted" data-testid="cs-repositories-empty">
          No repositories are attached, so a sync has nothing to read and no snapshot can be
          built. Attach at least one below.
        </p>
      ) : (
        <div className="table-responsive mb-3">
          <table className="table table-sm align-middle mb-0">
            <thead>
              <tr>
                <th>Repository</th>
                <th>Role</th>
                <th>Visibility</th>
                <th>Access</th>
                <th>Last synced</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {repositories.map((repo, index) => (
                <tr key={repo.id} data-testid={`cs-repository-${repo.id}`}>
                  <td>
                    {repoIsLinkable(repo) ? (
                      <a href={repo.repoUrl} target="_blank" rel="noopener noreferrer">
                        {repoLabel(repo)}
                      </a>
                    ) : (
                      <span>{repoLabel(repo)}</span>
                    )}
                    {repo.visibility !== 'public' && (
                      <div className="small text-muted">
                        Not named on this screen, and never linked publicly.
                      </div>
                    )}
                  </td>
                  <td>
                    <select
                      className="form-select form-select-sm"
                      data-testid={controlIdAt('assign repo roles', index)}
                      aria-label={`Role for ${repoLabel(repo)}`}
                      value={repo.role} disabled={busy}
                      onChange={(e) => onSetRole(repo.id, e.target.value as CaseStudyRepoRole)}
                    >
                      {CASE_STUDY_REPO_ROLES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </td>
                  <td className="small">{repo.visibility}</td>
                  <td>
                    <StatusBadge
                      label={repo.accessStatus}
                      tone={ACCESS_TONE[repo.accessStatus] ?? 'neutral'}
                    />
                  </td>
                  <td className="small text-muted">{formatDate(repo.lastSyncedAt, true)}</td>
                  <td className="text-end">
                    <button
                      type="button" className="btn btn-sm btn-outline-secondary"
                      data-testid={controlIdAt('remove repos', index)} disabled={busy}
                      onClick={() => onRemove(repo.id, repoLabel(repo))}
                    >
                      Detach
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); attach(); }} className="row g-2 align-items-end">
        <div className="col-md-6">
          <label className="form-label" htmlFor="cs-repo-reference">Attach a repository</label>
          <input
            id="cs-repo-reference" data-testid="cs-repo-reference" className="form-control"
            placeholder="owner/repo, a browser URL, or an ssh remote"
            value={reference} onChange={(e) => setReference(e.target.value)}
          />
        </div>
        <div className="col-md-3">
          <label className="form-label" htmlFor="cs-attach-role">Role</label>
          <select
            id="cs-attach-role" data-testid="cs-attach-role" className="form-select"
            value={role} onChange={(e) => setRole(e.target.value as CaseStudyRepoRole)}
          >
            {CASE_STUDY_REPO_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="col-md-3">
          <button
            type="button" className="btn btn-sm btn-danger" disabled={busy}
            data-testid={CASE_STUDY_CONTROLS['attach repos']} onClick={attach}
          >
            Attach repository
          </button>
        </div>
      </form>
    </SectionCard>
  );
}
