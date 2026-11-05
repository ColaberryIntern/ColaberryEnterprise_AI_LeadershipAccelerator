import { sequelize } from '../config/database';

/**
 * Gov proposal blueprints (gov_proposal_blueprints) — the Proposal Studio's per-contract RULEBOOK (P2), derived by
 * re-analyzing the STORED solicitation ZIP: Section M scoring, Section L submission mechanics, required forms
 * (incl. the Texas forms rules engine), and addenda to acknowledge. Every rule in `blueprint_json` carries the
 * literal source quote it came from; a rule whose quote is not literally present is dropped before it is stored.
 *
 * Versioned per delivery project: `reanalyze` writes the NEXT version (never overwrites), so the history of how the
 * solicitation was read is kept and two versions can be diffed. `source_sha256` is the sha256 of the bundle bytes
 * the blueprint was built from (provenance: which exact ZIP produced this reading).
 *
 * Idempotent raw SQL, same additive, self-healing pattern as ensureGovProposalDocumentSchema.ts: one
 * CREATE ... IF NOT EXISTS per statement, each in its own try/catch. A single additive NEW table FK'd to
 * delivery_projects; no existing table is altered here.
 */
export async function ensureGovProposalBlueprintSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS gov_proposal_blueprints (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       delivery_project_id UUID NOT NULL REFERENCES delivery_projects(id) ON DELETE CASCADE,
       version INTEGER NOT NULL DEFAULT 1,
       source_sha256 TEXT,
       blueprint_json JSONB NOT NULL DEFAULT '{}'::jsonb,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       created_by_identity_id UUID
     )`,
    // One row per (project, version): reanalyze computes the next version and inserts; a retry with the same
    // version number conflicts rather than duplicating. The read path takes the MAX(version) as current.
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_gov_proposal_blueprints_project_version ON gov_proposal_blueprints (delivery_project_id, version)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] gov_proposal_blueprints schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Gov proposal blueprints schema ensured');
}
