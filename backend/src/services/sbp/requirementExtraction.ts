/**
 * STAGE A of generation: extract and refine requirements, WITHOUT generating stories.
 *
 * P6-T2 splits requirement extraction from implementation-plan generation. Until now both
 * happened in one model call, which meant you could not refine a requirement set without also
 * producing a plan from it, and you could not produce a plan from a requirement set a human had
 * corrected. The two are now separately reachable:
 *
 *     extractRequirements(inputs)                 -> a requirement set, no stories. NO approval needed.
 *     decomposeBuild({ ...inputs, requirements }) -> releases and stories FROM that set.
 *
 * ## "No stories" is structural, not a convention
 *
 * `RefinedRequirements` has no `stories` field and no `releases` field, and
 * `REQUIREMENTS_JSON_SCHEMA` sets `additionalProperties: false`. A model that tried to emit a
 * story here would be rejected by the schema, not trusted and then ignored. The alternative,
 * returning a `BuildPlan` with empty arrays, would have made "requirements refined" and "plan
 * generated with nothing in it" the same value, and this programme has already shipped one
 * bypass that rested on an empty array being indistinguishable from an unmeasured one.
 *
 * ## Refinement is cheap; authorization is not
 *
 * This stage requires no approval on purpose. Refining requirements early is the point: it is
 * the part a human should iterate on before anything is committed to. What needs an approved
 * blueprint is turning a requirement set into AUTHORIZED stories, and that gate lives in
 * `storyAuthorization.ts` rather than here, so this module cannot accidentally become the thing
 * that decides it.
 */
import { BUILD_PLAN_JSON_SCHEMA, PlanRequirement } from './planContract';
import {
  DecomposeInputs,
  DEFAULT_TARGETS,
  PROMPT_SECTIONS,
  composeSystemPrompt,
  sourceBlocks,
  sourceOverflows,
  type SourceOverflow,
} from './decomposePrompt';
import {
  modelJsonCall, defaultClient, type ChatClient,
} from './modelJsonCall';

/**
 * A refined requirement set. Deliberately NOT a `BuildPlan`.
 *
 * Carries the project naming fields because they come from the same reading of the source and
 * asking a second model call to re-derive them would be a second chance to disagree with itself.
 */
export interface RefinedRequirements {
  project_name: string;
  descriptor: string;
  requirements: PlanRequirement[];
}

/**
 * The requirements-only structured-output schema.
 *
 * DERIVED from `BUILD_PLAN_JSON_SCHEMA`, not copied: the three property schemas below are the
 * SAME OBJECTS, by reference. A copy would be a second definition of what a requirement is, and
 * the day it drifts this stage starts accepting requirements the plan stage rejects, or emitting
 * ones the gate has never seen. `decomposePrompt.sections` makes the same argument about the
 * prompt and for the same reason.
 *
 * A test asserts the REFERENCE equality, which a copy cannot satisfy however carefully it is
 * transcribed.
 */
const planProperties = (BUILD_PLAN_JSON_SCHEMA as unknown as {
  properties: Record<string, unknown>;
}).properties;

export const REQUIREMENTS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  // No `releases`, no `stories`. Under OpenAI strict structured output every key in
  // `properties` must also appear in `required`, so omitting them here is what makes a
  // story-bearing response a schema violation rather than something to filter out afterwards.
  required: ['project_name', 'descriptor', 'requirements'],
  properties: {
    project_name: planProperties.project_name,
    descriptor: planProperties.descriptor,
    requirements: planProperties.requirements,
  },
} as const;

/**
 * The extraction stage's system prompt.
 *
 * Composed from the SAME sections the full prompt uses, minus the story and release rules. The
 * intro is the only new text, because it is the only thing that genuinely differs: what this
 * call is for.
 */
export const REQUIREMENT_EXTRACTION_SYSTEM_PROMPT = composeSystemPrompt([
  'You extract the complete set of requirements from a software requirements document.\n'
  + 'You do NOT write stories, releases, or a build plan. That is a separate, later step that\n'
  + 'runs only after a human has reviewed and approved what you produce here. Your only job is\n'
  + 'to capture what the system must do, completely and traceably.',
  PROMPT_SECTIONS.grounding,
  PROMPT_SECTIONS.antiInvention,
  PROMPT_SECTIONS.traceability,
  PROMPT_SECTIONS.requirementKinds,
  PROMPT_SECTIONS.dataNotInstruction,
]);

/** Assemble the extraction user message. Brief first, through the shared source assembly. */
export function buildRequirementExtractionPrompt(inputs: DecomposeInputs): string {
  const t = { ...DEFAULT_TARGETS, ...(inputs.targets ?? {}) };
  return [
    // The SAME completeness instruction the plan prompt carries, and for the recorded reason:
    // "I think we should build out all of the requirements - no matter how big. We can always
    // decide which release they will demo. I would rather have all the requirements there."
    // A tier band sent as an instruction once made a brief stating 35 requirements produce 18.
    `Capture EVERY requirement stated in the brief and the document. Do not merge, drop, `
      + `generalise or summarise requirements to reach a smaller number: completeness matters `
      + `more than brevity, and a requirement left out is a failure of this task. `
      + `A build of this size typically has around ${t.requirements[0]}-${t.requirements[1]} requirements, `
      + `but if the material states more, include ALL of them.`,
    // Said explicitly because the schema enforces it silently. A model told only by a schema
    // tends to produce a story-shaped requirement instead of refusing.
    `Do NOT produce releases or stories. Requirements only.`,
    '',
    sourceBlocks(inputs),
  ].join('\n');
}

/**
 * The approved requirement set, as an authoritative prompt block for the story stage.
 *
 * Lives here because this module owns `RefinedRequirements`, and `decomposePrompt` is already
 * at CLAUDE.md's twelve-symbol ceiling.
 *
 * Delimited and labelled like every other untrusted block (SAFE-002), even though this content
 * came from our own earlier model call and a human review. It is still model-derived text
 * reaching a prompt, and the one time that rule was relaxed anywhere in this repo is not a
 * precedent anybody wants to set.
 */
export function approvedRequirementsPromptBlock(set: RefinedRequirements): string {
  const lines = set.requirements.map((r) => (
    `- ${r.id} [${r.kind}/${r.priority}] ${r.statement}`
  ));
  return [
    'The requirement set below has ALREADY BEEN EXTRACTED AND REVIEWED BY A HUMAN. It is the',
    'complete and authoritative list. Do NOT add, remove, merge, reword or re-number any of',
    'them. Your job is to organise THESE requirements into releases and vertical-slice stories.',
    '',
    '<APPROVED_REQUIREMENTS>',
    ...lines,
    '</APPROVED_REQUIREMENTS>',
  ].join('\n');
}

export interface ExtractRequirementsOptions extends DecomposeInputs {
  model?: string;
  correlationId?: string;
  /** Injected in tests. Production resolves the shared bounded client. */
  client?: ChatClient;
}

export interface ExtractRequirementsResult {
  requirements: RefinedRequirements;
  /** How many model calls it took. 1 means a clean first pass. */
  attempts: number;
  model: string;
  client: ChatClient;
  /**
   * Source the model never saw, reported rather than silently clipped.
   *
   * RETURNED as well as logged, unlike the plan stage which only logs it. This stage exists to
   * be reviewed by a human, and a reviewer deciding whether a requirement set is complete needs
   * to know that 50,000 characters of the document were never read.
   */
  overflows: SourceOverflow[];
}

function log(event: string, correlationId: string | undefined, outcome: string, ctx: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'sbp-requirements',
    event,
    correlation_id: correlationId ?? null,
    outcome,
    context: ctx,
  }));
}

function isRequirementsShaped(v: unknown): v is RefinedRequirements {
  const r = v as RefinedRequirements | null;
  return !!r
    && typeof r.project_name === 'string'
    && typeof r.descriptor === 'string'
    && Array.isArray(r.requirements) && r.requirements.length > 0
    // A response carrying stories is a CONTRACT VIOLATION, not something to quietly drop. The
    // schema already forbids it; this is the local check, for the case where the schema was not
    // applied because a caller passed its own client.
    // Narrowed through `unknown`: `r` is typed as the thing being CHECKED FOR, so a direct
    // cast to a record is a type error rather than a convenience. tsc caught this; the test
    // suite could not, because ts-jest transpiles backend tests instead of typechecking them.
    && !('stories' in (r as unknown as Record<string, unknown>))
    && !('releases' in (r as unknown as Record<string, unknown>));
}

/**
 * Extract a requirement set from the source material. Generates no stories and needs no
 * approval.
 *
 * Does NOT gate what it produces: the caller runs whatever review it wants, exactly as
 * `decomposeBuild` leaves gating to its caller, so generation and judgement stay separable.
 */
export async function extractRequirements(
  opts: ExtractRequirementsOptions,
): Promise<ExtractRequirementsResult> {
  const model = opts.model || process.env.SBP_REQUIREMENTS_MODEL || process.env.SBP_DECOMPOSE_MODEL || 'gpt-4o';
  const client = opts.client ?? defaultClient();

  // Source that never reaches the model, said out loud. Same reporting as the plan stage, from
  // the same shared assembly, so the two stages cannot disagree about what was clipped.
  const overflows = sourceOverflows(opts);
  for (const o of overflows) {
    log('sbp_requirements_source_truncated', opts.correlationId, 'partial', {
      tag: o.tag, limit: o.limit, actual: o.actual, droppedChars: o.droppedChars,
    });
  }

  const result = await modelJsonCall<RefinedRequirements>({
    schemaName: 'refined_requirements',
    schema: REQUIREMENTS_JSON_SCHEMA as unknown as Record<string, unknown>,
    systemPrompt: REQUIREMENT_EXTRACTION_SYSTEM_PROMPT,
    userPrompt: buildRequirementExtractionPrompt(opts),
    isShaped: isRequirementsShaped,
    shapeProblem: 'the JSON did not match the requirement contract (empty or missing requirements, '
      + 'or it contained releases or stories, which this step must not produce)',
    model,
    client,
    eventPrefix: 'sbp_requirements',
    log: (event, outcome, ctx) => log(event, opts.correlationId, outcome, ctx),
    describe: (v) => ({ requirements: v.requirements.length }),
  });

  return {
    requirements: result.value,
    attempts: result.attempts,
    model: result.model,
    client: result.client,
    overflows,
  };
}
