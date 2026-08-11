/**
 * leadSourceGroups — the map from raw `leads.source` strings to the websites a
 * human would recognise.
 *
 * `leads.source` is free text written by whatever wired each intake point, and
 * it has drifted badly: 20 distinct values for ~8 real origins, including three
 * spellings of training.colaberry.com and three leftover test rows. A sales rep
 * filtering on the raw column sees noise, so every surface that offers a
 * "Website" filter resolves through here instead.
 *
 * This is a presentation grouping, NOT an access boundary. It decides what a
 * dropdown says; `requireSalesOrAdmin` decides who may read the rows.
 *
 * Adding a new intake point: register it in the `lead_sources` table (that is
 * what the ingest endpoints authenticate against) AND add its raw source string
 * here, or its leads land in the catch-all "Other" bucket. `UNGROUPED_KEY`
 * exists precisely so nothing is ever silently dropped from a filtered view.
 */

export type LeadSourceGroupKind = 'website' | 'event' | 'list' | 'internal' | 'test';

export interface LeadSourceGroup {
  key: string;
  label: string;
  /** Shown under the label so "Colaberry" vs "Colaberry alumni" is unambiguous. */
  domain?: string;
  kind: LeadSourceGroupKind;
  /** Raw `leads.source` values that roll up into this group. */
  sources: string[];
}

export const UNGROUPED_KEY = 'other';

/**
 * Ordered for the dropdown: live websites first (what reps work daily), then
 * events, then bulk lists, then internal/test at the bottom.
 */
export const LEAD_SOURCE_GROUPS: LeadSourceGroup[] = [
  {
    key: 'colaberry_ai',
    label: 'Colaberry',
    domain: 'colaberry.ai',
    kind: 'website',
    // 'website' carries the enterprise briefing + inquiry forms, which are
    // colaberry.ai surfaces; it predates the per-site source convention.
    sources: ['colaberry', 'website'],
  },
  {
    key: 'worldoftaxonomy',
    label: 'World of Taxonomy',
    domain: 'worldoftaxonomy.com',
    kind: 'website',
    sources: ['worldoftaxonomy'],
  },
  {
    key: 'trustbeforeintelligence',
    label: 'Trust Before Intelligence',
    domain: 'trustbeforeintelligence.ai',
    kind: 'website',
    sources: ['trustbeforeintelligence'],
  },
  {
    key: 'training_colaberry',
    label: 'Training site',
    domain: 'training.colaberry.com',
    kind: 'website',
    // Three spellings of the same site, plus the on-page popup form.
    sources: ['training.colaberry.com', 'training.colaberry.com/thank-you', 'popup'],
  },
  {
    key: 'advisor',
    label: 'AI Workforce Designer',
    domain: 'advisor.colaberry.ai',
    kind: 'website',
    sources: ['advisory'],
  },
  {
    key: 'open_house',
    label: 'Open House',
    kind: 'event',
    sources: ['open_house'],
  },
  {
    key: 'ai_pilot',
    label: 'AI Pilot campaign',
    kind: 'list',
    sources: ['ai-pilot', 'ai-pilot-cold'],
  },
  {
    key: 'apollo',
    label: 'Apollo (cold list)',
    kind: 'list',
    // 'apollo'          - the 2,102 the scheduled agents imported Mar-Jul 2026
    //                     before they were switched off on 2026-07-10.
    // 'apollo_contacts' - contacts pulled from the saved contacts already in
    //                     our Apollo account (apolloContactImport). Separate
    //                     string so the two intakes stay tellable apart.
    sources: ['apollo', 'apollo_contacts'],
  },
  {
    key: 'alumni',
    label: 'Colaberry alumni',
    domain: 'from the school database, not a website',
    kind: 'internal',
    sources: ['ccpp_winback', 'ccpp_alumni', 'alumni'],
  },
  {
    key: 'test',
    label: 'Test data',
    kind: 'test',
    sources: ['manual_test', 'campaign_test', 'training.colaberry.com-smoke'],
  },
];

/** Lowercased raw source -> group key, built once. */
const SOURCE_TO_GROUP: ReadonlyMap<string, string> = new Map(
  LEAD_SOURCE_GROUPS.flatMap((g) => g.sources.map((s) => [s.toLowerCase(), g.key] as const))
);

/**
 * The group a raw source belongs to. Anything unrecognised (including null,
 * from rows written before `source` was populated) lands in 'other' rather
 * than disappearing.
 */
export function groupForSource(source: string | null | undefined): string {
  if (!source) return UNGROUPED_KEY;
  return SOURCE_TO_GROUP.get(source.trim().toLowerCase()) ?? UNGROUPED_KEY;
}

/**
 * The raw `leads.source` values a group covers, for building a WHERE clause.
 * Returns null for 'other', which cannot be expressed as an IN list — callers
 * must express it as NOT IN (every known source) instead. Returns an empty
 * array for an unknown key so a bad filter matches nothing rather than
 * silently matching everything.
 */
export function sourcesForGroup(key: string): string[] | null {
  if (key === UNGROUPED_KEY) return null;
  return LEAD_SOURCE_GROUPS.find((g) => g.key === key)?.sources ?? [];
}

/** Every raw source string this module knows about. */
export function allKnownSources(): string[] {
  return LEAD_SOURCE_GROUPS.flatMap((g) => g.sources);
}

/**
 * Work-order priority by origin kind. Lower sorts first.
 *
 * Ali's rule (2026-08-11): someone who filled in a form on one of our sites is
 * worth more than a name pulled off a bought list, so website and event leads
 * outrank pulled lists no matter how recent the list is. Within a tier the
 * usual recency sort still applies.
 */
export const ORIGIN_PRIORITY: Record<LeadSourceGroupKind, number> = {
  website: 1,
  event: 2,
  list: 3,
  internal: 4,
  test: 9,
};

/** Priority tier for a raw source. Unknown sources sort just after pulled lists. */
export function priorityForSource(source: string | null | undefined): number {
  const key = groupForSource(source);
  const group = LEAD_SOURCE_GROUPS.find((g) => g.key === key);
  return group ? ORIGIN_PRIORITY[group.kind] : 5;
}

/**
 * `source -> tier` pairs for building a SQL CASE, so the database does the
 * ordering rather than us paginating in memory. Sources sharing a tier are
 * emitted together by the caller.
 */
export function sourcePriorityPairs(): Array<{ source: string; tier: number }> {
  return LEAD_SOURCE_GROUPS.flatMap((g) =>
    g.sources.map((source) => ({ source, tier: ORIGIN_PRIORITY[g.kind] }))
  );
}

/** Public shape of a group, without the raw plumbing the UI does not need. */
export interface LeadSourceGroupSummary {
  key: string;
  label: string;
  domain?: string;
  kind: LeadSourceGroupKind;
  count: number;
}
