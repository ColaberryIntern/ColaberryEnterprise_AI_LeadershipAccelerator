/**
 * factoryGenerate — the phase spine (the factory analogue of sbp/sbpOrchestrator.runGeneration).
 *
 * It wires the pieces and makes the deterministic gate the single enforcement point:
 *   input → buildFactoryDecomposeInput (T3, classify + ground)
 *         → factoryDecompose (T4, the bounded LLM call)
 *         → assembleFactoryProject (T5, deterministic complete project)
 *         → factoryValidate (the gate)
 *         → if errors: repairDecomposition (T6, bounded/monotone) → re-assemble → re-gate
 *         → return { project, issues, accepted }
 *
 * The contract callers can rely on: `accepted === true` if and only if factoryErrors(project) is
 * empty. It NEVER returns an accepted project with a gate error, and it never self-certifies — the
 * pure factoryValidate does the judging. It does not persist (factoryApproval / T8 owns the gated
 * write) and it does not touch the SBP build pipeline.
 *
 * Failure-first: an unrecoverable model failure (timeout / unparseable after retry) propagates as a
 * FactoryDecomposeError for the caller to classify; a decomposition that is produced but cannot pass
 * the gate after the capped repair is REFUSED (accepted:false with its issues), never thrown — the
 * distinction is "generation failed" vs "generation produced something the gate rejects".
 */
import type OpenAI from 'openai';
import type {
  ContractRequirement, ContractTrack, FactoryProject, AllocationRow, RoleMapRow,
} from './contracts/factoryContract';
import {
  buildFactoryDecomposeInput, type FactoryUnderstandingItem, type FactoryDecomposeRequirementInput,
} from './factoryDecomposeInput';
import { factoryDecompose } from './factoryDecompose';
import { assembleFactoryProject } from './factoryAssemble';
import { repairDecomposition } from './factoryRepair';
import { factoryErrors, type ValidationIssue } from './factoryValidate';

export interface FactoryGenerateInput {
  deliveryProjectId: string;
  /** full compliance-matrix requirements — used for the prompt AND attached to the project. */
  requirements: ContractRequirement[];
  /** the contract tracks — attached to the project. */
  tracks: ContractTrack[];
  /** understanding dimensions — context for the prompt. */
  understanding?: FactoryUnderstandingItem[];
  /** optional free-text project summary for the prompt. */
  contextSummary?: string;
  /** optional, for the rendered review; the gate does not require them. */
  allocation?: AllocationRow[];
  role_map?: RoleMapRow[];
}

export interface FactoryGenerateOptions {
  model?: string;
  correlationId?: string;
  /** Injected in tests. Production resolves the shared bounded client inside factoryDecompose. */
  client?: Pick<OpenAI['chat']['completions'], 'create'>;
}

export interface FactoryGenerateResult {
  project: FactoryProject;
  /** the remaining blocking errors ([] when accepted). */
  issues: ValidationIssue[];
  /** true iff factoryErrors(project) is empty — the ONLY meaning of "accepted". */
  accepted: boolean;
  decomposeAttempts: number;
  repairAttempts: number;
  repairRejected: number;
}

/** A no-input refusal issue, so an empty request is refused cleanly rather than calling the model. */
const NO_INPUT_ISSUE: ValidationIssue = {
  code: 'NO_INPUT',
  message: 'no requirement or understanding source to decompose',
  severity: 'error',
};

export async function factoryGenerate(
  input: FactoryGenerateInput,
  opts: FactoryGenerateOptions = {},
): Promise<FactoryGenerateResult> {
  const prepared = buildFactoryDecomposeInput({
    requirements: input.requirements as FactoryDecomposeRequirementInput[],
    understanding: input.understanding,
    contextSummary: input.contextSummary,
  });

  // Nothing to decompose — refuse cleanly, no model call.
  if (prepared.blocks.length === 0) {
    const emptyProject = assembleFactoryProject({
      decomposition: { processes: [], tasks: [], assignments: [], transitions: [], roles: [] },
      blocks: prepared.blocks,
      requirements: input.requirements,
      tracks: input.tracks,
      deliveryProjectId: input.deliveryProjectId,
      allocation: input.allocation,
      role_map: input.role_map,
    });
    return { project: emptyProject, issues: [NO_INPUT_ISSUE], accepted: false, decomposeAttempts: 0, repairAttempts: 0, repairRejected: 0 };
  }

  // 1) the bounded LLM decomposition (throws on unrecoverable failure — the caller classifies it).
  const dec = await factoryDecompose({
    inputs: prepared.promptInputs,
    model: opts.model,
    correlationId: opts.correlationId,
    client: opts.client,
  });

  const assembleCtx = {
    blocks: prepared.blocks,
    requirements: input.requirements,
    tracks: input.tracks,
    deliveryProjectId: input.deliveryProjectId,
    allocation: input.allocation,
    role_map: input.role_map,
  };

  // 2) assemble a complete project and run the deterministic gate.
  let project = assembleFactoryProject({ decomposition: dec.decomposition, ...assembleCtx });
  let issues = factoryErrors(project);
  let repairAttempts = 0;
  let repairRejected = 0;

  // 3) if the gate found errors, hand them back to the model — bounded, monotone (T6).
  if (issues.length > 0) {
    const repair = await repairDecomposition(dec.decomposition, assembleCtx, {
      client: dec.client,
      model: dec.model,
      correlationId: opts.correlationId,
    });
    project = repair.project;
    issues = repair.errors;
    repairAttempts = repair.attempts;
    repairRejected = repair.rejected;
  }

  return {
    project,
    issues,
    accepted: issues.length === 0,
    decomposeAttempts: dec.attempts,
    repairAttempts,
    repairRejected,
  };
}
