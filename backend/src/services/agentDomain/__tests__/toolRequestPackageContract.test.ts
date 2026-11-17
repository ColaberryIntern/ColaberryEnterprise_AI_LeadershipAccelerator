/**
 * AF11.8 — the ten blocks, asserted BLOCK BY BLOCK.
 *
 * The ticket's first acceptance criterion is *"A request missing any of the ten blocks does not
 * render for Ali; it bounces with the block named."* So the omission cases are a table rather than
 * a handful of spot checks: a new required block with no row here is visible as an omission, where
 * a prose test would quietly cover nine of ten blocks forever.
 *
 * THE CONTROL COMES FIRST and it is not a formality. If `complete()` ever stopped passing the
 * gate, every omission case below would still "bounce as expected" — for the wrong reason — and
 * the whole file would report green while proving nothing.
 */

import {
  PACKAGE_BLOCKS,
  acceptToolRequestPackage,
  bouncedBlocks,
  gateToolRequestPackage,
  isReadyForAHuman,
  type PackageBlock,
  type PackageRefusal,
  type ToolRequestPackageInput,
} from '../toolRequestPackageContract';

/** Fixed, because `Date.now()` in a test is a test that fails one day a year. */
const NOW = new Date('2026-11-17T12:00:00.000Z');

/**
 * Sarbjit's landing-page capability, written the way AF11.8 requires.
 *
 * A real worked case rather than `'x'` in every field: the ticket requires both worked requests to
 * render end to end, and a fixture of placeholders would pass every structural check while
 * proving nothing about whether the format can carry a real argument.
 */
function complete(over: Partial<ToolRequestPackageInput> = {}): ToolRequestPackageInput {
  return {
    executive_summary:
      'Sarbjit writes every campaign landing page by hand. This asks for a tool that drafts one '
      + 'from the brief. Approving B grants the existing builder; approving A builds a drafter.',
    problem: 'Sarbjit spends about three hours a week drafting pages that Sohail then rewrites.',
    key_findings: [
      { finding: '3 hours a week spent drafting', source: "Sarbjit's time log, 10 Nov 2026" },
      { finding: '8 landing-page endpoints already exist', source: 'backend/src/routes/admin/landingPageRoutes.ts' },
    ],
    options: [
      {
        key: 'A',
        summary: 'Build a drafter that reads a brief',
        what_happens: 'Two weeks of build, then the agent drafts and Sohail edits.',
        verb: 'approve_to_build',
      },
      {
        key: 'B',
        summary: 'Grant the landing page builder that already exists',
        what_happens: 'Sarbjit uses the current builder today; nothing is built.',
        verb: 'assign_existing_tool',
      },
    ],
    recommendation: 'B',
    recommendation_reason: 'The endpoints already exist, so a grant costs nothing to build.',
    impact: 'About 3 hours a week back, and no new blast radius.',
    risk_can_break: ['A draft could be published before anyone reviews it'],
    risk_cannot_break: ['It cannot publish: publish is a separate endpoint and a separate grant'],
    simulated_action: 'Ran the drafter over the last 12 briefs and compared each to what Sarbjit wrote.',
    simulated_against: 'The 12 campaign briefs filed between 1 Sep and 10 Nov 2026',
    simulated_at: '2026-11-16T09:00:00.000Z',
    steps_that_follow: [
      'Grant the tool to the marketing agent',
      'Sarbjit drafts one real page with it',
      'Report the edit count against the threshold',
    ],
    ...over,
  };
}

const gate = (input: ToolRequestPackageInput) => gateToolRequestPackage({ input, now: NOW });
const rules = (input: ToolRequestPackageInput): string[] => gate(input).map((i) => i.rule);
const blocks = (input: ToolRequestPackageInput): PackageBlock[] => bouncedBlocks(gate(input));

describe('THE CONTROL — without this the rest of the file proves nothing', () => {
  it('a complete package bounces on nothing at all', () => {
    expect(gate(complete())).toEqual([]);
    expect(isReadyForAHuman(gate(complete()))).toBe(true);
  });

  it('the fixture is a real argument, not ten placeholder strings', () => {
    // A fixture of 'x' would satisfy every structural rule and prove nothing about whether the
    // format can carry a case somebody would actually decide from.
    const p = complete();
    expect(String(p.executive_summary).length).toBeGreaterThan(80);
    expect(p.key_findings).toHaveLength(2);
    expect(p.options).toHaveLength(2);
    expect(p.steps_that_follow).toHaveLength(3);
  });
});

describe('every block, named one at a time', () => {
  const OMISSIONS: ReadonlyArray<[keyof ToolRequestPackageInput, PackageRefusal, PackageBlock]> = [
    ['executive_summary', 'executive_summary_missing', 'executive_summary'],
    ['problem', 'problem_missing', 'problem'],
    ['key_findings', 'key_findings_missing', 'key_findings'],
    ['options', 'options_missing', 'possible_solutions'],
    ['recommendation', 'recommendation_missing', 'recommendation'],
    ['recommendation_reason', 'recommendation_reason_missing', 'recommendation'],
    ['impact', 'impact_missing', 'possible_impact'],
    ['risk_can_break', 'risk_can_break_missing', 'risk_assessment'],
    ['risk_cannot_break', 'risk_cannot_break_missing', 'risk_assessment'],
    ['simulated_action', 'simulated_action_missing', 'simulated_action'],
    ['simulated_against', 'simulated_against_missing', 'simulated_action'],
    ['simulated_at', 'simulated_at_missing', 'simulated_action'],
    ['steps_that_follow', 'steps_that_follow_missing', 'steps_that_follow'],
  ];

  it.each(OMISSIONS)('a missing %s bounces as %s', (field, rule) => {
    const input = complete();
    delete (input as Record<string, unknown>)[field as string];
    expect(rules(input)).toContain(rule);
  });

  it.each(OMISSIONS)('%s names its BLOCK, so the agent is told what to go and write (%s)', (field, rule, block) => {
    const input = complete();
    delete (input as Record<string, unknown>)[field as string];
    const issue = gate(input).find((i) => i.rule === rule);
    expect(issue).toBeDefined();
    expect(issue?.block).toBe(block);
    // A code with no sentence is the generic refusal this whole format exists to rule out.
    expect(String(issue?.detail).length).toBeGreaterThan(20);
  });

  it('covers every block the module declares, so a new one cannot arrive untested', () => {
    // `the_answer` is reached through the option keys rather than a field of its own, and is
    // covered in its own describe below.
    const covered = new Set(OMISSIONS.map(([, , block]) => block));
    covered.add('the_answer');
    expect([...PACKAGE_BLOCKS].sort()).toEqual([...covered].sort());
  });

  it('reports EVERY bounced block at once, not the first', () => {
    // Ten round trips to learn ten things is exactly the work this format exists to stop an agent
    // creating for the person on the other end.
    const found = blocks({});
    expect(found.length).toBeGreaterThanOrEqual(8);
  });

  it('treats whitespace as absent rather than as an answer', () => {
    expect(rules(complete({ problem: '   ' }))).toContain('problem_missing');
  });

  it('treats a list of blanks as an empty list', () => {
    expect(rules(complete({ risk_can_break: ['', '  '] }))).toContain('risk_can_break_missing');
  });
});

describe('key findings carry their sources, which is the rule the whole script rests on', () => {
  it('bounces a finding with no source, and SAYS WHICH ONE', () => {
    const issue = gate(complete({
      key_findings: [
        { finding: '3 hours a week', source: 'the time log' },
        { finding: '1,571 unapproved colors' },
      ],
    })).find((i) => i.rule === 'key_finding_has_no_source');
    expect(issue).toBeDefined();
    expect(issue?.detail).toContain('1,571 unapproved colors');
  });

  it('bounces a blank source, which is a different mistake from a missing one and the same fact', () => {
    expect(rules(complete({ key_findings: [{ finding: 'x', source: '  ' }] })))
      .toContain('key_finding_has_no_source');
  });

  it('does not demand a source from an entry with no finding in it', () => {
    // An empty row in a form is not an unsourced claim; it is an empty row.
    const found = rules(complete({
      key_findings: [{ finding: '3 hours a week', source: 'the time log' }, {}],
    }));
    expect(found).not.toContain('key_finding_has_no_source');
  });
});

describe("the options are the answer, and 'do it' and 'do not' is not two options", () => {
  it('bounces a single option as a non-choice', () => {
    const found = rules(complete({ options: [complete().options![0]] }));
    expect(found).toContain('only_one_option');
  });

  it('bounces four options, because six paths move the analysis back onto the reader', () => {
    const o = complete().options![0];
    expect(rules(complete({
      options: [
        { ...o, key: 'A' }, { ...o, key: 'B' }, { ...o, key: 'C' }, { ...o, key: 'D' },
      ],
    }))).toContain('too_many_options');
  });

  it('BOUNCES AN OPTION THAT MERELY DECLINES — the ticket sentence, enforced', () => {
    // Nothing is always available to the decider, so an option that only declines is the answer
    // they already had. This is the rule that stops a package offering "do it" and "do not" and
    // calling that a choice.
    const issue = gate(complete({
      options: [
        complete().options![0],
        { key: 'B', summary: 'Do not', what_happens: 'Nothing', verb: 'deny' },
      ],
    })).find((i) => i.rule === 'option_is_a_refusal');
    expect(issue).toBeDefined();
    expect(issue?.detail).toMatch(/Nothing is always available/i);
  });

  it('bounces an option whose verb is not something a decision can do', () => {
    expect(rules(complete({
      options: [complete().options![0], { key: 'B', summary: 's', what_happens: 'w', verb: 'ponder' }],
    }))).toContain('option_verb_unknown');
  });

  it('bounces an option nobody described, because an unlabelled option cannot be weighed', () => {
    expect(rules(complete({
      options: [complete().options![0], { key: 'B', verb: 'send_back' }],
    }))).toContain('option_not_described');
  });

  it('requires the keys to be A, B, C IN ORDER, because the answer is recorded as a letter', () => {
    const o = complete().options![0];
    const found = rules(complete({
      options: [{ ...o, key: 'B' }, { ...o, key: 'D' }],
    }));
    expect(found).toContain('option_keys_out_of_order');
    expect(blocks(complete({ options: [{ ...o, key: 'B' }, { ...o, key: 'D' }] })))
      .toContain('the_answer');
  });

  it('accepts lowercase keys and normalises them, so a letter is one answer and not two', () => {
    const o = complete().options![0];
    const input = complete({
      options: [{ ...o, key: 'a' }, { ...o, key: 'b', verb: 'send_back' }],
      recommendation: 'A',
    });
    expect(rules(input)).toEqual([]);
    const out = acceptToolRequestPackage({ input, now: NOW });
    expect(out.ok && out.value.options.map((x) => x.key)).toEqual(['A', 'B']);
  });

  it('NOTHING IS NEVER AN OPTION the agent offers, and a package does not have to include it', () => {
    // The whole reason Nothing is not in the list: an option the agent has to remember to include
    // is an option it can leave out. The control package offers A and B and nothing else, and it
    // passes.
    expect(complete().options?.some((o) => String(o.key).toLowerCase() === 'nothing')).toBe(false);
    expect(gate(complete())).toEqual([]);
  });
});

describe('the recommendation points at something that was actually offered', () => {
  it('bounces a recommendation for an option nobody offered, and says what was', () => {
    const issue = gate(complete({ recommendation: 'C' }))
      .find((i) => i.rule === 'recommendation_not_on_the_list');
    expect(issue).toBeDefined();
    expect(issue?.detail).toContain('A, B');
  });

  it('bounces a recommendation that is not an answer at all', () => {
    expect(rules(complete({ recommendation: 'maybe' }))).toContain('recommendation_unknown');
  });

  it("ACCEPTS 'nothing', so an agent that has disproved its own capability can say so", () => {
    // The deliberate widening of the ticket's "one of them by name". Without it the honest answer
    // would be unwritable and the first agent to find its capability pointless would have to
    // recommend doing it anyway.
    expect(rules(complete({
      recommendation: 'nothing',
      recommendation_reason: 'Everything it would ever produce has now been produced once.',
    }))).toEqual([]);
  });
});

describe('the simulation has to have actually happened', () => {
  it('bounces a date that is not a date', () => {
    expect(rules(complete({ simulated_at: 'recently' }))).toContain('simulated_at_not_a_time');
  });

  it('BOUNCES A SIMULATION DATED IN THE FUTURE, which is the signature of a filled-in template', () => {
    // Not pedantry. Block 8 is the only one whose whole value is that it actually ran, and a
    // future timestamp is what a template looks like when somebody completed the form rather than
    // the work.
    expect(rules(complete({ simulated_at: '2027-01-01T00:00:00.000Z' })))
      .toContain('simulated_in_the_future');
  });

  it('accepts a simulation run a moment ago, so the check is not an off-by-one', () => {
    expect(rules(complete({ simulated_at: NOW.toISOString() }))).toEqual([]);
  });

  it('asks separately WHAT it was run against, because a simulation against nothing is a claim', () => {
    expect(rules(complete({ simulated_against: '' }))).toEqual(['simulated_against_missing']);
  });
});

describe('what is deliberately NOT checked, pinned so nobody adds it by accident', () => {
  it('does not require a number in the impact, because risk is legitimately qualitative', () => {
    // "This can publish to the public internet" is a complete answer with no quantity in it.
    // Requiring a figure would teach agents to invent one, which is worse than prose.
    expect(rules(complete({ impact: 'It can publish to the public internet.' }))).toEqual([]);
  });

  it('does not judge quality: a three-word summary passes', () => {
    // The gate is a floor, not a review. Stated as a test so a reader does not mistake a green
    // suite for an assurance that the package is any good.
    expect(rules(complete({ executive_summary: 'Build the thing.' }))).toEqual([]);
  });
});

describe('the narrowed value, so the gate and the write read one object', () => {
  it('trims every field and normalises the simulation time to ISO', () => {
    const out = acceptToolRequestPackage({
      input: complete({
        problem: '  spacing  ',
        impact: '  3 hours  ',
        simulated_at: '2026-11-16T09:00:00Z',
        steps_that_follow: ['  grant it  ', '', '  use it  '],
      }),
      now: NOW,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.problem).toBe('spacing');
    expect(out.value.impact).toBe('3 hours');
    expect(out.value.simulated_at).toBe('2026-11-16T09:00:00.000Z');
    expect(out.value.steps_that_follow).toEqual(['grant it', 'use it']);
  });

  it('returns the issues and NO value on a bounce', () => {
    const out = acceptToolRequestPackage({ input: {}, now: NOW });
    expect(out.ok).toBe(false);
    expect(out).not.toHaveProperty('value');
  });
});

describe("AF11.8's test case: the design-token package reads as an easy no", () => {
  /**
   * The capability Ali killed, written out as the package AF11.8 would require.
   *
   * The ticket: *"its simulated action has already been run (1,571 distinct unapproved colors
   * across 3,088 files, measured 16 Nov) and shows that everything the capability would ever
   * produce has now been produced once. Build the page so that this request reads as an easy no."*
   *
   * The point of this block is that the format does NOT refuse it. A complete, honest package
   * arguing for a worthless capability passes the gate, and it is the CONTENT that makes the
   * answer obvious. A gate that bounced it would be hiding the decision rather than presenting it.
   */
  const designTokenDrift = (): ToolRequestPackageInput => ({
    executive_summary:
      'The scanner would list every color outside the approved palette. It has now been run once '
      + 'over the whole repository. There is nothing left for it to find that this run did not.',
    problem:
      'Color drift accumulates unnoticed, and nobody has been looking. The cost today is that '
      + 'the palette is advisory rather than enforced.',
    key_findings: [
      { finding: '1,571 distinct unapproved colors', source: 'repository scan, main at 8bbcb51, 16 Nov 2026' },
      { finding: '4,492 unapproved occurrences across 3,088 styled files', source: 'the same scan' },
      { finding: '3,453 of those are already-approved values typed as raw hex', source: 'the same scan' },
    ],
    options: [
      {
        key: 'A',
        summary: 'Build the scanner and run it daily',
        what_happens: 'A list of 1,571 colors arrives every morning, for nobody in particular.',
        verb: 'approve_to_build',
      },
      {
        key: 'B',
        summary: 'Narrow it to the 83 uses of the retired navy and fix those once',
        what_happens: 'One pull request, then the capability is finished and comes off the board.',
        verb: 'approve_to_build',
      },
    ],
    recommendation: 'nothing',
    recommendation_reason:
      'The one run has produced everything the capability would ever produce.',
    impact:
      'Option A costs a reader every morning and saves nothing measurable. Nothing costs a '
      + 'capability slot on seven boards and frees the builder holding it.',
    risk_can_break: ['Nothing: it only reads the repository'],
    risk_cannot_break: ['It cannot change a file, open a pull request, or touch production'],
    simulated_action:
      'Ran the full scan over the repository and grouped every unapproved color by its nearest '
      + 'approved one.',
    simulated_against: 'main at 8bbcb51, every .tsx, .ts and .css file, 16 Nov 2026',
    simulated_at: '2026-11-16T18:00:00.000Z',
    steps_that_follow: [
      'Record the decision against the capability',
      'Take it off the seven boards that carry it',
      'Keep the 83 retired-navy uses as a separate one-off fix if anybody wants it',
    ],
  });

  it('is a COMPLETE package: the format does not refuse it', () => {
    // If this ever started bouncing, the page would be hiding the decision rather than making it
    // easy, and the ticket's test case would be testing the gate instead of the format.
    expect(gate(designTokenDrift())).toEqual([]);
  });

  it('recommends Nothing, in the agent\'s own words, with the simulation behind it', () => {
    const out = acceptToolRequestPackage({ input: designTokenDrift(), now: NOW });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.recommendation).toBe('nothing');
    expect(out.value.simulated_against).toContain('16 Nov 2026');
    expect(out.value.recommendation_reason).toMatch(/would ever produce/);
  });

  it('OFFERS NO OPTION THAT IS A REFUSAL, so Nothing is the decider\'s call and not the agent\'s', () => {
    // The agent argues for A or B and recommends Nothing. Nothing is still Ali's to choose,
    // because it is never in the list.
    const p = designTokenDrift();
    expect(p.options?.every((o) => o.verb !== 'deny')).toBe(true);
    expect(p.options?.map((o) => o.key)).toEqual(['A', 'B']);
  });

  it('every finding carries a source, so none of it sends Ali off to go and check', () => {
    for (const f of designTokenDrift().key_findings ?? []) {
      expect(String(f.source).length).toBeGreaterThan(5);
    }
  });
});
