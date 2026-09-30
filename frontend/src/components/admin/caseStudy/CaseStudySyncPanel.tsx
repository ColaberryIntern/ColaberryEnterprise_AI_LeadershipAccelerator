import React from 'react';
import { SectionCard, StatusBadge } from '../shell';
import { CASE_STUDY_CONTROLS, formatDate } from './caseStudyDesk';
import { readSnapshot } from './caseStudySnapshotView';
import type { SnapshotView } from './caseStudySnapshotView';
import type {
  CaseStudySnapshotSummary, CaseStudySyncResult, CaseStudySyncRunSummary,
} from '../../../services/caseStudyAdminTypes';

/**
 * CaseStudySyncPanel — the append-only sync history, and spec §18's sync diff.
 *
 * WHY THE DIFF IS PUBLISHED-VS-DRAFT AND NOT DRAFT-VS-DRAFT. Publishing pins a
 * snapshot version; a later sync builds new drafts underneath without moving
 * what is live. So the question a reviewer actually has is "what would change
 * for a visitor if I published this", and answering it needs the version that IS
 * live, fetched by id, rather than the newest approved one — which may not be
 * the one that was pinned.
 *
 * A FAILED SYNC IS NOT HIDDEN. Every run is listed with its status, its counts
 * and its error class; a `partial` run means some repositories were read and
 * some were not, and the record it produced is thinner than it looks.
 */

interface Props {
  lastSync: CaseStudySyncResult | null;
  runs: readonly CaseStudySyncRunSummary[] | null;
  runsLoading: boolean;
  runsError: string | null;
  onLoadRuns: () => void;

  draftSnapshot: CaseStudySnapshotSummary | null;
  publishedSnapshot: CaseStudySnapshotSummary | null;
  canDiff: boolean;
  diffLoading: boolean;
  diffError: string | null;
  onDiff: () => void;
}

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  success: 'success', unchanged: 'neutral', partial: 'warning', failed: 'danger', running: 'neutral',
};

interface DiffRow { field: string; published: string; draft: string }

const proofWarnings = (view: SnapshotView): number =>
  [...view.heroMetrics, ...view.measurementMetrics]
    .filter((m) => m.verificationClass === 'pending' || !m.publishable).length;

function diffRows(published: SnapshotView, draft: SnapshotView): DiffRow[] {
  return [
    { field: 'Title', published: published.title || '—', draft: draft.title || '—' },
    { field: 'Standfirst', published: published.standfirst || '—', draft: draft.standfirst || '—' },
    { field: 'Summary', published: published.summary || '—', draft: draft.summary || '—' },
    {
      field: 'Repositories',
      published: String(published.repositories.length), draft: String(draft.repositories.length),
    },
    {
      field: 'Artifacts',
      published: String(published.artifacts.length), draft: String(draft.artifacts.length),
    },
    { field: 'Stack', published: published.stack.join(', ') || '—', draft: draft.stack.join(', ') || '—' },
    {
      field: 'Metrics',
      published: String(published.heroMetrics.length + published.measurementMetrics.length),
      draft: String(draft.heroMetrics.length + draft.measurementMetrics.length),
    },
    {
      field: 'Timeline entries',
      published: String(published.timeline.length), draft: String(draft.timeline.length),
    },
    {
      field: 'Proof warnings',
      published: String(proofWarnings(published)), draft: String(proofWarnings(draft)),
    },
  ];
}

export default function CaseStudySyncPanel({
  lastSync, runs, runsLoading, runsError, onLoadRuns,
  draftSnapshot, publishedSnapshot, canDiff, diffLoading, diffError, onDiff,
}: Props): React.ReactElement {
  const rows = publishedSnapshot
    ? diffRows(readSnapshot(publishedSnapshot.content), readSnapshot(draftSnapshot?.content ?? null))
    : [];
  const changed = rows.filter((r) => r.published !== r.draft);

  return (
    <SectionCard title="Sync history and diff" icon="history-line" className="mb-4">
      {lastSync && (
        <div className="alert alert-secondary small" data-testid="cs-last-sync">
          Last run: <StatusBadge
            label={lastSync.status} tone={STATUS_TONE[lastSync.status] ?? 'neutral'}
          />
          {' '}
          {lastSync.counts.reposSucceeded} of {lastSync.counts.reposAttempted} repositories read,
          {' '}{lastSync.counts.factsExtracted} facts, {lastSync.counts.candidateMetrics} candidate
          metrics. Snapshot {lastSync.snapshotOutcome}
          {lastSync.snapshotVersion !== null ? ` (v${lastSync.snapshotVersion})` : ''}.
          {lastSync.repoErrors.length > 0 && (
            <ul className="mb-0 mt-2">
              {lastSync.repoErrors.map((e) => (
                <li key={`${e.repositoryId ?? e.repoRef}-${e.errorClass}`}>
                  Repository {e.repositoryId ? e.repositoryId.slice(0, 8) : e.repoRef}:{' '}
                  {e.errorClass} — {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="d-flex flex-wrap gap-2 mb-3">
        <button
          type="button" className="btn btn-sm btn-outline-secondary"
          data-testid={CASE_STUDY_CONTROLS['sync history']} onClick={onLoadRuns}
          disabled={runsLoading}
        >
          {runsLoading ? 'Loading history...' : 'Load sync history'}
        </button>
        <button
          type="button" className="btn btn-sm btn-outline-secondary"
          data-testid={CASE_STUDY_CONTROLS['published-vs-draft diff']} onClick={onDiff}
          disabled={diffLoading || !canDiff}
          title={canDiff
            ? 'Fetch the version that is live and compare it with the current draft'
            : 'Nothing is published on this surface, so there is nothing to compare against'}
        >
          {diffLoading ? 'Comparing...' : 'Compare published with draft'}
        </button>
      </div>

      {runsError && <div className="alert alert-danger" data-testid="cs-sync-runs-error">{runsError}</div>}

      {runs !== null && (
        runs.length === 0 ? (
          <p className="text-muted" data-testid="cs-sync-runs-empty">
            This candidate has never been synced, so no repository has ever been read for it.
          </p>
        ) : (
          <div className="table-responsive mb-3">
            <table className="table table-sm mb-0">
              <thead>
                <tr>
                  <th>Started</th><th>Trigger</th><th>Status</th>
                  <th className="text-end">Repos</th><th className="text-end">Facts</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} data-testid={`cs-sync-run-${run.id}`}>
                    <td className="small">{formatDate(run.startedAt, true)}</td>
                    <td className="small">{run.trigger}</td>
                    <td>
                      <StatusBadge label={run.status} tone={STATUS_TONE[run.status] ?? 'neutral'} />
                    </td>
                    <td className="text-end small">
                      {run.reposSucceeded}/{run.reposAttempted}
                      {run.reposFailed > 0 && (
                        <span className="text-danger"> ({run.reposFailed} failed)</span>
                      )}
                    </td>
                    <td className="text-end small">{run.factsExtracted}</td>
                    <td className="small text-muted">
                      {run.errorClass ? `${run.errorClass}: ${run.errorSummary ?? ''}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {diffError && <div className="alert alert-danger" data-testid="cs-diff-error">{diffError}</div>}

      {publishedSnapshot && (
        <div data-testid="cs-diff-table">
          <h3 className="h6">
            Published v{publishedSnapshot.version} vs draft
            {draftSnapshot ? ` v${draftSnapshot.version}` : ' (no draft)'}
          </h3>
          <p className="small text-muted">
            {changed.length === 0
              ? 'Nothing differs. Publishing the draft would change nothing a visitor sees.'
              : `${changed.length} field${changed.length === 1 ? '' : 's'} differ.`}
          </p>
          <div className="table-responsive">
            <table className="table table-sm mb-0">
              <thead>
                <tr><th>Field</th><th>Published</th><th>Draft</th></tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.field} data-testid={`cs-diff-${row.field.replace(/\s+/g, '-').toLowerCase()}`}
                    className={row.published !== row.draft ? 'table-warning' : undefined}
                  >
                    <td className="small">{row.field}</td>
                    <td className="small">{row.published}</td>
                    <td className="small">{row.draft}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
