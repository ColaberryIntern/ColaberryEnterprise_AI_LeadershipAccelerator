import React from 'react';

/**
 * BuildEvidencePanel — proof of what a student has actually built.
 *
 * REPOINTED 2026-09-09. This first read `build_manifests`, emitted by a student's
 * own Claude Code to the portal telemetry endpoint. That endpoint is real and
 * student-facing, but nothing in the Student Build Pipeline ever tells a student to
 * emit — so all 178 manifests in production belong to the platform's own project or
 * a withdrawn test account, and ZERO to the 30 live student projects. The panel was
 * therefore permanently empty for everyone it was built for.
 *
 * The platform was already collecting better evidence server-side: a job
 * (`build_pipeline:repo_verification`) reads each student's repo and checks their
 * acceptance criteria against real commits, writing the result to
 * `student_tasks.verification_json` — 309 tasks carry one, 174 with a commit SHA.
 *
 * A matched commit is proof rather than self-report, and `outstanding` names the
 * exact criteria blocking a task. Closing the gap needed no student-side token and
 * no change to the auth posture — only reading what was already there.
 */

export interface VerificationSummary {
  has_verification: boolean;
  tasks_with_verification: number;
  verified_tasks: number;
  in_progress_tasks: number;
  commits: number;
  latest_commit_sha: string | null;
  latest_commit_at: string | null;
  last_checked_at: string | null;
  criteria_passed: number;
  criteria_total: number;
  outstanding: string[];
  outstanding_count: number;
}

export interface EvidenceSummary {
  has_evidence: boolean;
  manifests: number;
  files_created: number;
  files_modified: number;
  apis_added: number;
  ui_components_added: number;
  tests_added: number;
  database_changes: number;
  last_execution_at: string | null;
}

export interface ProjectEvidence {
  source: 'repo_verification' | 'build_manifests' | 'none';
  verification: VerificationSummary;
  manifests: EvidenceSummary;
}

interface Props {
  evidence: ProjectEvidence | null;
  loading?: boolean;
  /** Used to turn a commit SHA into a link when the project has a known repo. */
  repoUrl?: string | null;
}

function fmtWhen(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: string }) {
  return (
    <div className="col-6 col-md-4 col-lg-3">
      <div className="border rounded p-2 text-center">
        <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.1, color: tone }}>{n}</div>
        <div className="text-muted" style={{ fontSize: 11 }}>{label}</div>
      </div>
    </div>
  );
}

export default function BuildEvidencePanel({ evidence, loading = false, repoUrl }: Props) {
  if (loading) {
    return <div className="text-muted small py-2" data-testid="evidence-loading">Loading build evidence…</div>;
  }

  // Nothing from either source: say why, and show NO numbers. A row of zeros would
  // assert "built nothing"; the truth is "nothing recorded".
  if (!evidence || evidence.source === 'none') {
    return (
      <div className="border rounded p-3" data-testid="evidence-empty">
        <div className="fw-semibold small mb-1">No build evidence recorded for this project yet.</div>
        <p className="text-muted small mb-0">
          Evidence comes from the repo-verification job, which reads the student&apos;s
          repository and checks each task&apos;s acceptance criteria against real commits.
          Nothing has been recorded against this project — usually because no repo is
          connected yet. Task progress above is unaffected.
        </p>
      </div>
    );
  }

  if (evidence.source === 'build_manifests') {
    const m = evidence.manifests;
    return (
      <div data-testid="evidence-manifests">
        <div className="small text-muted mb-2">
          From {m.manifests} build manifest{m.manifests === 1 ? '' : 's'}
          {m.last_execution_at && <> · last activity {fmtWhen(m.last_execution_at)}</>}
        </div>
        <div className="row g-2">
          <Stat n={m.files_created} label="Files created" />
          <Stat n={m.files_modified} label="Files changed" />
          <Stat n={m.apis_added} label="APIs added" />
          <Stat n={m.ui_components_added} label="Components" />
          <Stat n={m.tests_added} label="Tests added" />
          <Stat n={m.database_changes} label="DB changes" />
        </div>
      </div>
    );
  }

  const v = evidence.verification;
  const criteriaPct = v.criteria_total > 0
    ? Math.round((v.criteria_passed / v.criteria_total) * 100)
    : null;
  const sha = v.latest_commit_sha;
  const shortSha = sha ? sha.slice(0, 7) : null;
  const commitHref = sha && repoUrl
    ? `${repoUrl.replace(/\.git$/, '').replace(/\/$/, '')}/commit/${sha}`
    : null;

  return (
    <div data-testid="evidence-verification">
      <div className="small text-muted mb-2">
        Verified against the student&apos;s repository
        {v.last_checked_at && <> · last checked {fmtWhen(v.last_checked_at)}</>}
      </div>

      <div className="row g-2 mb-2">
        <Stat n={v.verified_tasks} label="Tasks verified" tone="var(--bs-success)" />
        <Stat n={v.in_progress_tasks} label="In progress" />
        <Stat n={v.commits} label="Commits matched" />
        <Stat n={v.criteria_passed} label={`of ${v.criteria_total} criteria`} />
      </div>

      {criteriaPct != null && (
        <div className="mb-2">
          <div className="progress" style={{ height: 6 }} role="progressbar"
            aria-valuenow={criteriaPct} aria-valuemin={0} aria-valuemax={100}
            aria-label="Acceptance criteria passed">
            <div className="progress-bar bg-success" style={{ width: `${criteriaPct}%` }} />
          </div>
          <div className="text-muted mt-1" style={{ fontSize: 11 }}>
            {criteriaPct}% of acceptance criteria passing
          </div>
        </div>
      )}

      {shortSha && (
        <div className="small mb-2">
          Latest matched commit:{' '}
          {commitHref
            ? <a href={commitHref} target="_blank" rel="noopener noreferrer"><code>{shortSha}</code></a>
            : <code>{shortSha}</code>}
          {v.latest_commit_at && <span className="text-muted"> · {fmtWhen(v.latest_commit_at)}</span>}
        </div>
      )}

      {/* What is actually blocking the build — the most useful thing on the panel. */}
      {v.outstanding_count > 0 && (
        <details>
          <summary className="small fw-medium" style={{ cursor: 'pointer' }}>
            {v.outstanding_count} outstanding criteri{v.outstanding_count === 1 ? 'on' : 'a'}
          </summary>
          <ul className="small text-muted mt-2 mb-0 ps-3">
            {v.outstanding.slice(0, 12).map((o) => <li key={o}>{o}</li>)}
          </ul>
          {v.outstanding_count > 12 && (
            <div className="text-muted mt-1" style={{ fontSize: 11 }}>
              …and {v.outstanding_count - 12} more.
            </div>
          )}
        </details>
      )}
    </div>
  );
}
