import React from 'react';

/**
 * BuildEvidencePanel — what the build actually produced, from build_manifests.
 *
 * THE EMPTY STATE IS THE MAIN CASE, and it must not be a row of zeros. Production
 * holds 178 manifests, but every one belongs to the platform's own project or to a
 * withdrawn test enrollment, so ZERO are visible for any of the 30 student projects
 * on this page. Rendering "0 files, 0 APIs, 0 tests" would assert that students built
 * nothing; the truth is that nothing was recorded. Those are different claims, and
 * only one of them is true.
 *
 * The panel therefore names the cause and points at it as a pipeline gap. It lights up
 * on its own the moment manifests start being written for student projects — no code
 * change needed.
 */

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

interface Props {
  evidence: EvidenceSummary | null;
  loading?: boolean;
}

const METRICS: Array<{ key: keyof EvidenceSummary; label: string; icon: string }> = [
  { key: 'files_created', label: 'Files created', icon: 'file-add-line' },
  { key: 'files_modified', label: 'Files changed', icon: 'file-edit-line' },
  { key: 'apis_added', label: 'APIs added', icon: 'plug-line' },
  { key: 'ui_components_added', label: 'Components', icon: 'layout-grid-line' },
  { key: 'tests_added', label: 'Tests added', icon: 'test-tube-line' },
  { key: 'database_changes', label: 'DB changes', icon: 'database-2-line' },
];

function fmtWhen(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export default function BuildEvidencePanel({ evidence, loading = false }: Props) {
  if (loading) {
    return (
      <div className="text-muted small py-2" data-testid="evidence-loading">
        Loading build evidence…
      </div>
    );
  }

  // No manifests: say why, and show NO numbers at all.
  if (!evidence || !evidence.has_evidence) {
    return (
      <div className="border rounded p-3" data-testid="evidence-empty">
        <div className="fw-semibold small mb-1">No build telemetry recorded for this project yet.</div>
        <p className="text-muted small mb-0">
          Build evidence comes from manifests the Student Build Pipeline writes as tasks
          are executed — files created, APIs added, components, tests. None have been
          recorded against this project, so there is nothing to show. This is a gap in
          the telemetry pipeline rather than a statement about the work: task progress
          above is unaffected.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="evidence-summary">
      <div className="small text-muted mb-2">
        From {evidence.manifests} build manifest{evidence.manifests === 1 ? '' : 's'}
        {evidence.last_execution_at && <> · last activity {fmtWhen(evidence.last_execution_at)}</>}
      </div>
      <div className="row g-2">
        {METRICS.map((m) => (
          <div className="col-6 col-md-4 col-lg-2" key={m.key as string}>
            <div className="border rounded p-2 text-center">
              <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.1 }}>
                {evidence[m.key] as number}
              </div>
              <div className="text-muted" style={{ fontSize: 11 }}>
                <i className={`ri-${m.icon}`} aria-hidden="true" /> {m.label}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
