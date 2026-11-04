/**
 * R3 — the one service that writes and reads the evidence spine.
 *
 * Every Revenue Room surface above this reads `evidence_links` through here rather than
 * querying it directly, for one reason: the rules below are the spine's value, and a
 * caller that goes around them gets a timeline that looks right and is not.
 *
 * ── THE FOUR RULES ───────────────────────────────────────────────────────────────────────
 *
 * 1. LINKING IS IDEMPOTENT. R5 and R8 are scheduled jobs. Running one twice must not double
 *    a timeline. `ON CONFLICT DO NOTHING` against the unique index does that at the
 *    database rather than in a read-then-write that two concurrent runs would both pass.
 *
 * 2. AUTOMATION NEVER OVERTURNS A HUMAN. If Ali unlinks a wrongly matched thread, the row
 *    stays and carries `unlinked_at`. The unique index still covers it, so the next
 *    ingestion run conflicts and does nothing — it cannot quietly resurrect the link. A
 *    human can re-link deliberately through `relinkEvidence`. This is the single most
 *    important property here: a correction that gets undone by a cron job teaches people
 *    to stop making corrections.
 *
 * 3. A MISSING TABLE IS NOT AN EMPTY ONE. Reads check the table exists and say which of the
 *    two they found. The boot ensure warns and continues on failure, so this is a state
 *    that can really occur, and an empty timeline rendered for a missing table reads as a
 *    quiet month rather than as a broken deploy.
 *
 * 4. AN UNKNOWN INITIATIVE IS REJECTED AT WRITE TIME. There is no foreign key on
 *    `initiative_key` (the module header explains why), so this is where that guarantee
 *    lives. Without it a typo produces a link to an initiative nobody can see, which is
 *    invisible in exactly the way this ladder keeps finding things invisible.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import {
  INITIATIVE_TYPES,
  LINK_METHODS,
  RELATIONS,
  SOURCE_SYSTEMS,
} from '../../db/ensureEvidenceLinkSchema';
import { REVENUE_HYPOTHESES } from '../commercialization/hypothesisRegister';
import { INITIATIVE_DEFINITIONS } from './revenueInitiatives';

export type SourceSystem = typeof SOURCE_SYSTEMS[number];
export type InitiativeType = typeof INITIATIVE_TYPES[number];
export type Relation = typeof RELATIONS[number];
export type LinkMethod = typeof LINK_METHODS[number];

export interface EvidenceLinkInput {
  sourceSystem: SourceSystem;
  sourceId: string;
  sourceUrl?: string | null;
  title?: string | null;
  initiativeType: InitiativeType;
  initiativeKey: string;
  relation: Relation;
  /** When the evidence HAPPENED. Never defaulted to now(); see the schema header. */
  observedAt: Date;
  linkedBy: string;
  linkMethod: LinkMethod;
  /** Required for `automatic`, forbidden for `human`. Enforced in the database too. */
  confidence?: number | null;
  notes?: string | null;
}

export interface EvidenceLink {
  id: string;
  sourceSystem: SourceSystem;
  sourceId: string;
  sourceUrl: string | null;
  title: string | null;
  initiativeType: InitiativeType;
  initiativeKey: string;
  relation: Relation;
  observedAt: string;
  linkedBy: string;
  linkMethod: LinkMethod;
  confidence: number | null;
  notes: string | null;
}

/** What a read found. `absent` and `empty` are different answers to the same question. */
export type SpineState = 'ready' | 'absent';

export interface EvidenceTimeline {
  state: SpineState;
  initiativeType: InitiativeType;
  initiativeKey: string;
  /** Empty when nothing is linked yet AND when the table is absent; read `state` to tell. */
  links: EvidenceLink[];
  /** Why the list is empty, when it is. Null when there is nothing to explain. */
  note: string | null;
}

export class EvidenceLinkRejected extends Error {
  readonly error_class = 'ValidationError';
  constructor(message: string) {
    super(message);
    this.name = 'EvidenceLinkRejected';
  }
}

/** True when the table exists in this database. A missing table is not an empty one. */
async function tableExists(): Promise<boolean> {
  const rows = await sequelize.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'evidence_links'`,
    { type: QueryTypes.SELECT },
  );
  return (rows[0]?.n ?? 0) > 0;
}

/**
 * The membership initiative keys, read from R1's Revenue Room card registry.
 *
 * An earlier revision declared this literal locally, because R1 was on an unmerged branch
 * and stacking R3 behind it would have made merging the child block approval of the parent.
 * R1 landed on main while this was being built, so the reason for the duplication is gone
 * and the duplication goes with it: one list, in the registry that defines the cards, read
 * by the spine that enforces it.
 */
export const MEMBERSHIP_KEYS: ReadonlyArray<string> = INITIATIVE_DEFINITIONS
  .filter((d) => d.kind === 'membership')
  .map((d) => d.key);

/**
 * The known initiative keys.
 *
 * Both sets are DERIVED, never retyped — hypothesis keys from the C0.1 register, membership
 * keys from the card registry. So a bet added or renamed in either place cannot leave this
 * validator describing a set that no longer exists. That is the same drift that made
 * `revenueOpportunityService`'s stage filter unsatisfiable against its own column.
 *
 * `gov_bid` and `account` are the deliberate exceptions: their keys are `delivery_project_id`
 * and organization UUIDs that only exist in the database, so they cannot be enumerated from
 * a static registry. Those get a shape check instead, which is weaker, and that is said here
 * rather than left for someone to discover.
 */
function knownKeysFor(type: InitiativeType): Set<string> | null {
  if (type === 'gov_bid' || type === 'account') return null;
  if (type === 'hypothesis') {
    return new Set(REVENUE_HYPOTHESES.map((h) => `hypothesis_${h.key}`));
  }
  return new Set(MEMBERSHIP_KEYS);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reject anything the spine cannot honestly store, BEFORE it reaches the database.
 *
 * The database re-checks the vocabularies and the confidence rule, so this is belt and
 * braces there. The initiative-key check exists ONLY here, because there is no foreign key
 * to lean on, which makes this function the whole guarantee rather than a convenience.
 */
export function validateLink(input: EvidenceLinkInput): void {
  if (!SOURCE_SYSTEMS.includes(input.sourceSystem)) {
    throw new EvidenceLinkRejected(`unknown source_system "${input.sourceSystem}"`);
  }
  if (!INITIATIVE_TYPES.includes(input.initiativeType)) {
    throw new EvidenceLinkRejected(`unknown initiative_type "${input.initiativeType}"`);
  }
  if (!RELATIONS.includes(input.relation)) {
    throw new EvidenceLinkRejected(`unknown relation "${input.relation}"`);
  }
  if (!LINK_METHODS.includes(input.linkMethod)) {
    throw new EvidenceLinkRejected(`unknown link_method "${input.linkMethod}"`);
  }
  if (!input.sourceId.trim()) {
    throw new EvidenceLinkRejected('source_id is required: a link to nothing is not evidence');
  }
  if (!input.linkedBy.trim()) {
    throw new EvidenceLinkRejected('linked_by is required: an unattributed link cannot be audited');
  }

  // Rule 4. A typo here would otherwise produce a link nobody can ever see.
  const known = knownKeysFor(input.initiativeType);
  if (known && !known.has(input.initiativeKey)) {
    throw new EvidenceLinkRejected(
      `initiative_key "${input.initiativeKey}" is not a known ${input.initiativeType}. `
      + `Known: ${[...known].join(', ')}`,
    );
  }
  if (input.initiativeType === 'gov_bid' && !UUID.test(input.initiativeKey)) {
    throw new EvidenceLinkRejected(
      `a gov_bid initiative_key must be a delivery_project_id UUID, got "${input.initiativeKey}"`,
    );
  }

  // `observed_at` carries the timeline. A missing or impossible one is worse than no link,
  // because it places the evidence at a point in the story where it did not happen.
  if (!(input.observedAt instanceof Date) || Number.isNaN(input.observedAt.getTime())) {
    throw new EvidenceLinkRejected('observed_at must be a real date, and is never defaulted to now');
  }

  if (input.linkMethod === 'human' && input.confidence !== undefined && input.confidence !== null) {
    throw new EvidenceLinkRejected(
      'a human link must not carry a confidence score: it would invite averaging a '
      + 'judgment together with a guess',
    );
  }
  if (input.linkMethod === 'automatic') {
    const c = input.confidence;
    if (c === undefined || c === null) {
      throw new EvidenceLinkRejected('an automatic link must state its confidence');
    }
    if (!(c >= 0 && c <= 1)) {
      throw new EvidenceLinkRejected(`confidence must be between 0 and 1, got ${c}`);
    }
  }
}

export interface LinkResult {
  /** True when this call created the row. False when an equivalent link already existed. */
  created: boolean;
  /**
   * True when the existing row is one a human unlinked. The caller has NOT been given a
   * link, and should not treat this as success: automation is being correctly refused.
   */
  blockedByUnlink: boolean;
  id: string | null;
}

/**
 * Link one piece of evidence to one initiative. Safe to call repeatedly with the same input.
 *
 * Rules 1 and 2 both live in this one statement. `ON CONFLICT DO NOTHING` makes a repeat
 * call a no-op, and because the unique index covers unlinked rows too, a row Ali unlinked
 * conflicts as well — so a cron run cannot undo his correction. The follow-up SELECT exists
 * to tell those two cases apart, since `DO NOTHING` returns the same empty result for both
 * and the caller needs to know which happened.
 */
export async function linkEvidence(input: EvidenceLinkInput): Promise<LinkResult> {
  validateLink(input);

  const inserted = await sequelize.query<{ id: string }>(
    `INSERT INTO evidence_links (
       source_system, source_id, source_url, title,
       initiative_type, initiative_key, relation,
       observed_at, linked_by, link_method, confidence, notes
     ) VALUES (
       :sourceSystem, :sourceId, :sourceUrl, :title,
       :initiativeType, :initiativeKey, :relation,
       :observedAt, :linkedBy, :linkMethod, :confidence, :notes
     )
     ON CONFLICT (source_system, source_id, initiative_type, initiative_key) DO NOTHING
     RETURNING id`,
    {
      type: QueryTypes.SELECT,
      replacements: {
        sourceSystem: input.sourceSystem,
        sourceId: input.sourceId,
        sourceUrl: input.sourceUrl ?? null,
        title: input.title ?? null,
        initiativeType: input.initiativeType,
        initiativeKey: input.initiativeKey,
        relation: input.relation,
        observedAt: input.observedAt,
        linkedBy: input.linkedBy,
        linkMethod: input.linkMethod,
        confidence: input.confidence ?? null,
        notes: input.notes ?? null,
      },
    },
  );

  if (inserted[0]?.id) return { created: true, blockedByUnlink: false, id: inserted[0].id };

  // The conflict case. Which of the two is it?
  const existing = await sequelize.query<{ id: string; unlinked_at: Date | null }>(
    `SELECT id, unlinked_at FROM evidence_links
      WHERE source_system = :sourceSystem AND source_id = :sourceId
        AND initiative_type = :initiativeType AND initiative_key = :initiativeKey`,
    {
      type: QueryTypes.SELECT,
      replacements: {
        sourceSystem: input.sourceSystem,
        sourceId: input.sourceId,
        initiativeType: input.initiativeType,
        initiativeKey: input.initiativeKey,
      },
    },
  );
  const row = existing[0];
  return {
    created: false,
    blockedByUnlink: Boolean(row?.unlinked_at),
    id: row?.id ?? null,
  };
}

/**
 * Soft-unlink a wrongly matched piece of evidence. The row stays for audit and stops
 * appearing in any timeline.
 *
 * Idempotent on purpose: unlinking twice is not an error, and `unlinked_at IS NULL` in the
 * WHERE means the second call does not overwrite who did it first.
 */
export async function unlinkEvidence(
  id: string, unlinkedBy: string, reason: string,
): Promise<boolean> {
  if (!unlinkedBy.trim()) {
    throw new EvidenceLinkRejected('unlinked_by is required: an unexplained unlink gets argued about later');
  }
  const rows = await sequelize.query<{ id: string }>(
    `UPDATE evidence_links
        SET unlinked_at = NOW(), unlinked_by = :unlinkedBy, unlink_reason = :reason,
            updated_at = NOW()
      WHERE id = :id AND unlinked_at IS NULL
      RETURNING id`,
    { type: QueryTypes.SELECT, replacements: { id, unlinkedBy, reason: reason || null } },
  );
  return rows.length > 0;
}

/**
 * Deliberately restore a link a human unlinked. Only a human may do this.
 *
 * This is the escape hatch rule 2 needs. Automation is blocked from resurrecting a link, so
 * there has to be a door marked clearly as the human one, or a mistaken unlink becomes
 * permanent and people work around the spine instead.
 */
export async function relinkEvidence(id: string, relinkedBy: string): Promise<boolean> {
  if (!relinkedBy.trim()) {
    throw new EvidenceLinkRejected('relinked_by is required');
  }
  const rows = await sequelize.query<{ id: string }>(
    `UPDATE evidence_links
        SET unlinked_at = NULL, unlinked_by = NULL,
            unlink_reason = CONCAT('re-linked by ', :relinkedBy, '; previous reason: ',
                                   COALESCE(unlink_reason, '(none)')),
            link_method = 'human', confidence = NULL, linked_by = :relinkedBy,
            updated_at = NOW()
      WHERE id = :id AND unlinked_at IS NOT NULL
      RETURNING id`,
    { type: QueryTypes.SELECT, replacements: { id, relinkedBy } },
  );
  return rows.length > 0;
}

interface Row {
  id: string;
  source_system: SourceSystem;
  source_id: string;
  source_url: string | null;
  title: string | null;
  initiative_type: InitiativeType;
  initiative_key: string;
  relation: Relation;
  observed_at: Date | string;
  linked_by: string;
  link_method: LinkMethod;
  confidence: string | number | null;
  notes: string | null;
}

const toLink = (r: Row): EvidenceLink => ({
  id: r.id,
  sourceSystem: r.source_system,
  sourceId: r.source_id,
  sourceUrl: r.source_url,
  title: r.title,
  initiativeType: r.initiative_type,
  initiativeKey: r.initiative_key,
  relation: r.relation,
  observedAt: r.observed_at instanceof Date ? r.observed_at.toISOString() : String(r.observed_at),
  linkedBy: r.linked_by,
  linkMethod: r.link_method,
  // NUMERIC comes back as a string from pg. Number(null) is 0, which would turn "no
  // confidence" into "no confidence at all" — a real claim — so the null is preserved.
  confidence: r.confidence === null ? null : Number(r.confidence),
  notes: r.notes,
});

/**
 * Everything linked to one initiative, newest first. Rule 3: says whether the spine was
 * there to read.
 */
export async function getEvidenceTimeline(
  initiativeType: InitiativeType, initiativeKey: string, limit = 200,
): Promise<EvidenceTimeline> {
  const base = { state: 'ready' as SpineState, initiativeType, initiativeKey, links: [], note: null };

  if (!(await tableExists())) {
    return {
      ...base,
      state: 'absent',
      note: 'evidence_links is not present in this database, so no timeline can be shown. '
        + 'This is NOT an empty timeline: a missing source is not an empty one.',
    };
  }

  const rows = await sequelize.query<Row>(
    `SELECT id, source_system, source_id, source_url, title,
            initiative_type, initiative_key, relation, observed_at,
            linked_by, link_method, confidence, notes
       FROM evidence_links
      WHERE initiative_type = :initiativeType AND initiative_key = :initiativeKey
        AND unlinked_at IS NULL
      ORDER BY observed_at DESC
      LIMIT :limit`,
    { type: QueryTypes.SELECT, replacements: { initiativeType, initiativeKey, limit } },
  );

  return {
    ...base,
    links: rows.map(toLink),
    note: rows.length === 0
      ? 'Nothing is linked to this initiative yet. The table is present and holds no row '
        + 'for it, so this is a measured zero rather than a gap in what can be seen.'
      : null,
  };
}

/** How much evidence each initiative has, for the Room's cards. Live links only. */
export async function getEvidenceCounts(): Promise<
  { state: SpineState; counts: Record<string, number> }
> {
  if (!(await tableExists())) return { state: 'absent', counts: {} };
  const rows = await sequelize.query<{ initiative_type: string; initiative_key: string; n: number }>(
    `SELECT initiative_type, initiative_key, COUNT(*)::int AS n
       FROM evidence_links
      WHERE unlinked_at IS NULL
      GROUP BY 1, 2`,
    { type: QueryTypes.SELECT },
  );
  const counts: Record<string, number> = {};
  for (const r of rows) counts[`${r.initiative_type}:${r.initiative_key}`] = r.n;
  return { state: 'ready', counts };
}
