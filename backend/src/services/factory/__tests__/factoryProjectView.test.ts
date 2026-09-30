/**
 * factoryProjectView is the single contract the read API serves and the command-center page renders.
 * These tests pin it to the REAL sample: the gate summary runs the real factoryValidate (0 errors), the
 * allocation/roster/compliance/flow projections carry the true data, and the agent's accountable human is
 * surfaced (the OVERSIGHT rule made visible). reconstructFactoryProject round-trips the split DB shape.
 */
import {
  factoryProjectView, reconstructFactoryProject, sampleCommandCenterView, type FactoryDocJson,
} from '../factoryProjectView';
import { buildSampleContractProject } from '../sample/sampleContractProject';

const s = buildSampleContractProject();
const view = factoryProjectView(s, { isSample: true, contractName: 'AI Government Contract Finder' });

describe('factoryProjectView — the gate summary is the real gate', () => {
  it('reports the sample as clean (0 errors) with every check passing', () => {
    expect(view.gate.ok).toBe(true);
    expect(view.gate.errorCount).toBe(0);
    expect(view.gate.checks.every((c) => c.ok)).toBe(true);
    expect(view.gate.checks.map((c) => c.code)).toEqual(
      expect.arrayContaining(['SOURCE_COVERAGE', 'OVERSIGHT', 'PERFORMER', 'FLOW', 'DECISION', 'WORK_REFERENCE']),
    );
  });
});

describe('factoryProjectView — the projections carry the true data', () => {
  it('allocation has the 4 rows with their execution classes', () => {
    expect(view.allocation).toHaveLength(4);
    const classes = view.allocation.map((a) => a.executionClass).sort();
    expect(classes).toEqual(['ai_with_approval', 'ai_with_approval', 'human', 'human']);
    // an AI-with-approval task names its accountable human
    const extract = view.allocation.find((a) => a.taskTitle.startsWith('Extract'));
    expect(extract?.executionClass).toBe('ai_with_approval');
    expect(extract?.accountable).toBe('Compliance Analyst');
  });

  it('the roster marks the agent role and surfaces its accountable human (OVERSIGHT visible)', () => {
    const agentRole = view.roster.find((r) => r.isAgent);
    expect(agentRole).toBeDefined();
    expect(agentRole?.name).toBe('Requirement Extraction Agent');
    expect(agentRole?.accountableHuman).toBe('Compliance Analyst');
    // people roles carry no agent flag
    expect(view.roster.filter((r) => !r.isAgent).length).toBeGreaterThan(0);
  });

  it('the flow has one START, one END, and the classify DECISION with two labeled branches', () => {
    expect(view.flow.nodes.filter((n) => n.kind === 'START')).toHaveLength(1);
    expect(view.flow.nodes.filter((n) => n.kind === 'END')).toHaveLength(1);
    const decision = view.flow.nodes.find((n) => n.kind === 'DECISION');
    expect(decision).toBeDefined();
    const outConds = view.flow.edges.filter((e) => e.from === decision!.id).map((e) => e.condition);
    expect(outConds.filter(Boolean).sort()).toEqual(['administrative', 'technical']);
  });

  it('compliance covers all 4 requirements, each cited by at least one task', () => {
    expect(view.compliance).toHaveLength(4);
    for (const r of view.compliance) expect(r.citedBy.length).toBeGreaterThan(0);
  });

  it('surfaces the process, the two tracks (solution build linked to a student project), role map, and workforce counts', () => {
    expect(view.process?.businessOutcome).toMatch(/compliance matrix/i);
    expect(view.tracks.map((t) => t.trackType).sort()).toEqual(['proposal', 'solution_build']);
    expect(view.tracks.find((t) => t.trackType === 'solution_build')?.linkedStudentProjectId).toBeTruthy();
    expect(view.roleMap[0].newRole).toBe('Compliance Analyst');
    expect(view.workforce.agents).toBe(1);
    expect(view.workforce.people).toBeGreaterThanOrEqual(2);
  });
});

describe('reconstructFactoryProject round-trips the split DB shape', () => {
  it('rebuilds a project equal to the sample from doc_json + tracks + requirements', () => {
    const docJson: FactoryDocJson = {
      processes: s.processes, roles: s.roles, tasks: s.tasks, assignments: s.assignments,
      transitions: s.transitions, allocation: s.allocation, role_map: s.role_map, source_blocks: s.source_blocks,
    };
    const rebuilt = reconstructFactoryProject({
      deliveryProjectId: s.delivery_project_id, docJson, tracks: s.tracks, requirements: s.requirements,
    });
    expect(rebuilt).toEqual(s);
  });
});

describe('sampleCommandCenterView is the day-one fixture', () => {
  it('is flagged as a sample and names the contract', () => {
    const v = sampleCommandCenterView();
    expect(v.isSample).toBe(true);
    expect(v.contractName).toBe('AI Government Contract Finder');
    expect(v.gate.ok).toBe(true);
  });
});

describe('the gate summary genuinely flips on a broken project (not hardcoded)', () => {
  it('reports OVERSIGHT failure when the agent performers lose their accountable humans', () => {
    // strip the human ACCOUNTABLE assignments → the two agent-performed tasks now lack oversight
    const broken = { ...s, assignments: s.assignments.filter((a) => a.responsibility !== 'ACCOUNTABLE') };
    const v = factoryProjectView(broken);
    expect(v.gate.ok).toBe(false);
    expect(v.gate.errorCount).toBeGreaterThan(0);
    expect(v.gate.checks.find((c) => c.code === 'OVERSIGHT')?.ok).toBe(false);
    // per-rule, not all-or-nothing: an unaffected check stays true
    expect(v.gate.checks.find((c) => c.code === 'PERFORMER')?.ok).toBe(true);
  });
});

describe('an UNASSESSED migrated shell renders HONESTLY — renders, does not approve (Phase 6)', () => {
  // Exactly what backfillUnassessedContract produces: empty decomposition + one explicit
  // "not yet assessed" requirement + two unassessed tracks. No invented work.
  const emptyDoc: FactoryDocJson = {
    processes: [], roles: [], tasks: [], assignments: [], transitions: [], allocation: [], role_map: [], source_blocks: [],
  };
  const tracks = [
    { id: 't-p', delivery_project_id: 'dp-x', track_type: 'proposal', status: 'unassessed', owner_identity_id: null, solution_student_project_id: null },
    { id: 't-s', delivery_project_id: 'dp-x', track_type: 'solution_build', status: 'unassessed', owner_identity_id: null, solution_student_project_id: null },
  ] as any;
  const requirements = [
    {
      id: 'r-unassessed', delivery_project_id: 'dp-x', canonical_req_id: 'UNASSESSED',
      statement: 'This project has not been assessed against the factory model.', kind: 'compliance', priority: 'must',
      tracks: ['proposal', 'solution_build'], source_document: '', amendment_version: '', section: '', extracted_text: '',
      interpretation: 'Migrated shell — evidence not yet established.', human_confirmed: false, evidence_state: 'unassessed', source_evidence: [],
    },
  ] as any;

  const project = reconstructFactoryProject({ deliveryProjectId: 'dp-x', docJson: emptyDoc, tracks, requirements });

  it('renders the command-center view WITHOUT throwing', () => {
    expect(() => factoryProjectView(project, { contractName: 'AI Ops Assistant (ordinary demo)' })).not.toThrow();
  });

  const view = factoryProjectView(project, { contractName: 'AI Ops Assistant (ordinary demo)' });

  it('the gate HONESTLY fails (empty task graph → no START/END) — it is not approvable', () => {
    expect(view.gate.ok).toBe(false);
    expect(view.gate.errorCount).toBeGreaterThan(0);
    expect(view.gate.checks.find((c) => c.code === 'FLOW')?.ok).toBe(false); // one start, a reachable end
  });

  it('surfaces the unassessed label and NO invented work', () => {
    expect(view.compliance).toHaveLength(1);
    expect(view.compliance[0].evidenceState).toBe('unassessed');
    expect(view.flow.nodes).toHaveLength(0);
    expect(view.allocation).toHaveLength(0);
    expect(view.roster).toHaveLength(0);
    expect(view.process).toBeNull();
    expect(view.workforce).toEqual({ people: 0, agents: 0 });
    // the two tracks still render, so the page shows the shape honestly
    expect(view.tracks.map((t) => t.trackType).sort()).toEqual(['proposal', 'solution_build']);
    expect(view.tracks.every((t) => t.status === 'unassessed')).toBe(true);
  });
});
