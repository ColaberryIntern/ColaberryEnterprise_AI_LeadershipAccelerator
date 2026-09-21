/**
 * factoryRepair — close the gaps factoryValidate found, rather than failing on the first one.
 *
 * Mirrors sbp/planRepair with the three properties that repair loop learned from a live failure:
 *  1. TARGETED, not a re-roll: the model is handed the gate's violations verbatim, with a specific
 *     remedy per rule code, and asked to fix EXACTLY those.
 *  2. MONOTONE: a candidate is kept only if it strictly REDUCES the error count. An attempt that
 *     does not improve is discarded and the previous best is kept, so repair can never hand back
 *     something worse than it received.
 *  3. BOUNDED: capped at MAX_REPAIR_ATTEMPTS (CLAUDE.md Stall Detection). An unrepairable
 *     decomposition fails closed with its remaining errors recorded — factoryGenerate (T7) then
 *     refuses it. Shipping a decomposition with a known gap is the thing this pipeline prevents.
 *
 * The unit of repair is the DECOMPOSITION (processes/tasks/assignments/transitions/roles). Each
 * candidate is assembled (factoryAssemble) and re-gated (factoryValidate) against the SAME
 * deterministic blocks/requirements/tracks, so the model's fix is judged as a whole project.
 */
import OpenAI from 'openai';
import type {
  SourceBlock, ContractRequirement, ContractTrack, AllocationRow, RoleMapRow, FactoryProject,
} from './contracts/factoryContract';
import { FACTORY_DECOMPOSITION_JSON_SCHEMA } from './contracts/factoryContractSchema';
import { FACTORY_DECOMPOSE_SYSTEM_PROMPT } from './factoryDecomposePrompt';
import { toStrictSchema, isDecompositionShaped, type FactoryDecomposition } from './factoryDecompose';
import { assembleFactoryProject } from './factoryAssemble';
import { factoryErrors, type ValidationIssue } from './factoryValidate';

export const MAX_REPAIR_ATTEMPTS = 3;

const STRICT_DECOMPOSITION_SCHEMA = toStrictSchema(FACTORY_DECOMPOSITION_JSON_SCHEMA);

/**
 * What to actually DO about each gate rule. Without this the model guesses, and its guess for a
 * flow/oversight problem is usually "add another task", which tends to make the graph worse.
 * Keyed on the factoryValidate rule code so the guidance shows only when relevant.
 */
export const FACTORY_REMEDIES: Record<string, string> = {
  WORK_REFERENCE:
    'A task/edge/assignment references an id that does not exist. Either correct the reference or ' +
    'emit the missing process/task. Every task.process_id MUST equal a process id you emit; every ' +
    'edge and assignment MUST point at a task id you emit.',
  SOURCE_COVERAGE:
    'A requirement source block is cited by no task. Add that block id to the source_evidence of the ' +
    'task that addresses it (or add a task for it). Do NOT invent a block id.',
  SOURCE_CLASSIFICATION:
    'A source block is unresolved. This is an input problem you cannot fix by decomposition; leave the ' +
    'tasks as they are.',
  PERFORMER:
    'A TASK or DECISION has no PERFORMER. Add exactly one assignment with responsibility "PERFORMER" ' +
    'for that task.',
  OVERSIGHT:
    'Either an agent is a PERFORMER with no human ACCOUNTABLE/APPROVER (add a person/team ACCOUNTABLE ' +
    'assignment for that task), or an agent was given APPROVER/ACCOUNTABLE (change that executor to a ' +
    'person or team). An agent may never be ACCOUNTABLE or APPROVER.',
  DUPLICATE_ASSIGNMENT:
    'The same (task, role, responsibility) appears twice. Remove the duplicate assignment.',
  EFFORT_EVIDENCE:
    'A task/assignment has minutes with basis UNKNOWN. Either set effort_basis/basis to "ESTIMATED" ' +
    'or "MEASURED", or set the minutes to null.',
  START:
    'There must be exactly one task of kind "START", and it must have no incoming edge. Fix the START ' +
    'count or remove the inbound edge.',
  END:
    'There must be at least one task of kind "END", and an END must have no outgoing edge. Add an END ' +
    'or remove its outbound edge.',
  REACHABILITY:
    'A task is unreachable from START. Add a transition from a reachable task so every task is on a ' +
    'path from START.',
  BRANCH_KIND:
    'A task has two or more outgoing edges but is not a DECISION. Make it kind "DECISION", or reduce ' +
    'it to a single outgoing edge.',
  DECISION:
    'A DECISION needs at least two outgoing edges with two DISTINCT non-empty condition labels. Add or ' +
    'relabel its outgoing edges.',
  LOOP:
    'There is a cycle over forward edges. Mark a genuine rework/retry edge with "is_rework": true, or ' +
    'remove the edge that closes the loop.',
};

/** Remedies for the rules actually violated, deduped and in violation order. */
export function factoryRemedyText(errors: ValidationIssue[]): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const e of errors) {
    if (seen.has(e.code) || !FACTORY_REMEDIES[e.code]) continue;
    seen.add(e.code);
    lines.push(`- ${e.code}: ${FACTORY_REMEDIES[e.code]}`);
  }
  return lines.length ? `\nHOW TO FIX EACH KIND OF VIOLATION:\n${lines.join('\n')}\n` : '';
}

/** Build the repair user prompt: the current decomposition + its violations + targeted remedies. */
export function buildFactoryRepairUserPrompt(decomposition: FactoryDecomposition, errors: ValidationIssue[]): string {
  return [
    'A decomposition you produced failed its deterministic gate. Fix EXACTLY these violations and',
    'introduce no new ones. Return the COMPLETE corrected decomposition (all five lists).',
    '',
    `VIOLATIONS:\n${errors.map((e) => `- [${e.code}] ${e.message}`).join('\n')}`,
    factoryRemedyText(errors),
    'CURRENT DECOMPOSITION (JSON):',
    JSON.stringify(decomposition),
    '',
    'Return valid JSON matching the schema exactly. Keep everything that already passed; change only',
    'what the violations require.',
  ].join('\n');
}

function log(event: string, correlationId: string | undefined, ctx: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'warn', service: 'factory-repair',
    event, correlation_id: correlationId ?? null, outcome: 'partial', context: ctx,
  }));
}

/** The deterministic pieces assembly needs, held constant across repair attempts. */
export interface FactoryRepairContext {
  blocks: SourceBlock[];
  requirements: ContractRequirement[];
  tracks: ContractTrack[];
  deliveryProjectId: string;
  allocation?: AllocationRow[];
  role_map?: RoleMapRow[];
}

export interface FactoryRepairDeps {
  client: Pick<OpenAI['chat']['completions'], 'create'>;
  model: string;
  correlationId?: string;
  onAttempt?: (attempt: number, errors: number) => void;
}

export interface FactoryRepairResult {
  decomposition: FactoryDecomposition;
  /** the assembled project for the best decomposition reached. */
  project: FactoryProject;
  /** the remaining blocking errors on the best decomposition ([] when clean). */
  errors: ValidationIssue[];
  /** accepted (improving) attempts. */
  attempts: number;
  /** attempts discarded for not reducing the error count (monotonicity). */
  rejected: number;
}

/** Assemble a decomposition with the fixed context, and return its blocking errors. */
function assembleAndGate(decomposition: FactoryDecomposition, ctx: FactoryRepairContext) {
  const project = assembleFactoryProject({
    decomposition,
    blocks: ctx.blocks,
    requirements: ctx.requirements,
    tracks: ctx.tracks,
    deliveryProjectId: ctx.deliveryProjectId,
    allocation: ctx.allocation,
    role_map: ctx.role_map,
  });
  return { project, errors: factoryErrors(project) };
}

/**
 * Gate, and repair until clean or out of attempts. Returns the best decomposition reached with its
 * assembled project and remaining errors — the caller (factoryGenerate) decides refuse vs accept.
 */
export async function repairDecomposition(
  decomposition: FactoryDecomposition,
  context: FactoryRepairContext,
  deps: FactoryRepairDeps,
): Promise<FactoryRepairResult> {
  let bestDecomp = decomposition;
  let { project: bestProject, errors: bestErrors } = assembleAndGate(bestDecomp, context);
  let rejected = 0;
  let accepted = 0;

  for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS && bestErrors.length > 0; attempt++) {
    deps.onAttempt?.(attempt, bestErrors.length);

    // `any`: the OpenAI SDK create() returns a Chat/stream union; we read only choices[0].message
    // .content and validate the real contract downstream (isDecompositionShaped + the gate), so the
    // response's static shape carries no runtime risk here. Same pattern as sbp/decomposeService.
    let completion: any;
    try {
      completion = await deps.client.create({
        model: deps.model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: FACTORY_DECOMPOSE_SYSTEM_PROMPT },
          { role: 'user', content: buildFactoryRepairUserPrompt(bestDecomp, bestErrors) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'factory_decomposition_repair', strict: true, schema: STRICT_DECOMPOSITION_SCHEMA },
        },
      });
    } catch (err: any) {
      // A failed repair call is not fatal — the loop is capped, so stop trying and fail closed
      // with the best decomposition reached so far.
      log('factory_repair_call_failed', deps.correlationId, { attempt, message: err?.message });
      break;
    }

    let candidate: unknown;
    try {
      candidate = JSON.parse(completion?.choices?.[0]?.message?.content ?? '{}');
    } catch {
      rejected += 1;
      continue; // a malformed repair is discarded; the cap stops runaway
    }
    if (!isDecompositionShaped(candidate)) {
      rejected += 1;
      continue;
    }

    const { project: candidateProject, errors: candidateErrors } = assembleAndGate(candidate, context);

    // Monotonicity: strictly fewer errors, or the attempt is thrown away.
    if (candidateErrors.length < bestErrors.length) {
      bestDecomp = candidate;
      bestProject = candidateProject;
      bestErrors = candidateErrors;
      accepted += 1;
    } else {
      rejected += 1;
    }
  }

  if (bestErrors.length > 0) {
    log('factory_repair_exhausted', deps.correlationId, { remaining_errors: bestErrors.length, accepted, rejected });
  }
  return { decomposition: bestDecomp, project: bestProject, errors: bestErrors, attempts: accepted, rejected };
}
