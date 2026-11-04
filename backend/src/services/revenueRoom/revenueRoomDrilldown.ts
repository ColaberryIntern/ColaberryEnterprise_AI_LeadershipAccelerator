/**
 * R4 — what sits behind a Revenue Room card when you click it.
 *
 * Ali's words: "every card is clickable to drill through to another page that shows the
 * timeline, documents etc... of all the things that have happened moving towards that
 * initiative."
 *
 * ── ONE CARD IS NOT ONE INITIATIVE, AND THAT SHAPES THIS WHOLE MODULE ────────────────────
 *
 * Six of the Room's seven cards are a single initiative: five hypotheses and membership.
 * Clicking one asks "what has happened towards this?", and the answer is a timeline.
 *
 * The seventh, `gov_bid_pursuit`, is an AGGREGATE. It reports a count of bids carrying the
 * pursuit flag — twelve of them on 2026-11-03, including a row named "Snow College Adult
 * Learner - T8 test", one RFP duplicated under two project ids, and three rows with no
 * delivery project at all. Clicking it cannot sensibly produce one timeline, because there
 * is no one thing it is the history of.
 *
 * So a drill-down has two shapes. A `single` view is a timeline. A `roster` view is a list
 * of the initiatives the card aggregates, each with its own evidence count, each clickable
 * through to its own `single` view. Collapsing those into one shape would have meant either
 * inventing a merged timeline across twelve unrelated bids, or quietly picking one of them.
 *
 * ── WHY THE TIMELINE READS ONLY THE SPINE ────────────────────────────────────────────────
 *
 * It would be quicker to query Basecamp, email and the proposal tables directly from here
 * and merge the results. That is the design R3 exists to replace: five bespoke queries that
 * each decide for themselves what counts as an event, with no way to unlink a wrong one and
 * no record of who linked it. Everything here reads `evidence_links`, and anything that
 * wants to appear in a timeline earns its place by being linked.
 *
 * The consequence is visible and deliberate: until something populates the spine, these
 * timelines are empty. `govProposalEvidenceBackfill` is the first producer, and it exists
 * precisely so this page has real rows to show rather than a design nobody can check.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { INITIATIVE_DEFINITIONS, InitiativeDefinition } from './revenueInitiatives';
import {
  EvidenceTimeline,
  InitiativeType,
  SpineState,
  getEvidenceCounts,
  getEvidenceTimeline,
} from './evidenceLinkService';

/** A card either resolves to one initiative, or to a list of them. */
export type DrilldownShape = 'single' | 'roster';

export interface RosterEntry {
  initiativeType: InitiativeType;
  initiativeKey: string;
  label: string;
  /** How many live evidence links this one has. */
  evidenceCount: number;
  /** What the row itself shows, so a test row is not silently presented as a deal. */
  flags: string[];
}

export interface Drilldown {
  shape: DrilldownShape;
  /** The card this page is behind. */
  cardKey: string;
  label: string;
  provenance: string;
  owner: string;
  /** Present on a `single` drill-down. */
  timeline: EvidenceTimeline | null;
  /** Present on a `roster` drill-down, ordered by evidence then recency. */
  roster: RosterEntry[] | null;
  /** Whether the spine could be read at all. Mirrors the service's own distinction. */
  spine: SpineState;
  /** Why a view is empty, when it is. Null when there is nothing to explain. */
  note: string | null;
}

export class DrilldownNotFound extends Error {
  readonly error_class = 'NotFoundError';
  constructor(cardKey: string) {
    super(`no Revenue Room card is called "${cardKey}"`);
    this.name = 'DrilldownNotFound';
  }
}

/**
 * The card whose drill-down this is. Resolved from the registry rather than matched on a
 * string pattern, so a card renamed there cannot leave a route resolving to nothing.
 */
function cardFor(cardKey: string): InitiativeDefinition {
  const def = INITIATIVE_DEFINITIONS.find((d) => d.key === cardKey);
  if (!def) throw new DrilldownNotFound(cardKey);
  return def;
}

/**
 * The initiative type a single-initiative card belongs to in the spine's key space.
 *
 * The card registry's `kind` and the spine's `initiative_type` are deliberately separate
 * vocabularies — one describes a card, the other describes what evidence can attach to —
 * so the mapping is explicit here rather than assumed to be the same string.
 */
function spineTypeFor(def: InitiativeDefinition): InitiativeType {
  if (def.kind === 'hypothesis') return 'hypothesis';
  if (def.kind === 'membership') return 'membership';
  return 'gov_bid';
}

interface BidRow {
  delivery_project_id: string;
  project_name: string | null;
  docs: number;
  drafted: number;
  submissions: number;
  assignees: string | null;
  roles: string | null;
  assigned_on: string | null;
  updated: string | null;
}

/** True when the table exists. A missing table is not an empty one. */
async function tableExists(name: string): Promise<boolean> {
  const rows = await sequelize.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = :name`,
    { type: QueryTypes.SELECT, replacements: { name } },
  );
  return (rows[0]?.n ?? 0) > 0;
}

/**
 * The bids that are in motion and assigned right now.
 *
 * ── SCOPED, NOT ANNOTATED ────────────────────────────────────────────────────────────────
 *
 * The first version of this listed all twelve flagged rows and attached warnings: this one
 * looks like a test row, that title appears twice, this one has no documents. Ali corrected
 * it on 2026-11-04 — he wants only the projects in motion and assigned right now. He is
 * right, and not only as a preference: a roster of twelve rows where nine are noise makes
 * the reader do the filtering, and a reader who skims does it wrong.
 *
 * So the filter is now part of the query: approved for pursuit, active, and holding at
 * least one `delivery_project_members` row that has not been revoked. Everything the
 * warnings used to say is handled by the definition instead —
 *
 *   - the "Snow College Adult Learner - T8 test" row has no live assignment;
 *   - of the RFP duplicated under two project ids, only 80b35be2 is assigned;
 *   - Statewide Victim-Centered, which holds the most documents of anything in the system,
 *     has had its membership REVOKED and so is not in motion.
 *
 * The remaining flags describe work, not suspicion: who holds it, since when, how much has
 * been drafted, and whether it has gone out.
 */
async function govRoster(): Promise<{ state: SpineState; entries: RosterEntry[] }> {
  // Both tables are required. Without the membership table an in-motion bid cannot be told
  // from a flagged one, and falling back to the flag count is the behaviour being removed.
  if (!(await tableExists('gov_qualifications'))) return { state: 'absent', entries: [] };
  if (!(await tableExists('delivery_project_members'))) return { state: 'absent', entries: [] };

  const rows = await sequelize.query<BidRow>(
    `SELECT DISTINCT ON (q.delivery_project_id)
            q.delivery_project_id,
            p.name AS project_name,
            COALESCE((SELECT COUNT(*) FROM gov_proposal_documents d
                       WHERE d.delivery_project_id = q.delivery_project_id), 0)::int AS docs,
            COALESCE((SELECT COUNT(*) FROM gov_proposal_documents d
                       WHERE d.delivery_project_id = q.delivery_project_id
                         AND d.drafted_at IS NOT NULL), 0)::int AS drafted,
            COALESCE((SELECT COUNT(*) FROM gov_submission s
                       WHERE s.delivery_project_id = q.delivery_project_id), 0)::int AS submissions,
            (SELECT STRING_AGG(DISTINCT COALESCE(pi.display_name, pi.primary_email, 'unnamed'), ', ')
               FROM delivery_project_members m
               LEFT JOIN platform_identities pi ON pi.id = m.platform_identity_id
              WHERE m.delivery_project_id = q.delivery_project_id
                AND m.revoked_at IS NULL) AS assignees,
            (SELECT STRING_AGG(DISTINCT m.delivery_role, ', ')
               FROM delivery_project_members m
              WHERE m.delivery_project_id = q.delivery_project_id
                AND m.revoked_at IS NULL) AS roles,
            (SELECT MIN(m.granted_at)::date::text
               FROM delivery_project_members m
              WHERE m.delivery_project_id = q.delivery_project_id
                AND m.revoked_at IS NULL) AS assigned_on,
            q.updated_at::date::text AS updated
       FROM gov_qualifications q
       JOIN delivery_projects p ON p.id = q.delivery_project_id
      WHERE q.decision::text = 'approved_bid_pursuit' AND q.status::text = 'active'
        AND EXISTS (SELECT 1 FROM delivery_project_members m
                     WHERE m.delivery_project_id = q.delivery_project_id
                       AND m.revoked_at IS NULL)
      ORDER BY q.delivery_project_id, q.updated_at DESC`,
    { type: QueryTypes.SELECT },
  );

  const { counts } = await getEvidenceCounts().catch(() => ({ counts: {} as Record<string, number> }));

  const entries: RosterEntry[] = rows.map((r) => {
    const flags: string[] = [];
    // Who holds it comes first: it is the reason the bid is on this list at all.
    if (r.assignees) {
      flags.push(`assigned to ${r.assignees}${r.roles ? ` (${r.roles})` : ''}`);
    }
    if (r.assigned_on) flags.push(`since ${r.assigned_on}`);
    if (r.drafted > 0) flags.push(`${r.drafted} of ${r.docs} documents drafted`);
    else if (r.docs > 0) flags.push(`${r.docs} document${r.docs === 1 ? '' : 's'}, none drafted yet`);
    else flags.push('no proposal document yet');
    if (r.submissions === 0) flags.push('not yet submitted');
    return {
      initiativeType: 'gov_bid' as InitiativeType,
      initiativeKey: r.delivery_project_id,
      label: (r.project_name ?? '').trim() || '(unnamed project)',
      evidenceCount: counts[`gov_bid:${r.delivery_project_id}`] ?? 0,
      flags,
    };
  });

  // Most drafted work first, then most evidence: a reader scanning two or three live bids
  // wants the one furthest along at the top.
  entries.sort((a, b) => b.evidenceCount - a.evidenceCount);
  return { state: 'ready', entries };
}

/**
 * The drill-down behind one card, or behind one bid inside the government roster.
 *
 * `cardKey` is a Revenue Room card. `bidKey`, when given, is a `delivery_project_id` from
 * that card's roster, and turns an aggregate into the single initiative inside it.
 */
export async function getDrilldown(cardKey: string, bidKey?: string): Promise<Drilldown> {
  const def = cardFor(cardKey);
  const base = {
    cardKey, label: def.label, provenance: def.provenance, owner: def.owner,
    timeline: null, roster: null, note: null,
  };

  // One bid inside the aggregate: a single view, keyed on the project rather than the card.
  if (bidKey) {
    if (def.kind !== 'gov_pipeline') {
      throw new DrilldownNotFound(`${cardKey} has no roster, so it has no entry "${bidKey}"`);
    }
    const timeline = await getEvidenceTimeline('gov_bid', bidKey);
    return {
      ...base, shape: 'single', timeline, spine: timeline.state,
      label: `${def.label} — ${bidKey}`, note: timeline.note,
    };
  }

  if (def.kind === 'gov_pipeline') {
    const { state, entries } = await govRoster();
    return {
      ...base,
      shape: 'roster',
      roster: entries,
      spine: state,
      note: state === 'absent'
        ? 'Either gov_qualifications or delivery_project_members is missing from this '
          + 'database, so an in-motion bid cannot be told from a merely flagged one. A '
          + 'missing source is not an empty one.'
        : entries.length === 0
          ? 'No bid is in motion. Both tables are present and nothing is both approved for '
            + 'pursuit and currently assigned, so this is a measured zero rather than a gap '
            + 'in what can be seen.'
          : null,
    };
  }

  const timeline = await getEvidenceTimeline(spineTypeFor(def), def.key);
  return { ...base, shape: 'single', timeline, spine: timeline.state, note: timeline.note };
}
