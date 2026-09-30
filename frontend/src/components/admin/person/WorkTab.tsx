import React from 'react';
import { WorkPanel } from '../../../adminOs/personTypes';
import { EmptyPanel, Stat, fmtDate } from './primitives';

/**
 * What this person built: projects, case studies, capstones, portfolio, cert prep.
 *
 * The evidence a learner produces is the thing the programme exists to create,
 * and none of it reached the admin surface before 2026-09-09. A reader could
 * see 217 completed cards and not that those cards produced two named systems
 * for a real client organisation.
 */
export default function WorkTab({ work }: { work: WorkPanel | null | undefined }) {
  if (!work) {
    return <EmptyPanel>No enrolment, so there is no project or portfolio work to show.</EmptyPanel>;
  }

  const { projects, caseStudies, capstones, portfolio, certPrep, clientOrganisations } = work;
  const nothing = projects.length === 0 && caseStudies.length === 0
    && capstones.length === 0 && portfolio.length === 0;

  return (
    <>
      <div className="row g-3 mb-4">
        <Stat label="Projects" value={projects.length} />
        <Stat label="Case studies" value={caseStudies.length} />
        <Stat label="Capstones" value={capstones.length} />
        <Stat label="Portfolio items" value={portfolio.length} />
      </div>

      {clientOrganisations.length > 0 && (
        <div className="alert alert-light border d-flex align-items-center gap-2 mb-4">
          <i className="ri-building-line" />
          <span>
            Building for{' '}
            <strong>{clientOrganisations.join(', ')}</strong>
            <span className="text-muted"> — the organisation named on their project work.</span>
          </span>
        </div>
      )}

      {nothing && <EmptyPanel>Nothing built yet.</EmptyPanel>}

      {projects.length > 0 && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold">Projects</div>
          <div className="card-body">
            {projects.map((p) => (
              <div key={p.id} className="border rounded p-3 mb-3">
                <div className="d-flex justify-content-between align-items-start gap-3 mb-2">
                  <div>
                    <div className="fw-semibold">{p.name ?? 'Untitled project'}</div>
                    <div className="text-muted small">
                      {p.organizationName ?? 'No organisation'}
                      {p.industry && ` · ${p.industry}`}
                      {p.stage && ` · ${p.stage.replace(/_/g, ' ')}`}
                    </div>
                  </div>
                  {p.archivedAt && <span className="badge bg-secondary-subtle text-secondary-emphasis">Archived</span>}
                </div>

                {p.businessProblem && (
                  <p className="small text-muted mb-2">{p.businessProblem}</p>
                )}

                <div className="d-flex flex-wrap gap-3 small mb-2">
                  <Score label="Health" value={p.healthScore} />
                  <Score label="Velocity" value={p.velocityScore} />
                  <Score label="Stability" value={p.stabilityScore} />
                  <Score label="Maturity" value={p.maturityScore} />
                  <Score label="Requirements" value={p.requirementsCompletionPct} suffix="%" />
                </div>

                <div className="d-flex flex-wrap gap-3 small align-items-center">
                  <span className="text-muted">
                    Tasks: <strong>{p.doneTasks}</strong> done, <strong>{p.openTasks}</strong> open
                  </span>
                  {p.githubRepoUrl && (
                    <a href={p.githubRepoUrl} target="_blank" rel="noreferrer">
                      <i className="ri-github-line me-1" />Repository
                    </a>
                  )}
                  {p.portfolioUrl && (
                    <a href={p.portfolioUrl} target="_blank" rel="noreferrer">
                      <i className="ri-external-link-line me-1" />Portfolio
                    </a>
                  )}
                  <span className="text-muted">Created {fmtDate(p.createdAt) ?? '—'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {caseStudies.length > 0 && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold">Case studies</div>
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th>Title</th><th>Organisation</th><th>Capability</th>
                  <th>Status</th><th className="text-end">Published</th>
                </tr>
              </thead>
              <tbody>
                {caseStudies.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="fw-medium">{c.title ?? c.slug ?? 'Untitled'}</div>
                      {c.projectName && <div className="text-muted small">from {c.projectName}</div>}
                    </td>
                    <td>
                      {c.organizationDisplayName ?? <span className="text-muted">—</span>}
                      {c.organizationIsAnonymised && (
                        <span className="badge bg-secondary-subtle text-secondary-emphasis ms-2">anonymised</span>
                      )}
                    </td>
                    <td className="small text-muted">{c.primaryCapability ?? '—'}</td>
                    <td>
                      <span className={`badge bg-${c.status === 'published' ? 'success' : 'secondary'}-subtle text-${c.status === 'published' ? 'success' : 'secondary'}-emphasis`}>
                        {c.status ?? 'unknown'}
                      </span>
                    </td>
                    <td className="text-end small text-muted">
                      {c.publishedCount > 0 ? `${c.publishedCount}×` : 'never'}
                      {c.snapshotCount > 0 && ` · ${c.snapshotCount} snapshots`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {capstones.length > 0 && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold">Capstones</div>
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr><th>Capstone</th><th>Project</th><th>Status</th><th>Visibility</th><th>Published</th></tr>
              </thead>
              <tbody>
                {capstones.map((c) => (
                  <tr key={c.id}>
                    <td className="fw-medium">{c.slug ?? 'Untitled'}</td>
                    <td className="small text-muted">{c.projectName ?? '—'}</td>
                    <td>
                      <span className={`badge bg-${c.status === 'published' ? 'success' : 'warning'}-subtle text-${c.status === 'published' ? 'success' : 'warning'}-emphasis`}>
                        {c.status ?? 'unknown'}
                      </span>
                    </td>
                    <td className="small text-muted">{c.visibility ?? '—'}</td>
                    <td className="small text-muted">{fmtDate(c.publishedAt) ?? 'not published'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {portfolio.length > 0 && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold">Portfolio artifacts</div>
          <div className="table-responsive">
            <table className="table table-hover table-sm mb-0">
              <thead className="table-light">
                <tr><th>Kind</th><th>Title</th><th>Status</th><th>When</th></tr>
              </thead>
              <tbody>
                {portfolio.map((p, i) => (
                  <tr key={`${p.kind}-${i}`}>
                    <td className="small">{p.kind.replace(/_/g, ' ')}</td>
                    <td>{p.title ?? <span className="text-muted">Untitled</span>}</td>
                    <td className="small text-muted">{p.status ?? '—'}</td>
                    <td className="small text-muted">{fmtDate(p.at) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold">Certification prep</div>
        <div className="card-body">
          {certPrep.sessions.length > 0 ? (
            <div className="table-responsive">
              <table className="table table-hover table-sm mb-0">
                <thead className="table-light">
                  <tr><th>Track</th><th>Status</th><th>Score</th><th>Correct</th><th>Completed</th></tr>
                </thead>
                <tbody>
                  {certPrep.sessions.map((s, i) => (
                    <tr key={`${s.trackId}-${i}`}>
                      <td>{s.trackId ?? '—'}</td>
                      <td className="small">{s.status ?? '—'}</td>
                      <td>{s.scaledScore ?? <span className="text-muted">—</span>}</td>
                      <td className="small text-muted">
                        {s.correctCount !== null && s.totalCount !== null
                          ? `${s.correctCount} / ${s.totalCount}` : '—'}
                      </td>
                      <td className="small text-muted">{fmtDate(s.completedAt) ?? 'in progress'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyPanel>{certPrep.platformUsageNote}</EmptyPanel>
          )}

          {certPrep.evidenceMapped > 0 && (
            <p className="text-muted small mb-0 mt-3">
              {certPrep.evidenceMapped} pieces of evidence mapped to certification objectives,
              {' '}{certPrep.evidenceVerified} verified.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

/** A 0-1 or 0-100 score, shown only when it exists. */
function Score({ label, value, suffix }: { label: string; value: number | null; suffix?: string }) {
  if (value === null || value === undefined) return null;
  const shown = suffix === '%' ? Math.round(value) : Math.round(value * 10) / 10;
  return (
    <span className="text-muted">
      {label}: <strong className="text-body">{shown}{suffix ?? ''}</strong>
    </span>
  );
}
