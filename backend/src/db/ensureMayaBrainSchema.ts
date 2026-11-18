import { sequelize } from '../config/database';

/**
 * OH1i (T3): the one table behind two of Maya's content shelves - AI facts and build prompts.
 *
 * Every other shelf is read live from where it already lives (events, lessons, community posts,
 * hire.refactored.ai). These two need a place to hold a human decision: an AI fact is only
 * usable once someone has tied it to an approved Claim Registry entry (CLM-nnn) or a public
 * source, and a build prompt is only usable once it has actually built something. That
 * decision is the row's status, and nothing reaches a learner unless status = 'approved',
 * not expired, and (for a build prompt) test_build_status = 'passed'.
 *
 * The two gates are enforced twice: in the reader (mayaBrainItems.isServable, unit tested) and
 * here as CHECK constraints, so a hand-written UPDATE cannot approve an unsourced fact or an
 * untested prompt either. (COALESCE matters: a CHECK that evaluates to NULL passes, so a bare
 * `source_url ~ ...` on a NULL url would have let an unsourced fact through. The dev1 proof
 * caught exactly that.)
 *
 * Additive only: one new table and its indexes; nothing existing is altered. Not run at boot -
 * created by `scripts/ensureMayaBrainSchema.ts --apply` (dry run by default). Until it exists,
 * every reader degrades to an empty shelf.
 */
export const MAYA_BRAIN_SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS maya_brain_items (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     kind VARCHAR(24) NOT NULL,
     title VARCHAR(300) NOT NULL,
     body TEXT NOT NULL,
     source_url VARCHAR(1000),
     source_label VARCHAR(300),
     virality NUMERIC(6,4),
     signal_id UUID,
     status VARCHAR(16) NOT NULL DEFAULT 'draft',
     test_build_status VARCHAR(16) NOT NULL DEFAULT 'pending',
     test_build_notes TEXT,
     approved_by VARCHAR(255),
     approved_at TIMESTAMPTZ,
     expires_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     CONSTRAINT maya_brain_items_kind_chk CHECK (kind IN ('ai_fact', 'build_prompt')),
     CONSTRAINT maya_brain_items_status_chk CHECK (status IN ('draft', 'approved', 'retired')),
     CONSTRAINT maya_brain_items_test_build_chk CHECK (test_build_status IN ('pending', 'passed', 'failed')),
     CONSTRAINT maya_brain_items_fact_sourced_chk CHECK (
       status <> 'approved' OR kind <> 'ai_fact'
       OR COALESCE(source_label, '') ~ 'CLM-[0-9]{3,}' OR COALESCE(source_url, '') ~ '^https?://[^/]+\\.[^/]+'
     ),
     CONSTRAINT maya_brain_items_prompt_tested_chk CHECK (
       status <> 'approved' OR kind <> 'build_prompt' OR test_build_status = 'passed'
     )
   )`,
  `CREATE INDEX IF NOT EXISTS idx_maya_brain_items_shelf ON maya_brain_items (kind, status)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_maya_brain_items_signal ON maya_brain_items (kind, signal_id) WHERE signal_id IS NOT NULL`,
];

type Runner = (sql: string) => Promise<unknown>;

/** Runs every statement; each is idempotent and isolated, so a partial table self-heals on re-run. */
export async function ensureMayaBrainSchema(run: Runner = (sql) => sequelize.query(sql)): Promise<{ ok: number; skipped: string[] }> {
  let ok = 0;
  const skipped: string[] = [];
  for (const sql of MAYA_BRAIN_SCHEMA_STATEMENTS) {
    try {
      await run(sql);
      ok++;
    } catch (err: any) {
      skipped.push(err?.message || String(err));
      console.warn('[DB] maya brain schema stmt skipped:', err?.message);
    }
  }
  return { ok, skipped };
}
