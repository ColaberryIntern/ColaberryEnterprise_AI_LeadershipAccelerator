import { env } from '../../config/env';
// The SAME projection the public API renders with — never a second renderer.
import { projectPublicDetail } from './caseStudyPublicProjection';
import type { PublicCaseStudyDetail } from '../../types/caseStudyPublic';
import type { CaseStudySnapshotContent, CaseStudySurfaceKey } from '../../types/caseStudy';
import type { PublicSurfaceView } from './caseStudySurfaceView';
import type { CaseStudySnapshotSummary } from './caseStudyAdminStore';
import type { CaseStudyPublishDecision } from './caseStudyPublicationService';
import type { CaseStudyReadinessReport } from './caseStudyReadinessService';

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

/**
 * WHAT A PREVIEW IS.
 *
 * MOVED HERE FROM `caseStudyAdminReview.ts`, which was at 497 of CLAUDE.md's
 * 500-line hard ceiling when `surface` was added — the rule is to split before
 * adding, not after, and this is the module that already owns the preview
 * concept. `caseStudyAdminReview` re-exports the name so no importer moves.
 */
export interface CaseStudySurfacePreview {
  readonly surfaceKey: CaseStudySurfaceKey;
  /**
   * The surface profile as the client receives it, built by the SAME
   * `surfaceView()` the public detail response uses.
   *
   * Without this the admin lens lab could not exist: `visibleSections()` takes a
   * `PublicSurfaceView` and derives the band order, the hidden set and the
   * attribution floor from it, and a bare `surfaceKey` string cannot stand in
   * for that. Rebuilding the view on the client from a key would be a second
   * implementation of the framing rules, which is the same mistake as a second
   * projection — the reviewer would be reviewing a different artifact from the
   * one that ships.
   */
  readonly surface: PublicSurfaceView;
  /** Which version the preview is OF. `null` when nothing has been built yet. */
  readonly snapshot: CaseStudySnapshotSummary | null;
  readonly source: 'approved_snapshot' | 'latest_draft' | 'none';
  /** The real gate, not a second opinion. `blockers` are verbatim, for the UI. */
  readonly decision: CaseStudyPublishDecision;
  /** ADVISORY. Reported beside the decision, never consulted by it. */
  readonly readiness: CaseStudyReadinessReport | null;
  /**
   * What a visitor would actually see, rendered through the SAME projection the
   * public API uses (spec §34). Null when there is no snapshot to project.
   *
   * This is deliberately not a second renderer. If the preview built its own
   * view, an admin could approve something subtly different from what ships —
   * and the review step, which is the entire justification for a human in this
   * loop, would be reviewing the wrong artifact. The projection is also where
   * private repositories are dropped and pending metrics become unrepresentable,
   * so a preview that skipped it would show the admin more than the public gets.
   */
  readonly projection: PublicCaseStudyDetail | null;
}

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
