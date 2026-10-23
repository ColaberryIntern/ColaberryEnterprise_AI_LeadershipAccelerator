/**
 * campusAudience - which campus a signed-in learner gets.
 *
 * A pure function over the account signals PortalShell already reads, so the
 * rule is testable without rendering anything. Precedence (logged decision,
 * C1): staff > business (org manager) > explorer > member. A staff member who
 * also manages an org sees the Staff Office; an org manager on an Explorer
 * account sees the Partner Office. `isIntern` is orthogonal: interns are
 * members (or Explorers) who also get the internship rooms.
 */
import type { CampusAudience } from './campusMap';

export interface AudienceSignals {
  isStaff: boolean;
  isOrgManager: boolean;
  isExplorer: boolean;
  isIntern: boolean;
}

export interface CampusAudienceResult {
  audience: CampusAudience;
  isIntern: boolean;
  /** WP-7: the account's own audience when a preview (another account type) is showing; absent from the pure rule. */
  realAudience?: CampusAudience;
  /** C13: the server has answered (or failed, and the local signals stand): audience-specific UI may draw. */
  ready?: boolean;
}

export function deriveCampusAudience(s: AudienceSignals): CampusAudienceResult {
  const audience: CampusAudience = s.isStaff ? 'staff' : s.isOrgManager ? 'business' : s.isExplorer ? 'explorer' : 'member';
  return { audience, isIntern: s.isIntern };
}
