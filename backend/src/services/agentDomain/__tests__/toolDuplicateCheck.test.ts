import { TOOL_CAPABILITIES } from '../../reese/agentToolCapabilities';
import {
  COMMON_TOKEN_SHARE,
  DEFAULT_THRESHOLD,
  FIELD_WEIGHTS,
  checkForDuplicateTool,
  type CatalogTool,
  type DuplicateCheckRequest,
} from '../toolDuplicateCheck';

/**
 * AF11.2 — "do we already have a tool that does this?", proved against the REAL catalog.
 *
 * ## The catalog here is not a fixture, and that is the whole reason this file is shaped this way
 *
 * The ticket is explicit: *"Read the 47 tools as the catalog actually returns them rather than as a
 * fixture, since the fixture would be built by the code under test and would match by
 * construction."*
 *
 * So `CATALOG` below is `TOOL_CAPABILITIES` — the shipped tool chest, written for the Agent Detail
 * page in August 2026, maintained by people who have never heard of this matcher — plus the four
 * names measured in production that the dictionary does not document. Nothing in it was authored
 * for this test, and no entry was adjusted to make a test pass. The planted requests below are the
 * only thing this file writes, which is the correct side of the comparison to control.
 *
 * ## Measured in production on 2026-11-04, and the ticket's own figures are stale
 *
 * `buildToolCatalog()` returns **57** tools, not the 47 the ticket states. 53 are documented in
 * `TOOL_CAPABILITIES`; three more (`assignHandoff`, `materializeHandoffs`, `rankQueue`) appear only
 * in some agent's `tools_granted`; and `read_attachments` appears in neither, reaching the catalog
 * through Reese's and Dara's compiled handler arrays. All four carry no `reads` and no `produces`,
 * so they are matchable by NAME only. `toolCatalogForMatching.ts` reproduces exactly these 57.
 *
 * ## PLANTED FIRST, CLEAN RESULT SECOND
 *
 * *"Plant near-duplicates and prove the matcher finds them BEFORE trusting any clean result."* The
 * planted block runs first in this file for that reason. A matcher that finds nothing is
 * indistinguishable from a matcher that is broken, so the negative controls further down are only
 * meaningful because the positives above them pass.
 *
 * ## The real scores, so the threshold is a measurement rather than a preference
 *
 * | Planted request | Target | Score | Best non-target |
 * |---|---|---|---|
 * | `curriculum_integrity_scanner` | `scan_curriculum_integrity` | 0.5305 | 0.0565 |
 * | `check_broken_curriculum_videos` | `monitor_curriculum_video_health` | 0.4965 | 0.0642 |
 * | `fetch_attachments` | `read_attachments` | 0.4000 | 0.0436 |
 * | `text_the_visitor_a_recap` | `send_sms_summary` | 0.4366 | 0.1864 |
 * | `reconcile_payroll_deductions` | NOTHING | — | 0.0717 |
 * | `estimate_run_cost` | NOTHING | — | 0.0438 |
 * | `allocate_classroom_seats` | NOTHING | — | 0.0571 |
 *
 * True positives land between 0.40 and 0.53. The highest score anything else reached, across all
 * seven requests, is 0.1864. `DEFAULT_THRESHOLD` of 0.2 sits in that gap: twice below the weakest
 * true positive, and just above the strongest near miss. The margin on the upper side is thin on
 * purpose and is recorded here rather than smoothed over, so the next person to move a weight can
 * see how much room there is.
 */

/** Measured 2026-11-04. Documented nowhere, so they arrive name-only. */
const BEHAVIORLESS = ['assignHandoff', 'materializeHandoffs', 'rankQueue', 'read_attachments'];

const CATALOG: CatalogTool[] = [
  ...Object.entries(TOOL_CAPABILITIES).map(([tool_name, c]) => ({
    tool_name,
    reads: c.reads,
    produces: c.produces,
  })),
  ...BEHAVIORLESS.map((tool_name) => ({ tool_name, reads: [], produces: [] })),
];

const check = (request: DuplicateCheckRequest, over: Partial<{ threshold: number; maxCandidates: number }> = {}) =>
  checkForDuplicateTool({ request, catalog: CATALOG, ...over });

const names = (request: DuplicateCheckRequest) => check(request).candidates.map((c) => c.tool_name);

// --- the planted near-duplicates, each a restatement of a REAL catalog entry -----------------

/** Restates `scan_curriculum_integrity`: same tables walked, same findings list produced. */
const RESTATES_INTEGRITY_SCAN: DuplicateCheckRequest = {
  tool_name: 'curriculum_integrity_scanner',
  purpose: 'Walk every curriculum module and lesson and report integrity findings with a severity and a location',
  reads: ['curriculum_modules, curriculum_lessons, artifact_definitions and mini_sections'],
  produces: ['A structured findings list with severity, location and description'],
};

/** Restates `monitor_curriculum_video_health` under a name sharing none of its words but one. */
const RESTATES_VIDEO_HEALTH: DuplicateCheckRequest = {
  tool_name: 'check_broken_curriculum_videos',
  purpose: 'Check curriculum video links are still playable and alert when one is broken',
  reads: ['Curriculum video links checked against the YouTube Data API'],
  produces: ['An alert row when a video is broken'],
};

/** Hits `read_attachments`, which has NO behavior text: name only, through the verb synonym. */
const VERB_ALIAS_OF_READ_ATTACHMENTS: DuplicateCheckRequest = {
  tool_name: 'fetch_attachments',
  purpose: 'Open the files somebody attached so the agent can quote them',
  reads: ['Files attached to the conversation'],
  produces: [],
};

/** Restates `send_sms_summary` with a name that shares nothing at all with it. */
const RESTATES_SMS_SUMMARY: DuplicateCheckRequest = {
  tool_name: 'text_the_visitor_a_recap',
  purpose: 'Send the visitor an SMS summarising the conversation',
  reads: ['The visitor conversation history and their confirmed phone number'],
  produces: ['A real SMS to the visitor via GoHighLevel'],
};

// --- the negative controls --------------------------------------------------------------------

/** Far field. Nothing in this platform's catalog touches payroll. */
const NOVEL_PAYROLL: DuplicateCheckRequest = {
  tool_name: 'reconcile_payroll_deductions',
  purpose: 'Compare each employee payroll deduction against the benefit elections on file and report mismatches',
  reads: ['Payroll deduction lines', 'Benefit election records'],
  produces: ['A mismatch report per employee'],
};

/**
 * Near field, and the harder control: it is ABOUT agents and runs, which is what the catalog is
 * made of, while asking a question no tool asks. A matcher that leans on common vocabulary fails
 * here and passes the far-field one.
 */
const NOVEL_RUN_COST: DuplicateCheckRequest = {
  tool_name: 'estimate_run_cost',
  purpose: 'Work out the dollar cost of each run from its token usage and total it by month',
  reads: ['Token usage recorded per run'],
  produces: ['A cost figure per run and a monthly total'],
};

/** Near field in the other direction: about learners, but about furniture. */
const NOVEL_CLASSROOM_SEATS: DuplicateCheckRequest = {
  tool_name: 'allocate_classroom_seats',
  purpose: 'Allocate a physical desk in the Plano classroom to each person attending in person',
  reads: ['Desk inventory for the Plano office'],
  produces: ['A desk allocation per attendee'],
};

describe('PLANTED near-duplicates are found, which is what makes a clean result mean anything', () => {
  it('surfaces the tool whose purpose a request restates, in the top three', () => {
    // The ticket's first acceptance criterion, word for word, against the real catalog.
    expect(names(RESTATES_INTEGRITY_SCAN).slice(0, 3)).toContain('scan_curriculum_integrity');
  });

  it('ranks that tool FIRST, not merely somewhere in the three', () => {
    expect(names(RESTATES_INTEGRITY_SCAN)[0]).toBe('scan_curriculum_integrity');
  });

  it('finds a restatement whose NAME shares almost nothing with the tool it duplicates', () => {
    // `check_broken_curriculum_videos` against `monitor_curriculum_video_health`. If the name were
    // doing all the work this would miss, so this is the test that proves the behavior fields are
    // load-bearing rather than decorative.
    expect(names(RESTATES_VIDEO_HEALTH)[0]).toBe('monitor_curriculum_video_health');
  });

  it('finds a restatement whose name shares NOTHING with the tool it duplicates', () => {
    // `text_the_visitor_a_recap` and `send_sms_summary` have no word in common whatsoever.
    expect(names(RESTATES_SMS_SUMMARY)[0]).toBe('send_sms_summary');
  });

  it('finds a tool that has NO behavior text, through the leading-verb synonym alone', () => {
    // `read_attachments` is documented nowhere, so `reads` and `produces` are empty and the only
    // comparable thing it has is its name. `fetch` folds onto `read`.
    expect(names(VERB_ALIAS_OF_READ_ATTACHMENTS)[0]).toBe('read_attachments');
  });

  it('scores every planted duplicate comfortably clear of the default threshold', () => {
    for (const planted of [
      RESTATES_INTEGRITY_SCAN, RESTATES_VIDEO_HEALTH,
      VERB_ALIAS_OF_READ_ATTACHMENTS, RESTATES_SMS_SUMMARY,
    ]) {
      const top = check(planted).candidates[0];
      expect(top.score).toBeGreaterThanOrEqual(DEFAULT_THRESHOLD * 2);
    }
  });
});

describe('NEGATIVE CONTROL: a genuinely novel request surfaces nothing', () => {
  it('surfaces nothing for a request from outside the platform entirely', () => {
    expect(names(NOVEL_PAYROLL)).toEqual([]);
  });

  it('surfaces nothing for a novel question asked in the catalog OWN vocabulary', () => {
    // The hard one. "run", "token", "cost", "month" -- a matcher leaning on the words this catalog
    // is built from would return half the fleet here.
    expect(names(NOVEL_RUN_COST)).toEqual([]);
  });

  it('surfaces nothing for a novel request about the people the platform does serve', () => {
    expect(names(NOVEL_CLASSROOM_SEATS)).toEqual([]);
  });

  it('is not vacuously empty: the same requests DO score, just below the bar', () => {
    // The distinction that matters. These requests are not invisible to the matcher, they are
    // ranked and rejected. A matcher returning nothing because it computes nothing would pass the
    // three tests above and fail this one.
    for (const novel of [NOVEL_PAYROLL, NOVEL_RUN_COST, NOVEL_CLASSROOM_SEATS]) {
      const scored = check(novel, { threshold: 0, maxCandidates: 5 }).candidates;
      expect(scored.length).toBeGreaterThan(0);
      expect(scored[0].score).toBeLessThan(DEFAULT_THRESHOLD);
    }
  });
});

describe('THE THRESHOLD IS LOAD-BEARING, proven in both directions from the outside', () => {
  it('matches everything when the bar is dropped to zero, which breaks the negative control', () => {
    // Mutation one, as behavior rather than as a source edit: at threshold 0 the novel request
    // surfaces candidates, so the negative control above is testing the threshold and not an
    // accident of the data.
    expect(check(NOVEL_RUN_COST, { threshold: 0 }).candidates.length).toBeGreaterThan(0);
  });

  it('matches nothing when the bar is raised past one, which breaks every planted case', () => {
    // Mutation two, the opposite direction, and it kills a DIFFERENT set of tests: the planted
    // block rather than the negative controls.
    for (const planted of [
      RESTATES_INTEGRITY_SCAN, RESTATES_VIDEO_HEALTH,
      VERB_ALIAS_OF_READ_ATTACHMENTS, RESTATES_SMS_SUMMARY,
    ]) {
      expect(check(planted, { threshold: 1.01 }).candidates).toEqual([]);
    }
  });

  it('keeps the two knobs where a reader can find them', () => {
    // Pinned so a silent retune is a failing test rather than a quiet behavior change.
    expect(DEFAULT_THRESHOLD).toBe(0.2);
    expect(COMMON_TOKEN_SHARE).toBe(0.25);
    expect(Object.values(FIELD_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });
});

describe('EVERY candidate names the field that matched, because a number cannot be audited', () => {
  it('attaches at least one named field to every candidate it returns', () => {
    for (const request of [
      RESTATES_INTEGRITY_SCAN, RESTATES_VIDEO_HEALTH,
      VERB_ALIAS_OF_READ_ATTACHMENTS, RESTATES_SMS_SUMMARY,
    ]) {
      for (const candidate of check(request).candidates) {
        expect(candidate.matched_fields.length).toBeGreaterThan(0);
        for (const field of candidate.matched_fields) {
          expect(Object.keys(FIELD_WEIGHTS)).toContain(field.field);
          expect(field.detail.length).toBeGreaterThan(20);
        }
      }
    }
  });

  it('names the exact words that matched, not just the field they matched in', () => {
    const top = check(RESTATES_INTEGRITY_SCAN).candidates[0];
    const reads = top.matched_fields.find((f) => f.field === 'reads');
    expect(reads).toBeDefined();
    // The words the two sides genuinely share, which is what an approver checks by eye against the
    // tool. `curriculum_modules` is split on the underscore and the plural stemmed, so the shared
    // vocabulary is the parts rather than the column name: that is the matcher being able to see
    // `curriculum_lessons` and `curriculum lesson` as the same thing.
    expect(reads?.tokens).toEqual(
      ['artifact', 'curriculum', 'definition', 'lesson', 'mini', 'module', 'section'],
    );
    expect(reads?.detail).toContain('curriculum');
  });

  it('names `purpose_vs_behavior` rather than `purpose`, because the catalog holds no purpose', () => {
    // `ToolCapability` is `{ reads, produces }`. Calling this field `purpose` would claim a
    // comparison that did not happen, and the detail text says which comparison did.
    const fields = check(RESTATES_SMS_SUMMARY).candidates
      .flatMap((c) => c.matched_fields.map((f) => f.field));
    expect(fields).toContain('purpose_vs_behavior');
    expect(fields).not.toContain('purpose');
    const purposeField = check(RESTATES_SMS_SUMMARY).candidates[0].matched_fields
      .find((f) => f.field === 'purpose_vs_behavior');
    expect(purposeField?.detail).toContain('no purpose field');
  });

  it('explains an exact name match as a name match, with the normalization stated', () => {
    const result = check({ ...VERB_ALIAS_OF_READ_ATTACHMENTS, tool_name: 'Read-Attachments' });
    const top = result.candidates[0];
    expect(top.tool_name).toBe('read_attachments');
    const nameField = top.matched_fields.find((f) => f.field === 'tool_name');
    expect(nameField?.detail).toContain('case and separators');
  });

  it('explains a verb-synonym match by naming the verb it folded', () => {
    const top = check(VERB_ALIAS_OF_READ_ATTACHMENTS).candidates[0];
    const nameField = top.matched_fields.find((f) => f.field === 'tool_name');
    expect(nameField?.detail).toContain('read');
    expect(nameField?.detail).toContain('synonym');
  });
});

describe('a zero says WHICH zero it is', () => {
  it('reports the catalog size on every result, so an answer carries the set it saw', () => {
    expect(check(NOVEL_PAYROLL).catalog_size).toBe(CATALOG.length);
    expect(check(NOVEL_PAYROLL).catalog_size).toBe(57);
  });

  it('flags an EMPTY catalog rather than reporting a clean result', () => {
    // The difference between "compared against everything, found nothing" and "compared against
    // nothing". An empty catalog cannot clear a request, and saying so is the only honest output.
    const blind = checkForDuplicateTool({ request: RESTATES_INTEGRITY_SCAN, catalog: [] });
    expect(blind.candidates).toEqual([]);
    expect(blind.catalog_absent).toBe(true);
    expect(blind.catalog_size).toBe(0);
  });

  it('does not flag absence when the catalog is real and the request is simply novel', () => {
    const novel = check(NOVEL_PAYROLL);
    expect(novel.candidates).toEqual([]);
    expect(novel.catalog_absent).toBe(false);
  });

  it('lists the tools that carry no behavior text, so their absence is never mistaken for novelty', () => {
    // A request duplicating one of these four can only ever match by name. Without this list, a
    // reviewer reading "no candidates" has no way to know that four tools were effectively unsearched.
    expect(check(NOVEL_PAYROLL).behaviorless_tools).toEqual(BEHAVIORLESS.slice().sort());
  });
});

describe('determinism, because a stored answer and a recomputed one must agree', () => {
  it('returns byte-identical results for the same inputs', () => {
    const a = JSON.stringify(check(RESTATES_SMS_SUMMARY));
    const b = JSON.stringify(check(RESTATES_SMS_SUMMARY));
    expect(a).toBe(b);
  });

  it('does not depend on the order the catalog arrives in', () => {
    const forward = checkForDuplicateTool({ request: RESTATES_SMS_SUMMARY, catalog: CATALOG });
    const reversed = checkForDuplicateTool({
      request: RESTATES_SMS_SUMMARY,
      catalog: [...CATALOG].reverse(),
    });
    expect(JSON.stringify(reversed.candidates)).toBe(JSON.stringify(forward.candidates));
  });

  it('breaks ties by name so equal scores still have one stable order', () => {
    // Twelve tools, not two, and the reason is the next test: on a catalog small enough that every
    // shared word is also a common word, the common-word guard correctly drops all of them and
    // there is nothing left to tie.
    const filler = Array.from({ length: 10 }, (_, i) => ({
      tool_name: `filler${i}_tool`, reads: [`Unrelated subject${i} material${i}`], produces: [],
    }));
    const twins: CatalogTool[] = [
      { tool_name: 'zebra_tool', reads: ['A rare widget ledger'], produces: [] },
      { tool_name: 'alpha_tool', reads: ['A rare widget ledger'], produces: [] },
      ...filler,
    ];
    const result = checkForDuplicateTool({
      request: { tool_name: 'x_tool', purpose: 'p', reads: ['A rare widget ledger'], produces: [] },
      catalog: twins,
      threshold: 0,
    });
    const tied = result.candidates.filter((c) => c.score === result.candidates[0].score);
    expect(tied.map((c) => c.tool_name)).toEqual(['alpha_tool', 'zebra_tool']);
  });

  it('on a catalog too small for rarity to mean anything, matches NOTHING rather than everything', () => {
    // A REAL boundary, found by a test of mine that assumed otherwise, and recorded rather than
    // tuned away. With two tools, a word both use is a word 100% of the catalog uses, so
    // `COMMON_TOKEN_SHARE` drops it and no comparison survives.
    //
    // Failing closed is the right direction for this matcher: the alternative is a two-tool
    // catalog in which everything matches everything, which is the exact failure the ticket says
    // would train the approver to ignore it. `catalog_size` on the result is how a reader sees
    // which case they are in, and production is nowhere near it: at 57 tools a word must appear in
    // 15 of them before it is dropped.
    const tiny: CatalogTool[] = [
      { tool_name: 'zebra_tool', reads: ['A rare widget ledger'], produces: [] },
      { tool_name: 'alpha_tool', reads: ['A rare widget ledger'], produces: [] },
    ];
    const result = checkForDuplicateTool({
      request: { tool_name: 'x_tool', purpose: 'p', reads: ['A rare widget ledger'], produces: [] },
      catalog: tiny,
      threshold: 0,
    });
    expect(result.candidates).toEqual([]);
    expect(result.catalog_size).toBe(2);
    expect(result.catalog_absent).toBe(false);
  });

  it('holds no clock, so the same request compared twice a week apart is the same answer', () => {
    for (const key of Object.keys(check(RESTATES_SMS_SUMMARY))) {
      expect(key).not.toMatch(/_at$|time|clock/i);
    }
  });
});

describe('it is ADVICE, and it is structurally incapable of being anything else', () => {
  it('returns no verdict, no refusal and no assignment', () => {
    const result = check(RESTATES_INTEGRITY_SCAN) as unknown as Record<string, unknown>;
    for (const forbidden of ['verdict', 'refused', 'refusal', 'issues', 'approved', 'assigned', 'grant']) {
      expect(result[forbidden]).toBeUndefined();
    }
  });

  it('caps the answer at three candidates by default, which is what the ticket asks to see', () => {
    expect(check(RESTATES_SMS_SUMMARY, { threshold: 0 }).candidates.length).toBeLessThanOrEqual(3);
  });

  it('never claims a match on a word the request did not use', () => {
    for (const candidate of check(RESTATES_VIDEO_HEALTH).candidates) {
      const requestText = [
        RESTATES_VIDEO_HEALTH.tool_name,
        RESTATES_VIDEO_HEALTH.purpose,
        ...RESTATES_VIDEO_HEALTH.reads,
        ...RESTATES_VIDEO_HEALTH.produces,
      ].join(' ').toLowerCase();
      for (const field of candidate.matched_fields) {
        for (const token of field.tokens) {
          // The token is stemmed and the name is normalized, so the check is on the stem's root
          // rather than on the literal token.
          expect(requestText).toContain(token.replace(/[^a-z0-9]/g, '').slice(0, 5));
        }
      }
    }
  });
});

describe('boundaries, because an empty request is a real thing a form can send', () => {
  it('handles a request with no reads, no produces and an empty purpose', () => {
    const bare = check({ tool_name: 'something_entirely_new', purpose: '', reads: [], produces: [] });
    expect(bare.catalog_absent).toBe(false);
    expect(bare.candidates).toEqual([]);
  });

  it('still matches on name when everything else is empty', () => {
    const bare = check({ tool_name: 'create_tickets', purpose: '', reads: [], produces: [] });
    expect(bare.candidates[0].tool_name).toBe('create_tickets');
    expect(bare.candidates[0].score).toBeCloseTo(FIELD_WEIGHTS.tool_name, 10);
  });

  it('does not crash or match on a request that is only punctuation', () => {
    expect(check({ tool_name: '---', purpose: '...', reads: ['!!'], produces: [] }).candidates)
      .toEqual([]);
  });

  it('survives a very long purpose without matching everything', () => {
    const long = Array.from({ length: 400 }, (_, i) => `widget${i} ledger entry`).join(' ');
    const result = check({
      tool_name: 'widget_ledger_tool', purpose: long, reads: [long], produces: [long],
    });
    // Volume is not evidence. A request four hundred phrases long is still novel if none of its
    // distinguishing words is in the catalog, and this is the shape that would defeat a raw
    // token-count matcher.
    expect(result.candidates).toEqual([]);
  });
});

describe('THE COMMON-WORD GUARD IS LOAD-BEARING, and pinned in both directions', () => {
  /**
   * HALF the catalog says `ticket`, and the half is the point.
   *
   * The real 57-tool catalog cannot pin the LOOSENING direction: almost no word crosses 25% of 57
   * tools, so raising the ceiling there changes nothing measurable. Mutating the constant in the
   * source killed only the knob-pin test, which is exactly the "pinned in only one direction"
   * state the ticket warns about, and is why `commonTokenShare` is an argument.
   *
   * A word in EVERY tool cannot pin it either, and that was measured rather than assumed: the
   * rarity weight is `log(N/df)/log(N)`, which is already ZERO at `df = N`. So a fully uniform
   * catalog scores nothing whether the guard is on or off, and a first version of this test
   * expected twelve matches and got none. The guard does its work in the band BETWEEN its ceiling
   * and 100%, so the catalog has to sit in that band: `ticket` here is in 6 of 12, a share of 0.5,
   * where the weight would be 0.279 if nothing dropped it.
   */
  const HALF_SHARED: CatalogTool[] = [
    ...Array.from({ length: 6 }, (_, i) => ({
      tool_name: `ticket_tool_${i}`,
      reads: [`A ticket for subject${i}`],
      produces: ['A ticket'],
    })),
    ...Array.from({ length: 6 }, (_, i) => ({
      tool_name: `widget_tool_${i}`,
      reads: [`A widget ledger for item${i}`],
      produces: ['A widget ledger line'],
    })),
  ];

  const TICKET_REQUEST: DuplicateCheckRequest = {
    tool_name: 'make_a_ticket',
    purpose: 'Create a ticket',
    reads: ['A ticket'],
    produces: ['A ticket'],
  };

  it('AT THE REAL SETTING: a word half the catalog uses explains nothing, so nothing matches', () => {
    // Matching on `ticket` would make all six ticket tools candidates for every ticket request,
    // none of them more right than the others. That is the failure the ticket says would train
    // the approver to ignore the feature inside a week.
    const result = checkForDuplicateTool({
      request: TICKET_REQUEST, catalog: HALF_SHARED, threshold: 0,
    });
    expect(result.candidates).toEqual([]);
  });

  it('LOOSENED TO 1.01: the same request matches ALL SIX, which IS the failure mode', () => {
    // The direction the real catalog could not show. With nothing dropped as common, every tool
    // sharing the word becomes a candidate for a request that duplicates none of them.
    const result = checkForDuplicateTool({
      request: TICKET_REQUEST, catalog: HALF_SHARED, threshold: 0,
      commonTokenShare: 1.01, maxCandidates: 50,
    });
    expect(result.candidates.length).toBe(6);
    expect(result.candidates.every((c) => c.tool_name.startsWith('ticket_tool_'))).toBe(true);
  });

  it('TIGHTENED TO 0: every known word is dropped, so behavior matching stops entirely', () => {
    const result = checkForDuplicateTool({
      request: TICKET_REQUEST, catalog: HALF_SHARED, threshold: 0, commonTokenShare: 0,
    });
    expect(result.candidates).toEqual([]);
  });

  it('reports the word it dropped AND how common it was, so an empty result is auditable', () => {
    const result = checkForDuplicateTool({
      request: TICKET_REQUEST, catalog: HALF_SHARED, threshold: 0,
    });
    expect(result.ignored_common_tokens.find((d) => d.token === 'ticket')?.share).toBe(0.5);
  });

  it('a DISTINCTIVE word in the same catalog still matches, so the guard is not a blanket', () => {
    // The guard removes COMMON words, not all words. `subject3` is in one tool of the twelve, so
    // it keeps its full weight and finds exactly that tool.
    const result = checkForDuplicateTool({
      request: { ...TICKET_REQUEST, reads: ['A ticket for subject3'] },
      catalog: HALF_SHARED,
      threshold: 0,
    });
    expect(result.candidates[0].tool_name).toBe('ticket_tool_3');
  });
});
