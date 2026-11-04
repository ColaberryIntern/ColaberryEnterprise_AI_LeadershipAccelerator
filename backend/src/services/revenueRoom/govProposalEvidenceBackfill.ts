/**
 * R4 — the spine's first producer: link the proposal documents that already exist.
 *
 * WHY THIS IS HERE RATHER THAN IN R5. R3 built the spine and R4 built the page that reads
 * it, and between them sat a problem: nothing wrote a link, so every timeline rendered
 * empty and the page could not be checked against anything real. A surface verified only
 * against fixtures is a surface nobody has actually seen work.
 *
 * `gov_proposal_documents` is the one evidence source that needs no ingestion to reach.
 * It is already in this database, already attached to a `delivery_project_id` by foreign
 * key, and it is the only signal that distinguishes a real bid pursuit from a flagged row:
 * on 2026-11-03, of the twelve bids carrying the pursuit flag, exactly three projects held
 * any document at all. So linking it is both the cheapest first producer and the most
 * useful.
 *
 * R5 remains the scheduled ingestion of Basecamp and R8 of email. This is a backfill of
 * something already present, not a second sync.
 *
 * ── WHY IT IS SAFE TO RUN ON EVERY BOOT ──────────────────────────────────────────────────
 *
 * It goes through `linkEvidence`, so R3's guarantees apply unchanged: the unique index
 * makes a repeat run a no-op, and because that index covers unlinked rows, a document Ali
 * deliberately unlinked stays unlinked. The count of refusals is reported rather than
 * swallowed, because "nothing to do" and "I was correctly refused fourteen times" are
 * different facts and only one of them is boring.
 *
 * ── `observed_at` IS `drafted_at`, NOT `created_at` ──────────────────────────────────────
 *
 * The proposal document list is MATERIALIZED for a project: `created_at` is when the row
 * appeared in that list, which for a derived list is when somebody pressed a button, not
 * when the document was written. `drafted_at` is the moment the document was produced, and
 * that is the event a timeline is asking about. Where `drafted_at` is null nothing has been
 * drafted yet, so `created_at` is the honest fallback and the row still belongs on the
 * timeline as "listed, not yet drafted".
 *
 * This matters more than it sounds. The R2 diagnosis found an explorer-to-paid conversion
 * rate that was counting backwards because when-recorded had been used for when-happened,
 * and the resulting number pointed the wrong way down the funnel.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { linkEvidence } from './evidenceLinkService';

/** Who the links are attributed to. A link nobody owns cannot be audited. */
export const BACKFILL_ACTOR = 'govProposalEvidenceBackfill';

export interface BackfillResult {
  /** `absent` when a table this needs is missing: not the same as nothing to do. */
  state: 'ran' | 'absent';
  considered: number;
  created: number;
  /** Already linked. The normal result of the second and every later run. */
  alreadyLinked: number;
  /** Correctly refused because a human had unlinked the document. */
  refusedByUnlink: number;
  /** Rejected by validation, with the reason. Never silently dropped. */
  rejected: Array<{ sourceId: string; reason: string }>;
}

interface DocRow {
  id: string;
  delivery_project_id: string;
  title: string;
  doc_key: string;
  observed_at: Date | string;
  drafted: boolean;
}

async function tableExists(name: string): Promise<boolean> {
  const rows = await sequelize.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = :name`,
    { type: QueryTypes.SELECT, replacements: { name } },
  );
  return (rows[0]?.n ?? 0) > 0;
}

/**
 * Link every proposal document to the bid it belongs to. Idempotent; safe on every boot.
 *
 * Scoped to documents whose project is actually a bid in pursuit. A proposal document
 * attached to a project nobody is bidding on is not evidence towards revenue, and linking
 * it would put rows on a timeline no card leads to.
 */
export async function backfillGovProposalEvidence(): Promise<BackfillResult> {
  const empty: BackfillResult = {
    state: 'absent', considered: 0, created: 0, alreadyLinked: 0, refusedByUnlink: 0, rejected: [],
  };
  for (const t of ['gov_proposal_documents', 'gov_qualifications', 'evidence_links']) {
    if (!(await tableExists(t))) return empty;
  }

  const docs = await sequelize.query<DocRow>(
    `SELECT d.id,
            d.delivery_project_id,
            d.title,
            d.doc_key,
            COALESCE(d.drafted_at, d.created_at) AS observed_at,
            (d.drafted_at IS NOT NULL) AS drafted
       FROM gov_proposal_documents d
      WHERE EXISTS (
              SELECT 1 FROM gov_qualifications q
               WHERE q.delivery_project_id = d.delivery_project_id
                 AND q.decision::text = 'approved_bid_pursuit'
                 AND q.status::text = 'active')
      ORDER BY COALESCE(d.drafted_at, d.created_at) ASC`,
    { type: QueryTypes.SELECT },
  );

  const result: BackfillResult = { ...empty, state: 'ran', considered: docs.length };

  for (const d of docs) {
    try {
      const r = await linkEvidence({
        sourceSystem: 'gov_proposal_document',
        sourceId: d.id,
        // No URL: this table carries no link to a viewer, and constructing one from a
        // guessed admin route would put a dead link in front of a reader.
        sourceUrl: null,
        title: d.drafted ? d.title : `${d.title} (listed, not yet drafted)`,
        initiativeType: 'gov_bid',
        initiativeKey: d.delivery_project_id,
        relation: 'produced',
        observedAt: d.observed_at instanceof Date ? d.observed_at : new Date(d.observed_at),
        linkedBy: BACKFILL_ACTOR,
        linkMethod: 'automatic',
        // 1 because this is a foreign key, not an inference. The document IS attached to
        // that project by the database. Anything less would imply a judgment was made.
        confidence: 1,
        notes: `doc_key=${d.doc_key}`,
      });
      if (r.created) result.created += 1;
      else if (r.blockedByUnlink) result.refusedByUnlink += 1;
      else result.alreadyLinked += 1;
    } catch (err) {
      // Recorded, never swallowed. One malformed row must not stop the other thirteen, and
      // a backfill that reports success while dropping rows is the failure this ladder
      // keeps finding.
      result.rejected.push({
        sourceId: d.id,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log(JSON.stringify({
    level: result.rejected.length ? 'warn' : 'info',
    service: 'revenue-room',
    event: 'gov_proposal_evidence_backfill',
    outcome: result.rejected.length ? 'partial' : 'success',
    context: {
      considered: result.considered,
      created: result.created,
      already_linked: result.alreadyLinked,
      refused_by_unlink: result.refusedByUnlink,
      rejected: result.rejected.length,
    },
  }));

  return result;
}
