// Shared Central Time (CST/CDT) formatter for admin / ProofDesk / Workforce OS
// surfaces. Ali flagged this live: ticket timestamps rendered in the browser's own
// local timezone with no indication a conversion (or lack of one) had happened at
// all — see PROGRESS.md session CC-20260812-r9x3 ("ticket UX" fixes).
//
// This is the THIRD near-identical Central-time formatter in this codebase
// (`frontend/src/utils/sessionTime.ts` and
// `frontend/src/pages/portal/today/shellUtils.ts` both already have one, for the
// student portal). Per CLAUDE.md's "same 5+ lines in three places -> lift" rule this
// is exactly the trigger to consolidate — but refactoring those two existing portal
// call sites to delegate here is deliberately NOT done in this run (out of scope,
// logged in execution-contract.md: unrelated portal-scope blast radius). This module
// is the canonical one new admin/ProofDesk/Workforce OS code should import; a future
// pass can point the portal ones at it too.
//
// DST-aware via Intl.DateTimeFormat's own timezone database — never a hardcoded
// fixed UTC offset — and always labeled (`timeZoneName: 'short'`) so a viewer can
// tell CST from CDT rather than silently seeing a shifted, unlabeled number.

export const CENTRAL_TZ = 'America/Chicago';

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** e.g. "Aug 12, 3:00 PM CDT" */
export function fmtCentralDateTime(v: string | Date | null | undefined): string {
  const d = toDate(v);
  return d
    ? new Intl.DateTimeFormat('en-US', {
        timeZone: CENTRAL_TZ,
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      }).format(d)
    : '';
}

/** e.g. "3:00 PM CDT" */
export function fmtCentralTime(v: string | Date | null | undefined): string {
  const d = toDate(v);
  return d
    ? new Intl.DateTimeFormat('en-US', {
        timeZone: CENTRAL_TZ,
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      }).format(d)
    : '';
}

/** e.g. "Aug 12" (Central calendar date, no time) */
export function fmtCentralDate(v: string | Date | null | undefined): string {
  const d = toDate(v);
  return d
    ? new Intl.DateTimeFormat('en-US', { timeZone: CENTRAL_TZ, month: 'short', day: 'numeric' }).format(d)
    : '';
}
