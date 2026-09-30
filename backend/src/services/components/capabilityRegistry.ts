/**
 * capabilityRegistry — the shared library of reusable Capability Modules that AI
 * Components compose from. Replaces hardcoded per-type behavior: a component
 * declares `capabilities: string[]` referencing these ids, and every runtime
 * surface (Classroom card, evaluation, portfolio) reads the same registry.
 *
 * Registry pattern (no switch): new capabilities self-register here and are
 * immediately composable + toggleable in the Experience Studio.
 */
export interface CapabilityModule {
  id: string;
  label: string;
  category: 'interaction' | 'assessment' | 'evidence' | 'social' | 'media' | 'system';
  description: string;
  /** legacy capability flag this module maps to (for backward-compat surfacing) */
  legacy_flag?: 'evidence_required' | 'github_required' | 'ai_evaluation' | 'instructor_review' | 'portfolio_eligible';
}

export const CAPABILITY_MODULES: CapabilityModule[] = [
  { id: 'transcript', label: 'Transcript', category: 'media', description: 'Timed transcript for video/audio content.' },
  { id: 'ai_chat', label: 'AI Chat', category: 'interaction', description: 'In-card AI tutor conversation scoped to the card.' },
  { id: 'reflection', label: 'Reflection', category: 'assessment', description: 'Prompted written reflection, AI-coached.' },
  { id: 'discussion', label: 'Discussion', category: 'social', description: 'Threaded cohort discussion on the card.' },
  { id: 'quiz', label: 'Quiz', category: 'assessment', description: 'Auto-graded knowledge check.' },
  { id: 'github', label: 'GitHub', category: 'evidence', description: 'Links + analyzes a student repository as evidence.', legacy_flag: 'github_required' },
  { id: 'portfolio', label: 'Portfolio', category: 'evidence', description: 'Output counts toward the student portfolio.', legacy_flag: 'portfolio_eligible' },
  { id: 'mentor_review', label: 'Mentor Review', category: 'assessment', description: 'Instructor/mentor review gate.', legacy_flag: 'instructor_review' },
  { id: 'peer_review', label: 'Peer Review', category: 'social', description: 'Peer evaluation exchange.' },
  { id: 'video', label: 'Video', category: 'media', description: 'Embedded video experience.' },
  { id: 'voice', label: 'Voice', category: 'media', description: 'Voice recording / narration.' },
  { id: 'camera', label: 'Camera', category: 'media', description: 'Camera capture (demo / presentation).' },
  { id: 'rubric', label: 'Rubric', category: 'assessment', description: 'Explicit scoring rubric surfaced to the student.' },
  { id: 'artifacts', label: 'Artifacts', category: 'evidence', description: 'Produces durable artifacts (docs, diagrams).' },
  { id: 'evaluation', label: 'Evaluation', category: 'assessment', description: 'AI evaluation of the submission.', legacy_flag: 'ai_evaluation' },
  { id: 'retry', label: 'Retry', category: 'system', description: 'Allows multiple attempts.' },
  { id: 'hint_system', label: 'Hint System', category: 'interaction', description: 'Progressive AI hints.' },
  { id: 'scoring', label: 'Scoring', category: 'assessment', description: 'Numeric scoring + XP award.' },
  { id: 'notifications', label: 'Notifications', category: 'system', description: 'Deadline / event notifications.' },
  { id: 'calendar', label: 'Calendar', category: 'system', description: 'Adds a scheduled event.' },
  { id: 'comments', label: 'Comments', category: 'social', description: 'Comments on the card.' },
  { id: 'likes', label: 'Likes', category: 'social', description: 'Reactions.' },
  { id: 'bookmarks', label: 'Bookmarks', category: 'system', description: 'Student can save the card.' },
  { id: 'sharing', label: 'Sharing', category: 'social', description: 'Shareable to the cohort/community.' },
  { id: 'evidence', label: 'Evidence', category: 'evidence', description: 'Requires a submitted evidence artifact.', legacy_flag: 'evidence_required' },
];

const BY_ID = new Map(CAPABILITY_MODULES.map((c) => [c.id, c]));
export const resolveCapability = (id: string) => BY_ID.get(id);
export const capabilityIds = () => CAPABILITY_MODULES.map((c) => c.id);

/** Map the 5 legacy boolean flags on a component onto capability-module ids. */
export function capabilitiesFromLegacyFlags(c: Record<string, any>): string[] {
  return CAPABILITY_MODULES.filter((m) => m.legacy_flag && c[m.legacy_flag]).map((m) => m.id);
}
