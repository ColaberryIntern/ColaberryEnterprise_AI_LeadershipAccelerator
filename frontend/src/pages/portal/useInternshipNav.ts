import { useEffect, useState } from 'react';
import { fetchInternshipStatus, InternshipStatus } from '../../services/internshipApi';

export interface InternshipNavStatus {
  /** Show the "Internship" nav tab: this person is in the process or is an active intern. */
  isIntern: boolean;
}

/**
 * Pure predicate: does this internship status warrant the nav tab? Extracted so
 * the who-sees-it rule — the crux of the feature — is tested in isolation, with
 * no hook or fetch. Show for an active intern, or a live (non-terminal)
 * application; never for the merely eligible, the flag-off `render:false`, or a
 * rejected/withdrawn (terminal) application.
 */
export function deriveIsIntern(status: InternshipStatus): boolean {
  const inProcess = status.application != null && !status.application.is_terminal;
  return !!status.render && (status.card_state === 'active' || inProcess);
}

/**
 * Whether the signed-in student should see the "Internship" tab in the portal
 * nav — drives one item in the "Build and learn" group. Backed by the same
 * GET /api/portal/internship/status the Today cards read, so the tab and the
 * card can never disagree about who is an intern.
 *
 * The tab is for people who have ENTERED the process or are active interns, not
 * the merely eligible (who have never applied — that recruiting audience is
 * served by the Today opportunity card, not a nav destination). So:
 *   - `card_state === 'active'` — an approved, active intern; or
 *   - a live application that has not reached a terminal outcome — in-process,
 *     including waitlisted; excludes a rejected/withdrawn application.
 * `is_terminal` comes from the server, so a rejected applicant drops the tab
 * without this hook hardcoding the lifecycle state names.
 *
 * `render` gates the whole thing: when INTERNSHIP is disabled the status comes
 * back `render:false` and the tab never shows. Fail-soft: any error (offline,
 * flag off, 500) reads as "not an intern", so the nav degrades to no tab rather
 * than throwing.
 */
export function useInternshipNav(): InternshipNavStatus {
  const [isIntern, setIsIntern] = useState(false);
  useEffect(() => {
    let live = true;
    fetchInternshipStatus()
      .then((s) => { if (live) setIsIntern(deriveIsIntern(s)); })
      .catch(() => { /* not an intern / offline / flag off — leave the tab hidden */ });
    return () => { live = false; };
  }, []);
  return { isIntern };
}
