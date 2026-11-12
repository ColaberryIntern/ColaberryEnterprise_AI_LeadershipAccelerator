/**
 * cadenceRun - the unattended pass. Build every brief, decide who hears from us, send.
 *
 * This is the piece that makes coverage a PROCESS rather than a person. Until now
 * `buildAllBriefs` had exactly one caller, an admin HTTP route, so if Ali stopped pressing the
 * button communication stopped with him. Measured 2026-11-11: coverage was perfect, and it was
 * perfect because he pressed it on the 10th and again on the 11th.
 *
 * ## Dry by default, and that is not timidity
 *
 * `dryRun` defaults to TRUE. A worker that sends mail as a person to real interns is the most
 * irreversible thing in this subsystem, and the first thing anyone will want from it is to see
 * what it WOULD have done. Turning it live is one argument at the call site, which is where that
 * decision belongs, rather than an env var read in here that nobody can see from the caller.
 *
 * ## Why this does not need to know whether Ali is around
 *
 * The clock keys on the intern's last contact from us, whoever sent it. His own sends reset it;
 * when he is not sending, the floor fires. There is no presence flag and no mode to get wrong.
 *
 * ## One intern failing must not cost the others
 *
 * Same rule `buildAllBriefs` already follows. A send that throws is recorded against that intern
 * and the pass continues, because the alternative is that one bad address silences the roster.
 */
import { buildAllBriefs } from './build';
import { decide, summarize, unreviewedBody, type CadenceDecision, type CadenceSummary } from './cadence';
import { sendBrief, type BriefSendOutcome } from './send';

export interface CadenceRunResult {
  readonly ranAt: string;
  readonly dryRun: boolean;
  readonly summary: CadenceSummary;
  readonly decisions: readonly CadenceDecision[];
  /** One per intern we tried to send to, in the send path's own vocabulary. */
  readonly outcomes: readonly BriefSendOutcome[];
  /** Interns whose brief could not be built at all. They are covered by nobody and must be seen. */
  readonly failedToBuild: ReadonlyArray<{ enrollmentId: string; name: string; errorClass: string }>;
}

function log(event: string, outcome: string, context: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'intern-nudge-cadence',
    event,
    outcome,
    context,
  }));
}

export interface CadenceRunInput {
  readonly now?: Date;
  /** Defaults to TRUE. Pass false explicitly to let it send. */
  readonly dryRun?: boolean;
}

export async function runCadence({ now = new Date(), dryRun = true }: CadenceRunInput = {}): Promise<CadenceRunResult> {
  const batch = await buildAllBriefs({ now });

  const decisions: CadenceDecision[] = [];
  const outcomes: BriefSendOutcome[] = [];
  const failedToBuild = batch.attempts
    .filter((a) => !a.ok)
    .map((a) => (a as { enrollmentId: string; name: string; errorClass: string }))
    .map(({ enrollmentId, name, errorClass }) => ({ enrollmentId, name, errorClass }));

  for (const attempt of batch.attempts) {
    if (!attempt.ok) continue;
    const decision = decide({ brief: attempt.brief, engagement: attempt.engagement, hold: attempt.hold });
    decisions.push(decision);
    if (!decision.send) continue;

    try {
      const outcome = await sendBrief({
        brief: attempt.brief,
        // Unreviewed means deterministic. The console is where a model-written body gets approved.
        body: unreviewedBody(attempt.brief),
        subject: attempt.brief.subject,
        dryRun,
        now,
      });
      outcomes.push(outcome);
    } catch (err) {
      const errorClass = (err as { name?: string })?.name ?? 'Error';
      log('cadence_send_threw', 'failure', { enrollment_id: decision.enrollmentId, error_class: errorClass });
      outcomes.push({
        enrollmentId: decision.enrollmentId,
        email: attempt.brief.email ?? '',
        outcome: 'failed',
        errorClass,
        error: String((err as { message?: string })?.message ?? err).slice(0, 300),
      });
    }
  }

  const summary = summarize(decisions);
  log('cadence_run', failedToBuild.length ? 'partial' : 'success', {
    dry_run: dryRun,
    ...summary,
    failed_to_build: failedToBuild.length,
    // The number that has to be zero for nobody to be sliding, carried on every run.
    overdue_after: batch.coverage.overdue,
    engagement_rate: batch.coverage.engagementRate,
  });

  return { ranAt: now.toISOString(), dryRun, summary, decisions, outcomes, failedToBuild };
}
