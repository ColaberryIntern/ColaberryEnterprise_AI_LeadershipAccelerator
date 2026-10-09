/**
 * factoryAssemble is the step that makes the golden path REACHABLE: a well-formed decomposition
 * plus the deterministic source_blocks/requirements/tracks must assemble into a project that
 * factoryValidate accepts with ZERO errors. The known-valid sample (sampleContractProject — proven
 * zero-error) is the fixture: its five decomposition lists + its blocks/requirements/tracks, fed
 * through assembly, must reconstruct a gate-valid project. Ids are recomputed deterministically, so
 * even garbage input ids produce the stable ones, and re-assembly is byte-identical.
 */
import { assembleFactoryProject, type FactoryAssembleInput } from '../factoryAssemble';
import { buildSampleContractProject } from '../sample/sampleContractProject';
import { factoryErrors } from '../factoryValidate';
import { factoryId } from '../factoryIds';
import type { FactoryDecomposition } from '../factoryDecompose';

const sample = buildSampleContractProject();

/** The five decomposition lists the model would emit, taken from the known-valid sample. */
function sampleDecomposition(): FactoryDecomposition {
  return {
    processes: sample.processes,
    tasks: sample.tasks,
    assignments: sample.assignments,
    transitions: sample.transitions,
    roles: sample.roles,
  };
}

function baseInput(overrides: Partial<FactoryAssembleInput> = {}): FactoryAssembleInput {
  return {
    decomposition: sampleDecomposition(),
    blocks: sample.source_blocks,
    requirements: sample.requirements,
    tracks: sample.tracks,
    deliveryProjectId: sample.delivery_project_id,
    ...overrides,
  };
}

describe('assembleFactoryProject produces a gate-valid FactoryProject (the golden path)', () => {
  it('reconstructs the known-valid sample and factoryValidate returns ZERO errors', () => {
    const project = assembleFactoryProject(baseInput({ allocation: sample.allocation, role_map: sample.role_map }));
    expect(factoryErrors(project)).toEqual([]);
    // full reconstruction: same decomposition + same inputs + same derived ids ⇒ equals the sample
    expect(project).toEqual(sample);
  });

  it('attaches the input blocks, requirements, and tracks (the model never invents them)', () => {
    const project = assembleFactoryProject(baseInput());
    expect(project.source_blocks).toBe(sample.source_blocks);
    expect(project.requirements).toBe(sample.requirements);
    expect(project.tracks).toBe(sample.tracks);
    expect(project.delivery_project_id).toBe(sample.delivery_project_id);
  });

  it('carries the DECOMPOSITION\u2019s allocation and role_map through to the project', () => {
    // The path, not just the schema. Before P3-T3 this read `input.allocation ?? []`, so a
    // compliant model's rows were discarded and "allocation is emittable" was true of the schema
    // object and false of the pipeline. Without this assertion the line could be reverted and
    // every other test would stay green.
    const d = sampleDecomposition();
    d.allocation = sample.allocation;
    d.role_map = sample.role_map;

    const project = assembleFactoryProject(baseInput({ decomposition: d }));  // no input.allocation
    expect(project.allocation).toEqual(sample.allocation);
    expect(project.role_map).toEqual(sample.role_map);
  });

  it('lets EXPLICIT input win over the decomposition, so a caller that passes rows means it', () => {
    const d = sampleDecomposition();
    d.allocation = sample.allocation;

    const project = assembleFactoryProject(baseInput({ decomposition: d, allocation: [] }));
    expect(project.allocation).toEqual([]);
  });

  it('treats a null from the model as nothing to state, not as a crash', () => {
    // Strict mode forces the key into every response, so `null` is the shape a model sends when
    // it has nothing to declare. That must behave exactly like the pre-P3-T3 stored shape.
    const d = sampleDecomposition();
    d.allocation = null;
    d.role_map = null;

    const project = assembleFactoryProject(baseInput({ decomposition: d }));
    expect(project.allocation).toEqual([]);
    expect(project.role_map).toEqual([]);
    expect(factoryErrors(project)).toEqual([]);
  });
  it('defaults allocation and role_map to [] when the orchestrator omits them, still zero errors', () => {
    const project = assembleFactoryProject(baseInput()); // no allocation/role_map passed
    expect(project.allocation).toEqual([]);
    expect(project.role_map).toEqual([]);
    expect(factoryErrors(project)).toEqual([]);
  });
});

describe('assembleFactoryProject derives idempotent ids deterministically', () => {
  it('recomputes assignment and edge ids from their semantic keys, overriding whatever the model sent', () => {
    const d = sampleDecomposition();
    // simulate a model that emitted useless placeholder ids
    d.assignments = d.assignments.map((a) => ({ ...a, id: 'GARBAGE' }));
    d.transitions = d.transitions.map((e) => ({ ...e, id: 'GARBAGE' }));

    const project = assembleFactoryProject(baseInput({ decomposition: d }));

    for (const a of project.assignments) {
      expect(a.id).toBe(factoryId('assignment', [a.task_id, a.role_id, a.responsibility]));
      expect(a.id).not.toBe('GARBAGE');
    }
    for (const e of project.transitions) {
      expect(e.id).toBe(factoryId('edge', [e.from_task_id, e.to_task_id, e.condition ?? '']));
      expect(e.id).not.toBe('GARBAGE');
    }
    // fixing the ids does not disturb the gate
    expect(factoryErrors(project)).toEqual([]);
  });

  it('is idempotent: assembling the same input twice is byte-identical', () => {
    expect(assembleFactoryProject(baseInput())).toEqual(assembleFactoryProject(baseInput()));
  });

  it('every task.process_id resolves to a process in the assembled project (WORK_REFERENCE holds)', () => {
    const project = assembleFactoryProject(baseInput());
    const processIds = new Set(project.processes.map((p) => p.id));
    for (const t of project.tasks) expect(processIds.has(t.process_id)).toBe(true);
  });
});

describe('assembleFactoryProject is total (does not throw on sparse input)', () => {
  it('handles a decomposition with no assignments/transitions without throwing', () => {
    const sparse: FactoryDecomposition = { processes: sample.processes, tasks: [], assignments: [], transitions: [], roles: [] };
    const project = assembleFactoryProject(baseInput({ decomposition: sparse }));
    expect(project.assignments).toEqual([]);
    expect(project.transitions).toEqual([]);
    // (this project is NOT gate-valid — that is factoryGenerate's job to catch, not assembly's)
  });
});
