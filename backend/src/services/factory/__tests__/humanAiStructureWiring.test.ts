/**
 * The structure evaluator had no production caller (L10.2/L10.3).
 *
 * `evaluateHumanAiStructure` was written with fifteen rule codes and a full suite, and nothing
 * called it. A decomposition could declare no agent teams and no console and the gate would not
 * mention it, so "the structure is checked" was true of the code and false of the pipeline - the
 * same shape as `allocation` being emittable by the schema while assembly discarded it.
 *
 * These tests fix the two halves in place: the model's teams and surfaces REACH the project, and
 * the gate SAYS something about them. Both are the kind of wiring that is invisible when it
 * breaks, because everything stays green and the output merely goes quiet.
 */
import { assembleFactoryProject, type FactoryAssembleInput } from '../factoryAssemble';
import { buildSampleContractProject } from '../sample/sampleContractProject';
import { factoryValidate, factoryErrors } from '../factoryValidate';
import { evaluateHumanAiStructure } from '../humanAiStructure';
import type { FactoryDecomposition } from '../factoryDecompose';
import type { AgentTeam, Surface } from '../contracts/factoryContract';

const sample = buildSampleContractProject();

function decomposition(over: Partial<FactoryDecomposition> = {}): FactoryDecomposition {
  return {
    processes: sample.processes,
    tasks: sample.tasks,
    assignments: sample.assignments,
    transitions: sample.transitions,
    roles: sample.roles,
    allocation: sample.allocation,
    ...over,
  };
}

function input(over: Partial<FactoryAssembleInput> = {}): FactoryAssembleInput {
  return {
    decomposition: decomposition(),
    blocks: sample.source_blocks,
    requirements: sample.requirements,
    tracks: sample.tracks,
    deliveryProjectId: sample.delivery_project_id,
    ...over,
  };
}

/** The sample's two AI tasks, on one team of one subject. */
const team: AgentTeam = {
  id: 'team-extraction',
  name: 'Extraction',
  subject: 'requirement extraction',
  task_ids: ['t-extract', 't-classify'],
  approver_role_id: 'role-analyst',
  execution_policy: 'agent_with_review',
  approval_policy: 'internal_review',
  autonomy_stage: null,
  trust_dimensions: ['permitted'],
};

const console_: Surface = {
  id: 'surface-console',
  name: 'Delivery Console',
  kind: 'console',
  task_ids: ['t-route-admin', 't-route-tech'],
};

describe('the model\'s teams and surfaces reach the assembled project', () => {
  it('carries agent_teams and surfaces through assembly', () => {
    const p = assembleFactoryProject(input({
      decomposition: decomposition({ agent_teams: [team], surfaces: [console_] }),
    }));
    expect(p.agent_teams).toEqual([team]);
    expect(p.surfaces).toEqual([console_]);
  });

  it('lets an explicit caller override the model, as allocation already does', () => {
    const mine: AgentTeam[] = [{ ...team, id: 'team-mine', subject: 'pricing' }];
    const p = assembleFactoryProject(input({
      decomposition: decomposition({ agent_teams: [team] }),
      agent_teams: mine,
    }));
    expect(p.agent_teams).toEqual(mine);
  });

  describe('an undeclared structure stays UNDEFINED, not an empty array', () => {
    // THE BUG THIS NEARLY SHIPPED. `humanAiStructure` keeps `structured` separate from `passes`
    // and decides it by `agent_teams !== undefined`. Defaulting to `[]` in assembly would make
    // every project "structured" with zero teams, so STRUCTURE_ABSENT could never fire again -
    // the check going silent exactly when it has something to report.
    it('leaves both undefined when the model declared nothing', () => {
      const p = assembleFactoryProject(input());
      expect(p.agent_teams).toBeUndefined();
      expect(p.surfaces).toBeUndefined();
    });

    it('leaves both undefined when the model sent null', () => {
      const p = assembleFactoryProject(input({
        decomposition: decomposition({ agent_teams: null, surfaces: null }),
      }));
      expect(p.agent_teams).toBeUndefined();
      expect(p.surfaces).toBeUndefined();
    });

    it('so STRUCTURE_ABSENT still fires on a project nobody structured', () => {
      const p = assembleFactoryProject(input());
      const r = evaluateHumanAiStructure({
        tasks: p.tasks, allocation: p.allocation, assignments: p.assignments,
        agent_teams: p.agent_teams, surfaces: p.surfaces,
      });
      expect(r.structured).toBe(false);
      expect(r.findings.map((f) => f.rule)).toContain('STRUCTURE_ABSENT');
    });

    it('but an EMPTY declaration is structured - declaring none differs from never declaring', () => {
      const p = assembleFactoryProject(input({
        decomposition: decomposition({ agent_teams: [], surfaces: [] }),
      }));
      expect(p.agent_teams).toEqual([]);
      const r = evaluateHumanAiStructure({
        tasks: p.tasks, allocation: p.allocation, assignments: p.assignments,
        agent_teams: p.agent_teams, surfaces: p.surfaces,
      });
      expect(r.structured).toBe(true);
    });
  });
});

describe('the gate reports structure findings, and blocks on none of them', () => {
  it('surfaces STRUCTURE_ABSENT as a warning on an unstructured project', () => {
    const p = assembleFactoryProject(input());
    const codes = factoryValidate(p).filter((i) => i.severity === 'warning').map((i) => i.code);
    expect(codes).toContain('STRUCTURE_STRUCTURE_ABSENT');
  });

  it('adds ZERO errors, so no stored decomposition is retroactively un-approved', () => {
    // Every decomposition generated before today has neither teams nor surfaces. Promoting
    // these to errors would un-approve the whole corpus and block regenerating the live bid,
    // which is why the evaluator's own `blocking` severity is mapped to `warning` here.
    const p = assembleFactoryProject(input());
    expect(factoryErrors(p)).toEqual([]);
  });

  it('still adds zero errors for a project with a genuinely broken structure', () => {
    const p = assembleFactoryProject(input({
      // Two teams sharing one subject, and a team claiming a human task: both 'blocking' to the
      // evaluator. The gate must report them and still approve, until a caller earns the veto.
      decomposition: decomposition({
        agent_teams: [team, { ...team, id: 'team-two', task_ids: ['t-route-admin'] }],
        surfaces: [console_],
      }),
    }));
    const warnings = factoryValidate(p).filter((i) => i.severity === 'warning').map((i) => i.code);
    expect(warnings).toContain('STRUCTURE_SUBJECT_UNIQUE');
    expect(warnings).toContain('STRUCTURE_TEAM_CLAIMS_HUMAN_TASK');
    expect(factoryErrors(p)).toEqual([]);
  });

  it('warns that a team with no autonomy stage is unassessed, rather than assuming one', () => {
    const p = assembleFactoryProject(input({
      decomposition: decomposition({ agent_teams: [team], surfaces: [console_] }),
    }));
    expect(factoryValidate(p).map((i) => i.code)).toContain('STRUCTURE_AUTONOMY_STAGE_UNASSESSED');
  });

  it('says nothing about structure on a correctly structured project', () => {
    const p = assembleFactoryProject(input({
      // A stage AND the dimensions, so this is clean rather than merely unobjectionable.
      decomposition: decomposition({
        agent_teams: [{ ...team, autonomy_stage: 'autonomy:R6' }],
        surfaces: [console_],
      }),
    }));
    const structure = factoryValidate(p).filter((i) => i.code.startsWith('STRUCTURE_'));
    // A clean project producing a clean result is what makes the warnings above worth reading.
    // Without this, a rule that fired on everything would look the same as one that works.
    expect(structure).toEqual([]);
  });

  it('names the offending id on the finding, so a warning is actionable', () => {
    const p = assembleFactoryProject(input({
      decomposition: decomposition({ agent_teams: [{ ...team, subject: '  ' }], surfaces: [console_] }),
    }));
    const f = factoryValidate(p).find((i) => i.code === 'STRUCTURE_SUBJECT_REQUIRED');
    expect(f).toBeDefined();
    expect(f!.stepId).toBe('team-extraction');
  });
});
