import React from 'react';
import type { GovBuildSummary } from '../../../../services/govProjectPortalApi';

/**
 * BuildReleases — the cockpit's BUILD tab: the project's software build as RELEASES → STORIES with verification
 * state, plus a deep-link to the full build workspace (repo, per-story prompts, progress, commit verification).
 * The intern owns the whole project, so this is a read-only summary here; the hands-on building happens in the
 * linked workspace. A story is `verified` only when the platform confirmed it from a commit.
 */
const statusTag = (s: { verified: boolean; status: string }): { cls: string; label: string } => {
  if (s.verified) return { cls: 'ok', label: 'verified' };
  if (s.status === 'complete') return { cls: 'warn', label: 'done, unverified' };
  if (s.status === 'in_progress') return { cls: 'ai', label: 'in progress' };
  if (s.status === 'blocked') return { cls: 'warn', label: 'blocked' };
  return { cls: '', label: 'not started' };
};

export default function BuildReleases({ summary }: { summary: GovBuildSummary | null | undefined }): React.ReactElement {
  if (!summary) {
    return <div className="gck-empty" style={{ padding: 16 }}>No software build is linked to this project yet. Once the build is materialized, its releases and stories appear here.</div>;
  }
  const { releases, rollup } = summary;
  return (
    <section>
      <div className="gck-filters" style={{ justifyContent: 'space-between' }}>
        <span className="gck-eyebrow">{rollup.verified} of {rollup.total} stor{rollup.total === 1 ? 'y' : 'ies'} verified &middot; {rollup.pct}%</span>
        {/* The build has no bare /portal/projects/:id route; the student opens it from their projects list, which is
            where the per-story workspace + repo + prompts live. Link there rather than to a route that does not exist. */}
        <a className="gck-btn primary" href="/portal/projects">
          Open the build workspace <i className="ri-arrow-right-line" aria-hidden="true" />
        </a>
      </div>
      {releases.length === 0 ? (
        <div className="gck-empty">The build plan has no releases yet.</div>
      ) : releases.map((r) => (
        <div className="gck-release" key={r.key}>
          <h3 className="gck-eyebrow" style={{ marginBottom: 8 }}>{r.name} <span className="gck-num" style={{ color: 'var(--muted)' }}>&middot; {r.stories.length}</span></h3>
          <div className="gck-story-list">
            {r.stories.map((s) => {
              const t = statusTag(s);
              return (
                <div className="gck-story" key={s.storyId}>
                  <span className="gck-key">{s.storyId}</span>
                  <span className="gck-story-title">{s.title}</span>
                  <span className={`gck-tag ${t.cls}`}>{t.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
