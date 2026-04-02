import { NextAction, ArtifactDefinition, AssignmentSubmission } from '../../models';
import { getProjectByEnrollment } from '../projectService';
import { getRequirementsStatus } from '../requirementsMatchingService';
import { getFileTree } from '../githubService';
import { prioritizeRequirements } from './requirementPriorityService';
import { generateAction } from './actionGeneratorService';

// ---------------------------------------------------------------------------
// 1. Get Next Action (main orchestrator)
// ---------------------------------------------------------------------------

export async function getNextAction(enrollmentId: string): Promise<NextAction | null> {
  const project = await getProjectByEnrollment(enrollmentId);
  if (!project) {
    console.log('[NextAction] No project found for enrollment:', enrollmentId);
    return null;
  }

  // Check for existing pending action
  const existing = await NextAction.findOne({
    where: { project_id: project.id, status: 'pending' },
    order: [['created_at', 'DESC']],
  });

  // If a pending action exists and is less than 1 hour old, return it
  if (existing && existing.created_at) {
    const ageMs = Date.now() - new Date(existing.created_at).getTime();
    if (ageMs < 60 * 60 * 1000) {
      console.log(`[NextAction] Returning cached action: ${existing.title}`);
      return existing;
    }
  }

  // Get requirements status
  const reqStatus = await getRequirementsStatus(project.id);
  if (!reqStatus.requirements || reqStatus.requirements.length === 0) {
    console.log('[NextAction] No requirements found');
    return null;
  }

  // Check if all requirements are complete
  const actionable = reqStatus.requirements.filter(
    (r: any) => r.status === 'unmatched' || r.status === 'partial'
  );
  if (actionable.length === 0) {
    console.log('[NextAction] All requirements are matched/verified');
    return null;
  }

  // Get system doc content for priority boosting
  const systemDocContent = await getSystemDocContent(enrollmentId);

  // Prioritize requirements
  const prioritized = await prioritizeRequirements(
    reqStatus.requirements as any[],
    systemDocContent
  );

  if (prioritized.length === 0) {
    console.log('[NextAction] No actionable requirements after prioritization');
    return null;
  }

  // Get GitHub file tree (may be null if no repo connected)
  let fileTree: string[] = [];
  try {
    const tree = await getFileTree(enrollmentId);
    if (tree?.tree && Array.isArray(tree.tree)) {
      fileTree = tree.tree
        .filter((item: any) => item.type === 'blob')
        .map((item: any) => item.path);
    }
  } catch {
    console.log('[NextAction] No GitHub file tree available, proceeding without it');
  }

  // Generate action for top priority requirement
  const topReq = prioritized[0];
  const action = await generateAction(topReq.requirement, project.id, fileTree);

  // Upsert: expire old pending actions for this project
  await NextAction.update(
    { status: 'expired' as string },
    { where: { project_id: project.id, status: 'pending' } }
  );

  // Create new action
  const nextAction = await NextAction.create({
    project_id: project.id,
    title: action.title,
    action_type: action.action_type,
    reason: action.reason,
    priority_score: topReq.priorityScore,
    confidence_score: action.confidence_score,
    status: 'pending',
    metadata: {
      files_suggested: action.files_suggested,
      related_artifacts: action.related_artifacts,
      requirement_key: action.requirement_key,
      scoring: {
        status_weight: topReq.statusWeight,
        dependency_weight: topReq.dependencyWeight,
        system_rule_weight: topReq.systemRuleWeight,
      },
    },
  });

  console.log(
    `[NextAction] Generated: "${nextAction.title}" (type: ${nextAction.action_type}, priority: ${nextAction.priority_score.toFixed(2)})`
  );

  return nextAction;
}

// ---------------------------------------------------------------------------
// 2. Accept Action
// ---------------------------------------------------------------------------

export async function acceptAction(actionId: string): Promise<NextAction> {
  const action = await NextAction.findByPk(actionId);
  if (!action) throw new Error(`Action not found: ${actionId}`);
  if (action.status !== 'pending') {
    throw new Error(`Action is not pending (current status: ${action.status})`);
  }

  action.status = 'accepted';
  await action.save();

  console.log(`[NextAction] Accepted: "${action.title}"`);
  return action;
}

// ---------------------------------------------------------------------------
// 3. Complete Action
// ---------------------------------------------------------------------------

export async function completeAction(actionId: string): Promise<NextAction> {
  const action = await NextAction.findByPk(actionId);
  if (!action) throw new Error(`Action not found: ${actionId}`);
  if (action.status !== 'accepted' && action.status !== 'pending') {
    throw new Error(`Action cannot be completed (current status: ${action.status})`);
  }

  action.status = 'completed';
  await action.save();

  console.log(`[NextAction] Completed: "${action.title}"`);

  // Auto-sync CLAUDE.md to repo (non-blocking, non-critical)
  try {
    const { autoSync } = require('../projectReconciliationService');
    // Need enrollmentId — get from project
    const project = await (await import('../../models')).Project.findByPk(action.project_id);
    if (project?.enrollment_id) {
      autoSync(project.enrollment_id).catch(() => {});
    }
  } catch {}

  return action;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getSystemDocContent(enrollmentId: string): Promise<string> {
  // Fetch compiled system docs (claude.md, system_prompt.md, interaction_protocol.md)
  const systemArtifacts = await ArtifactDefinition.findAll({
    where: { artifact_type: 'system_compiled' },
  });

  if (systemArtifacts.length === 0) return '';

  const docIds = systemArtifacts
    .filter((a) => a.name !== 'compiled_requirements') // Exclude requirements — we're scoring those
    .map((a) => a.id);

  if (docIds.length === 0) return '';

  const submissions = await AssignmentSubmission.findAll({
    where: {
      enrollment_id: enrollmentId,
      artifact_definition_id: docIds,
      is_latest: true,
    },
  });

  return submissions
    .map((s) => s.content_json?.text || '')
    .filter(Boolean)
    .join('\n');
}
