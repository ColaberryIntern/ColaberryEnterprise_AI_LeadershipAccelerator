/**
 * sendPlan - PURE. Who gets the internship report and under which idempotency key.
 *
 *   daily report   INTERN_REPORT_TO + INTERN_REPORT_CC, key internship-report-<Central date>:
 *                  the send ledger allows one per day, so the 9:00 retry slot is a no-op once
 *                  8:00 sent, and a failed send is retried.
 *   --test-to X    X only, no CC, key internship-report-test-<UTC minute>: a test copy can be sent
 *                  again a minute later and never consumes or blocks the real daily send.
 */
export interface SendPlan { to: string; cc: string[]; businessEventId: string }

export const REPORT_TO = (): string => process.env.INTERN_REPORT_TO || 'ali@colaberry.com';
export const REPORT_CC = (): string[] => (process.env.INTERN_REPORT_CC ?? 'alimuwwakkil@gmail.com,ram@colaberry.com').split(',').map((s) => s.trim()).filter(Boolean);

export function centralDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/**
 * Editions. `daily` is the 8:00 AM report; `meeting` is the extra Tuesday 10:00 AM copy for Ali's
 * intern meeting (Ali, 10 Nov 2026: "should also hit my inbox at 10am on Tuesdays ... That is when
 * I meet with the interns and I want to make sure I have a fresh report"). Its own ledger key, so
 * Tuesday gets both, each exactly once.
 */
export type Edition = 'daily' | 'meeting';
export const EDITIONS: ReadonlySet<string> = new Set(['daily', 'meeting']);
export const parseEdition = (v: string | null | undefined): Edition => {
  if (v === null || v === undefined || v === '') return 'daily';
  if (!EDITIONS.has(v)) throw new Error(`ValidationError: unknown --edition "${v}" (daily | meeting)`);
  return v as Edition;
};

export function sendPlanFor(now: Date, testTo: string | null, edition: Edition = 'daily'): SendPlan {
  if (testTo) return { to: testTo, cc: [], businessEventId: `internship-report-test-${now.toISOString().slice(0, 16)}` };
  const suffix = edition === 'meeting' ? '-meeting' : '';
  return { to: REPORT_TO(), cc: REPORT_CC(), businessEventId: `internship-report-${centralDate(now)}${suffix}` };
}

/** The meeting edition's subject: distinct, and still starting "Ali, here's" (inbox rule 0a). */
export const meetingSubject = (subject: string): string => subject.replace("Ali, here's your Internship Report for", "Ali, here's your Internship Report for your intern meeting,");

/** Marked TEST, and still starting "Ali, here's" so the inbox manager keeps it in the INBOX. */
export const testSubject = (subject: string): string => subject.replace("Ali, here's your Internship Report", "Ali, here's your Internship Report (TEST)");
