import { canView, type ShowcaseRow } from './showcaseAccess';
import { describeExternal } from './showcaseDraft';

/**
 * The gallery list, filtered by the SAME predicate every other surface uses.
 *
 * WHY THE FILTER IS HERE AND NOT IN THE PAGE. This endpoint is the search index. A
 * gallery that returned every row and let the browser hide the private ones would be
 * one view-source away from leaking them, and anyone querying the endpoint directly
 * would get the lot. `canView` decides, on the `search` surface, exactly as it decides
 * on `media` and `download`.
 *
 * THE SQL DELIBERATELY DOES NOT ENCODE THE RULE. It narrows to rows that could
 * plausibly be visible — live, not withdrawn — and `canView` makes the decision in one
 * place. Two copies of an access rule, one in SQL and one in TypeScript, drift; and the
 * one in SQL is the one nobody re-reads.
 */

/** Lazy so importing this module never constructs the ORM. */
async function db() {
  const { sequelize } = await import('../../config/database');
  return sequelize;
}

export interface GalleryViewer {
  enrollmentId: string;
  isStaff?: boolean;
  cohortId?: string | null;
}

export interface GalleryItem {
  id: string;
  title: string;
  summary: string;
  authorName: string;
  audience: string;
  workInProgress: boolean;
  external: { url: string; badge: string; note: string } | null;
  tags: string[];
}

function toItem(r: Record<string, any>): GalleryItem {
  const draft = r.draft_json || {};
  const ext = draft.external_url
    ? describeExternal({ url: String(draft.external_url), label: String(draft.external_label || 'External project') })
    : null;
  return {
    id: String(r.id),
    title: String(draft.title || r.project_name || 'Untitled'),
    summary: String(draft.summary || ''),
    authorName: String(r.author_name || 'A learner'),
    audience: String(r.audience),
    // The author's own statement, never inferred from how complete it looks.
    workInProgress: draft.work_in_progress === true,
    external: ext ? { url: ext.url, badge: ext.badge, note: ext.note } : null,
    tags: Array.isArray(draft.tags) ? draft.tags.map(String) : [],
  };
}

export async function listVisibleShowcases(viewer: GalleryViewer): Promise<GalleryItem[]> {
  const sequelize = await db();

  // Narrow to rows that COULD be visible. The decision is still `canView`'s.
  const [rows] = await sequelize.query(
    `SELECT s.id, s.audience, s.draft_json, s.content_hash,
            s.author_approved_at, s.staff_approved_at, s.published_at, s.withdrawn_at,
            a.enrollment_id AS owner_enrollment_id,
            a.cohort_id,
            p.name AS project_name,
            e.full_name AS author_name
       FROM presentation_showcases s
       JOIN presentation_attempts t ON t.id = s.attempt_id
       JOIN presentation_assignments a ON a.id = t.assignment_id
       LEFT JOIN projects p ON p.id = a.project_id
       LEFT JOIN enrollments e ON e.id = a.enrollment_id
      WHERE s.published_at IS NOT NULL
        AND s.withdrawn_at IS NULL
      ORDER BY s.published_at DESC
      LIMIT 200`,
  ) as [Array<Record<string, any>>, unknown];

  const items: GalleryItem[] = [];
  for (const r of rows || []) {
    const row: ShowcaseRow = {
      id: String(r.id),
      ownerEnrollmentId: String(r.owner_enrollment_id || ''),
      cohortId: r.cohort_id ? String(r.cohort_id) : null,
      audience: r.audience,
      contentHash: r.content_hash,
      // Stored with the draft when the take is rebound; see showcaseService.
      currentContentHash: (r.draft_json || {}).current_content_hash ?? r.content_hash,
      authorApprovedAt: r.author_approved_at,
      staffApprovedAt: r.staff_approved_at,
      publishedAt: r.published_at,
      withdrawnAt: r.withdrawn_at,
    };
    if (canView(row, viewer, 'search')) items.push(toItem(r));
  }
  return items;
}
