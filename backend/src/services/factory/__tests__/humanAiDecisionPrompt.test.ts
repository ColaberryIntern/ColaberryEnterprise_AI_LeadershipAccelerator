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
