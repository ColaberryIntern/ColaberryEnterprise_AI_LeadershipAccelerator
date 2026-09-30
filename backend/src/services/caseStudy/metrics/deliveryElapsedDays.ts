import { elapsedDays } from './metricDefinition';
import type { MetricComputation, MetricDefinition, MetricRunContext } from './metricDefinition';

/**
 * D1 — `delivery_elapsed_days`. `METRIC_PROVENANCE_PIPELINE.md` §4.
 *
 * Calendar days from the earliest repository creation date across the case
 * study's analysable repositories, to the committer date of the commit pinned by
 * the approved snapshot.
 *
 * WHY THIS ONE FIRST. It is the number the business is already claiming and
 * cannot currently back: `seedPilotProgramCampaigns.ts` instructs a campaign to
 * say a system was "deployed in 11 days" — unverified prose in an email,
 * invisible to the publish gate because it never travels as a metric. Turning it
 * into a computed figure replaces a claim nobody can check with one anyone can.
 *
 * WHY IT IS STABLE. Both ends are pinned. The start is `createdAt`, which never
 * moves. The end is the committer date of a specific sha recorded in the
 * approved snapshot — not `pushedAt`, which changes on every push and which this
 * codebase already refuses to hash for exactly that reason. Re-running against
 * the same snapshot returns the same number, which is what makes the
 * idempotency requirement satisfiable rather than aspirational.
 *
 * WHAT IT IS NOT. Repository creation is not project start. That limitation is
 * generated with every run rather than left for a reader to infer, because the
 * number is most flattering precisely when it is least true.
 */
export const deliveryElapsedDays: MetricDefinition = {
  key: 'delivery_elapsed_days',
  version: 1,
  label: 'Delivery elapsed time',
  metricType: 'delivery',
  // `repo`, not `platform`: both ends are readable from the repositories
  // themselves at a recorded sha, so a third party can check the figure without
  // access to this platform. That is the whole reason the metric is publishable.
  verificationMethod: 'repo',

  compute(ctx: MetricRunContext): MetricComputation {
    const dated = ctx.repositories
      .map((repo) => ({ ref: repo.ref, createdAt: repo.facts.metadata.createdAt }))
      .filter((r): r is { ref: string; createdAt: string } => typeof r.createdAt === 'string')
      .filter((r) => !Number.isNaN(Date.parse(r.createdAt)));

    const earliest = dated.reduce<{ ref: string; createdAt: string } | null>(
      (best, r) => (best === null || Date.parse(r.createdAt) < Date.parse(best.createdAt) ? r : best),
      null
    );

    const inputs: Record<string, unknown> = {
      analysable_repo_count: ctx.repositories.length,
      dated_repo_count: dated.length,
      unreadable_repo_count: ctx.unreadableRepoCount,
      earliest_created_at: earliest?.createdAt ?? null,
      earliest_repo_ref: earliest?.ref ?? null,
      pinned_commit_sha: ctx.pinnedCommitSha,
      pinned_commit_at: ctx.pinnedCommitAt,
    };

    const limitations = [...STATIC_LIMITATIONS, ...runLimitations(ctx, dated.length)];

    // Every refusal below produces a null value with a methodology that says
    // WHY. A metric row carrying "not computed" and no reason is a row somebody
    // has to reverse-engineer later; the run record is the place to answer it.
    if (earliest === null) {
      return refusal(
        inputs,
        limitations,
        ctx.repositories.length === 0
          ? 'No analysable repository was attached, so there is no start date to measure from.'
          : 'No analysable repository reported a creation date, so there is no start date to measure from.'
      );
    }
    if (!ctx.pinnedCommitAt) {
      return refusal(
        inputs,
        limitations,
        'The approved snapshot pins no commit whose date could be read, so there is no end date to measure to.'
      );
    }

    const days = elapsedDays(earliest.createdAt, ctx.pinnedCommitAt);
    if (days === null) {
      // Reachable when the pinned commit PRECEDES the earliest repository
      // creation, which means the inputs disagree rather than that delivery took
      // negative time. Naming that is more useful than publishing a number.
      return refusal(
        inputs,
        limitations,
        'The pinned commit predates the earliest repository creation, so the elapsed time is not a measurement.'
      );
    }

    return {
      numericValue: days,
      valueDisplay: `${days} ${days === 1 ? 'day' : 'days'}`,
      unit: 'days',
      sample: sampleSentence(ctx, dated.length),
      methodology:
        `Calendar days from the earliest repository creation date (${earliest.createdAt}) ` +
        `to the committer date of the commit pinned by the approved snapshot ` +
        `(${short(ctx.pinnedCommitSha)}, ${ctx.pinnedCommitAt}). ` +
        'Both ends are fixed points, so re-running against the same snapshot returns the same number.',
      // Null, and deliberately so: this is a LEVEL metric. There is no prior
      // period to compare against, and inventing one would be the "N% improvement"
      // figure the scope document rejects for having no baseline anything records.
      baseline: null,
      limitations,
      inputs,
    };
  },
};

const STATIC_LIMITATIONS: readonly string[] = [
  'Repository creation is not project start; a repository created early and left idle inflates this figure.',
  'Measured from repository history only. Work done before the first repository existed is not counted.',
];

function runLimitations(ctx: MetricRunContext, datedCount: number): string[] {
  const out: string[] = [];
  if (ctx.unreadableRepoCount > 0) {
    const total = ctx.repositories.length + ctx.unreadableRepoCount;
    out.push(
      `${ctx.unreadableRepoCount} of ${total} attached repositories could not be analysed and are excluded; ` +
        'an excluded repository may predate the earliest one measured here.'
    );
  }
  const undated = ctx.repositories.length - datedCount;
  if (undated > 0) {
    out.push(`${undated} analysable repositories reported no creation date and are excluded from the start date.`);
  }
  return out;
}

function sampleSentence(ctx: MetricRunContext, datedCount: number): string {
  const total = ctx.repositories.length + ctx.unreadableRepoCount;
  return (
    `${datedCount} of ${total} attached repositories, ` +
    `measured to snapshot commit ${short(ctx.pinnedCommitSha)}.`
  );
}

/** A metric that could not be computed, with the reason in the methodology. */
function refusal(
  inputs: Record<string, unknown>,
  limitations: readonly string[],
  why: string
): MetricComputation {
  return {
    // Null, never 0. "Not computable" and "took zero days" are different claims
    // and only one of them is true here.
    numericValue: null,
    valueDisplay: 'Not computed',
    sample: 'No measurable sample.',
    methodology: why,
    baseline: null,
    limitations,
    inputs,
  };
}

const short = (sha: string | null): string => (sha ? sha.slice(0, 7) : 'none');
