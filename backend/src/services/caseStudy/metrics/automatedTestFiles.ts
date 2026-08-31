import type { MetricComputation, MetricDefinition, MetricRunContext } from './metricDefinition';

/**
 * D3 — `automated_test_files`. `METRIC_PROVENANCE_PIPELINE.md` §4.
 *
 * Test files summed across the analysable repositories, with continuous
 * integration reported alongside.
 *
 * WHY SHIP THE UNFLATTERING ONE. This is the metric that resists inflation, and
 * that is the reason to have it. It will sometimes be a small number. A case
 * study that publishes a small honest figure next to a large honest one is more
 * credible than one publishing only the large one, and a reader who can see the
 * business chose to show both has a reason to believe the rest.
 *
 * THE LIMITATION IS NOT OPTIONAL. A file count is not coverage: one file can
 * assert nothing, and a thousand can miss the path that matters. The scope
 * document calls this limitation non-negotiable if the metric is ever promoted
 * to headline, so it is generated on every run rather than left to an author to
 * remember.
 */
export const automatedTestFiles: MetricDefinition = {
  key: 'automated_test_files',
  version: 1,
  label: 'Automated test files',
  metricType: 'quality',
  verificationMethod: 'repo',

  compute(ctx: MetricRunContext): MetricComputation {
    const analysable = ctx.repositories.length;
    const total = analysable + ctx.unreadableRepoCount;

    const counted = ctx.repositories.map((repo) => ({
      ref: repo.ref,
      files: Number(repo.facts.derived.testFileCount) || 0,
      hasCi: repo.facts.derived.hasCi === true,
    }));

    const files = counted.reduce((n, r) => n + r.files, 0);
    const withCi = counted.filter((r) => r.hasCi).length;
    const withNoTests = counted.filter((r) => r.files === 0).length;

    const inputs: Record<string, unknown> = {
      analysable_repo_count: analysable,
      unreadable_repo_count: ctx.unreadableRepoCount,
      test_file_count: files,
      repos_with_ci: withCi,
      repos_with_no_tests: withNoTests,
      per_repo: counted.map((r) => ({ ref: r.ref, files: r.files, hasCi: r.hasCi })),
      pinned_commit_sha: ctx.pinnedCommitSha,
    };

    const limitations = [
      'A file count is not coverage. One test file can assert nothing, and many can miss the path that matters.',
      ...(withNoTests > 0
        ? [`${withNoTests} of the ${analysable} analysable repositories contain no test files at all.`]
        : []),
      ...(ctx.unreadableRepoCount > 0
        ? [`${ctx.unreadableRepoCount} of ${total} attached repositories could not be analysed and contribute nothing to this total.`]
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
      // A genuine zero is a real, publishable answer here — "no automated tests"
      // is a fact about the work, not a failure to measure it. Only an
      // unanalysable set returns null.
      numericValue: files,
      valueDisplay: `${files} ${files === 1 ? 'file' : 'files'}`,
      unit: 'files',
      sample: `${analysable} of ${total} attached repositories, ${withCi} running continuous integration.`,
      methodology:
        `Test files counted across the ${analysable} analysable repositories at the commit the ` +
        `approved snapshot pinned. ${withCi} of those ${analysable} run continuous integration, ` +
        'which is reported alongside because a test that never runs proves less than one that does.',
      baseline: null,
      limitations,
      inputs,
    };
  },
};
