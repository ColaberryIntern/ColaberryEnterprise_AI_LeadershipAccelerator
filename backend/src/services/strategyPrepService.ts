import { StrategyPrepInput } from '../schemas/strategyPrepSchema';

/**
 * Calculate completion score (0-100) based on filled fields.
 *
 * Core fields (60%): challenges, maturity, team size, use case, timeline, tools — 10 pts each
 * File upload (20%): uploaded file
 * Budget + consulting (10%): 5 pts each
 * Questions + context (10%): 5 pts each
 */
export function calculateCompletionScore(
  data: StrategyPrepInput,
  hasUploadedFile: boolean
): number {
  let score = 0;

  // Core fields — 10 pts each = 60
  if (data.primary_challenges.length > 0) score += 10;
  if (data.ai_maturity_level) score += 10;
  if (data.team_size) score += 10;
  if (data.priority_use_case && data.priority_use_case.trim().length > 0) score += 10;
  if (data.timeline_urgency) score += 10;
  if (data.current_tools && data.current_tools.length > 0) score += 10;

  // File upload — 20 pts
  if (hasUploadedFile) score += 20;

  // Budget + consulting — 5 pts each = 10
  if (data.budget_range && data.budget_range.trim().length > 0) score += 5;
  if (data.evaluating_consultants !== undefined) score += 5;

  // Questions + context — 5 pts each = 10
  if (data.specific_questions && data.specific_questions.trim().length > 0) score += 5;
  if (data.additional_context && data.additional_context.trim().length > 0) score += 5;

  return score;
}
