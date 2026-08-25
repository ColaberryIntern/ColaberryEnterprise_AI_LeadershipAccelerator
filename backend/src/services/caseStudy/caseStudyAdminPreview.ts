import { env } from '../../config/env';
// The SAME projection the public API renders with — never a second renderer.
import { projectPublicDetail } from './caseStudyPublicProjection';
import type { PublicCaseStudyDetail } from '../../types/caseStudyPublic';
import type { CaseStudySnapshotContent, CaseStudySurfaceKey } from '../../types/caseStudy';

/**
 * Rendering an admin preview through the public projection (spec §34).
 *
 * Extracted from `caseStudyAdminReview.ts` because adding it inline took that
 * file to 529 lines, past CLAUDE.md's 500 hard ceiling — the rule is to split
 * before adding, not after.
 *
 * WHY THE PREVIEW MUST NOT HAVE ITS OWN RENDERER. If it did, an admin could
 * approve something subtly different from what actually ships, and the review
 * step — the entire justification for a human in this loop — would be reviewing
 * the wrong artifact. The projection is also where private repositories are
 * dropped and pending metrics become structurally unrepresentable, so a preview
 * that skipped it would show the reviewer strictly more than the public gets,
 * which is the opposite of a useful check.
 */

/** The snapshot fields a preview projection needs. Structural, so a Sequelize row fits. */
export interface PreviewSnapshotFacts {
  readonly content: unknown;
  readonly updated_at?: Date | string | null;
}

/**
 * Project a snapshot as a visitor would see it.
 *
 * Publication facts are SYNTHESISED rather than read, because a preview exists
 * precisely for records that are not published yet — there is usually no
 * `case_study_publications` row to read. `featured` is false and the overrides
 * are null, so the preview shows the snapshot's own title and summary; a surface
 * override is applied at publish time and belongs to the publication editor.
 *
 * Returns null on failure rather than throwing, for the same reason readiness
 * does: a projection error must not deny the admin the gate decision, which is
 * the load-bearing half of the preview screen.
 */
export function projectPreviewDetail(
  slug: string,
  snapshot: PreviewSnapshotFacts,
  surfaceKey: CaseStudySurfaceKey,
): PublicCaseStudyDetail | null {
  try {
    const now = new Date().toISOString();
    const updatedAt = typeof snapshot.updated_at === 'string'
      ? snapshot.updated_at
      : snapshot.updated_at?.toISOString() ?? now;

    return projectPublicDetail({
      surfaceKey,
      slug,
      content: (snapshot.content ?? {}) as CaseStudySnapshotContent,
      publication: {
        featured: false,
        publishedAt: now,
        updatedAt,
        titleOverride: null,
        summaryOverride: null,
      },
      canonicalBaseUrl: env.publicAppUrl,
    });
  } catch (err) {
    // Swallowed to null so a projection failure cannot deny the admin the gate
    // decision — but NEVER silently. A bare `catch { return null }` here would
    // let the projection regress to null in production with no signal at all,
    // and the caller renders an empty preview panel that looks like "nothing to
    // show yet" rather than "the renderer threw".
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'case-study-admin-preview',
      event: 'case_study.preview_projection_failed',
      outcome: 'failure',
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
      context: {
        slug,
        surface_key: surfaceKey,
        // The message, never the content — a projection error can quote a value,
        // and a value can name a client.
        message: err instanceof Error ? err.message : String(err),
      },
    }));
    return null;
  }
}
