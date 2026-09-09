import React, { useState } from 'react';

/**
 * ArtifactsPanel — the documents a project has produced, with version history.
 *
 * NO DOWNLOAD LINKS, deliberately. Every artifact observed in production has
 * `file_name` null and its content in `content_json`, so a file link would 404. There
 * is also no admin submission deep-link surface to send the operator to: the only
 * submissions modal is enrollment-keyed, lives on a different page, and never renders
 * `content_json`. Offering a dead link is worse than offering none, so this shows what
 * exists and where it sits, and says plainly when content is not retrievable here.
 *
 * Versions are grouped server-side: production holds four rows that are all versions
 * of one specification, and listing them raw would look like four artifacts.
 */

export interface ArtifactVersion {
  version: number | null;
  submission_id: string | null;
  title: string | null;
  file_name: string | null;
  has_content: boolean;
  submitted_at: string | null;
  stage: string | null;
}

export interface ArtifactGroup {
  name: string;
  latest_version: number | null;
  versions: ArtifactVersion[];
}

interface Props {
  artifacts: ArtifactGroup[] | null;
  loading?: boolean;
}

function fmtWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export default function ArtifactsPanel({ artifacts, loading = false }: Props) {
  const [open, setOpen] = useState<string | null>(null);

  if (loading) {
    return <div className="text-muted small py-2" data-testid="artifacts-loading">Loading artifacts…</div>;
  }

  if (!artifacts || artifacts.length === 0) {
    return (
      <div className="border rounded p-3" data-testid="artifacts-empty">
        <div className="fw-semibold small mb-1">No artifacts submitted for this project yet.</div>
        <p className="text-muted small mb-0">
          Artifacts are the documents a build produces — requirements specifications,
          roadmaps, governance briefs. None have been recorded against this project.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="artifacts-list">
      {artifacts.map((a) => {
        const expanded = open === a.name;
        const latest = a.versions[0];
        return (
          <div key={a.name} className="border rounded mb-2">
            <button
              className="btn w-100 text-start d-flex justify-content-between align-items-center p-2"
              onClick={() => setOpen(expanded ? null : a.name)}
              aria-expanded={expanded}
            >
              <span className="d-flex align-items-center gap-2">
                <i className={`ri-arrow-${expanded ? 'down' : 'right'}-s-line`} aria-hidden="true" />
                <span className="fw-medium">{a.name}</span>
                {latest?.stage && <span className="badge bg-light text-dark">{latest.stage}</span>}
              </span>
              <span className="small text-muted">
                v{a.latest_version ?? '—'} · {a.versions.length} version{a.versions.length === 1 ? '' : 's'}
              </span>
            </button>

            {expanded && (
              <div className="border-top p-2">
                <ul className="list-unstyled mb-0">
                  {a.versions.map((v) => (
                    <li key={`${a.name}-${v.version}-${v.submission_id}`}
                      className="d-flex justify-content-between small py-1 border-bottom">
                      <span>
                        <span className="fw-medium">v{v.version ?? '—'}</span>
                        {v.title && <span className="text-muted"> · {v.title}</span>}
                      </span>
                      <span className="text-muted">
                        {fmtWhen(v.submitted_at)}
                        {v.has_content
                          ? <span className="ms-2 text-success" title="Content stored with the submission">content stored</span>
                          : <span className="ms-2" title="No retrievable content for this version">no content</span>}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="text-muted mt-2" style={{ fontSize: 11 }}>
                  Artifacts are stored as submission content rather than downloadable
                  files, so there is no file to open from here.
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
