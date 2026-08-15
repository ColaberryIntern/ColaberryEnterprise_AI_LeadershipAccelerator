/**
 * Pure logic for the historical `strategic_initiatives` duplicate-explosion cleanup
 * (see backend/src/scripts/consolidateDuplicateStrategicInitiatives.ts for the
 * DB-backed CLI that uses this module). No DB/Sequelize dependency here — grouping,
 * survivor selection, and note-text construction are fully unit-testable in
 * isolation, mirroring backend/src/scripts/lib/openclawDuplicateTicketClusters.ts's
 * split between pure logic and DB-backed apply/revert.
 *
 * Background: `createStrategicInitiative()`'s dedup (backend/src/services/cory/
 * coryInitiatives.ts) was an exact-title match, so any finding whose title embeds a
 * volatile number (a duration, a percentage, an alert count) never deduped against
 * its own earlier occurrence and kept spawning a brand-new `proposed` row forever.
 * That dedup is fixed going forward (see coryInitiatives.ts's
 * normalizeInitiativeDedupTitle(), imported here so this historical cleanup can never
 * drift from the runtime dedup key it is cleaning up after). This module groups the
 * 350 pre-existing `proposed` rows (confirmed live in production, 2026-08-15) by that
 * same normalized key: 68 distinct groups, 58 singles (left alone — not this module's
 * concern), 10 multi-row groups totaling 292 rows.
 */
import { normalizeInitiativeDedupTitle } from '../../services/cory/coryInitiatives';

/** Minimal shape this module needs from a `strategic_initiatives` row. */
export interface InitiativeLike {
  id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string | Date;
}

/** Groups `rows` by `normalizeInitiativeDedupTitle(title)`. */
export function groupByNormalizedTitle<T extends InitiativeLike>(rows: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = normalizeInitiativeDedupTitle(row.title);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  return groups;
}

/**
 * The survivor for a group: the most recently created row, kept exactly as-is
 * (never mutated by the consolidation script). Ties (identical `created_at`)
 * resolve to the first one encountered, matching `pickRepresentative`'s existing
 * precedent in `openclawDuplicateTicketClusters.ts` — deterministic given a stable
 * input order (the caller always fetches ordered by `created_at`).
 */
export function pickSurvivor<T extends InitiativeLike>(rows: T[]): T {
  return rows.reduce((latest, row) =>
    new Date(row.created_at).getTime() > new Date(latest.created_at).getTime() ? row : latest,
  );
}

/**
 * Only the groups with 2+ members — the genuine duplicate-explosion clusters. The 58
 * singles (genuinely distinct findings) are never returned here, matching the
 * explicit "leave the singles untouched" scope of this cleanup.
 */
export function duplicateGroups<T extends InitiativeLike>(rows: T[]): Map<string, T[]> {
  const all = groupByNormalizedTitle(rows);
  const dupes = new Map<string, T[]>();
  for (const [key, members] of all) {
    if (members.length >= 2) dupes.set(key, members);
  }
  return dupes;
}

export interface ConsolidationNoteInput {
  survivorId: string;
  survivorCreatedAt: string | Date;
  consolidatedAt: string;
  sessionId: string;
}

/**
 * The exact text appended to a superseded row's `description` (StrategicInitiative
 * has no `metadata` column to record this in instead — confirmed against
 * backend/src/models/StrategicInitiative.ts). Appended, never overwriting the
 * original description, so no information is lost.
 */
export function buildConsolidationNote(input: ConsolidationNoteInput): string {
  const { survivorId, survivorCreatedAt, consolidatedAt, sessionId } = input;
  const survivorDate = new Date(survivorCreatedAt).toISOString().slice(0, 10);
  return (
    `\n\n---\n[CONSOLIDATED ${consolidatedAt}] Superseded by a more recent duplicate ` +
    `observation of the same underlying condition. Survivor: strategic_initiatives ` +
    `id=${survivorId} (created ${survivorDate}). This row's linked ticket was NOT ` +
    `modified. Consolidated by session ${sessionId}.`
  );
}
