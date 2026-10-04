/**
 * ensureCaseStudyServiceLinkSchema — which case studies evidence which services, additive.
 *
 * A government bid asks "what proves you can do this", and the honest answer is a case study. Until now nothing
 * connected the two: `service_offerings` carried a free-text `past_performance` field, which is prose rather than a
 * link, and no table joined a record to an offering in either direction.
 *
 * MANY TO MANY, because both directions are real questions. A bid asks a service what proves it; a record asks
 * which offerings it supports. A JSONB array on either side would answer one and lose the other, and would hold no
 * referential integrity.
 *
 * NOTHING HERE IS A CLAIM UNTIL A HUMAN MAKES IT ONE. A link is born `suggested`, carrying the overlap that
 * produced it, and only a person moves it to `confirmed`. That distinction is the point of the table: these links
 * feed past-performance claims in government proposals, and an unreviewed keyword match quoted to a contracting
 * officer is exactly the failure this company's case-study process exists to prevent. A rejected suggestion is
 * kept, not deleted, so the same weak match is not proposed again next week.
 *
 * ON DELETE CASCADE, deliberately, against the house style of this table family. A case study was permanently
 * deleted on 2026-10-02, taking 73 rows with it; the delete rolled back first because one child table linked
 * through a column the schema scan had not thought to look for. Cascade means a future deletion cannot leave a link
 * pointing at a record that no longer exists, and cannot be blocked by one either.
 *
 *   case_study_service_links — one row per (case study, service offering) pair.
 */
import { sequelize } from '../config/database';

export const REQUIRED_TABLES: ReadonlyArray<string> = ['case_study_service_links'];

/** Every DDL statement, hoisted so a test can assert the whole set is additive (CREATE ... IF NOT EXISTS only). */
export const CASE_STUDY_SERVICE_LINK_STATEMENTS: ReadonlyArray<string> = [
  `CREATE TABLE IF NOT EXISTS case_study_service_links (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     case_study_id UUID NOT NULL REFERENCES case_studies(id) ON DELETE CASCADE,
     service_offering_id UUID NOT NULL REFERENCES service_offerings(id) ON DELETE CASCADE,
     state TEXT NOT NULL DEFAULT 'suggested',
     rationale TEXT,
     match_score INTEGER,
     suggested_by TEXT,
     decided_by TEXT,
     decided_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  // One row per pair. A second suggestion for a pair a human already rejected must update that row rather than
  // appear as a fresh proposal, which is what the unique index enforces.
  `CREATE UNIQUE INDEX IF NOT EXISTS case_study_service_links_pair_idx
     ON case_study_service_links (case_study_id, service_offering_id)`,
  // Both directions are queried, so both get an index: a record's services, and a service's proof.
  `CREATE INDEX IF NOT EXISTS case_study_service_links_by_service_idx
     ON case_study_service_links (service_offering_id, state)`,
  `CREATE INDEX IF NOT EXISTS case_study_service_links_by_record_idx
     ON case_study_service_links (case_study_id, state)`,
];

export async function ensureCaseStudyServiceLinkSchema(): Promise<void> {
  for (const statement of CASE_STUDY_SERVICE_LINK_STATEMENTS) {
    await sequelize.query(statement);
  }
}

export default ensureCaseStudyServiceLinkSchema;
