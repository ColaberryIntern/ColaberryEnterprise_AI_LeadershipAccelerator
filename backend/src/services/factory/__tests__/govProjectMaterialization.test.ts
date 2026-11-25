import { materializeGovBuildProject, GovMaterializeError, type MaterializeGovProjectInput } from '../govProjectMaterialization';
import type { BuildPlan } from '../../sbp/planContract';

jest.mock('../../../modules/identity/platformIdentityService', () => ({ getIdentityLinks: jest.fn() }));
jest.mock('../../../models/PlatformIdentity', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));
jest.mock('../../../models/Enrollment', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../../../models/ContractTrack', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));
jest.mock('../../projectService', () => ({ createDetachedProjectForEnrollment: jest.fn() }));
jest.mock('../../sbp/materializeTasks', () => ({ materializePlanAsTasks: jest.fn() }));
jest.mock('../govDeliveryProject', () => ({ linkGovBuildToStudentProject: jest.fn() }));
jest.mock('../govBuildPlanAI', () => ({ decomposeGovBuildPlanRaw: jest.fn() }));
jest.mock('../../sbp/planGate', () => ({ gatePlan: jest.fn(() => ({ ok: true, violations: [] })), blockingViolations: jest.fn(() => []) }));
jest.mock('../govBuildAssignment', () => ({ ensureAssigneeCanBuild: jest.fn() }));
jest.mock('../../sbp/planStore', () => ({ getPublishedPlan: jest.fn(), savePlanDraft: jest.fn(), publishPlan: jest.fn() }));
jest.mock('../proposal/reanalyzeProposalBlueprint', () => ({ reanalyzeProposalBlueprint: jest.fn() }));

import { getIdentityLinks } from '../../../modules/identity/platformIdentityService';
import { reanalyzeProposalBlueprint } from '../proposal/reanalyzeProposalBlueprint';
import { getPublishedPlan, savePlanDraft, publishPlan } from '../../sbp/planStore';
import ContractTrack from '../../../models/ContractTrack';
import { createDetachedProjectForEnrollment } from '../../projectService';
import { materializePlanAsTasks } from '../../sbp/materializeTasks';
import { linkGovBuildToStudentProject } from '../govDeliveryProject';
import { decomposeGovBuildPlanRaw } from '../govBuildPlanAI';
import { gatePlan, blockingViolations } from '../../sbp/planGate';
import { ensureAssigneeCanBuild } from '../govBuildAssignment';
import { normalizeGovReleaseLadder } from '../govReleaseLadder';

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

// M2-T1: gov materialize now imposes the R0/R1/R2 ladder on the gated plan before it is
// scheduled, materialized, and published. The real (unmocked) ladder function is what runs
// inside materializeGovBuildProject, so the plan forwarded downstream is this value.
const LADDER = normalizeGovReleaseLadder(PLAN);

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
    mock(reanalyzeProposalBlueprint).mockResolvedValue({ version: 1, blueprint: {}, diff: {}, documentCount: 13 });
  });

  it('happy path: creates a named project, marks its gov origin, links it, and materializes the plan', async () => {
    const project: any = { id: 'proj-1', project_variables: {}, save: jest.fn().mockResolvedValue(undefined) };
    mock(createDetachedProjectForEnrollment).mockResolvedValue(project);
    const r = await materializeGovBuildProject(baseInput);
    expect(r.created).toBe(true);
    expect(r.projectId).toBe('proj-1');
    expect(r.enrollmentId).toBe('enr-1');
    expect(r.tasks).toBe(3);
    expect(r.releaseCount).toBe(3);                                     // M2-T1: always the R0/R1/R2 ladder
    expect(project.name).toBeTruthy();                                  // a nameless project is invisible on the board
    expect(project.project_variables.kind).toBe('gov');
    expect(project.project_variables.gov_canonical_id).toBe('gws:abc');
    expect(project.project_variables.gov_parked_releases).toContain('r2');   // M2-T2: R2 parked by default
    expect(project.save).toHaveBeenCalled();
    expect(mock(linkGovBuildToStudentProject)).toHaveBeenCalledWith(expect.objectContaining({ deliveryProjectId: 'dp-1', studentProjectId: 'proj-1' }));
    const matArgs = mock(materializePlanAsTasks).mock.calls[0];
    expect(matArgs[0]).toBe('proj-1');
    expect(matArgs[1]).toBe('enr-1');
    expect(matArgs[2]).toEqual(LADDER);                                 // M2-T1: the laddered plan, not the raw decomposition
    expect(matArgs[2].releases.map((rel: { key: string }) => rel.key)).toEqual(['r0', 'r1', 'r2']);
    expect(matArgs[2].stories.map((s: { id: string }) => s.id)).toEqual(PLAN.stories.map((s) => s.id)); // stories intact
    expect(matArgs[3].schedule).toBeTruthy();                           // scheduled to real dates
  });

  // M1-T1 (Gov Proposal Studio): a NEW gov project must materialize STORY-900 Connected Demo (blocked_by STORY-000
  // Command Center), exactly as the student path. The spine injection lives in materializePlanAsTasks and fires only
  // when ctx.connectedDemo === true, so the one observable contract at this layer is that the flag is passed through.
  it('passes connectedDemo:true so gov projects materialize the Command Center + Connected Demo spine', async () => {
    const project: any = { id: 'proj-1', project_variables: {}, save: jest.fn().mockResolvedValue(undefined) };
    mock(createDetachedProjectForEnrollment).mockResolvedValue(project);
    await materializeGovBuildProject(baseInput);
    const matArgs = mock(materializePlanAsTasks).mock.calls[0];
    expect(matArgs[3].connectedDemo).toBe(true);
  });

  it('passes connectedDemo:true on the REUSE path too, so a re-run still carries the demo spine', async () => {
    mock(ContractTrack.findByPk).mockResolvedValue({ solution_student_project_id: 'proj-existing' });
    await materializeGovBuildProject(baseInput);
    const matArgs = mock(materializePlanAsTasks).mock.calls[0];
    expect(matArgs[3].connectedDemo).toBe(true);
  });

  it('idempotent: when the solution_build track already links a project, it REUSES it (no new project)', async () => {
    mock(ContractTrack.findByPk).mockResolvedValue({ solution_student_project_id: 'proj-existing' });
    const r = await materializeGovBuildProject(baseInput);
    expect(r.created).toBe(false);
    expect(r.projectId).toBe('proj-existing');
    expect(mock(createDetachedProjectForEnrollment)).not.toHaveBeenCalled();  // the anti-duplicate guard
    expect(mock(linkGovBuildToStudentProject)).not.toHaveBeenCalled();
    expect(mock(materializePlanAsTasks)).toHaveBeenCalledWith('proj-existing', 'enr-1', LADDER, expect.objectContaining({ schedule: expect.anything() }));
  });

  // M2-T4: AUTO-PICKUP. The materialize-build-project action IS the assignment action (it takes the assignee),
  // so assigning a gov project to an intern runs the WHOLE lifecycle in one call - the R0 Command Center + demo
  // spine, the R1/R2 ladder, and R2 parked - with no second manual step. T3's detached create is what lets the
  // same action pick up a SECOND gov project for the same intern without clobbering the first.
  it('a fresh gov assignment picks up the whole ladder in ONE call: R0 spine + R1 active + R2 parked, detached', async () => {
    const project: any = { id: 'proj-1', project_variables: {}, save: jest.fn().mockResolvedValue(undefined) };
    mock(createDetachedProjectForEnrollment).mockResolvedValue(project);
    const r = await materializeGovBuildProject(baseInput);
    expect(r.created).toBe(true);
    expect(r.releaseCount).toBe(3);                                         // R0 / R1 / R2 ladder
    const matArgs = mock(materializePlanAsTasks).mock.calls[0];
    expect(matArgs[3].connectedDemo).toBe(true);                           // R0 Command Center + Connected Demo spine
    expect(matArgs[2].releases.map((x: { key: string }) => x.key)).toEqual(['r0', 'r1', 'r2']);
    expect(project.project_variables.gov_parked_releases).toContain('r2'); // R2 parked
    expect(mock(createDetachedProjectForEnrollment)).toHaveBeenCalledTimes(1); // detached: active pointer untouched
  });

  it('assigning a SECOND gov project to the same intern picks up its OWN full ladder, independently', async () => {
    const p1: any = { id: 'proj-1', project_variables: {}, save: jest.fn().mockResolvedValue(undefined) };
    mock(createDetachedProjectForEnrollment).mockResolvedValueOnce(p1);
    const r1 = await materializeGovBuildProject(baseInput);
    // A different pursuit for the same intern: no linked project yet (ContractTrack.findByPk defaults to null).
    const p2: any = { id: 'proj-2', project_variables: {}, save: jest.fn().mockResolvedValue(undefined) };
    mock(createDetachedProjectForEnrollment).mockResolvedValueOnce(p2);
    const r2 = await materializeGovBuildProject({ ...baseInput, canonicalOpportunityId: 'gws:def', deliveryProjectId: 'dp-2' });
    expect(r1.projectId).toBe('proj-1');
    expect(r2.projectId).toBe('proj-2');                                   // independent project, not the first
    expect(r2.releaseCount).toBe(3);
    expect(p2.project_variables.gov_parked_releases).toContain('r2');
    expect(mock(createDetachedProjectForEnrollment)).toHaveBeenCalledTimes(2);
  });

  it('re-assigning the SAME pursuit is idempotent: reuses the project, re-runs the ladder, creates nothing new', async () => {
    mock(ContractTrack.findByPk).mockResolvedValue({ solution_student_project_id: 'proj-existing' });
    const r = await materializeGovBuildProject(baseInput);
    expect(r.created).toBe(false);
    expect(r.projectId).toBe('proj-existing');
    expect(r.releaseCount).toBe(3);                                         // same ladder on re-run
    expect(mock(createDetachedProjectForEnrollment)).not.toHaveBeenCalled();
    expect(mock(materializePlanAsTasks).mock.calls[0][3].connectedDemo).toBe(true);
  });

  it('grants the assignee the builder role on the delivery project, so their cockpit is not a 404', async () => {
    const project: any = { id: 'proj-1', project_variables: {}, save: jest.fn().mockResolvedValue(undefined) };
    mock(createDetachedProjectForEnrollment).mockResolvedValue(project);
    await materializeGovBuildProject(baseInput);
    // null actor: baseInput carries no actorIdentityId, so the grant records none.
    expect(mock(ensureAssigneeCanBuild)).toHaveBeenCalledWith('dp-1', 'id-1', null);
  });

  it('backfills membership even when the project is REUSED (re-running materialize grants cockpit access)', async () => {
    mock(ContractTrack.findByPk).mockResolvedValue({ solution_student_project_id: 'proj-existing' });
    await materializeGovBuildProject(baseInput);
    expect(mock(ensureAssigneeCanBuild)).toHaveBeenCalledWith('dp-1', 'id-1', null);
  });

  // The grant is not best-effort: a project whose own builder cannot open it is not a successful materialize. The
  // reason is translated into this module's own error so the route answers 503 (retryable) rather than a bare 500,
  // and the project is kept — step 3 reuses the one on the solution_build track, so a retry cannot duplicate it.
  it('a FAILED grant fails the materialize as grant_failed, rather than returning a project the intern cannot open', async () => {
    const project: any = { id: 'proj-1', project_variables: {}, save: jest.fn().mockResolvedValue(undefined) };
    mock(createDetachedProjectForEnrollment).mockResolvedValue(project);
    const grantErr: any = new Error('The builder role could not be granted on this project.');
    grantErr.name = 'AssignmentError';
    grantErr.reason = 'grant_failed';
    // Once, not for the suite: jest.clearAllMocks() clears calls but keeps implementations, so a persistent
    // rejection here would leak into every test that follows.
    mock(ensureAssigneeCanBuild).mockRejectedValueOnce(grantErr);
    await expect(materializeGovBuildProject(baseInput)).rejects.toMatchObject({
      name: 'GovMaterializeError', reason: 'grant_failed',
    });
    expect(mock(materializePlanAsTasks)).not.toHaveBeenCalled(); // stops before writing the task rows
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
    expect(mock(createDetachedProjectForEnrollment)).not.toHaveBeenCalled();
    expect(mock(materializePlanAsTasks)).not.toHaveBeenCalled();
  });

  it("intern's cohort has no program → GovMaterializeError no_program", async () => {
    mock(createDetachedProjectForEnrollment).mockRejectedValue(new Error('Enrollment enr-1 has no associated program via cohort'));
    await expect(materializeGovBuildProject(baseInput)).rejects.toMatchObject({ reason: 'no_program' });
    expect(mock(materializePlanAsTasks)).not.toHaveBeenCalled();
  });

  it('a plan with blocking gate violations is refused → plan_blocked, nothing materialized', async () => {
    mock(blockingViolations).mockReturnValue([{ rule: 'release_unbalanced', message: 'too much in r0' }]);
    await expect(materializeGovBuildProject(baseInput)).rejects.toMatchObject({ reason: 'plan_blocked' });
    expect(mock(createDetachedProjectForEnrollment)).not.toHaveBeenCalled();
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
    mock(createDetachedProjectForEnrollment).mockResolvedValue(project);
    await materializeGovBuildProject(baseInput);
    expect(mock(savePlanDraft)).toHaveBeenCalledWith('proj-1', LADDER, expect.objectContaining({ gate: expect.anything() }));
    expect(mock(publishPlan)).toHaveBeenCalledWith('proj-1', 1, 'sha');
  });

  it('self-heals: re-publishes the real plan over an existing empty-requirements reconstruction', async () => {
    mock(ContractTrack.findByPk).mockResolvedValue({ solution_student_project_id: 'proj-x' });
    mock(getPublishedPlan).mockResolvedValue({ plan: { requirements: [] } });
    await materializeGovBuildProject(baseInput);
    expect(mock(savePlanDraft)).toHaveBeenCalledWith('proj-x', LADDER, expect.anything());
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

  // ENTER-BUILD: analyze the stored solicitation ZIP once at the ready_to_assign -> in_build transition, so the
  // proposal blueprint + document set exist before the intern can build. The intern never runs the ZIP step.
  it('on first materialize (created), analyzes the ZIP once so the blueprint exists before the intern builds', async () => {
    const project: any = { id: 'proj-1', project_variables: {}, save: jest.fn().mockResolvedValue(undefined) };
    mock(createDetachedProjectForEnrollment).mockResolvedValue(project);
    const r = await materializeGovBuildProject({ ...baseInput, actorIdentityId: 'actor-9' });
    expect(r.created).toBe(true);
    expect(mock(reanalyzeProposalBlueprint)).toHaveBeenCalledTimes(1);
    expect(mock(reanalyzeProposalBlueprint)).toHaveBeenCalledWith('dp-1', 'actor-9');
  });

  it('does NOT re-analyze when the project is REUSED (created=false) — no repeated version bump on retry', async () => {
    mock(ContractTrack.findByPk).mockResolvedValue({ solution_student_project_id: 'proj-existing' });
    const r = await materializeGovBuildProject(baseInput);
    expect(r.created).toBe(false);
    expect(mock(reanalyzeProposalBlueprint)).not.toHaveBeenCalled();
  });

  it('a ZIP-not-yet-uploaded (bundle_missing) or any reanalyze failure is swallowed — build entry still succeeds', async () => {
    const project: any = { id: 'proj-1', project_variables: {}, save: jest.fn().mockResolvedValue(undefined) };
    mock(createDetachedProjectForEnrollment).mockResolvedValue(project);
    const bundleMissing: any = new Error('Solicitation package missing. Re-upload it on the Solicitation step.');
    bundleMissing.name = 'BlueprintReanalysisError';
    mock(reanalyzeProposalBlueprint).mockRejectedValueOnce(bundleMissing);
    const r = await materializeGovBuildProject(baseInput);
    expect(r.created).toBe(true);           // the build-entry transition is NOT rolled back
    expect(r.projectId).toBe('proj-1');
    expect(r.tasks).toBe(3);
  });
});
