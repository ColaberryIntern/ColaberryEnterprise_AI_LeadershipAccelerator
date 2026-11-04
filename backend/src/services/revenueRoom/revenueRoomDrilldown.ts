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
  submissions: number;
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
 * The bids the government card aggregates, with what each row itself shows.
 *
 * The flags are derived from the row, never from a judgment about the opportunity. A bid
 * with no delivery project cannot be named or priced; a title appearing twice is a
 * duplicate pair; a title containing "test" is almost certainly a test row. Each of those
 * was really present in the flagged set on 2026-11-03, and a page that showed twelve
 * identical-looking rows would have presented a test row to Ram as pipeline.
 */
async function govRoster(): Promise<{ state: SpineState; entries: RosterEntry[] }> {
  if (!(await tableExists('gov_qualifications'))) return { state: 'absent', entries: [] };

  const rows = await sequelize.query<BidRow>(
    `SELECT q.delivery_project_id,
            p.name AS project_name,
            COALESCE((SELECT COUNT(*) FROM gov_proposal_documents d
                       WHERE d.delivery_project_id = q.delivery_project_id), 0)::int AS docs,
            COALESCE((SELECT COUNT(*) FROM gov_submission s
                       WHERE s.delivery_project_id = q.delivery_project_id), 0)::int AS submissions,
            q.updated_at::date::text AS updated
       FROM gov_qualifications q
       LEFT JOIN delivery_projects p ON p.id = q.delivery_project_id
      WHERE q.decision::text = 'approved_bid_pursuit' AND q.status::text = 'active'
        AND q.delivery_project_id IS NOT NULL
      ORDER BY q.updated_at DESC`,
    { type: QueryTypes.SELECT },
  );

  // Count titles so a duplicated RFP is flagged on BOTH of its rows rather than neither.
  const titleCounts = new Map<string, number>();
  for (const r of rows) {
    const t = (r.project_name ?? '').trim().toLowerCase();
    if (t) titleCounts.set(t, (titleCounts.get(t) ?? 0) + 1);
  }

  const { counts } = await getEvidenceCounts().catch(() => ({ counts: {} as Record<string, number> }));

  const entries: RosterEntry[] = rows.map((r) => {
    const title = (r.project_name ?? '').trim();
    const flags: string[] = [];
    if (/\btest\b/i.test(title)) flags.push('looks like a test row');
    if (title && (titleCounts.get(title.toLowerCase()) ?? 0) > 1) flags.push('duplicate title');
    if (r.docs > 0) flags.push(`${r.docs} proposal document${r.docs === 1 ? '' : 's'}`);
    else flags.push('no proposal document');
    if (r.submissions === 0) flags.push('never submitted');
    return {
      initiativeType: 'gov_bid' as InitiativeType,
      initiativeKey: r.delivery_project_id,
      label: title || '(unnamed project)',
      evidenceCount: counts[`gov_bid:${r.delivery_project_id}`] ?? 0,
      flags,
    };
  });

  // Most evidence first: a reader scanning this wants the real pursuits at the top, and
  // "has documents" is the only signal in the data that distinguishes them.
  entries.sort((a, b) => b.evidenceCount - a.evidenceCount || b.flags.length - a.flags.length);
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
        ? 'gov_qualifications is not present in this database, so the bids behind this card '
          + 'cannot be listed. A missing source is not an empty one.'
        : entries.length === 0
          ? 'No bid carries the pursuit flag. The table is present and the filter matches '
            + 'nothing, so this is a measured zero.'
          : null,
    };
  }

  const timeline = await getEvidenceTimeline(spineTypeFor(def), def.key);
  return { ...base, shape: 'single', timeline, spine: timeline.state, note: timeline.note };
}
