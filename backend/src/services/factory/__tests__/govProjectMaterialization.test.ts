import { materializeGovBuildProject, GovMaterializeError, type MaterializeGovProjectInput } from '../govProjectMaterialization';
import type { BuildPlan } from '../../sbp/planContract';

jest.mock('../../../modules/identity/platformIdentityService', () => ({ getIdentityLinks: jest.fn() }));
jest.mock('../../../models/PlatformIdentity', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));
jest.mock('../../../models/Enrollment', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../../../models/ContractTrack', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));
jest.mock('../../projectService', () => ({ createNewProjectForEnrollment: jest.fn() }));
jest.mock('../../sbp/materializeTasks', () => ({ materializePlanAsTasks: jest.fn() }));
jest.mock('../govDeliveryProject', () => ({ linkGovBuildToStudentProject: jest.fn() }));
jest.mock('../govBuildPlanAI', () => ({ decomposeGovBuildPlanRaw: jest.fn() }));
jest.mock('../../sbp/planGate', () => ({ gatePlan: jest.fn(() => ({ ok: true, violations: [] })), blockingViolations: jest.fn(() => []) }));
jest.mock('../govBuildAssignment', () => ({ ensureAssigneeCanBuild: jest.fn() }));
jest.mock('../../sbp/planStore', () => ({ getPublishedPlan: jest.fn(), savePlanDraft: jest.fn(), publishPlan: jest.fn() }));

import { getIdentityLinks } from '../../../modules/identity/platformIdentityService';
import { getPublishedPlan, savePlanDraft, publishPlan } from '../../sbp/planStore';
import ContractTrack from '../../../models/ContractTrack';
import { createNewProjectForEnrollment } from '../../projectService';
import { materializePlanAsTasks } from '../../sbp/materializeTasks';
import { linkGovBuildToStudentProject } from '../govDeliveryProject';
import { decomposeGovBuildPlanRaw } from '../govBuildPlanAI';
import { gatePlan, blockingViolations } from '../../sbp/planGate';
import { ensureAssigneeCanBuild } from '../govBuildAssignment';

const PLAN: BuildPlan = {
  project_name: 'TxDOT Claims DB', descriptor: 'claims search',
  requirements: [{ id: 'REQ-001', statement: 'x', kind: 'FUNC', priority: 'must', cluster: 'Core', from_dimensions: [] }],
  releases: [
    { key: 'r0', name: 'Skeleton', goal: 'g', demo: 'd', week_start: 1, week_end: 2 },
    { key: 'r1', name: 'Dashboard', goal: 'g', demo: 'd', week_start: 3, week_end: 4 },
  ],
  stories: [
    { id: 'STORY-001', release: 'r0', title: 't', narrative: 'n', fulfills: ['REQ-001'], owner_agent: 'A', acceptance: ['G', 'W', 'Trust'], task_guidance: 'tg', failure_paths: ['f'], blocked_by: [] },
    { id: 'STORY-002', release: 'r1', title: 't2', narrative: 'n2', fulfills: ['REQ-001'], owner_agent: 'A', acceptance: ['G', 'W', 'Trust'], task_guidance: 'tg', failure_paths: ['f'], blocked_by: ['STORY-001'] },
  ],
};

const baseInput: MaterializeGovProjectInput = {
  deliveryProjectId: 'dp-1', canonicalOpportunityId: 'gws:abc', assigneeIdentityId: 'id-1',
  requirements: [{ id: 'REQ-001', text: 'x' }], title: 'Claims DB', buyer: 'TxDOT',
  buildSpec: 'spec', deadline: '2026-10-19', now: new Date('2026-10-01'),
};

const mock = <T>(fn: T) => fn as unknown as jest.Mock;

describe('govProjectMaterialization (core-table write — idempotent, typed errors)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mock(getIdentityLinks).mockResolvedValue({ lead: [], enrollment: ['enr-1'], admin_user: [] });
    mock(decomposeGovBuildPlanRaw).mockResolvedValue({ plan: PLAN, cached: false });
    mock(gatePlan).mockReturnValue({ ok: true, violations: [] });
    mock(blockingViolations).mockReturnValue([]);
    mock(materializePlanAsTasks).mockResolvedValue({ lists: 2, tasks: 3, preservedComplete: 0 });
    mock(linkGovBuildToStudentProject).mockResolvedValue({ ok: true, linkId: 'l1', created: true });
    mock(ContractTrack.findByPk).mockResolvedValue(null);
    mock(getPublishedPlan).mockResolvedValue(null);
    mock(savePlanDraft).mockResolvedValue({ version: 1, plan_sha256: 'sha' });
    mock(publishPlan).mockResolvedValue(undefined);
  });

  it('happy path: creates a named project, marks its gov origin, links it, and materializes the plan', async () => {
    const project: any = { id: 'proj-1', project_variables: {}, save: jest.fn().mockResolvedValue(undefined) };
    mock(createNewProjectForEnrollment).mockResolvedValue(project);
    const r = await materializeGovBuildProject(baseInput);
    expect(r.created).toBe(true);
    expect(r.projectId).toBe('proj-1');
    expect(r.enrollmentId).toBe('enr-1');
    expect(r.tasks).toBe(3);
    expect(r.releaseCount).toBe(2);
    expect(project.name).toBeTruthy();                                  // a nameless project is invisible on the board
    expect(project.project_variables.kind).toBe('gov');
    expect(project.project_variables.gov_canonical_id).toBe('gws:abc');
    expect(project.save).toHaveBeenCalled();
    expect(mock(linkGovBuildToStudentProject)).toHaveBeenCalledWith(expect.objectContaining({ deliveryProjectId: 'dp-1', studentProjectId: 'proj-1' }));
    const matArgs = mock(materializePlanAsTasks).mock.calls[0];
    expect(matArgs[0]).toBe('proj-1');
    expect(matArgs[1]).toBe('enr-1');
    expect(matArgs[2]).toBe(PLAN);
    expect(matArgs[3].schedule).toBeTruthy();                           // scheduled to real dates
  });

  it('idempotent: when the solution_build track already links a project, it REUSES it (no new project)', async () => {
    mock(ContractTrack.findByPk).mockResolvedValue({ solution_student_project_id: 'proj-existing' });
    const r = await materializeGovBuildProject(baseInput);
    expect(r.created).toBe(false);
    expect(r.projectId).toBe('proj-existing');
    expect(mock(createNewProjectForEnrollment)).not.toHaveBeenCalled();  // the anti-duplicate guard
    expect(mock(linkGovBuildToStudentProject)).not.toHaveBeenCalled();
    expect(mock(materializePlanAsTasks)).toHaveBeenCalledWith('proj-existing', 'enr-1', PLAN, expect.objectContaining({ schedule: expect.anything() }));
  });

  it('grants the assignee the builder role on the delivery project, so their cockpit is not a 404', async () => {
    const project: any = { id: 'proj-1', project_variables: {}, save: jest.fn().mockResolvedValue(undefined) };
    mock(createNewProjectForEnrollment).mockResolvedValue(project);
    await materializeGovBuildProject(baseInput);
    // null actor: baseInput carries no actorIdentityId, so the grant records none.
    expect(mock(ensureAssigneeCanBuild)).toHaveBeenCalledWith('dp-1', 'id-1', null);
  });

  it('backfills membership even when the project is REUSED (re-running materialize grants cockpit access)', async () => {
    mock(ContractTrack.findByPk).mockResolvedValue({ solution_student_project_id: 'proj-existing' });
    await materializeGovBuildProject(baseInput);
    expect(mock(ensureAssigneeCanBuild)).toHaveBeenCalledWith('dp-1', 'id-1', null);
  });

  it('does NOT grant membership when materialize fails before the project is ensured', async () => {
    mock(blockingViolations).mockReturnValue([{ rule: 'release_unbalanced', message: 'too much in r0' }]);
    await expect(materializeGovBuildProject(baseInput)).rejects.toMatchObject({ reason: 'plan_blocked' });
    expect(mock(ensureAssigneeCanBuild)).not.toHaveBeenCalled();
  });

  it('no enrollment (identity has no link and no email match) → GovMaterializeError no_enrollment, writes nothing', async () => {
    mock(getIdentityLinks).mockResolvedValue({ lead: [], enrollment: [], admin_user: [] });
    const PlatformIdentity = require('../../../models/PlatformIdentity').default;
    mock(PlatformIdentity.findByPk).mockResolvedValue(null);
    await expect(materializeGovBuildProject(baseInput)).rejects.toMatchObject({ reason: 'no_enrollment' });
    expect(mock(createNewProjectForEnrollment)).not.toHaveBeenCalled();
    expect(mock(materializePlanAsTasks)).not.toHaveBeenCalled();
  });

  it("intern's cohort has no program → GovMaterializeError no_program", async () => {
    mock(createNewProjectForEnrollment).mockRejectedValue(new Error('Enrollment enr-1 has no associated program via cohort'));
    await expect(materializeGovBuildProject(baseInput)).rejects.toMatchObject({ reason: 'no_program' });
    expect(mock(materializePlanAsTasks)).not.toHaveBeenCalled();
  });

  it('a plan with blocking gate violations is refused → plan_blocked, nothing materialized', async () => {
    mock(blockingViolations).mockReturnValue([{ rule: 'release_unbalanced', message: 'too much in r0' }]);
    await expect(materializeGovBuildProject(baseInput)).rejects.toMatchObject({ reason: 'plan_blocked' });
    expect(mock(createNewProjectForEnrollment)).not.toHaveBeenCalled();
    expect(mock(materializePlanAsTasks)).not.toHaveBeenCalled();
  });

  it('a decomposition error surfaces → decompose_error (not fail-soft-silent)', async () => {
    mock(decomposeGovBuildPlanRaw).mockResolvedValue({ plan: null, cached: false, error: 'upstream down' });
    await expect(materializeGovBuildProject(baseInput)).rejects.toMatchObject({ reason: 'decompose_error' });
    expect(mock(materializePlanAsTasks)).not.toHaveBeenCalled();
  });

  it('bad input (no requirements) → bad_input, resolves no enrollment', async () => {
    await expect(materializeGovBuildProject({ ...baseInput, requirements: [] })).rejects.toMatchObject({ reason: 'bad_input' });
    expect(mock(getIdentityLinks)).not.toHaveBeenCalled();
  });

  it('publishes the REAL plan to build_plans so the repo sync renders it, not the empty reconstruction', async () => {
    const project: any = { id: 'proj-1', project_variables: {}, save: jest.fn().mockResolvedValue(undefined) };
    mock(createNewProjectForEnrollment).mockResolvedValue(project);
    await materializeGovBuildProject(baseInput);
    expect(mock(savePlanDraft)).toHaveBeenCalledWith('proj-1', PLAN, expect.objectContaining({ gate: expect.anything() }));
    expect(mock(publishPlan)).toHaveBeenCalledWith('proj-1', 1, 'sha');
  });

  it('self-heals: re-publishes the real plan over an existing empty-requirements reconstruction', async () => {
    mock(ContractTrack.findByPk).mockResolvedValue({ solution_student_project_id: 'proj-x' });
    mock(getPublishedPlan).mockResolvedValue({ plan: { requirements: [] } });
    await materializeGovBuildProject(baseInput);
    expect(mock(savePlanDraft)).toHaveBeenCalledWith('proj-x', PLAN, expect.anything());
    expect(mock(publishPlan)).toHaveBeenCalled();
  });

  it('leaves a GOOD existing plan alone — no re-publish churn', async () => {
    mock(ContractTrack.findByPk).mockResolvedValue({ solution_student_project_id: 'proj-x' });
    mock(getPublishedPlan).mockResolvedValue({ plan: { requirements: [{ id: 'REQ-001' }] } });
    await materializeGovBuildProject(baseInput);
    expect(mock(savePlanDraft)).not.toHaveBeenCalled();
    expect(mock(publishPlan)).not.toHaveBeenCalled();
  });

  it('a plan-persist failure is swallowed — materialize still succeeds', async () => {
    mock(ContractTrack.findByPk).mockResolvedValue({ solution_student_project_id: 'proj-x' });
    mock(getPublishedPlan).mockRejectedValue(new Error('db down'));
    const r = await materializeGovBuildProject(baseInput);
    expect(r.projectId).toBe('proj-x');
    expect(r.tasks).toBe(3);
  });
});
