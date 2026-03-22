import { ProgressionLog } from '../../models';

export type DifficultyLevel = 'simplified' | 'standard' | 'advanced';

export interface DifficultyAdjustment {
  difficulty_level: DifficultyLevel;
  reason: string;
  recent_pattern: string;
}

// ---------------------------------------------------------------------------
// Adjust difficulty based on recent progression history
// ---------------------------------------------------------------------------

export async function adjustDifficulty(projectId: string): Promise<DifficultyAdjustment> {
  // Get last 5 progression decisions
  const recentLogs = await ProgressionLog.findAll({
    where: { project_id: projectId },
    order: [['created_at', 'DESC']],
    limit: 5,
  });

  if (recentLogs.length < 2) {
    return {
      difficulty_level: 'standard',
      reason: 'Not enough history to adjust difficulty',
      recent_pattern: 'insufficient_data',
    };
  }

  const decisions = recentLogs.map((log) => log.decision_type);
  const blockCount = decisions.filter((d) => d === 'blocked').length;
  const advanceCount = decisions.filter((d) => d === 'advanced' || d === 'auto_advanced').length;

  // Check for consecutive patterns
  const lastThree = decisions.slice(0, 3);
  const allBlocked = lastThree.length >= 3 && lastThree.every((d) => d === 'blocked');
  const allAdvanced = lastThree.length >= 3 && lastThree.every((d) => d === 'advanced' || d === 'auto_advanced');

  if (allBlocked || blockCount >= 3) {
    console.log(`[LearningAdjustment] Simplifying: ${blockCount} blocks in recent history`);
    return {
      difficulty_level: 'simplified',
      reason: `Student has been blocked ${blockCount} times recently. Simplifying difficulty to build momentum.`,
      recent_pattern: 'repeated_blocks',
    };
  }

  if (allAdvanced || advanceCount >= 3) {
    console.log(`[LearningAdjustment] Advancing: ${advanceCount} auto-advances in recent history`);
    return {
      difficulty_level: 'advanced',
      reason: `Student has auto-advanced ${advanceCount} times recently. Increasing difficulty for growth.`,
      recent_pattern: 'consistent_success',
    };
  }

  return {
    difficulty_level: 'standard',
    reason: 'Mixed performance pattern. Maintaining standard difficulty.',
    recent_pattern: 'mixed',
  };
}
