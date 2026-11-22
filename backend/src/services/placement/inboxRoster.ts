import { sequelize } from '../../config/database';
import { careerPrepEnabled } from '../careerPrep/careerPrepFlag';
import { normalizeJobSearchAddress } from './inboxHealth';
import { isSwitchOn, SWITCHES, type Read } from './darkSwitches';

/**
 * Career Prep v27, CP6.2 (kit F3): "the platform owns the roster". The inbox manager asks which learner a job-search
 * address belongs to, instead of reading its own committed student list.
 *
 * EXACTLY four fields, never a personal email or phone:
 *   participant_id  the enrollment id
 *   display_name    first name and last initial ("Ann L."), the least the inbox manager needs to label a thread
 *   recruiter       null: the platform has no per-learner recruiter assignment yet (no invented data; the desk, CP11,
 *                   is where one would be set)
 *   notify_ok       may the inbox manager send its OWN notifications to this learner? true while the platform's
 *                   employer mail switch (career_prep_employer_mail_enabled) is off or unreadable (= off), because
 *                   then the platform sends nothing; false once it is on, so the learner never hears twice.
 *                   T16/CP8 carry: this must key on whichever switch gates the platform's LEARNER sends once those exist.
 * Only learners Career Prep is on for are on the roster (dark: Ali's enrollment only); anyone else is "not found".
 */
export interface RosterEntry { participant_id: string; display_name: string; recruiter: string | null; notify_ok: boolean }
export const EMPLOYER_MAIL_SWITCH = SWITCHES.employerMail;

/** PURE: "Ann Lee" -> "Ann L."; one name stays as it is; nothing -> "Learner". */
export function displayName(fullName: string | null | undefined): string {
  const parts = String(fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Learner';
  if (parts.length === 1) return parts[0].slice(0, 60);
  return `${parts[0].slice(0, 60)} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export interface RosterDeps { read?: Read; enabled?: (e: string) => Promise<boolean> }


export async function lookupRoster(address: string, deps: RosterDeps = {}): Promise<RosterEntry | null> {
  const addr = normalizeJobSearchAddress(address);
  if (!addr.ok) return null;
  const [rows] = await sequelize.query(
    `SELECT i.enrollment_id, e.full_name FROM job_search_inboxes i JOIN enrollments e ON e.id = i.enrollment_id WHERE i.mailbox = :m`,
    { replacements: { m: addr.mailbox } });
  const r = (rows as Array<{ enrollment_id: string; full_name: string | null }>)[0];
  if (!r || !(await (deps.enabled ?? careerPrepEnabled)(String(r.enrollment_id)))) return null;
  return { participant_id: String(r.enrollment_id), display_name: displayName(r.full_name), recruiter: null, notify_ok: !(await isSwitchOn(EMPLOYER_MAIL_SWITCH, deps.read)) }; // darkSwitches: unreadable = off, the send paths' rule
}
