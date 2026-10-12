import {
  extractRequirements,
  buildRequirementExtractionPrompt,
  REQUIREMENT_EXTRACTION_SYSTEM_PROMPT,
  REQUIREMENTS_JSON_SCHEMA,
} from '../requirementExtraction';
import { BUILD_PLAN_JSON_SCHEMA } from '../planContract';
import {
  PROMPT_SECTIONS, briefPrecedesDocument, MAX_DOCUMENT_CHARS,
} from '../decomposePrompt';

/**
 * P6-T2 — STAGE A: requirements can be extracted and refined with no stories and no approval.
 *
 * This file covers the stage in isolation. The two-separately-reachable-states claim and the
 * negative control ("a story cannot be authorized from a refined-but-unapproved requirement
 * set") live in `requirementStages.test.ts`, because they are about the RELATIONSHIP between
 * the two stages rather than about this one.
 *
 * THE MODEL IS STUBBED. Nothing here calls OpenAI. What a stub can establish is that the schema
 * forbids stories, that the prompt carries the rules that govern a requirement and none of the
 * rules that govern a story, and that a story-bearing response is refused rather than filtered.
 * What it cannot establish is what a live model emits, and that is said rather than implied.
 */

const REQ = {
  id: 'REQ-001',
  statement: 'The system records each approval with the approving user and a timestamp.',
  kind: 'FUNC',
  priority: 'must',
  cluster: 'approvals',
  from_dimensions: ['approval_points'],
};

const SET = { project_name: 'P', descriptor: 'd', requirements: [REQ] };

/** A client that returns exactly what it is given, as the model would. */
const clientReturning = (payload: unknown) => ({
  create: jest.fn(async () => ({
    choices: [{ message: { content: JSON.stringify(payload) } }],
    usage: { total_tokens: 1 },
  })),
});

const INPUTS = { brief: 'a brief', document: 'a document' } as never;

describe('the requirements schema is DERIVED from the plan schema, not copied', () => {
  it('shares the requirement definition BY REFERENCE', () => {
    // The assertion a transcription cannot satisfy, however careful. Two structurally equal
    // copies would pass `toEqual` and then drift the first time one of them is edited, and the
    // drift would be invisible: this stage would accept requirements the plan gate rejects.
    const planProps = (BUILD_PLAN_JSON_SCHEMA as any).properties;
    const reqProps = (REQUIREMENTS_JSON_SCHEMA as any).properties;
    expect(reqProps.requirements).toBe(planProps.requirements);
    expect(reqProps.project_name).toBe(planProps.project_name);
    expect(reqProps.descriptor).toBe(planProps.descriptor);
  });

  it('has NO releases and NO stories, which is what makes a story-bearing answer invalid', () => {
    const s = REQUIREMENTS_JSON_SCHEMA as any;
    expect(Object.keys(s.properties).sort()).toEqual(['descriptor', 'project_name', 'requirements']);
    expect(s.additionalProperties).toBe(false);
  });

  it('satisfies OpenAI strict mode: every property is required', () => {
    // Strict structured output rejects a schema where a key in `properties` is absent from
    // `required`. Getting this wrong fails at the API, on a real student build, not here.
    const s = REQUIREMENTS_JSON_SCHEMA as any;
    expect([...s.required].sort()).toEqual(Object.keys(s.properties).sort());
  });
});

describe('the extraction prompt carries requirement rules and no story rules', () => {
  it('composes the four shared sections plus SAFE-002', () => {
    for (const s of [
      PROMPT_SECTIONS.grounding, PROMPT_SECTIONS.antiInvention,
      PROMPT_SECTIONS.traceability, PROMPT_SECTIONS.requirementKinds,
      PROMPT_SECTIONS.dataNotInstruction,
    ]) {
      expect(REQUIREMENT_EXTRACTION_SYSTEM_PROMPT).toContain(s);
    }
  });

  it('does NOT carry the story or release rules', () => {
    // Sending them alongside a requirements-only schema asks the model for output the schema
    // forbids: a guaranteed shape retry, then a failed build.
    for (const s of [
      PROMPT_SECTIONS.storyVerticalSlices, PROMPT_SECTIONS.releasesWalkingSkeleton,
      PROMPT_SECTIONS.everyStoryNeeds,
    ]) {
      expect(REQUIREMENT_EXTRACTION_SYSTEM_PROMPT).not.toContain(s);
    }
  });

  it('says in words that it must not produce stories, not only in the schema', () => {
    // A model told only by a schema tends to emit a story-shaped requirement rather than refuse.
    expect(REQUIREMENT_EXTRACTION_SYSTEM_PROMPT).toContain('You do NOT write stories');
    expect(buildRequirementExtractionPrompt(INPUTS)).toContain('Requirements only');
  });

  it('keeps the completeness instruction, which has an incident behind it', () => {
    // A tier band sent as an instruction once made a brief stating 35 requirements produce 18.
    const p = buildRequirementExtractionPrompt(INPUTS);
    expect(p).toContain('Capture EVERY requirement');
    expect(p).toContain('a requirement left out is a failure of this task');
  });

  it('puts the brief ahead of the document, through the shared assembly', () => {
    // The grounding invariant. It holds here because both stages use `sourceBlocks`, and this
    // asserts it on the composed prompt rather than trusting that they do.
    expect(briefPrecedesDocument(buildRequirementExtractionPrompt(INPUTS))).toBe(true);
  });
});

describe('extractRequirements returns a requirement set and nothing else', () => {
  it('returns the requirements, with no stories and no releases on the result', () => {
    // Structural, not asserted by convention: `RefinedRequirements` has no such fields, so a
    // caller cannot read an empty array and mistake it for "measured, none found".
    return extractRequirements({ ...INPUTS, client: clientReturning(SET) as never })
      .then(({ requirements, attempts, model, overflows }) => {
        expect(requirements.requirements).toHaveLength(1);
        expect(requirements.requirements[0].id).toBe('REQ-001');
        expect(requirements).not.toHaveProperty('stories');
        expect(requirements).not.toHaveProperty('releases');
        expect(attempts).toBe(1);
        expect(typeof model).toBe('string');
        expect(overflows).toEqual([]);
      });
  });

  it('sends the requirements schema under strict structured output', async () => {
    const client = clientReturning(SET);
    await extractRequirements({ ...INPUTS, client: client as never });
    const call = (client.create as jest.Mock).mock.calls[0][0];
    expect(call.response_format.json_schema.name).toBe('refined_requirements');
    expect(call.response_format.json_schema.strict).toBe(true);
    expect(call.response_format.json_schema.schema).toBe(REQUIREMENTS_JSON_SCHEMA);
    // And the extraction system prompt, not the plan one.
    expect(call.messages[0].content).toBe(REQUIREMENT_EXTRACTION_SYSTEM_PROMPT);
  });

  it('REFUSES a response that carries stories, rather than filtering them out', async () => {
    // The failure direction that matters. A caller passing its own client bypasses the schema,
    // so the local shape check is the thing standing between a story-bearing response and a
    // "refined requirement set" that quietly contains an unauthorized plan.
    const withStories = { ...SET, stories: [{ id: 'STORY-001' }] };
    const client = clientReturning(withStories);
    await expect(extractRequirements({ ...INPUTS, client: client as never }))
      .rejects.toThrow(/did not match refined_requirements/);
    // Retried once and then failed, rather than looping: MAX_SHAPE_ATTEMPTS is 2.
    expect((client.create as jest.Mock).mock.calls).toHaveLength(2);
  });

  it('REFUSES an empty requirement set, because that is never a useful answer', async () => {
    const client = clientReturning({ ...SET, requirements: [] });
    await expect(extractRequirements({ ...INPUTS, client: client as never }))
      .rejects.toThrow(/did not match refined_requirements/);
  });

  it('RETURNS the source overflow, so a reviewer knows what the model never read', async () => {
    // Stronger than the plan stage, which only logs it. This stage exists to be reviewed, and a
    // reviewer judging whether a requirement set is complete has to know that 40,000 characters
    // of the document were clipped before the model saw any of it.
    const doc = 'x'.repeat(MAX_DOCUMENT_CHARS + 40_000);
    const { overflows } = await extractRequirements({
      brief: 'b', document: doc, client: clientReturning(SET) as never,
    } as never);
    expect(overflows).toEqual([{
      tag: 'EXPANDED_DOCUMENT',
      limit: MAX_DOCUMENT_CHARS,
      actual: MAX_DOCUMENT_CHARS + 40_000,
      droppedChars: 40_000,
    }]);
  });

  it('classifies a timeout as retry-later, not as broken', async () => {
    // The taxonomy `modelJsonCall` exists to keep in one place. An operator reading
    // `UpstreamError` on a timeout goes looking for a defect that is not there.
    const client = {
      create: jest.fn(async () => {
        throw Object.assign(new Error('socket hang up ETIMEDOUT'), { name: 'APIConnectionTimeoutError' });
      }),
    };
    await expect(extractRequirements({ ...INPUTS, client: client as never }))
      .rejects.toThrow(/UpstreamTimeout/);
  });
});
