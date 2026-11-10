/**
 * build - the on-demand half. Runs the report pipeline for ONE intern and composes their brief.
 *
 * ## Why it is generated on click rather than with the roster
 *
 * `collectInternshipPortfolio()` across the whole cohort is a few hundred queries and takes roughly
 * thirteen seconds. Paying that on every page load, for thirteen messages a manager will mostly not
 * open, is the wrong trade. Narrowed to one enrollment it is a fraction of that, and it runs while
 * the manager is already looking at the row they asked about.
 *
 * It also makes the freshness guarantee honest: the message was generated from the database at the
 * moment it was opened, not from whatever the page happened to load with. A manager who leaves the
 * tab open for an hour and then clicks a row still gets today's facts.
 *
 * ## No model call
 *
 * `narrateAsks` and `summarizeInterns` are deliberately NOT run here. They are the only parts of
 * the report that call OpenAI, they are what make the daily run slow, and both already degrade to
 * deterministic fallbacks. A brief must render the same way twice and must not fail because an
 * upstream model is down, so it uses the fallbacks. The daily email keeps the model-written prose.
 */
import { collectInternshipPortfolio } from '../portfolioReport/collect';
import { composeInternshipPortfolio } from '../portfolioReport/compose';
import { buildSidecar } from '../portfolioReport/sidecar/build';
import { getConsoleRoster } from '../internConsoleRoster';
import { composeBrief } from './compose';
import { caseStudyDeadline } from './deadline';
import type { NudgeBrief } from './types';

function centralDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/** Raised when the enrollment is not on the active roster. The route turns this into a 404. */
export class UnknownInternError extends Error {
  readonly error_class = 'UnknownIntern';
  constructor(enrollmentId: string) {
    super(`No active intern with enrollment ${enrollmentId}`);
    this.name = 'UnknownInternError';
  }
}

/**
 * One intern's brief, generated now.
 *
 * `previous: null` means `delta` comes back null rather than wrong. The delta compares against the
 * last SENT report's snapshot, and an on-demand render is not a report, so there is nothing
 * legitimate to compare against. A null delta is honest; a delta against an arbitrary snapshot is
 * not, and the brief never writes a snapshot of its own for the same reason.
 */
export async function buildBriefFor(enrollmentId: string, { now = new Date() }: { now?: Date } = {}): Promise<NudgeBrief> {
  const data = await collectInternshipPortfolio({ now, onlyEnrollments: [enrollmentId] });
  if (!data.roster.length) throw new UnknownInternError(enrollmentId);

  const report = composeInternshipPortfolio(data, { now });
  const sidecar = buildSidecar(report, {
    reportDate: centralDate(now),
    previous: null,
    lastOutbound: data.lastOutbound ?? [],
  });

  const intern = sidecar.interns.find((i) => i.enrollment_id === enrollmentId);
  if (!intern) throw new UnknownInternError(enrollmentId);

  const deadline = await caseStudyDeadline(intern.project?.id ?? null, now);
  const brief = composeBrief({ intern, deadline, now });

  // The roster is the only place the address lives; the sidecar deliberately carries no email.
  const email = data.roster.find((r) => r.enrollment_id === enrollmentId)?.email ?? null;
  return { ...brief, email: email ? String(email) : null };
}

/** Every active intern, with no brief generated. This is what the tab lists. */
export async function listNudgeCandidates({ now = new Date() }: { now?: Date } = {}) {
  const roster = await getConsoleRoster({ now });
  return roster.map((r) => ({
    enrollmentId: r.enrollment_id,
    name: r.name,
    email: r.email ?? null,
    day: r.day ?? null,
    projectName: r.project?.name ?? null,
    applicationState: r.application_state ?? null,
  }));
}
