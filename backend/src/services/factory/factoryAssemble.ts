/**
 * factoryAssemble — PURE, deterministic assembly of a raw LLM decomposition into a complete
 * FactoryProject that factoryValidate can gate. This is the "code does the deterministic work"
 * half of the design: the model proposes the process/workforce/flow (probabilistic), and this
 * turns it into a well-formed project without adding judgment.
 *
 * What it does (and only this):
 *  - keeps the model's readable task/process/role handles (as the Phase-1 sample does);
 *  - DERIVES idempotent ids for assignments (factoryId('assignment', [task,role,responsibility]))
 *    and edges (factoryId('edge', [from,to,condition])), so the model's placeholder ids are
 *    replaced by stable ones and re-assembling the same decomposition is byte-identical;
 *  - ATTACHES the deterministic source_blocks / requirements / tracks from the input (the model
 *    never invents these — they are the ground truth the tasks cite);
 *  - defaults allocation / role_map to [] (factoryValidate does not require them).
 *
 * It does NOT validate — factoryGenerate (T7) runs factoryValidate and decides repair vs refuse.
 */
import type {
  FactoryProject, SourceBlock, ContractRequirement, ContractTrack, AllocationRow, RoleMapRow,
} from './contracts/factoryContract';
import type { FactoryDecomposition } from './factoryDecompose';
import { factoryId } from './factoryIds';

export interface FactoryAssembleInput {
  decomposition: FactoryDecomposition;
  /** classified source blocks the tasks cite (from factoryDecomposeInput / T3). */
  blocks: SourceBlock[];
  /** the compliance-matrix requirements for this project (loaded by the orchestrator). */
  requirements: ContractRequirement[];
  /** the contract tracks for this project (loaded by the orchestrator). */
  tracks: ContractTrack[];
  deliveryProjectId: string;
  /** optional, for the rendered review; the gate does not require them. */
  allocation?: AllocationRow[];
  role_map?: RoleMapRow[];
}

/**
 * Assemble a complete FactoryProject. Deterministic and total: given the same input it returns a
 * byte-identical project, and it never throws on well-typed input.
 */
export function assembleFactoryProject(input: FactoryAssembleInput): FactoryProject {
  const { decomposition: d } = input;

  const assignments = d.assignments.map((a) => ({
    ...a,
    id: factoryId('assignment', [a.task_id, a.role_id, a.responsibility]),
  }));

  const transitions = d.transitions.map((e) => ({
    ...e,
    id: factoryId('edge', [e.from_task_id, e.to_task_id, e.condition ?? '']),
  }));

  return {
    delivery_project_id: input.deliveryProjectId,
    tracks: input.tracks,
    source_blocks: input.blocks,
    requirements: input.requirements,
    processes: d.processes,
    tasks: d.tasks,
    roles: d.roles,
    assignments,
    transitions,
    allocation: input.allocation ?? [],
    role_map: input.role_map ?? [],
  };
}
