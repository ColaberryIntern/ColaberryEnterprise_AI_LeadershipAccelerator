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
 * ## It runs the SAME pipeline as the email, including the model calls
 *
 * This file used to skip `narrateAsks` and `summarizeInterns` and to call `buildSidecar` without
 * `conversations`, on the argument that a brief should be fast and deterministic. The result was a
 * message written from build telemetry by something that could not read what the intern had
 * actually said, with the same fallback ask sentence for everybody.
 *
 * `pipeline.ts` now runs exactly what `internshipPortfolioReport.ts` runs, and its header has the
 * full account. Determinism is kept where it was real: the model client is the CACHED one, so
 * unchanged data returns the stored reply, and a missing key still degrades to the fallback.
 */
import { getConsoleRoster } from '../internConsoleRoster';
import { composeBrief } from './compose';
import { factsForBrief, upgradeBody } from './modelBody';
import { caseStudyDeadline } from './deadline';
import { holdFor, type HoldDecision } from './hold';
import { runPortfolioPipeline, type PipelineResult } from './pipeline';
import type { NudgeBrief } from './types';

/** Raised when the enrollment is not on the active roster. The route turns this into a 404. */
export class UnknownInternError extends Error {
  readonly error_class = 'UnknownIntern';
  constructor(enrollmentId: string) {
    super(`No active intern with enrollment ${enrollmentId}`);
    this.name = 'UnknownInternError';
  }
}

/** Compose one intern out of an already-run pipeline. Shared by the single and batch paths. */
async function briefFromPipeline(
  p: PipelineResult,
  enrollmentId: string,
  now: Date,
  deadlines: Map<string, Awaited<ReturnType<typeof caseStudyDeadline>>>,
): Promise<NudgeBrief> {
  const intern = p.sidecar.interns.find((i) => i.enrollment_id === enrollmentId);
  if (!intern) throw new UnknownInternError(enrollmentId);

  const key = intern.project?.id ?? '';
  if (!deadlines.has(key)) deadlines.set(key, await caseStudyDeadline(intern.project?.id ?? null, now));

  const deadline = deadlines.get(key) ?? null;
  const brief = composeBrief({ intern, deadline, now });
  // The roster is the only place the address lives; the sidecar deliberately carries no email.
  const row = p.roster.find((r) => r.enrollment_id === enrollmentId);
  const email = row?.email ?? null;
  const withEmail = { ...brief, email: email ? String(email) : null };

  /**
   * The model may rewrite the MIDDLE of the message, and only if the draft passes every check in
   * modelBody.ts. A refusal, a timeout or a missing client all land in the same place: the
   * deterministic body, unchanged. `deterministicBody` is never touched either way, because that
   * is what an unattended send uses.
   */
  return upgradeBody(withEmail, factsForBrief(intern, withEmail, deadline), p.chatClient);
}

/**
 * One intern's brief, generated now, from the same pipeline the email runs.
 *
 * Narrowed to one enrollment, which narrows every query behind it. It is slower than it was,
 * because it now pays for the model narration the report pays for, and that is the trade Ali
 * asked for: a message written from the whole picture beats a fast one written from a third of it.
 */
export async function buildBriefFor(enrollmentId: string, { now = new Date() }: { now?: Date } = {}): Promise<NudgeBrief> {
  const p = await runPortfolioPipeline({ now, onlyEnrollments: [enrollmentId] });
  if (!p.roster.length) throw new UnknownInternError(enrollmentId);
  return briefFromPipeline(p, enrollmentId, now, new Map());
}

/** One intern's outcome in a batch: either their brief and its hold decision, or why they have none. */
export type BriefAttempt =
  | { readonly ok: true; readonly brief: NudgeBrief; readonly hold: HoldDecision | null }
  | { readonly ok: false; readonly enrollmentId: string; readonly name: string; readonly errorClass: string; readonly error: string };

export interface BriefBatch {
  readonly generatedAt: string;
  readonly attempts: readonly BriefAttempt[];
  /**
   * The two artifacts the nightly email attaches, built from this same run.
   *
   * Carried as sizes rather than content: the page is around 600KB and the sidecar around 300KB,
   * and nothing is served by putting either inside a JSON response a browser has to parse to show
   * a list of thirteen rows. The route serves them separately so a manager can open the identical
   * report the email carries, generated from the data these messages were written from.
   */
  readonly artifacts: {
    readonly reportDate: string;
    readonly htmlBytes: number;
    readonly jsonBytes: number;
    readonly model: boolean;
    readonly asksNarrated: number;
    readonly conversations: number;
    readonly previousReportDate: string | null;
  };
}

/**
 * Every intern's brief, from ONE run of the pipeline.
 *
 * ## Why this is not `buildBriefFor` in a loop
 *
 * `collectInternshipPortfolio` is a few hundred queries whether it is asked for one intern or all
 * fourteen, because the expensive parts are the cohort-wide joins. Narrowing it per intern and
 * calling it fourteen times pays that cost fourteen times over, for a screen the manager asked for
 * once. Collected once and composed per intern it is a single pass, which is what makes a "prepare
 * them all" button answerable in seconds rather than a minute.
 *
 * ## One intern failing must not cost the other twelve
 *
 * `composeInternshipPortfolio` deliberately drops operators from the intern list, so an operator
 * sitting on the roster has a roster row and no sidecar entry, and composing their brief throws.
 * That is correct behaviour, and it is also the reason this returns a per-intern result rather than
 * a single array: a batch that threw on the first unknown enrollment would hand back nothing at all
 * because one row was never an intern.
 *
 * The deadline lookup is cached per project, because interns on the same gov project share one
 * baseline date and the query is the only per-intern I/O left in the loop.
 */
export async function buildAllBriefs({ now = new Date() }: { now?: Date } = {}): Promise<BriefBatch> {
  const p = await runPortfolioPipeline({ now });
  const deadlines = new Map<string, Awaited<ReturnType<typeof caseStudyDeadline>>>();

  const attempts: BriefAttempt[] = [];
  for (const r of p.roster) {
    const id = String(r.enrollment_id);
    const name = String(r.name ?? id);
    try {
      const brief = await briefFromPipeline(p, id, now, deadlines);
      attempts.push({
        ok: true,
        brief,
        hold: holdFor({ brief, applicationState: (r.application_state as string | null) ?? null, now }),
      });
    } catch (err: any) {
      attempts.push({
        ok: false,
        enrollmentId: id,
        name,
        errorClass: err?.name ?? 'Error',
        error: String(err?.message ?? err).slice(0, 300),
      });
    }
  }

  return {
    generatedAt: now.toISOString(),
    attempts,
    artifacts: {
      reportDate: p.reportDate,
      htmlBytes: Buffer.byteLength(p.dashboardHtml, 'utf8'),
      jsonBytes: Buffer.byteLength(p.sidecarJson, 'utf8'),
      model: p.enrichment.model,
      asksNarrated: p.enrichment.asksNarrated,
      conversations: p.enrichment.conversations,
      previousReportDate: p.enrichment.previousReportDate,
    },
  };
}

/**
 * The two artifacts the nightly email attaches, regenerated now.
 *
 * Served by the route so a manager can open the identical report the email carries, built from the
 * same run the messages were written from. Returning them from their own call rather than from the
 * batch keeps a 900KB payload out of a list of thirteen rows.
 */
export async function buildReportArtifacts({ now = new Date() }: { now?: Date } = {}): Promise<{
  reportDate: string; html: string; json: string;
}> {
  const p = await runPortfolioPipeline({ now });
  return { reportDate: p.reportDate, html: p.dashboardHtml, json: p.sidecarJson };
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
