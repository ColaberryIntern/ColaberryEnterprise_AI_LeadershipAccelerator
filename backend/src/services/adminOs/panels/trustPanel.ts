/**
 * Data & trust — extracted from the composer, 2026-10-09 (T211).
 *
 * `personProfileService` was already past CLAUDE.md's 500-line hard ceiling at
 * 544 lines and T211 pushed it to 571, so the rule that an oversize file must be
 * split by the next change that touches it was owed. This is the natural unit: it
 * is a panel, every other panel already lives here, and it had exactly one caller.
 *
 * Nothing about its behaviour changed in the move.
 */
import { AcquisitionPanel } from './acquisitionPanels';

/**
 * Data & trust — the brief's last profile section, and the one this whole
 * workstream has been arguing for.
 *
 * It answers "how much of this should you believe": which source records
 * resolve to this person, how they were matched, whether consent was recorded,
 * how fresh the data is, and — most usefully — what CANNOT be computed for them
 * and why. A gap stated is a gap a reader can act on; a gap left blank reads as
 * a zero.
 */
export interface TrustPanel {
  leadIds: number[];
  enrollmentIds: string[];
  matchMethod: 'exact_email' | 'none';
  tracedToLead: boolean;
  consentRecorded: boolean | null;
  lastActivity: string | null;
  gaps: Array<{ field: string; reason: string }>;
}

/**
 * What we cannot say about this person, and why.
 *
 * Derived from what the lifecycle contract records as unjoinable plus what is
 * genuinely absent for THIS person, so the list is specific rather than a
 * generic disclaimer nobody reads.
 */
/**
 * Only the four fields `buildTrust` actually reads.
 *
 * Deliberately NOT `PersonProfile`. Importing that from the composer which
 * imports this module is a circular type dependency, and `tsc` said so --
 * while jest passed 2676 tests over it, because ts-jest runs with
 * `isolatedModules` and typechecks nothing. That is the standing
 * "nothing in this repo typechecks tests" gap catching a fourth defect.
 *
 * A narrow structural input is also the better dependency: this panel has no
 * business knowing about the other twenty profile keys.
 */
export interface TrustInput {
  tracedToLead: boolean;
  acquisition?: AcquisitionPanel | null;
  classActivity?: { attendanceTotal: number } | null;
  journey?: { lastActivity: string | null } | null;
}

export function buildTrust(
  profile: TrustInput,
  leadIds: number[],
  enrollmentIds: string[],
): TrustPanel {
  const gaps: Array<{ field: string; reason: string }> = [];

  if (leadIds.length === 0) {
    gaps.push({
      field: 'Acquisition history',
      reason: 'No lead record. This person enrolled without ever being captured as a lead, '
        + 'so there is nothing recorded about how they found us.',
    });
  }
  if (profile.acquisition && profile.acquisition.consentContact === null) {
    gaps.push({
      field: 'Contact consent',
      reason: 'Never recorded. This is not the same as consent being refused.',
    });
  }
  gaps.push({
    field: 'Graduation',
    reason: 'Computable but never set. enrollments.status supports "completed", and this profile '
      + 'reads it, but no enrolment has ever carried it (464 active, 24 lapsed, 0 completed as '
      + 'of 2026-09-09). Nothing marks a student complete when their cohort ends, so an empty '
      + 'graduate count means "not recorded", not "did not graduate".',
  });
  gaps.push({
    field: 'Placement and employment',
    reason: 'Not tracked anywhere in this database, so outcomes beyond graduation cannot be '
      + 'reported at all.',
  });
  if (enrollmentIds.length > 0) {
    gaps.push({
      field: 'Payment transactions',
      reason: 'Subscription STATE is local and shown above, but the individual charges live in '
        + 'PaySimple and are not joined. A failed subscription row proves a collection failed; '
        + 'it does not tell you the amount actually collected to date.',
    });
    if (profile.classActivity && profile.classActivity.attendanceTotal === 0) {
      gaps.push({
        field: 'Attendance',
        reason: 'No register was taken for this person\'s sessions. Content consumption and '
          + 'curriculum progress are the reliable engagement signals here, not attendance.',
      });
    }
  }

  return {
    leadIds,
    enrollmentIds,
    matchMethod: leadIds.length > 0 && enrollmentIds.length > 0 ? 'exact_email' : 'none',
    tracedToLead: profile.tracedToLead,
    consentRecorded: profile.acquisition?.consentContact ?? null,
    lastActivity: profile.journey?.lastActivity ?? null,
    gaps,
  };
}
