import StoryTruthEnrichmentRecord from '../../models/StoryTruthEnrichmentRecord';
import type { StoryTruthEnrichment } from './storyEnrichmentContract';

/**
 * storyEnrichmentLedger - read what the stories of one project reported. I/O.
 *
 * The write side lives in storyEnrichmentService; this is the read side the
 * case-study foundation composes from. It returns the rows as they were
 * written, in the order they arrived, and nothing derived: what a row means
 * for maturity or readiness is caseStudyFoundation's decision, made where it
 * can be tested without a database.
 */

export interface StoryEnrichmentRow {
  readonly storyId: string;
  readonly outcome: string;
  readonly baseRevision: number;
  readonly mergedRevision: number | null;
  readonly sourceCommitSha: string | null;
  readonly counts: Readonly<Record<string, number>>;
  readonly event: StoryTruthEnrichment;
  readonly createdAt: string;
}

export async function listStoryEnrichments(projectId: string): Promise<StoryEnrichmentRow[]> {
  const rows = await StoryTruthEnrichmentRecord.findAll({
    where: { project_id: projectId },
    order: [['created_at', 'ASC']],
  });
  return rows.map((r) => ({
    storyId: r.story_id,
    outcome: r.outcome,
    baseRevision: r.base_revision ?? 0,
    mergedRevision: r.merged_revision ?? null,
    sourceCommitSha: r.source_commit_sha ?? null,
    counts: (r.counts ?? {}) as Record<string, number>,
    event: r.event as unknown as StoryTruthEnrichment,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}
