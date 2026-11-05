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
  FactoryProject, SourceBlock, ContractRequirement, ContractTrack, AllocationRow, RoleMapRow, AgentTeam, Surface,
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
  /** L10.2/L10.3, same contract as allocation: optional here, checked by humanAiStructure. */
  agent_teams?: AgentTeam[];
  surfaces?: Surface[];
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
    // The DECOMPOSITION's rows are now a real path, where before they were discarded: this
    // read `input.allocation ?? []`, so a compliant model's output had nowhere to go and
    // "allocation is emittable" was true of the schema and false of the pipeline.
    //
    // Explicit input still WINS. A caller that passes allocation means it (the hand-authored
    // fixtures do), and when `d` carries nothing the behaviour is byte-identical to before,
    // which is what keeps this additive for every decomposition already stored.
    allocation: input.allocation ?? d.allocation ?? [],
    role_map: input.role_map ?? d.role_map ?? [],
    // Same precedence, same reason. The lesson from allocation was that a schema can permit a
    // field while the pipeline silently drops it, which makes "the model can emit teams" true
    // and useless at once. These two lines are what make L10.2/L10.3 reach storage.
    //
    // BUT NOT DEFAULTED TO [], UNLIKE THE TWO LINES ABOVE, and the difference is load-bearing.
    // `humanAiStructure` keeps `structured` separate from `passes` precisely so that a project
    // which declared NOTHING reports STRUCTURE_ABSENT instead of passing, and it decides that by
    // `agent_teams !== undefined`. Defaulting to `[]` here would make every assembled project
    // "structured" with zero teams - the check would go quiet exactly when it has something to
    // say. `undefined` means nobody declared; `[]` means somebody declared none.
    agent_teams: input.agent_teams ?? d.agent_teams ?? undefined,
    surfaces: input.surfaces ?? d.surfaces ?? undefined,
  };
}
