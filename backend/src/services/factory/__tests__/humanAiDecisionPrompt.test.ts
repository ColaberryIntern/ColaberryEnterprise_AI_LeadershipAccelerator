/**
 * The prompt must ASK THE QUESTION, not merely offer the vocabulary (L10.2/L10.3/L10.4).
 *
 * ## What happened on 5 Nov 2026, and why a string assertion is the right test here
 *
 * The Herriman decomposition (`delivery_project 80b35be2`) came back with ten allocation rows and
 * every single one `human`. Nothing was broken: four execution classes exist, the prompt listed
 * all four, and `sample/sampleContractProject.ts` emits `ai_with_approval`, so the vocabulary was
 * demonstrably reachable. It was unreachable THERE, structurally, because:
 *
 *   1. `execution_class` is DERIVED from the assignments - AI only if an AGENT is the performer;
 *   2. no agent roster or team list reached the prompt, so there was no agent id to name;
 *   3. inventing one is correctly forbidden, and a null executor is explicitly rewarded; and
 *   4. the prompt framed the performer as a FACT TO READ OFF THE SOLICITATION - and an RFP never
 *      says an AI will do anything, for any bid, ever.
 *
 * So every executor sourced as a person, every time. A classifier with one output class is not
 * classifying, which is the same defect as 858 of 864 requirement rows being `compliance/must`.
 *
 * For a prompt, the text IS the artefact, so these tests assert on it. But the ones that earn
 * their place are the DRIFT checks: that the lists the prompt asks for are exactly the lists the
 * schema requires, and that the vocabularies it spells out are the real ones. A schema that
 * permits a field the prompt never requests is precisely the allocation bug - true of the schema,
 * false of the pipeline, and green all the way.
 */
import { FACTORY_DECOMPOSE_SYSTEM_PROMPT, buildFactoryDecomposeUserPrompt } from '../factoryDecomposePrompt';
import { FACTORY_DECOMPOSITION_JSON_SCHEMA } from '../contracts/factoryContractSchema';
import { readFileSync } from 'fs';
import { join } from 'path';
import { evaluateHumanAiStructure } from '../humanAiStructure';
import type { FactoryTask, AllocationRow, Surface } from '../contracts/factoryContract';
import { EXECUTION_POLICIES, APPROVAL_POLICIES } from '../../delivery/deliveryStoryContract';
import { AUTONOMY_STAGES } from '../../agentDomain/autonomyLadder';
import { INPACT_DIMENSIONS } from '../../../modules/delivery/inpact';

const P = FACTORY_DECOMPOSE_SYSTEM_PROMPT;

describe('the prompt asks for exactly the lists the schema requires', () => {
  it('names every required schema key in the YOU EMIT line, and no others', () => {
    // THE DRIFT CHECK. Add a list to the schema and forget the prompt, and the model is never
    // asked for it - the field is emittable and always empty, which reads as a finding about
    // the work rather than a gap in the pipeline.
    const line = P.match(/YOU EMIT [A-Z]+ LISTS \(and nothing else\): ([^.]+)\./);
    expect(line).not.toBeNull();
    const named = line![1].split(/,\s*/).map((s) => s.trim().replace(/\s+/g, ' ')).sort();
    expect(named).toEqual([...FACTORY_DECOMPOSITION_JSON_SCHEMA.required].sort());
  });

  it('says NINE, so the count in the prose cannot drift from the list either', () => {
    expect(P).toContain('YOU EMIT NINE LISTS');
    expect(FACTORY_DECOMPOSITION_JSON_SCHEMA.required).toHaveLength(9);
  });
});

describe('the can-an-AI-do-this question is put, not implied', () => {
  it('asks the question outright for every task', () => {
    expect(P).toMatch(/CAN AN AI DO THIS WORK\?/);
    expect(P).toMatch(/For EVERY task, ask one question/);
  });

  it('tells the model the performer is its decision and NOT a fact in the source', () => {
    // This is the sentence whose absence produced ten human rows.
    expect(P).toMatch(/WHO PERFORMS A TASK IS YOUR DECISION, NOT A FACT TO FIND IN THE SOURCE/);
    expect(P).toMatch(/will never tell you whether a person\s+or an agent does the work/);
  });

  it('does not leave the blanket "null when the source does not tell you" permission over the executor', () => {
    // The old DON'T KNOW list included "a null executor" alongside unknown effort and skills,
    // which made nulling the performer the rewarded move. The list must no longer offer it.
    const dontKnow = P.slice(P.indexOf('"DON\'T KNOW" IS A VALUE'));
    expect(dontKnow).not.toMatch(/a null executor/);
    expect(dontKnow).toMatch(/WHO PERFORMS THE WORK IS NOT ON THAT LIST/);
  });

  it('keeps approvals and commitments human, which is the half that must not be automated away', () => {
    expect(P).toMatch(/A HUMAN IS REQUIRED for: any APPROVAL or sign-off/);
    expect(P).toMatch(/committing the organisation/);
    // Draft-then-approve as two tasks is what stops "a human must approve" from dragging the
    // drafting back onto the human side with it.
    expect(P).toMatch(/draft\s+and approve are TWO tasks/);
  });

  it('names ai_with_approval as the answer under doubt, so doubt does not default to human', () => {
    expect(P).toMatch(/WHEN IN DOUBT, ai_with_approval/);
  });

  it('refuses a rationale that restates the verdict', () => {
    // Every rationale in the 5 Nov run was of the form "X requires human judgment", which is
    // the verdict spelled backwards.
    expect(P).toMatch(/"Requires human\s+judgment" restates the verdict/);
  });
});

describe('agent teams are declarable, and declaring one is not invention', () => {
  it('says the declared team ids ARE the agent executor ids', () => {
    expect(P).toMatch(/THE TEAM IDS YOU DECLARE HERE ARE THE AGENT IDS YOU USE AS EXECUTORS/);
  });

  it('carves the structure out of ANTI-INVENTION explicitly', () => {
    // Without this, the two rules contradict and the safe reading is the empty one.
    const anti = P.slice(P.indexOf('ANTI-INVENTION:'));
    expect(anti).toMatch(/THIS IS ABOUT OUTSIDE FACTS, NOT ABOUT THE STRUCTURE YOU WERE ASKED FOR/);
  });

  it('requires one subject per team and forbids the omniscient team', () => {
    expect(P).toMatch(/One team owns ONE subject/);
    expect(P).toMatch(/Two teams may NOT share a subject/);
    expect(P).toMatch(/Never "AI", "Agent", "Automation" or "General"/);
  });

  it('forbids an agent approving its own team', () => {
    expect(P).toMatch(/It may NEVER be an agent/);
  });

  it('spells the delivery vocabularies exactly as they are defined, never re-worded', () => {
    // A prompt that offers `agent_review` for `agent_with_review` produces output the schema
    // rejects, and the failure surfaces as a generation error with no obvious cause.
    for (const v of EXECUTION_POLICIES) expect(P).toContain(v);
    for (const v of APPROVAL_POLICIES) expect(P).toContain(v);
    for (const v of INPACT_DIMENSIONS) expect(P).toContain(v);
    expect(P).toContain(AUTONOMY_STAGES[0]);
    expect(P).toContain(AUTONOMY_STAGES[AUTONOMY_STAGES.length - 1]);
  });

  it('tells the model never to write a bare autonomy level', () => {
    // `R3` in the risk-tier column is the value autonomyLadder throws on.
    expect(P).toMatch(/Never write a bare "R3"/);
  });

  it('prefers an admitted gap over a flattering autonomy claim', () => {
    expect(P).toMatch(/NULL IS THE HONEST ANSWER unless the source supports a stage/);
  });

  it('calls out listing all six trust dimensions to look complete', () => {
    expect(P).toMatch(/Listing all\s+six to look complete is the failure this field exists to expose/);
  });
});

describe('surfaces keep "one console" an honest claim', () => {
  it('asks for one console and says why many is the failure', () => {
    expect(P).toMatch(/PREFER ONE surface of kind "console"/);
    expect(P).toMatch(/Many surfaces means many logins/);
    expect(P).toMatch(/Do not split the console by role/);
  });

  it('guards the claim in BOTH directions, which is what makes the count worth having', () => {
    // Filing real work as external flatters the console; dragging genuinely external work onto
    // it flatters the coverage. Either one makes the number meaningless.
    expect(P).toMatch(/Do not file work as external to tidy\s+the console/);
    expect(P).toMatch(/do not pull genuinely external work onto the console/);
  });
});

describe('the user message repeats the decision, because the system prompt alone did not carry it', () => {
  const prompt = buildFactoryDecomposeUserPrompt({
    sourceBlocks: [{ id: 'blk-1', locator: 'L.1', text: 'The vendor shall provide training.', kind: 'requirement' }],
    requirements: [{ id: 'REQ-1', statement: 'Provide training', kind: 'technical', priority: 'must' }],
    context: 'x',
  });

  it('instructs the per-task decision in the user message too', () => {
    expect(prompt).toMatch(/For EVERY task, decide whether an AI can do the work/);
  });

  it('asks for teams grouped by subject and as few surfaces as the work allows', () => {
    expect(prompt).toMatch(/agent teams grouped by subject/);
    expect(prompt).toMatch(/as few surfaces as the work honestly allows/);
  });

  it('still carries the older instructions it is added alongside', () => {
    // Guards against the repetition displacing what was already there.
    expect(prompt).toMatch(/Assign a PERFORMER to every task/);
    expect(prompt).toContain('<SOURCE_BLOCKS>');
  });
});

/**
 * L10.2/L10.3 - THE PERMISSION TO EMIT NOTHING, AND WHERE IT IS ALLOWED TO SIT.
 *
 * The 5 Nov production run emitted neither `agent_teams` nor `surfaces`. The pipeline was fine:
 * `factoryGenerate.ts:116` passes the decomposition whole, and the keys were simply absent from
 * the model's output. The cause was LAYOUT. `ALLOCATION AND ROLE_MAP` opened with "send null
 * (or []) for either if you genuinely have nothing to state", and both later sections sat below
 * that line - a standing permission to be empty directly above an instruction to fill.
 *
 * That is the same shape as the defect this whole ladder exists to fix: a rule that makes the
 * empty answer the safe one. So these tests pin POSITION, not just presence, because the words
 * were already present on 5 Nov and the model still emitted nothing.
 */
/**
 * L10.4 — WHOSE PROCESS. The half of the 5 Nov defect that survived the performer fix.
 *
 * The 5 Nov run got the human/AI axis right for the first time and still produced three tasks
 * belonging to the buyer: `t-receive-proposals` from our duty to submit, `t-review-proposals`
 * from our duty to state compliance, and `t-select-vendor` from our duty to execute the
 * agreement. All six cited requirement rows genuinely bind us, so the triage and the demotion
 * were both correct. The model simply wrote our obligations from the City's side of the table.
 *
 * The prompt said who DECIDES the performer. It never said whose PROCESS was being built.
 */
describe('the prompt says whose process is being built', () => {
  it('states the responder frame before the performer rules, because it governs them', () => {
    const iWhose = P.indexOf('WHOSE PROCESS YOU ARE BUILDING');
    const iWho = P.indexOf('WHO PERFORMS A TASK IS YOUR DECISION');
    expect(iWhose).toBeGreaterThan(-1);
    expect(iWho).toBeGreaterThan(-1);
    expect(iWhose).toBeLessThan(iWho);
    expect(P).toMatch(/process WE run as the RESPONDING PARTY/);
    expect(P).toMatch(/We answer the solicitation; we do\s+not administer it/);
  });

  it('carries all three real inversions, not a general principle', () => {
    // A rule stated abstractly is the version that was already there. These are the three
    // sentences the model actually got wrong, with the task it should have emitted instead.
    expect(P).toContain('"Submit the response"');
    expect(P).toContain('NOT "Receive proposals"');
    expect(P).toContain('"State our compliance"');
    expect(P).toContain('NOT "Review proposals"');
    expect(P).toContain('"Execute the agreement"');
    expect(P).toContain('NOT "Select a vendor"');
  });

  it('files the buyer\'s deadlines as constraints rather than tasks', () => {
    expect(P).toMatch(/are CONSTRAINTS on our work,\s+not tasks in our process/);
  });

  it('gives the model a self-check it can apply to its own output', () => {
    expect(P).toMatch(/only the buyer could perform is a sign you read an obligation from the wrong side/);
  });
});

describe('the empty-list permission is scoped to the two lists it was written for', () => {
  const iAlloc = P.indexOf('ALLOCATION AND ROLE_MAP');
  const iTeams = P.indexOf('AGENT_TEAMS - group the AI tasks BY SUBJECT');
  const iSurfaces = P.indexOf('SURFACES - where each HUMAN task actually lands');
  const iAfter = P.indexOf('GRANULARITY');

  it('has all four sections, in the order the arithmetic below assumes', () => {
    // A test built on indexOf is worthless if one of them is -1, which sorts first and makes
    // every comparison below pass for the wrong reason.
    expect(iAlloc).toBeGreaterThan(-1);
    expect(iTeams).toBeGreaterThan(iAlloc);
    expect(iSurfaces).toBeGreaterThan(iTeams);
    expect(iAfter).toBeGreaterThan(iSurfaces);
  });

  it('states the permission inside the allocation section', () => {
    const i = P.indexOf('these two lists, and ONLY these two, may be empty');
    expect(i).toBeGreaterThan(iAlloc);
    expect(i).toBeLessThan(iTeams);
  });

  it('says outright that the permission does not reach the two lists below it', () => {
    expect(P).toContain('THIS PERMISSION DOES NOT REACH AGENT_TEAMS OR SURFACES BELOW');
  });

  it('does NOT repeat a list-level empty permission inside agent_teams or surfaces', () => {
    // Field-level nulls DO belong there - a null approver_role_id and an unassessed
    // autonomy_stage are both honest answers, and this must not forbid them. What may not
    // appear is permission for the LIST itself to be empty.
    const below = P.slice(iTeams, iAfter);
    expect(below).not.toContain('never invent rows to fill them');
    expect(below).not.toContain('may be empty when you have nothing');
    // The field-level nulls are still there, which is what makes the assertion above narrow.
    expect(below).toContain('autonomy_stage is one of autonomy:R0 through autonomy:R9, or null');
  });

  it('requires teams when there is AI work and surfaces when there is human work', () => {
    const below = P.slice(iTeams, iAfter);
    expect(below).toContain('REQUIRED WHENEVER YOU ALLOCATED ANY AI WORK');
    expect(below).toContain('REQUIRED WHENEVER YOU ALLOCATED ANY HUMAN WORK');
  });
});

/**
 * PROMPT-TO-GATE AGREEMENT, asserted BEHAVIOURALLY rather than by matching strings.
 *
 * The prompt now names four gate rules by id, to tell the model what rejects an empty list. A
 * grep for those ids in `humanAiStructure.ts` would prove only that the strings exist. So each
 * one below is made to FIRE, and the prompt is then checked against the ids the gate actually
 * emitted. If a rule is renamed, or guarded so it can no longer fire, these fail.
 *
 * This matters for a reason the audit of this plan caught: `AI_TASK_WITHOUT_TEAM` is guarded by
 * `structured`, which is FALSE when the key is omitted. So the rule that fired on 5 Nov was
 * STRUCTURE_ABSENT, and a prompt naming only AI_TASK_WITHOUT_TEAM would describe a consequence
 * that does not occur. Both are named, and both are proven reachable here.
 */
describe('every gate rule the prompt names is one the gate really emits', () => {
  const task = (id: string): FactoryTask => ({
    id, process_id: 'PROC-1', title: id, description: '', kind: 'TASK', stage_id: 'S1',
    source_evidence: ['b1'], required_skills: [], judgment_level: 'low', decision_authority: 'none',
    data_sensitivity: 'internal', interaction_pattern: null, frequency: null, effort_minutes: null,
    effort_basis: 'UNKNOWN', confidence: null, method: 'EXPLICIT',
  });
  const alloc = (task_id: string, execution_class: AllocationRow['execution_class']): AllocationRow =>
    ({ task_id, execution_class, rationale: 'because', accountable_role_id: 'role-lead' });
  // `Surface` declares exactly id, name, kind, task_ids. An earlier draft added
  // `description: null`, which jest happily ran — ts-jest is transpile-only — while the
  // required Test-file typecheck gate rejected it. The checking thing was itself unchecked.
  const surface = (id: string, kind: Surface['kind']): Surface =>
    ({ id, name: id, kind, task_ids: [] });

  const rulesFrom = (input: Parameters<typeof evaluateHumanAiStructure>[0]) =>
    evaluateHumanAiStructure(input).findings.map((f) => f.rule);

  it('emits STRUCTURE_ABSENT when both keys are OMITTED - the 5 Nov failure', () => {
    const rules = rulesFrom({
      tasks: [task('t1')], allocation: [alloc('t1', 'ai_with_approval')], assignments: [],
      agent_teams: undefined, surfaces: undefined,
    });
    expect(rules).toContain('STRUCTURE_ABSENT');
    // And the rule for the OTHER kind of empty is correctly silent, because it is guarded.
    expect(rules).not.toContain('AI_TASK_WITHOUT_TEAM');
  });

  it('emits AI_TASK_WITHOUT_TEAM when the list is declared EMPTY and AI work exists', () => {
    const rules = rulesFrom({
      tasks: [task('t1')], allocation: [alloc('t1', 'ai_with_approval')], assignments: [],
      agent_teams: [], surfaces: [],
    });
    expect(rules).toContain('AI_TASK_WITHOUT_TEAM');
    expect(rules).not.toContain('STRUCTURE_ABSENT');
  });

  it('emits HUMAN_TASK_WITHOUT_SURFACE for human work with nowhere to land', () => {
    const rules = rulesFrom({
      tasks: [task('t1')], allocation: [alloc('t1', 'human')], assignments: [],
      agent_teams: [], surfaces: [],
    });
    expect(rules).toContain('HUMAN_TASK_WITHOUT_SURFACE');
  });

  it('emits ONE_CONSOLE for two consoles', () => {
    const rules = rulesFrom({
      tasks: [], allocation: [], assignments: [],
      agent_teams: [], surfaces: [surface('s1', 'console'), surface('s2', 'console')],
    });
    expect(rules).toContain('ONE_CONSOLE');
  });

  it('names in the prompt only rule ids the gate was just shown to emit', () => {
    // The four ids above, collected from real findings rather than typed in twice.
    const emitted = new Set([
      ...rulesFrom({
        tasks: [task('t1')], allocation: [alloc('t1', 'ai_with_approval')], assignments: [],
        agent_teams: undefined, surfaces: undefined,
      }),
      ...rulesFrom({
        tasks: [task('t1'), task('t2')],
        allocation: [alloc('t1', 'ai_with_approval'), alloc('t2', 'human')],
        assignments: [], agent_teams: [], surfaces: [],
      }),
      ...rulesFrom({
        tasks: [], allocation: [], assignments: [],
        agent_teams: [], surfaces: [surface('s1', 'console'), surface('s2', 'console')],
      }),
    ]);

    const namedInPrompt = ['STRUCTURE_ABSENT', 'AI_TASK_WITHOUT_TEAM', 'HUMAN_TASK_WITHOUT_SURFACE', 'ONE_CONSOLE'];
    for (const id of namedInPrompt) {
      expect(P).toContain(id);
      expect([...emitted]).toContain(id);
    }
  });

  /**
   * THE OTHER DIRECTION, which the test above does not cover.
   *
   * Checking four hardcoded ids proves those four are real. It proves nothing about a FIFTH:
   * review of this suite showed that inserting an invented `SURFACE_WITHOUT_OWNER` into the
   * prompt broke no test. A prompt that cites a consequence the gate cannot produce is telling
   * the model something false, which is the same class of defect as the gate being unable to
   * fire — just pointed the other way.
   *
   * So this scans the prompt for every rule-shaped token and requires each to be one the gate
   * can really emit. Rule ids are read out of `humanAiStructure.ts` rather than retyped;
   * reading a source file in a test is the existing pattern here (`promptDelimiters.test.ts`
   * does the same with this prompt).
   */
  it('cites no rule id the gate cannot emit', () => {
    const gateSrc = readFileSync(join(__dirname, '..', 'humanAiStructure.ts'), 'utf8');
    const emittable = new Set(
      [...gateSrc.matchAll(/finding\('([A-Z_]+)'/g)].map((m) => m[1]),
    );

    // Tokens in the prompt that are SCREAMING_SNAKE but are NOT gate rules: the names of the
    // lists the model emits, and codes owned by `factoryValidate` rather than by the structure
    // evaluator. Each is listed deliberately, so a NEW token forces a decision instead of
    // being swept in.
    const notGateRules = new Set([
      'AGENT_TEAMS', 'ROLE_MAP', 'SOURCE_BLOCK', 'SOURCE_BLOCKS',
      'SOURCE_COVERAGE', 'WORK_REFERENCE', 'EFFORT_EVIDENCE',
    ]);

    const tokens = [...new Set(P.match(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g) ?? [])];
    const ruleish = tokens.filter((t) => !notGateRules.has(t));

    // CONTROL. If the scan finds nothing, every assertion below is vacuous and this test is
    // decoration. It must find the four ids the prompt really does name.
    expect(ruleish.length).toBeGreaterThanOrEqual(4);
    expect(emittable.size).toBeGreaterThanOrEqual(4);

    for (const token of ruleish) {
      expect([...emittable]).toContain(token);
    }
  });
});
