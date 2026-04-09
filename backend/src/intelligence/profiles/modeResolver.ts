/**
 * Mode Resolver — deterministic resolution of effective mode for a business process.
 * Handles project-level defaults and BP-level overrides with clear precedence.
 */
import { PROFILES, ProfileName } from './executionProfiles';

/**
 * Resolve the effective mode for a business process.
 * Precedence: BP mode_override > Project target_mode > 'production' default
 */
export function resolveMode(projectMode: string | null | undefined, bpOverride?: string | null): ProfileName {
  if (bpOverride && bpOverride in PROFILES) return bpOverride as ProfileName;
  if (projectMode && projectMode in PROFILES) return projectMode as ProfileName;
  return 'production';
}

/**
 * Resolve the applicability status of a business process.
 * User-set applicability takes precedence over lifecycle_status.
 */
export function resolveApplicability(
  bp: { lifecycle_status?: string; applicability_status?: string }
): 'active' | 'deferred' | 'not_required' {
  const appStatus = bp.applicability_status;
  if (appStatus === 'deferred' || appStatus === 'not_required') return appStatus;
  if (bp.lifecycle_status === 'deferred') return 'deferred';
  return 'active';
}

/**
 * Check if a mode transition is safe (cannot downgrade if process has passed higher threshold).
 * Returns null if safe, or a reason string if blocked.
 */
export function validateModeTransition(
  currentMode: ProfileName,
  targetMode: ProfileName,
  currentMaturity: number
): string | null {
  const currentProfile = PROFILES[currentMode];
  const targetProfile = PROFILES[targetMode];
  if (!currentProfile || !targetProfile) return 'Invalid mode';

  // Allow any upgrade
  if (targetProfile.completion_maturity_threshold >= currentProfile.completion_maturity_threshold) return null;

  // Downgrade: check if process has already passed the current threshold
  if (currentMaturity >= currentProfile.completion_maturity_threshold) {
    return `Cannot downgrade from ${currentMode} to ${targetMode}: process already at L${currentMaturity} (meets ${currentMode} threshold of L${currentProfile.completion_maturity_threshold})`;
  }

  return null; // downgrade is safe if not yet at threshold
}
