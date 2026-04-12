/**
 * Mode Resolver — deterministic resolution of effective mode for a business process.
 * Handles project-level defaults and BP-level overrides with clear precedence.
 */
import { PROFILES, ProfileName } from './executionProfiles';

/**
 * Resolve the effective mode for a business process.
 * Precedence: BP mode_override > Campaign mode_override > Project target_mode > 'production' default
 */
export function resolveMode(projectMode: string | null | undefined, bpOverride?: string | null, campaignMode?: string | null): ProfileName {
  if (bpOverride && bpOverride in PROFILES) return bpOverride as ProfileName;
  if (campaignMode && campaignMode in PROFILES) return campaignMode as ProfileName;
  if (projectMode && projectMode in PROFILES) return projectMode as ProfileName;
  return 'production';
}

/**
 * Identify which layer is providing the effective mode.
 * Useful for UI display: "Mode: ENTERPRISE (from Campaign)"
 */
export function getModeSource(projectMode?: string | null, campaignMode?: string | null, capabilityMode?: string | null): 'capability' | 'campaign' | 'project' | 'default' {
  if (capabilityMode && capabilityMode in PROFILES) return 'capability';
  if (campaignMode && campaignMode in PROFILES) return 'campaign';
  if (projectMode && projectMode in PROFILES) return 'project';
  return 'default';
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
