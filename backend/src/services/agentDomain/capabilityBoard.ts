/**
 * capabilityBoard — where every capability is, and who is holding it up. PURE, no I/O.
 *
 * AF11.10. Ali, 16 Nov 2026: *"they need to be able to put multiple in the works since there are
 * many steps, we don't want them to have to wait for anything."*
 *
 * Today every capability on every builder's board looks identical, and what it looks like is
 * "ticket open". Nothing distinguishes a builder who is stuck, a builder who is slow, a request
 * waiting on Kes, and a decision nobody knows they own. Kalkidan's change request, the only one
 * ever filed in the programme, has been undecided since 13 Nov for exactly that reason.
 *
 * ## THE STAGE IS DERIVED. THERE IS NO STATUS COLUMN, AND THERE MUST NOT BE ONE
 *
 * Every stage below is already implied by the records that actually gate the work: the detail,
 * the package, the decision log, the build events, the grant. A `stage` column would be a second
 * source of truth about where something is, and **the first time it disagreed with the grant
 * table the board would be lying confidently** — which is worse than no board, because a board
 * is believed.
 *
 * So the rule this module is built on: compute the column from the records, and **where the
 * records cannot answer, say `unknown` rather than guessing**. An unknown is a prompt to go and
 * look. A guess is a wrong answer wearing the same clothes as a right one.
 *
 * ## THE TWO MISSING SIGNALS THE TICKET NAMED, AND WHAT ACTUALLY HAPPENED TO THEM
 *
 * The ticket, measured on 16 Nov: `ToolRequestBuildEventName` is exactly
 * `'started_build' | 'handed_over'`. Two milestones. So column 1 had no signal and column 5 had
 * no run count.
 *
 *   - **Column 1 now HAS a signal, and it did not come from a new build event.** AF11.8 made a
 *     request carry a decision package, and an incomplete package is precisely "somebody is
 *     scoping this". So `scoping` is derived from readiness, and the build-event vocabulary is
 *     untouched. That matters because the ticket's own instruction was *"Do not widen the
 *     build-event vocabulary beyond what the board genuinely needs. Each new event name is a
 *     thing that must then be written correctly forever."*
 *
 *   - **Column 5 still has no run count, and this module does not invent one.** A grant is
 *     recorded; how often the agent has actually used the tool is not. `agent_has_it` therefore
 *     reports the grant and leaves the count `null`, and the board renders that as "not
 *     recorded" rather than as zero. Zero and unknown are different facts, and showing the
 *     second as the first would make a working tool look unused.
 */

import type { PackageReadiness } from './toolRequestPackageService';

/** The five columns, in order. */
export const BOARD_COLUMNS = [
  'scoping',
  'your_desk',
  'being_built',
  'builder_validates',
  'agent_has_it',
] as const;
export type BoardColumn = typeof BOARD_COLUMNS[number];

/**
 * `unknown` is a sixth bucket and deliberately not a column.
 *
 * It is what the board says when the records contradict each other or cannot answer. It is not a
 * stage of the work; it is the board admitting it does not know, which is the only honest
 * alternative to guessing.
 */
export type BoardPlacement = BoardColumn | 'unknown';

/** What the board needs to know about one capability, from records that already exist. */
export interface BoardInput {
  readonly change_request_id: string;
  readonly domain_key: string;
  readonly title: string;
  /** `submitted` | `approved` | `declined` | `withdrawn`. */
  readonly status: string;
  readonly requested_by_identity: string;
  /** When it was filed. Null when the record does not carry one. */
  readonly requested_at: string | null;
  /** AF11.8 readiness. Null for a request that is not a tool request. */
  readonly readiness: PackageReadiness | null;
  /** Has anybody decided it? The decision log, newest first. */
  readonly decisions: ReadonlyArray<{
    readonly verb: string;
    readonly decided_at: string;
    readonly decided_by_identity: string;
  }>;
  /** `started_build` and `handed_over`, newest first. */
  readonly build_events: ReadonlyArray<{
    readonly event: string;
    readonly occurred_at: string;
    readonly actor_identity: string;
  }>;
  /** Has the agent actually been granted the tool? */
  readonly grant: { readonly approved_at: string; readonly tool_name: string } | null;
  /**
   * AF11.7's field, which is how column four knows the builder has confirmed it by hand.
   * Null when the request predates AF11.7 or carries no detail.
   */
  readonly tried_in_product: string | null;
}

/** One card. Everything the board shows about one capability. */
export interface BoardCard {
  readonly change_request_id: string;
  readonly domain_key: string;
  readonly title: string;
  readonly column: BoardPlacement;
  /**
   * WHO IS HOLDING IT, as a name, and WHY, in words rather than a status chip.
   *
   * The ticket is explicit about this: *"Kes · tool request, 2 days". "Sarbjit · not started, 5
   * days". "You · 4 hours".* A chip says what state something is in; this says who has to move.
   */
  readonly held_by: string;
  readonly holding_because: string;
  /** How long they have held it, in whole hours. Null when no record carries a time. */
  readonly held_hours: number | null;
  /**
   * The run count for column five. ALWAYS NULL today, and that is a measured fact rather than an
   * oversight: nothing records how often an agent has used a tool it holds. The board renders
   * null as "not recorded", never as zero.
   */
  readonly runs: number | null;
  /** Why the board placed it here, so an `unknown` can be investigated rather than argued with. */
  readonly placed_because: string;
}

const iso = (v: string | null | undefined): number | null => {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
};

/** Whole hours between then and now, or null when there is no `then`. */
export function hoursSince(then: string | null | undefined, now: Date): number | null {
  const t = iso(then);
  if (t === null) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 3_600_000));
}

/**
 * Where does this capability sit?
 *
 * Read in order, most-settled first, because the records accumulate: a granted capability also
 * has a decision and a build event, and asking "is it granted" before "was it decided" is what
 * keeps a finished thing out of column two.
 */
export function placeOnBoard(input: BoardInput): BoardPlacement {
  // 5. The agent holds it. The most settled fact there is, so it wins over everything.
  if (input.grant) return 'agent_has_it';

  const handedOver = input.build_events.some((e) => e.event === 'handed_over');
  const startedBuild = input.build_events.some((e) => e.event === 'started_build');

  // 4. Handed over and the builder is confirming it by hand.
  if (handedOver) return 'builder_validates';
  // 3. Somebody is building it.
  if (startedBuild) return 'being_built';

  const decided = input.decisions.length > 0;
  if (decided) {
    const last = input.decisions[0];
    // A request that was decided and then went nowhere is NOT "being built" and not "on your
    // desk". Saying unknown here is the point of having an unknown: an approved request with no
    // build event is a real state nobody owns, and it is exactly what this board exists to
    // surface rather than smooth over.
    if (last.verb === 'approve_to_build') return 'unknown';
    // Denied, answered Nothing, or sent back: it is off the board or back with the builder.
    if (last.verb === 'deny' || last.verb === 'nothing') return 'unknown';
    if (last.verb === 'send_back') return 'scoping';
    if (last.verb === 'assign_existing_tool') {
      // The decision was made and AF11.4 performs the grant. No grant row means the grant has
      // not happened, which is a gap worth showing rather than a column to assume.
      return 'unknown';
    }
  }

  // 1 and 2 split on AF11.8 readiness, which is the signal column one did not have.
  if (input.readiness && input.readiness.ready_for_a_human) return 'your_desk';
  if (input.readiness) return 'scoping';

  // No readiness at all: a request that is not a tool request, or one that predates AF11.8.
  return 'unknown';
}

/**
 * Who is holding this up, and for how long.
 *
 * `approverName` is passed in rather than hardcoded so the board can say "You" to Ali and name
 * him to anybody else. One configuration, no second idea of who approves.
 */
export function whoIsHolding(
  input: BoardInput,
  column: BoardPlacement,
  now: Date,
  viewerEmail: string,
  approverEmail: string,
): { held_by: string; holding_because: string; held_hours: number | null } {
  const them = (email: string) => (
    email.toLowerCase() === viewerEmail.toLowerCase() ? 'You' : email
  );
  const lastDecision = input.decisions[0] ?? null;
  const lastEvent = input.build_events[0] ?? null;

  switch (column) {
    case 'scoping':
      return {
        held_by: them(input.requested_by_identity),
        holding_because: input.readiness?.has_package
          ? `scoping, ${input.readiness.bounced_blocks.length} block(s) outstanding`
          : 'not started',
        held_hours: hoursSince(lastDecision?.decided_at ?? input.requested_at, now),
      };
    case 'your_desk':
      return {
        held_by: them(approverEmail),
        holding_because: 'tool request, undecided',
        held_hours: hoursSince(input.requested_at, now),
      };
    case 'being_built':
      return {
        held_by: them(lastEvent?.actor_identity ?? ''),
        holding_because: 'building',
        held_hours: hoursSince(lastEvent?.occurred_at ?? null, now),
      };
    case 'builder_validates':
      return {
        held_by: them(input.requested_by_identity),
        holding_because: input.tried_in_product === 'used_by_hand'
          ? 'confirmed by hand, waiting on the grant'
          : 'handed over, confirming it by hand',
        held_hours: hoursSince(lastEvent?.occurred_at ?? null, now),
      };
    case 'agent_has_it':
      return {
        held_by: 'nobody',
        holding_because: 'the agent holds the tool',
        held_hours: hoursSince(input.grant?.approved_at ?? null, now),
      };
    default:
      // UNKNOWN NAMES A PERSON ANYWAY, because an unknown nobody owns is how Kalkidan's request
      // sat for four days. The requester is the one who can chase it.
      return {
        held_by: them(input.requested_by_identity),
        holding_because: lastDecision
          ? `decided "${lastDecision.verb}" and nothing happened since`
          : 'no record says where this is',
        held_hours: hoursSince(lastDecision?.decided_at ?? input.requested_at, now),
      };
  }
}

/** Why the board placed a card where it did, so an unknown can be investigated. */
function because(input: BoardInput, column: BoardPlacement): string {
  if (column === 'agent_has_it') return 'a grant row exists';
  if (column === 'builder_validates') return 'a handed_over build event exists';
  if (column === 'being_built') return 'a started_build build event exists';
  if (column === 'your_desk') return 'the package is complete and nothing has been decided';
  if (column === 'scoping') {
    return input.decisions[0]?.verb === 'send_back'
      ? 'it was sent back for detail'
      : 'the decision package is not complete yet';
  }
  const last = input.decisions[0];
  if (last) return `the last decision was "${last.verb}" and no build event or grant followed`;
  return 'no package, no decision and no build event: nothing says where this is';
}

export interface BuildBoardArgs {
  readonly inputs: ReadonlyArray<BoardInput>;
  readonly now: Date;
  /** Who is looking, so the board can say "You". */
  readonly viewerEmail: string;
  /** Who settles a tool request. Configuration, never a literal. */
  readonly approverEmail: string;
}

export interface Board {
  readonly columns: ReadonlyArray<{
    readonly key: BoardPlacement;
    readonly cards: ReadonlyArray<BoardCard>;
  }>;
  /** Cards the records could not place. Surfaced, never hidden. */
  readonly unknown: ReadonlyArray<BoardCard>;
  /**
   * TRUE when nothing is waiting on the approver.
   *
   * The ticket: *"An empty column two means nobody is waiting on Ali, and that must be visible
   * in one glance."* Computed here rather than left to the page to infer from an array length,
   * so the sentence the page shows cannot drift from the cards it shows.
   */
  readonly nobody_is_waiting_on_you: boolean;
}

/** Build the whole board. Pure: same inputs, same board. */
export function buildBoard(args: BuildBoardArgs): Board {
  const cards: BoardCard[] = args.inputs.map((input) => {
    const column = placeOnBoard(input);
    const held = whoIsHolding(input, column, args.now, args.viewerEmail, args.approverEmail);
    return {
      change_request_id: input.change_request_id,
      domain_key: input.domain_key,
      title: input.title,
      column,
      held_by: held.held_by,
      holding_because: held.holding_because,
      held_hours: held.held_hours,
      // Measured: nothing records how often an agent has used a tool it holds.
      runs: null,
      placed_because: because(input, column),
    };
  });

  // Oldest first inside every column: the thing that has been waiting longest is the thing worth
  // looking at, and a board sorted by filing date buries it under whatever arrived this morning.
  const byAge = (a: BoardCard, b: BoardCard) => (b.held_hours ?? -1) - (a.held_hours ?? -1);

  return {
    columns: BOARD_COLUMNS.map((key) => ({
      key,
      cards: cards.filter((c) => c.column === key).sort(byAge),
    })),
    unknown: cards.filter((c) => c.column === 'unknown').sort(byAge),
    nobody_is_waiting_on_you: cards.every((c) => c.column !== 'your_desk'),
  };
}

/** "2 days", "4 hours", or null when nothing records a time. */
export function ageInWords(hours: number | null): string | null {
  if (hours === null) return null;
  if (hours < 1) return 'under an hour';
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`;
  return `${Math.floor(hours / 24)} days`;
}
