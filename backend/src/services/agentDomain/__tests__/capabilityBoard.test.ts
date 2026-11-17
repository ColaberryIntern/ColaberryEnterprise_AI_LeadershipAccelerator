/**
 * AF11.10 — the five columns, derived from records rather than stored.
 *
 * THE PROPERTY THIS FILE EXISTS FOR is the one the ticket is most insistent about: there is no
 * stage column, so every placement here has to be reproducible from the detail, the package, the
 * decision log, the build events and the grant. A test that asserted a stored `stage` would pass
 * forever and prove nothing.
 *
 * The second property is `unknown`. A board that guesses is worse than no board, because a board
 * is believed. Several cases below exist only to prove the board declines to guess.
 */

import {
  BOARD_COLUMNS,
  ageInWords,
  buildBoard,
  hoursSince,
  placeOnBoard,
  whoIsHolding,
  type BoardInput,
} from '../capabilityBoard';
import { NO_PACKAGE, type PackageReadiness } from '../toolRequestPackageService';

const NOW = new Date('2026-11-17T12:00:00.000Z');
const ALI = 'ali@colaberry.com';
const SARBJIT = 'sarbjit@colaberry.com';
const KES = 'kes@colaberry.com';

const ready: PackageReadiness = {
  has_package: true, ready_for_a_human: true, bounced_blocks: [], bounce_reasons: [],
};
const scoping: PackageReadiness = {
  has_package: true,
  ready_for_a_human: false,
  bounced_blocks: ['problem', 'simulated_action'],
  bounce_reasons: [],
};

function req(over: Partial<BoardInput> = {}): BoardInput {
  return {
    change_request_id: 'cr-1',
    domain_key: 'marketing',
    title: 'Draft a landing page from a brief',
    status: 'submitted',
    requested_by_identity: SARBJIT,
    requested_at: '2026-11-15T12:00:00.000Z',
    readiness: ready,
    decisions: [],
    build_events: [],
    grant: null,
    tried_in_product: 'not_built',
    ...over,
  };
}

const place = (over: Partial<BoardInput> = {}) => placeOnBoard(req(over));

describe('THE CONTROL — the five columns exist and are the five the ticket names', () => {
  it('names them in order', () => {
    expect([...BOARD_COLUMNS]).toEqual([
      'scoping', 'your_desk', 'being_built', 'builder_validates', 'agent_has_it',
    ]);
  });
});

describe('each column is derived from the record that actually gates it', () => {
  it('SCOPING: the package exists and is incomplete', () => {
    // The signal the ticket said column one did not have. It did not come from a new build
    // event: AF11.8 made a request carry a package, and an incomplete one IS somebody scoping.
    expect(place({ readiness: scoping })).toBe('scoping');
  });

  it('YOUR DESK: the package is complete and nothing has been decided', () => {
    expect(place({ readiness: ready, decisions: [] })).toBe('your_desk');
  });

  it('BEING BUILT: a started_build event exists', () => {
    expect(place({
      decisions: [{ verb: 'approve_to_build', decided_at: '2026-11-16T09:00:00Z', decided_by_identity: ALI }],
      build_events: [{ event: 'started_build', occurred_at: '2026-11-16T10:00:00Z', actor_identity: KES }],
    })).toBe('being_built');
  });

  it('BUILDER VALIDATES: handed over', () => {
    expect(place({
      build_events: [
        { event: 'handed_over', occurred_at: '2026-11-17T08:00:00Z', actor_identity: KES },
        { event: 'started_build', occurred_at: '2026-11-16T10:00:00Z', actor_identity: KES },
      ],
    })).toBe('builder_validates');
  });

  it('AGENT HAS IT: a grant row exists, and it beats every earlier record', () => {
    // The records accumulate, so the most settled fact has to be read first or a finished
    // capability sits forever in column two.
    expect(place({
      readiness: ready,
      decisions: [{ verb: 'assign_existing_tool', decided_at: '2026-11-16T09:00:00Z', decided_by_identity: ALI }],
      build_events: [{ event: 'handed_over', occurred_at: '2026-11-17T08:00:00Z', actor_identity: KES }],
      grant: { approved_at: '2026-11-17T09:00:00Z', tool_name: 'draft_landing_page' },
    })).toBe('agent_has_it');
  });

  it('a send-back puts it back in SCOPING, with the builder', () => {
    expect(place({
      readiness: ready,
      decisions: [{ verb: 'send_back', decided_at: '2026-11-16T09:00:00Z', decided_by_identity: ALI }],
    })).toBe('scoping');
  });
});

describe('the board declines to guess, and says unknown instead', () => {
  it('APPROVED TO BUILD AND NOTHING HAPPENED is unknown, not "being built"', () => {
    // This is the state nobody owns, and it is exactly what the board exists to surface. Calling
    // it "being built" would hide a stalled approval behind a reassuring column.
    expect(place({
      decisions: [{ verb: 'approve_to_build', decided_at: '2026-11-16T09:00:00Z', decided_by_identity: ALI }],
      build_events: [],
    })).toBe('unknown');
  });

  it('ASSIGNED BUT NOT GRANTED is unknown, because the grant is the fact that matters', () => {
    // AF11.4 performs the grant after the decision. No grant row means it did not happen, and a
    // board that assumed otherwise would show an agent holding a tool it does not have.
    expect(place({
      decisions: [{ verb: 'assign_existing_tool', decided_at: '2026-11-16T09:00:00Z', decided_by_identity: ALI }],
      grant: null,
    })).toBe('unknown');
  });

  it('a denial and a Nothing both leave the board, rather than sitting in a column', () => {
    for (const verb of ['deny', 'nothing']) {
      expect(place({ decisions: [{ verb, decided_at: '2026-11-16T09:00:00Z', decided_by_identity: ALI }] }))
        .toBe('unknown');
    }
  });

  it('no package, no decision and no event is unknown rather than scoping', () => {
    // "Nothing is recorded" and "somebody is working on it" are different facts, and only one
    // of them is something a reader can act on.
    expect(place({ readiness: null })).toBe('unknown');
  });

  it('a request with NO_PACKAGE readiness is scoping: a package that does not exist is unwritten', () => {
    expect(place({ readiness: NO_PACKAGE })).toBe('scoping');
  });
});

describe('who is holding it, in words rather than a status chip', () => {
  const held = (over: Partial<BoardInput>, viewer = ALI) => {
    const input = req(over);
    return whoIsHolding(input, placeOnBoard(input), NOW, viewer, ALI);
  };

  it('says YOU to the approver when it is on their desk', () => {
    // The ticket's own example: "You · 4 hours".
    const h = held({ readiness: ready });
    expect(h.held_by).toBe('You');
    expect(h.holding_because).toBe('tool request, undecided');
    expect(h.held_hours).toBe(48);
  });

  it('names the approver to anybody else', () => {
    expect(held({ readiness: ready }, SARBJIT).held_by).toBe(ALI);
  });

  it('names the BUILDER while it is being scoped, and how much is outstanding', () => {
    const h = held({ readiness: scoping });
    expect(h.held_by).toBe(SARBJIT);
    expect(h.holding_because).toContain('2 block(s) outstanding');
  });

  it('names who is building it, from the build event rather than the request', () => {
    const h = held({
      build_events: [{ event: 'started_build', occurred_at: '2026-11-17T08:00:00Z', actor_identity: KES }],
    });
    expect(h.held_by).toBe(KES);
    expect(h.held_hours).toBe(4);
  });

  it('says nobody is holding a capability the agent already has', () => {
    const h = held({ grant: { approved_at: '2026-11-17T06:00:00Z', tool_name: 't' } });
    expect(h.held_by).toBe('nobody');
  });

  it('AN UNKNOWN STILL NAMES A PERSON, because an unknown nobody owns is how one sat for days', () => {
    const h = held({
      decisions: [{ verb: 'approve_to_build', decided_at: '2026-11-13T12:00:00Z', decided_by_identity: ALI }],
    });
    expect(h.held_by).toBe(SARBJIT);
    expect(h.holding_because).toContain('nothing happened since');
    expect(h.held_hours).toBe(96);
  });
});

describe('the run count is NOT invented', () => {
  it('reports null, because nothing records how often an agent used a tool it holds', () => {
    // Zero and unknown are different facts. Showing the second as the first would make a working
    // tool look unused, and somebody would act on that.
    const board = buildBoard({
      inputs: [req({ grant: { approved_at: '2026-11-17T06:00:00Z', tool_name: 't' } })],
      now: NOW, viewerEmail: ALI, approverEmail: ALI,
    });
    const card = board.columns.find((c) => c.key === 'agent_has_it')?.cards[0];
    expect(card?.runs).toBeNull();
  });
});

describe('the whole board', () => {
  const many = () => buildBoard({
    inputs: [
      req({ change_request_id: 'a', readiness: scoping }),
      req({ change_request_id: 'b', readiness: ready }),
      req({ change_request_id: 'c', requested_at: '2026-11-10T12:00:00Z', readiness: ready }),
      req({
        change_request_id: 'd',
        build_events: [{ event: 'started_build', occurred_at: '2026-11-16T12:00:00Z', actor_identity: KES }],
      }),
      req({ change_request_id: 'e', grant: { approved_at: '2026-11-17T06:00:00Z', tool_name: 't' } }),
      req({
        change_request_id: 'f',
        decisions: [{ verb: 'approve_to_build', decided_at: '2026-11-13T12:00:00Z', decided_by_identity: ALI }],
      }),
    ],
    now: NOW, viewerEmail: ALI, approverEmail: ALI,
  });

  it('places every card into exactly one column, and surfaces the unknowns', () => {
    const board = many();
    const placed = board.columns.reduce((n, c) => n + c.cards.length, 0);
    expect(placed + board.unknown.length).toBe(6);
    expect(board.unknown.map((c) => c.change_request_id)).toEqual(['f']);
  });

  it('sorts the OLDEST first inside a column, so the thing waiting longest is at the top', () => {
    // A board sorted newest-first buries the four-day-old request under this morning's.
    const desk = many().columns.find((c) => c.key === 'your_desk');
    expect(desk?.cards.map((c) => c.change_request_id)).toEqual(['c', 'b']);
  });

  it('ANSWERS "is anybody waiting on me" as a fact, not as an array length to eyeball', () => {
    // The ticket: an empty column two must be visible in one glance.
    expect(many().nobody_is_waiting_on_you).toBe(false);
    const quiet = buildBoard({
      inputs: [req({ readiness: scoping })], now: NOW, viewerEmail: ALI, approverEmail: ALI,
    });
    expect(quiet.nobody_is_waiting_on_you).toBe(true);
  });

  it('an empty board is quiet rather than broken', () => {
    const empty = buildBoard({ inputs: [], now: NOW, viewerEmail: ALI, approverEmail: ALI });
    expect(empty.nobody_is_waiting_on_you).toBe(true);
    expect(empty.columns).toHaveLength(5);
    expect(empty.unknown).toEqual([]);
  });

  it('every card says WHY it was placed, so an unknown can be investigated', () => {
    for (const card of [...many().columns.flatMap((c) => c.cards), ...many().unknown]) {
      expect(card.placed_because.length).toBeGreaterThan(10);
    }
  });
});

describe('ages, in words a person reads', () => {
  it('counts whole hours from a real time, and null from nothing', () => {
    expect(hoursSince('2026-11-17T08:00:00.000Z', NOW)).toBe(4);
    expect(hoursSince(null, NOW)).toBeNull();
    expect(hoursSince('not a date', NOW)).toBeNull();
  });

  it('never reports a negative age for a record stamped in the future', () => {
    expect(hoursSince('2026-11-18T12:00:00.000Z', NOW)).toBe(0);
  });

  it('reads as the ticket writes it: hours, then days', () => {
    expect(ageInWords(0)).toBe('under an hour');
    expect(ageInWords(1)).toBe('1 hour');
    expect(ageInWords(4)).toBe('4 hours');
    expect(ageInWords(96)).toBe('4 days');
    expect(ageInWords(null)).toBeNull();
  });
});
