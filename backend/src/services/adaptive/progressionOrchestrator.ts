import { NextAction, RequirementsMap, ProgressionLog } from '../../models';
import { getProjectByEnrollment } from '../projectService';
import { completeAction, getNextAction } from '../nextAction/nextActionService';
import { evaluateAdvance, AdvanceDecision } from './autoAdvanceService';
import { generateLearningInjection, LearningInjection } from './curriculumInjectionService';
import { adjustDifficulty, DifficultyAdjustment } from './learningAdjustmentService';

export interface ProgressionDecision {
  decision: 'auto_advanced' | 'soft_complete' | 'blocked';
  reason: string;
  confidence: number;
  next_action: any | null;
  learning_injection: LearningInjection | null;
  difficulty: DifficultyAdjustment;
  action_completed: boolean;
}

// ---------------------------------------------------------------------------
// Main Progression Evaluation
// ---------------------------------------------------------------------------

export async function evaluateProgression(
  enrollmentId: string,
  actionId: string
): Promise<ProgressionDecision> {
  const project = await getProjectByEnrollment(enrollmentId);
  if (!project) throw new Error('No project found');

  const action = await NextAction.findByPk(actionId);
  if (!action) throw new Error(`Action not found: ${actionId}`);

  // Get verification results for this action's requirement
  const reqKey = action.metadata?.requirement_key;
  let verificationConfidence = 0;
  let verificationStatus = 'not_verified';
  let semanticStatus: string | null = null;
  let missingElements: string[] = [];
  let semanticReasoning: string | null = null;

  if (reqKey) {
    const req = await RequirementsMap.findOne({
      where: { project_id: project.id, requirement_key: reqKey },
    });
    if (req) {
      verificationConfidence = req.verification_confidence || 0;
      verificationStatus = req.verification_status || 'not_verified';
      semanticStatus = req.semantic_status;
      semanticReasoning = req.semantic_reasoning;
      // Parse missing elements from verification notes
      const gapsMatch = req.verification_notes?.match(/Gaps:\s*(.+?)(?:\s*\||$)/);
      if (gapsMatch) {
        missingElements = gapsMatch[1].split(';').map((s: string) => s.trim()).filter(Boolean);
      }
    }
  }

  // Step 1: Get advance decision
  const advanceDecision = evaluateAdvance(verificationConfidence, verificationStatus, semanticStatus);

  // Step 2: Generate learning injection if blocked
  let learning_injection: LearningInjection | null = null;
  if (advanceDecision.decision === 'blocked') {
    learning_injection = generateLearningInjection(
      action.title,
      action.action_type,
      missingElements,
      semanticReasoning
    );
  }

  // Step 3: Get difficulty adjustment
  const difficulty = await adjustDifficulty(project.id);

  // Step 4: Execute decision
  let action_completed = false;
  let next_action: any = null;

  if (advanceDecision.decision === 'auto_advanced' || advanceDecision.decision === 'soft_complete') {
    // Complete the action
    try {
      const completed = await completeAction(actionId);
      completed.completion_type = advanceDecision.decision;
      await completed.save();
      action_completed = true;

      // Fetch next action
      next_action = await getNextAction(enrollmentId);
    } catch (err: any) {
      console.error(`[Progression] Failed to complete action: ${err.message}`);
    }
  }

  // Step 5: Log the decision
  await ProgressionLog.create({
    project_id: project.id,
    action_id: actionId,
    decision_type: advanceDecision.decision === 'auto_advanced' ? 'advanced' : advanceDecision.decision,
    reason: advanceDecision.reason,
    confidence: advanceDecision.confidence,
    metadata: {
      verification_status: verificationStatus,
      verification_confidence: verificationConfidence,
      semantic_status: semanticStatus,
      difficulty: difficulty.difficulty_level,
      learning_injection: learning_injection ? learning_injection.topic : null,
      action_completed,
    },
  });

  console.log(
    `[Progression] ${action.metadata?.requirement_key || actionId}: ${advanceDecision.decision} (confidence: ${Math.round(advanceDecision.confidence * 100)}%, difficulty: ${difficulty.difficulty_level})`
  );

  return {
    decision: advanceDecision.decision,
    reason: advanceDecision.reason,
    confidence: advanceDecision.confidence,
    next_action,
    learning_injection,
    difficulty,
    action_completed,
  };
}
