import type { MetricComputation, MetricDefinition, MetricRunContext } from './metricDefinition';

/**
 * D2 — `production_systems_declared`. `METRIC_PROVENANCE_PIPELINE.md` §4.
 *
 * How many of the analysable repositories declare a deployment, over how many
 * were attached.
 *
 * WHY IT IS `adoption` AND NOT A PRODUCTION-STATUS CLAIM. `deploymentUrl` is the
 * repository's own declared homepage, and the extractor is explicit that it is
 * "never guessed from README prose". A declaration is a fact about what a team
 * published about itself — it is not proof that anything serves traffic. Calling
 * this `adoption` keeps the metric honest about which of those two it measured,
 * and the limitation says so on every run rather than leaving a reader to infer
 * it. The existing production-status publish rule already refuses a `verified`
 * production status carrying no evidence; this metric is not a way around that.
 *
 * "Three of four systems declare a live deployment" is a claim about shipping
 * rather than building, and it is mechanically checkable by anyone who opens the
 * repositories.
 */
export const productionSystemsDeclared: MetricDefinition = {
  key: 'production_systems_declared',
  version: 1,
  label: 'Systems declaring a deployment',
  metricType: 'adoption',
  verificationMethod: 'repo',

  compute(ctx: MetricRunContext): MetricComputation {
    const analysable = ctx.repositories.length;
    const total = analysable + ctx.unreadableRepoCount;

    const declaring = ctx.repositories.filter(
      (repo) => typeof repo.facts.derived.deploymentUrl === 'string'
        && repo.facts.derived.deploymentUrl.trim().length > 0
    );

    const inputs: Record<string, unknown> = {
      analysable_repo_count: analysable,
      unreadable_repo_count: ctx.unreadableRepoCount,
      declaring_repo_count: declaring.length,
      // The opaque refs only. A deployment URL is repository identity by another
      // name, and gate rule 11 refuses prose carrying the identity of a withheld
      // repository — so the URLs themselves never enter the record.
      declaring_repo_refs: declaring.map((r) => r.ref).sort(),
      pinned_commit_sha: ctx.pinnedCommitSha,
    };

    const limitations = [
      'A declared homepage is a declaration, not proof of live traffic. This counts what the repositories say about themselves.',
      ...(ctx.unreadableRepoCount > 0
        ? [`${ctx.unreadableRepoCount} of ${total} attached repositories could not be analysed and are excluded from both halves of this ratio.`]
        : []),
    ];

    if (analysable === 0) {
      return {
        numericValue: null,
        valueDisplay: 'Not computed',
        sample: 'No measurable sample.',
        methodology: 'No repository could be analysed, so there is nothing to count.',
        baseline: null,
        limitations,
        inputs,
      };
    }

    return {
      numericValue: declaring.length,
      // The denominator travels IN the displayed value. "3" alone invites a
      // reader to supply their own denominator; "3 of 4" cannot be misread.
      valueDisplay: `${declaring.length} of ${analysable}`,
      unit: 'repositories',
      sample: `${analysable} of ${total} attached repositories were analysable.`,
      methodology:
        `Counts analysable repositories whose declared homepage is set, over the ${analysable} ` +
        'that could be analysed. The homepage is read from the repository\'s own metadata and is ' +
        'never inferred from README prose, so the figure can be checked by opening the repositories.',
      baseline: null,
      limitations,
      inputs,
    };
  },
};
