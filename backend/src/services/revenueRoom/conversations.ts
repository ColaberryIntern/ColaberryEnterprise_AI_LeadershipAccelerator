/**
 * R7 — conversations in progress, and how thin they are.
 *
 * Ali's ask, as the ticket records it: *"try to map in current events like meetings and in
 * talks with. A deal in conversation is the most current signal there is and today it is
 * invisible to every surface."*
 *
 * ── WHAT THE MEASUREMENT FOUND, 2026-11-27 ───────────────────────────────────────
 *
 * The ticket warned: "Expect this surface to be sparse and do not let sparse render as
 * healthy." What production actually holds:
 *
 *   booked_meeting   9 rows, last 2026-04-28,  0 inside the board's 180-day window
 *   answered        22 rows, last 2026-04-13,  0 inside the window
 *   replied         25 rows, last 2026-07-29,  6 inside the window
 *   appointments     0 rows, the table has never been written to
 *   strategy_calls  10 rows: 7 no-show, 2 cancelled, 1 completed, nothing since 2026-04-28
 *
 * Read that bottom-up rather than top-down. The MEETING pipeline is dead: nobody has
 * booked one or answered a call in over seven months. The REPLY channel is not dead: six
 * people wrote back inside the window. So `dormant` computes as FALSE against this data,
 * and the live card says "6 conversations inside the last 180 days".
 *
 * An earlier version of this comment called the whole surface DORMANT. It is not, and the
 * distinction is the useful half of the finding: people still write back, and nobody is
 * turning that into a meeting. The dormancy path below is real and tested; production
 * simply does not trigger it today, and will the moment the replies stop too.
 *
 * What the card must still refuse is the comfortable reading of the same rows. "9 meetings
 * booked" is true and would be heard as a pipeline with activity in it, which is the exact
 * failure the ticket named. Hence a headline built from what falls inside the window,
 * never from the lifetime totals.
 *
 * ── AND A THIRD OF THE HISTORY IS TEST DATA ──────────────────────────────────────────────
 *
 * Three of the nine booked meetings are test rows: "Ali Muwwakkil (Test)" at "Colaberry Test
 * Corp", and "Test User" at "Test" twice. Counting them would overstate a number that is
 * already small enough to quote in a meeting. They are FLAGGED rather than dropped, the same
 * treatment `govBidFlow` gives the "Snow College Adult Learner - T8 test" row: a reader who
 * cannot see the test row cannot tell that the cleanup is outstanding.
 *
 * ── "HELD" IS NOT SPARSE, IT IS UNRECORDED ───────────────────────────────────────────────
 *
 * The ticket asks for a meeting booked and a meeting held to be distinguished, "because the
 * funnel already distinguishes them". It does, and it is emphatic: `funnelStages.ts` defines
 * `meeting_booked` as "A meeting with the account is on a calendar. Booked, not yet held", and
 * records that nothing in the system holds any claim that a meeting took place.
 *
 * So "held" is reported as NOT RECORDED, never as zero. Zero would say the meetings were
 * booked and nobody turned up; the truth is that nothing writes the outcome either way.
 */

/** What this module can read. Narrow on purpose, so the rules below stay pure. */
export interface ConversationRow {
  id: string;
  /** `booked_meeting`, `answered` or `replied`. */
  outcome: string;
  leadId: number | null;
  name: string | null;
  company: string | null;
  /** ISO day. */
  at: string;
}

export interface ConversationEntry {
  id: string;
  kind: 'meeting_booked' | 'answered' | 'replied';
  label: string;
  /** The person, as recorded. Null when the row does not resolve to a lead. */
  name: string | null;
  /**
   * The lead the row points at, carried so the name can open that person's 360.
   *
   * Ali, 2026-09-09: "Everytime we are on the admin side of the app and you see a
   * lead/student/person's name, then clicking on them should take you to the 360 dashboard."
   * Null when `interaction_outcomes.lead_id` is null, and the name then renders as text rather
   * than as a link that would 404.
   */
  leadId: number | null;
  company: string | null;
  at: string;
  /** Why this row should not be counted at face value. Empty when nothing is wrong with it. */
  suspectReasons: string[];
}

export interface ConversationTier {
  key: string;
  label: string;
  /** Rows of this kind, newest first. */
  entries: ConversationEntry[];
  /** How many of them tripped a suspect check. */
  suspectCount: number;
  definition: string;
}

export interface ConversationsView {
  /** The thing a reader must see first: how long since anything happened. */
  headline: string;
  /** ISO day of the most recent conversation of any kind, or null when there has never been one. */
  lastAt: string | null;
  daysSince: number | null;
  /** True when nothing at all falls inside the board's window. */
  dormant: boolean;
  tiers: ConversationTier[];
  /** Instruments that exist and hold nothing, named so their silence is not mistaken for absence. */
  silentSources: Array<{ label: string; detail: string }>;
  /** Why no meeting can be shown as HELD. */
  heldNote: string;
  provenance: string;
}

const KIND_LABEL: Record<ConversationEntry['kind'], string> = {
  meeting_booked: 'Meeting booked',
  answered: 'Call answered',
  replied: 'Replied',
};

/**
 * Flags derived from the row itself, never from a judgment about the person.
 *
 * Each pattern below was really present on 2026-11-25, which is why they are computed rather
 * than assumed absent. A test row counted as a booked meeting is the same defect as a test bid
 * counted as pipeline.
 */
export function suspectReasons(row: ConversationRow): string[] {
  const out: string[] = [];
  const name = (row.name ?? '').trim();
  const company = (row.company ?? '').trim();

  if (/\btest\b/i.test(name)) out.push('the lead is named as a test');
  if (/\btest\b/i.test(company)) out.push('the company is named as a test');
  if (!name) out.push('no name is recorded against the lead');

  return out;
}

/** Day precision, matching every other dated surface on this board. */
const day = (iso: string): string => String(iso).slice(0, 10);

/**
 * Build the view.
 *
 * Pure: every row is passed in, so the dormancy sentence and the suspect flags are testable
 * without a database and the same function serves a run where nothing has ever been recorded.
 *
 * `windowDays` is the board's own window, so this card agrees with the timeline beside it
 * about what "recent" means rather than inventing a second definition.
 */
export function buildConversations(
  rows: ConversationRow[],
  opts: {
    now: Date;
    windowDays: number;
    appointmentsRows: number;
    strategyCalls: Array<{ status: string; rows: number; latest: string | null }>;
  },
): ConversationsView {
  const nowIso = day(opts.now.toISOString());
  const entries: ConversationEntry[] = rows
    .map((r) => ({
      id: r.id,
      kind: (r.outcome === 'booked_meeting' ? 'meeting_booked' : r.outcome) as ConversationEntry['kind'],
      label: KIND_LABEL[(r.outcome === 'booked_meeting' ? 'meeting_booked' : r.outcome) as ConversationEntry['kind']]
        ?? r.outcome,
      name: r.name,
      leadId: r.leadId,
      company: r.company,
      at: day(r.at),
      suspectReasons: suspectReasons(r),
    }))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id.localeCompare(b.id)));

  const lastAt = entries.length ? entries[0].at : null;
  const daysSince = lastAt
    ? Math.max(0, Math.round(
      (Date.parse(`${nowIso}T00:00:00Z`) - Date.parse(`${lastAt}T00:00:00Z`)) / 86_400_000,
    ))
    : null;
  const inWindow = entries.filter(
    (e) => daysSinceOf(e.at, nowIso) <= opts.windowDays,
  ).length;
  const dormant = inWindow === 0;

  const tiers: ConversationTier[] = (['meeting_booked', 'answered', 'replied'] as const).map((kind) => {
    const of = entries.filter((e) => e.kind === kind);
    return {
      key: kind,
      label: KIND_LABEL[kind],
      entries: of,
      suspectCount: of.filter((e) => e.suspectReasons.length > 0).length,
      definition: DEFINITION[kind],
    };
  });

  return {
    headline: headlineFor(entries.length, inWindow, lastAt, daysSince, opts.windowDays),
    lastAt,
    daysSince,
    dormant,
    tiers,
    silentSources: silentSources(opts.appointmentsRows, opts.strategyCalls),
    heldNote:
      'No meeting can be shown as HELD, and that is a gap in the writer rather than in the '
      + 'meetings. The funnel defines a booked meeting as "booked, not yet held" and records '
      + 'that nothing in this system holds any claim that a meeting took place. Showing zero '
      + 'held would say the meetings were booked and nobody came.',
    provenance:
      'interaction_outcomes joined to leads for the name. Only outcomes a human had to '
      + 'produce are counted here: a booked meeting, an answered call and a reply. An open is '
      + 'fired by a tracking pixel and is not a conversation.',
  };
}

function daysSinceOf(at: string, nowIso: string): number {
  return Math.max(0, Math.round(
    (Date.parse(`${nowIso}T00:00:00Z`) - Date.parse(`${at}T00:00:00Z`)) / 86_400_000,
  ));
}

const DEFINITION: Record<ConversationEntry['kind'], string> = {
  meeting_booked:
    "interaction_outcomes.outcome = 'booked_meeting'. A meeting is on a calendar. Booked, "
    + 'not yet held.',
  answered:
    "interaction_outcomes.outcome = 'answered'. Somebody picked up. It says nothing about "
    + 'what was discussed.',
  replied:
    "interaction_outcomes.outcome = 'replied'. A human wrote something back, which is the "
    + 'weakest of the three and still a person choosing to respond.',
};

/**
 * The sentence at the top, chosen by what was measured.
 *
 * Dormancy leads, because the ticket's whole warning is that this surface must not render as
 * healthy. "9 meetings booked" is true and would be read as activity; "nothing in seven
 * months" is the same data and the actual finding.
 */
function headlineFor(
  total: number,
  inWindow: number,
  lastAt: string | null,
  daysSince: number | null,
  windowDays: number,
): string {
  if (total === 0) {
    return 'No conversation of any kind has ever been recorded. Not a booked meeting, not an '
      + 'answered call, not a reply. That is an empty instrument, not a quiet quarter.';
  }
  if (inWindow === 0) {
    return `Nothing in ${windowDays} days. The last conversation of any kind was recorded on `
      + `${lastAt}, ${daysSince} days ago, so every entry below sits outside the window this `
      + 'board reports on. The pipeline of conversations is dormant.';
  }
  return `${inWindow} conversation${inWindow === 1 ? '' : 's'} inside the last ${windowDays} `
    + `days. The most recent was ${lastAt}, ${daysSince} days ago.`;
}

/**
 * Instruments that exist and hold nothing.
 *
 * Named rather than omitted: a reader who does not know the appointments table exists cannot
 * tell the difference between "we do not track that" and "we track it and it is empty", and
 * those lead to opposite actions.
 */
function silentSources(
  appointmentsRows: number,
  strategyCalls: Array<{ status: string; rows: number; latest: string | null }>,
): Array<{ label: string; detail: string }> {
  const out: Array<{ label: string; detail: string }> = [];

  out.push({
    label: 'appointments',
    detail: appointmentsRows === 0
      ? 'The table exists and has never been written to. Zero rows, so no appointment has '
        + 'ever been recorded through it.'
      : `${appointmentsRows} row(s), which this card does not yet read.`,
  });

  const total = strategyCalls.reduce((a, s) => a + s.rows, 0);
  if (total === 0) {
    out.push({ label: 'strategy_calls', detail: 'No strategy call has ever been recorded.' });
  } else {
    const parts = strategyCalls
      .slice()
      .sort((a, b) => b.rows - a.rows)
      .map((s) => `${s.rows} ${s.status}`);
    const latest = strategyCalls
      .map((s) => s.latest)
      .filter((x): x is string => Boolean(x))
      .sort()
      .pop();
    out.push({
      label: 'strategy_calls',
      detail: `${total} in total: ${parts.join(', ')}`
        + `${latest ? `. Nothing since ${latest}.` : '.'}`,
    });
  }

  return out;
}
