/**
 * factoryProjectView — PURE projection of a FactoryProject into the Command Center view model, plus
 * the reconstruction that rebuilds a full FactoryProject from what the DB stores.
 *
 * Two concerns, both pure (no I/O), so the read route (factoryRoutes) stays a thin loader:
 *  1. reconstructFactoryProject — contract_process_documents.doc_json is a SUBSET (processes, roles,
 *     tasks, assignments, transitions, allocation, role_map, source_blocks). The full FactoryProject the
 *     UI needs also carries `tracks` (from contract_tracks) and `requirements` (from contract_requirements)
 *     and the delivery_project_id. This merges the three.
 *  2. factoryProjectView — the command-center view model the API serves and the page renders. Its gate
 *     summary runs the REAL factoryValidate; its allocation/roster/compliance/role-map projections mirror
 *     scripts/renderSampleContractReview.ts (the honest picture, computed from the data, never hardcoded).
 */
import type {
  FactoryProject, ContractTrack, ContractRequirement, TaskKind,
} from './contracts/factoryContract';
import { factoryValidate } from './factoryValidate';
import { buildSampleContractProject } from './sample/sampleContractProject';

/** The eight members contract_process_documents.doc_json stores (see seedSampleContractProject). */
export interface FactoryDocJson {
  processes: FactoryProject['processes'];
  roles: FactoryProject['roles'];
  tasks: FactoryProject['tasks'];
  assignments: FactoryProject['assignments'];
  transitions: FactoryProject['transitions'];
  allocation: FactoryProject['allocation'];
  role_map: FactoryProject['role_map'];
  source_blocks: FactoryProject['source_blocks'];
}

/** Merge the persisted subset with the sibling-table rows into a full FactoryProject. Pure, total. */
export function reconstructFactoryProject(input: {
  deliveryProjectId: string;
  docJson: FactoryDocJson;
  tracks: ContractTrack[];
  requirements: ContractRequirement[];
}): FactoryProject {
  const d = input.docJson;
  return {
    delivery_project_id: input.deliveryProjectId,
    tracks: input.tracks ?? [],
    source_blocks: d.source_blocks ?? [],
    requirements: input.requirements ?? [],
    processes: d.processes ?? [],
    tasks: d.tasks ?? [],
    roles: d.roles ?? [],
    assignments: d.assignments ?? [],
    transitions: d.transitions ?? [],
    allocation: d.allocation ?? [],
    role_map: d.role_map ?? [],
  };
}

// ── the view model ─────────────────────────────────────────────────────────────
export interface GateCheck { code: string; label: string; ok: boolean; }
export interface CcTrack { trackType: string; status: string; owner: string | null; requirementIds: string[]; linkedStudentProjectId: string | null; }
export interface CcFlowNode { id: string; title: string; kind: TaskKind; executorType: string | null; performerRole: string | null; accountableRole: string | null; method: string; confidence: number | null; sourceEvidence: string[]; }
export interface CcFlowEdge { from: string; to: string; condition: string | null; isRework: boolean; }
export interface CcAllocation { taskId: string; taskTitle: string; executionClass: string; performer: string | null; accountable: string | null; rationale: string; }
export interface CcRole { roleId: string; name: string; definition: string; executorType: string | null; isAgent: boolean; accountableHuman: string | null; }
export interface CcRequirement { id: string; statement: string; kind: string; priority: string; evidenceState: string; tracks: string[]; citedBy: string[]; }
export interface CcRoleMap { previousFunction: string; aiContribution: string; newRole: string; retained: string[]; }

export interface FactoryCommandCenterView {
  deliveryProjectId: string;
  contractName: string;
  isSample: boolean;
  gate: { ok: boolean; errorCount: number; checks: GateCheck[]; };
  process: { id: string; businessOutcome: string; successCriterion: string; } | null;
  tracks: CcTrack[];
  flow: { nodes: CcFlowNode[]; edges: CcFlowEdge[]; };
  allocation: CcAllocation[];
  roster: CcRole[];
  compliance: CcRequirement[];
  roleMap: CcRoleMap[];
  workforce: { people: number; agents: number; };
}

export interface FactoryViewOptions { isSample?: boolean; contractName?: string; }

export function factoryProjectView(project: FactoryProject, opts: FactoryViewOptions = {}): FactoryCommandCenterView {
  const roleName = (id: string | null | undefined): string | null => project.roles.find((r) => r.id === id)?.name ?? (id ?? null);
  const performerOf = (taskId: string) => project.assignments.find((a) => a.task_id === taskId && a.responsibility === 'PERFORMER');
  const accountableOf = (taskId: string) => project.assignments.find((a) => a.task_id === taskId && a.responsibility === 'ACCOUNTABLE');

  const errors = factoryValidate(project).filter((i) => i.severity === 'error');
  const noneOf = (codes: string[]): boolean => !errors.some((e) => codes.includes(e.code));
  const checks: GateCheck[] = [
    { code: 'SOURCE_COVERAGE', label: 'Every task cites its source evidence', ok: noneOf(['SOURCE_COVERAGE', 'SOURCE_CLASSIFICATION']) },
    { code: 'OVERSIGHT', label: 'Every AI task has an accountable human', ok: noneOf(['OVERSIGHT']) },
    { code: 'PERFORMER', label: 'Every task has a performer', ok: noneOf(['PERFORMER']) },
    { code: 'FLOW', label: 'One start, a reachable end, no dead ends', ok: noneOf(['START', 'END', 'REACHABILITY', 'LOOP']) },
    { code: 'DECISION', label: 'Decision branches are labeled and distinct', ok: noneOf(['DECISION', 'BRANCH_KIND']) },
    { code: 'WORK_REFERENCE', label: 'Every task, edge and assignment resolves', ok: noneOf(['WORK_REFERENCE', 'DUPLICATE_ASSIGNMENT', 'EFFORT_EVIDENCE']) },
  ];

  const flowNodes: CcFlowNode[] = project.tasks.map((t) => {
    const perf = performerOf(t.id);
    const acct = accountableOf(t.id);
    return {
      id: t.id, title: t.title, kind: t.kind,
      executorType: perf?.executor?.type ?? null,
      performerRole: roleName(perf?.role_id),
      accountableRole: roleName(acct?.role_id),
      method: t.method, confidence: t.confidence, sourceEvidence: t.source_evidence,
    };
  });
  const flowEdges: CcFlowEdge[] = project.transitions.map((e) => ({ from: e.from_task_id, to: e.to_task_id, condition: e.condition, isRework: e.is_rework }));

  const allocation: CcAllocation[] = project.allocation.map((a) => {
    const perf = performerOf(a.task_id);
    return {
      taskId: a.task_id,
      taskTitle: project.tasks.find((t) => t.id === a.task_id)?.title ?? a.task_id,
      executionClass: a.execution_class,
      performer: roleName(perf?.role_id),
      accountable: roleName(a.accountable_role_id),
      rationale: a.rationale,
    };
  });

  const roster: CcRole[] = project.roles.map((r) => {
    const perfAssign = project.assignments.find((a) => a.role_id === r.id && a.responsibility === 'PERFORMER');
    const isAgent = perfAssign?.executor?.type === 'agent';
    let accountableHuman: string | null = null;
    if (isAgent && perfAssign) {
      const acct = project.assignments.find((a) => a.task_id === perfAssign.task_id && a.responsibility === 'ACCOUNTABLE');
      accountableHuman = roleName(acct?.role_id);
    }
    return { roleId: r.id, name: r.name, definition: r.definition, executorType: perfAssign?.executor?.type ?? null, isAgent, accountableHuman };
  });

  const compliance: CcRequirement[] = project.requirements.map((r) => ({
    id: r.id, statement: r.statement, kind: r.kind, priority: r.priority, evidenceState: r.evidence_state,
    tracks: r.tracks,
    citedBy: project.tasks.filter((t) => r.source_evidence.some((b) => t.source_evidence.includes(b))).map((t) => t.title),
  }));

  const roleMap: CcRoleMap[] = project.role_map.map((m) => ({
    previousFunction: m.previous_function, aiContribution: m.ai_contribution,
    newRole: roleName(m.new_role_id) ?? m.new_role_id, retained: m.retained_responsibilities,
  }));

  const people = new Set<string>();
  const agents = new Set<string>();
  for (const a of project.assignments) {
    if (a.executor?.type === 'agent') agents.add(a.executor.id);
    else if (a.executor && (a.executor.type === 'person' || a.executor.type === 'team')) people.add(a.executor.id);
  }

  const p0 = project.processes[0];
  const tracks: CcTrack[] = project.tracks.map((t) => ({
    trackType: t.track_type, status: t.status, owner: t.owner_identity_id,
    requirementIds: project.requirements.filter((r) => (r.tracks as string[]).includes(t.track_type)).map((r) => r.id),
    linkedStudentProjectId: t.solution_student_project_id,
  }));

  return {
    deliveryProjectId: project.delivery_project_id,
    contractName: opts.contractName ?? 'Delivery contract',
    isSample: opts.isSample ?? false,
    gate: { ok: errors.length === 0, errorCount: errors.length, checks },
    process: p0 ? { id: p0.id, businessOutcome: p0.business_outcome, successCriterion: p0.success_criterion } : null,
    tracks,
    flow: { nodes: flowNodes, edges: flowEdges },
    allocation, roster, compliance, roleMap,
    workforce: { people: people.size, agents: agents.size },
  };
}

/** The fixture view: the Phase-1 sample, so the command center renders on day one. */
export function sampleCommandCenterView(): FactoryCommandCenterView {
  return factoryProjectView(buildSampleContractProject(), { isSample: true, contractName: 'AI Government Contract Finder' });
}
