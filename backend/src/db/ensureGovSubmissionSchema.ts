import { sequelize } from '../config/database';

// Gov submission + outcome (the per-project submission lifecycle, export manifest, manual receipt, win/loss
// outcome, and PRIVATE reusable candidates) — ensured via idempotent raw SQL, same pattern as the other gov
// ensure-schema files. Each statement is CREATE ... IF NOT EXISTS in its own try/catch.
//
// Additive only: creates 1 new table and adds nullable columns via ADD COLUMN IF NOT EXISTS; never drops or
// narrows anything existing. Columns must match backend/src/models/GovSubmission.ts EXACTLY.
//
// UNIQUE delivery_project_id: one submission record per project (upsert). `status` defaults 'preparing';
// `outcome` defaults 'pending'. The candidates are JSONB and born private — this table never writes to the
// published case_studies / live service_offerings systems.
export async function ensureGovSubmissionSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS gov_submission (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       delivery_project_id UUID NOT NULL REFERENCES delivery_projects(id) ON DELETE CASCADE,
       status VARCHAR(30) NOT NULL DEFAULT 'preparing',
       outcome VARCHAR(20) NOT NULL DEFAULT 'pending',
       export_manifest JSONB,
       exported_at TIMESTAMPTZ,
       external_ref TEXT,
       externally_submitted_at TIMESTAMPTZ,
       acknowledged_ref TEXT,
       acknowledged_at TIMESTAMPTZ,
       outcome_note TEXT,
       outcome_recorded_at TIMESTAMPTZ,
       case_study_candidate JSONB,
       service_capability_candidate JSONB,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_gov_submission_project ON gov_submission (delivery_project_id)`,
    // M5 (additive, nullable): the solicitation close/due date for the bid, so a submitted potential-win carries a
    // close date in the Revenue Room whether or not it has been priced. Sourced only from the solicitation; never
    // fabricated. Lives here (not on gov_bid_values, whose proposal_value_cents is NOT NULL) so a value-pending win
    // can still carry a close date. ADD COLUMN IF NOT EXISTS matches the house additive idiom; no default.
    `ALTER TABLE gov_submission ADD COLUMN IF NOT EXISTS close_date DATE`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] gov_submission schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Gov submission schema ensured');
}
