/**
 * Case Study OS — Story Studio asset schema.
 *
 * WHY THIS IS A PEER MODULE AND NOT THREE MORE STATEMENTS IN
 * `ensureCaseStudySchema.ts`. That file is 508 lines against CLAUDE.md's 500
 * hard ceiling, so the Modular Composition Rule requires a split before adding
 * to it. Splitting it, though, would have moved the text that two guard suites
 * read directly — `db/__tests__/ensureCaseStudySchema.test.ts` asserts
 * properties of the SQL as source text, and `models/__tests__/
 * caseStudyModelParity.test.ts` pins `CASE_STUDY_TABLES` to exactly ten and the
 * DDL column total to exactly 158. Both would have gone red for a refactor,
 * which is the change most likely to get a guard "fixed" rather than honoured.
 *
 * So the ten-table core is left byte-untouched and the four Studio tables live
 * here, with their OWN table list, their OWN derived column list and their OWN
 * parity suite mirroring the original. Nothing is weakened; the guard is
 * duplicated rather than widened.
 *
 * SAME CONVENTIONS AS THE CORE MODULE, deliberately:
 *   - bare-UUID references, not real FKs across domain boundaries
 *   - every write-facing flag defaults to the CLOSED state
 *   - a partial unique index where a row can be imported twice
 *   - every statement idempotent and safe to re-run
 *
 * AND THE SAME WARNING. `CREATE TABLE IF NOT EXISTS` is a no-op on a table that
 * already exists, so this module declares no ADD COLUMN statements and adding a
 * column later requires an explicit `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
 * or the column is reported missing on every boot forever while Sequelize
 * silently drops writes to it.
 */

import { sequelize } from '../config/database';
import { parseCreatedColumns, parseCreatedIndexes } from './ensureCaseStudySchema';

/** Tables this module owns. Order matters: parents before children. */
export const CASE_STUDY_STORY_TABLES = [
  'case_study_storylines',
  'case_study_ai_drafts',
  'case_study_quotes',
  'case_study_charts',
] as const;

export const CASE_STUDY_STORY_STATEMENTS: string[] = [
  // --- case_study_storylines : editorial direction, and NEVER a claim ----------
  // One row per Case Study. It holds the human's answer to "what is the story?"
  // and it is deliberately NOT a column on `case_studies` and NOT a key in
  // `case_study_snapshots.content`.
  //
  // THAT SEPARATION IS A SAFETY PROPERTY, NOT A NORMALISATION PREFERENCE. The
  // public projection reads snapshot content plus a typed allowlist, and the
  // publish gate's claim scan (`collectNarrative`) walks snapshot content. A
  // storyline is in neither, so there is no expression in either module that
  // could reach this row. It cannot be published by mistake because no code
  // path exists from here to a page — which is a stronger guarantee than any
  // rule forbidding it, because a rule can be edited and a missing join cannot
  // be edited by accident.
  `CREATE TABLE IF NOT EXISTS case_study_storylines (
     case_study_id UUID PRIMARY KEY,
     storyline_text TEXT NOT NULL,
     authored_by VARCHAR(255) NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,

  // --- case_study_ai_drafts : the quarantine -----------------------------------
  // One row per AI proposal for one dotted snapshot path. THE ROW IS THE
  // QUARANTINE: a generated value is written here and stays here. It reaches
  // `case_study_snapshots.content` only when a human promotes it, and promotion
  // goes through the existing `applyHumanOverride`, so the value lands in
  // content carrying tier `human_override` and the NAME OF THE HUMAN.
  //
  // `status` defaults to `proposed` — the closed state — for the same reason
  // `case_study_metrics.publishable` defaults false.
  //
  // `decided_by` is NULL while proposed, which is what makes "nobody has looked
  // at this" distinguishable from "somebody accepted it". A default of '' would
  // have collapsed those two into one value.
  `CREATE TABLE IF NOT EXISTS case_study_ai_drafts (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     case_study_id UUID NOT NULL,
     draft_path VARCHAR(255) NOT NULL,
     draft_value TEXT NOT NULL,
     status VARCHAR(20) NOT NULL DEFAULT 'proposed',
     generated_by VARCHAR(255) NOT NULL,
     rationale TEXT NOT NULL,
     decided_by VARCHAR(255),
     decided_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS cs_ai_drafts_by_case_study
     ON case_study_ai_drafts (case_study_id, status)`,
  // At most ONE live proposal per path. Regenerating supersedes rather than
  // stacking, so a reviewer is never shown four competing sentences for one
  // field with no way to tell which the generator meant. Partial, scoped to
  // `proposed`, so the decided history is kept unconstrained and auditable.
  `CREATE UNIQUE INDEX IF NOT EXISTS cs_ai_drafts_one_proposal_per_path
     ON case_study_ai_drafts (case_study_id, draft_path) WHERE status = 'proposed'`,

  // --- case_study_quotes : the highest-risk asset in the system ----------------
  // This repository actually shipped invented client quotations — the
  // remediation is named in `frontend/src/config/v2Proof.ts`. So the table is
  // built to make the incident's shape unrepresentable rather than merely
  // forbidden.
  //
  // `attribution_mode` + `display_name` + `consent_recorded_at` carry the
  // `CaseStudyContributor` consent union, and the CHECK constraint below is the
  // union expressed in SQL: a `named` quote without BOTH a display name and a
  // consent timestamp cannot be inserted. The TypeScript union makes it hard to
  // write; the constraint makes it impossible to store, including through the
  // direct SQL that promoted this record's artifacts in the first place.
  //
  // `approved` defaults false and `verification_class` defaults 'pending', so a
  // freshly created quote is publishable on no axis at all.
  `CREATE TABLE IF NOT EXISTS case_study_quotes (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     case_study_id UUID NOT NULL,
     quote_text TEXT NOT NULL,
     attribution_mode VARCHAR(20) NOT NULL,
     display_name VARCHAR(255),
     attribution_role VARCHAR(255),
     attribution_kind VARCHAR(40) NOT NULL,
     consent_recorded_at TIMESTAMPTZ,
     quote_source VARCHAR(40) NOT NULL,
     verification_class VARCHAR(20) NOT NULL DEFAULT 'pending',
     approved BOOLEAN NOT NULL DEFAULT FALSE,
     reviewed_by VARCHAR(255),
     reviewed_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     CONSTRAINT cs_quotes_named_requires_consent CHECK (
       attribution_mode <> 'named'
       OR (display_name IS NOT NULL AND consent_recorded_at IS NOT NULL)
     )
   )`,
  `CREATE INDEX IF NOT EXISTS cs_quotes_by_case_study
     ON case_study_quotes (case_study_id, approved)`,

  // --- case_study_charts : references numbers, never carries them --------------
  // THERE IS NO `values` COLUMN AND THAT IS THE ENTIRE ASSET.
  //
  // `metric_keys` is a TEXT[] of `case_study_metrics.metric_key` values. The
  // projection resolves each through `projectMetric`, which already returns
  // null for anything not `publishable` and verified. A chart therefore cannot
  // display a number the measurement section would refuse to display, because
  // it is the same number resolved by the same function.
  //
  // `verifiedFigures()` is the only thing standing between a number on a page
  // and a number nobody checked, and it draws exclusively from metrics. A chart
  // with its own values would sit entirely outside it — nothing would compare
  // it to anything. A column that does not exist cannot be written to, which is
  // why the guarantee lives here and not only in a TypeScript interface: JSONB
  // and TS types both accept whatever a runtime hands them, and a missing
  // column throws.
  `CREATE TABLE IF NOT EXISTS case_study_charts (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     case_study_id UUID NOT NULL,
     chart_type VARCHAR(20) NOT NULL,
     title VARCHAR(255) NOT NULL,
     caption TEXT,
     metric_keys TEXT[] NOT NULL DEFAULT '{}',
     approved BOOLEAN NOT NULL DEFAULT FALSE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     CONSTRAINT cs_charts_type_is_known CHECK (chart_type IN ('bar', 'ranking'))
   )`,
  `CREATE INDEX IF NOT EXISTS cs_charts_by_case_study
     ON case_study_charts (case_study_id, approved)`,
];

/** Derived from the DDL by the core module's parsers, never hand-listed. */
export const CASE_STUDY_STORY_REQUIRED_COLUMNS: string[] =
  parseCreatedColumns(CASE_STUDY_STORY_STATEMENTS);

export const CASE_STUDY_STORY_REQUIRED_INDEXES: string[] =
  parseCreatedIndexes(CASE_STUDY_STORY_STATEMENTS);

export async function ensureCaseStudyStoryAssets(): Promise<void> {
  for (const sql of CASE_STUDY_STORY_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] case study story asset stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Case Study Story Studio schema ensured (4 tables)');
}

/**
 * Verify the post-condition, for the same reason the core module does: every
 * statement above is swallowed into a console.warn, so `ensure` resolving
 * proves nothing whatsoever about whether the tables exist.
 */
export async function assertCaseStudyStoryAssets(): Promise<{ ok: boolean; missing: string[] }> {
  const missing: string[] = [];
  try {
    const [tables] = await sequelize.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    ) as [{ table_name: string }[], unknown];
    const present = new Set(tables.map((t) => t.table_name));
    for (const table of CASE_STUDY_STORY_TABLES) {
      if (!present.has(table)) missing.push(`table ${table}`);
    }

    const [columns] = await sequelize.query(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
    ) as [{ table_name: string; column_name: string }[], unknown];
    const presentColumns = new Set(columns.map((c) => `${c.table_name}.${c.column_name}`));
    for (const column of CASE_STUDY_STORY_REQUIRED_COLUMNS) {
      if (!presentColumns.has(column)) missing.push(`column ${column}`);
    }
  } catch (err: any) {
    console.warn('[DB] case study story asset assert failed:', err?.message);
    return { ok: false, missing: ['assert query failed'] };
  }

  if (missing.length > 0) {
    console.error('[DB] Case Study Story Studio schema INCOMPLETE:', missing.join(', '));
  }
  return { ok: missing.length === 0, missing };
}
