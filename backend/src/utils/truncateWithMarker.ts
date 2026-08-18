/**
 * Truncate a string to fit a fixed-length DB column, marking truncation
 * visibly (trailing `…`) so a reader — or a future debugging session staring
 * at a mysteriously-cut value — knows it was truncated rather than genuinely
 * short. Extracted after this exact pattern was independently written twice
 * to fix two real production varchar-overflow bugs in the same run:
 * `ai_agent_activity_logs.action` (varchar(100), aiEventService.ts) and
 * `OpenclawLearning.metric_key` (varchar(200),
 * openclawLearningOptimizationAgent.ts). Use this at any write boundary
 * where an upstream value can legitimately exceed the destination column's
 * length, rather than re-deriving the slice-and-mark logic locally.
 */
export function truncateWithMarker(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}
