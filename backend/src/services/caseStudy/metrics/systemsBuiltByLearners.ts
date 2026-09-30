import type { MetricComputation, MetricDefinition, MetricRunContext } from './metricDefinition';

/**
 * `systems_built_by_learners` — how many distinct working systems people built
 * going through the program.
 *
 * WHY THIS METRIC AND NOT A TEST COUNT. Three repository-derived metrics were
 * run against this record first, and all three answered questions nobody asked:
 * a test-file total that was 96% the platform's own monorepo, a delivery span
 * anchored on that monorepo's age, and a deployment count that was really
 * reporting an unset GitHub metadata field. The claim this record actually makes
 * is that people without a technical background finish able to build a system.
 * The honest measurement of that claim is how many systems exist.
 *
 * `platform`, not `repo`. §3.5: `platform` is the only member of the union that
 * names the mechanism when a figure comes from what the platform recorded rather
 * than from a repository at a pinned sha. Calling this `repo` would imply a
 * third party could re-read one commit and reproduce it, which is not true — it
 * is a count across many repositories the platform observed.
 *
 * IT COUNTS SYSTEMS, NEVER PEOPLE. The context carries an opaque ref and a file
 * count per system and nothing else — no owner, no repository name, no learner.
 * So this cannot become a per-learner figure by a later edit; the data to do
 * that is not present. That matters because §2.6 records that no consent axis
 * covers publication of learner data, and a count of artefacts is a far milder
 * thing than a claim about a named person's competency.
 */

/**
 * Below this, a repository is a placeholder rather than a system.
 *
 * Chosen against the observed distribution rather than picked for a flattering
 * result: real workspaces in this cohort run from the low twenties to the high
 * two hundreds of files, while the placeholder in the table is GitHub's demo
 * repository at one file. Ten is comfortably below every real build and
 * comfortably above the demo, and the figure is reported alongside the
 * unfiltered count so the threshold can never quietly do the work.
 */
export const SUBSTANTIVE_FILE_THRESHOLD = 10;

export const systemsBuiltByLearners: MetricDefinition = {
  key: 'systems_built_by_learners',
  version: 1,
  label: 'Systems built by learners',
  metricType: 'scale',
  verificationMethod: 'platform',

  compute(ctx: MetricRunContext): MetricComputation {
    const all = ctx.learnerSystems;
    const observed = all.filter((s) => s.treeRead);
    const substantive = observed.filter((s) => s.fileCount >= SUBSTANTIVE_FILE_THRESHOLD);

    const files = substantive.map((s) => s.fileCount).sort((a, b) => a - b);
    const median = files.length === 0
      ? null
      : files.length % 2 === 1
        ? files[(files.length - 1) / 2]
        : Math.round((files[files.length / 2 - 1] + files[files.length / 2]) / 2);

    const inputs: Record<string, unknown> = {
      connected_system_count: all.length,
      observed_system_count: observed.length,
      substantive_system_count: substantive.length,
      substantive_file_threshold: SUBSTANTIVE_FILE_THRESHOLD,
      median_file_count: median,
      smallest_file_count: files.length ? files[0] : null,
      largest_file_count: files.length ? files[files.length - 1] : null,
    };

    const limitations = [
      'Counts systems, not people. One learner may have built more than one, so this is not a headcount.',
      `A system counts when the platform has read its repository and found at least ${SUBSTANTIVE_FILE_THRESHOLD} files. That is a test of substance, not of whether the system works.`,
      ...(observed.length < all.length
        ? [`${all.length - observed.length} connected repositories have never been read and are excluded.`]
        : []),
      ...(observed.length > substantive.length
        ? [`${observed.length - substantive.length} read repositories fell below the file threshold and are excluded.`]
        : []),
    ];

    if (observed.length === 0) {
      return {
        numericValue: null,
        valueDisplay: 'Not computed',
        sample: 'No learner repository has been read.',
        methodology:
          'No connected learner repository has had its file tree read, so there is nothing to count.',
        baseline: null,
        limitations,
        inputs,
      };
    }

    return {
      numericValue: substantive.length,
      valueDisplay: `${substantive.length} ${substantive.length === 1 ? 'system' : 'systems'}`,
      unit: 'systems',
      sample: `${observed.length} learner repositories read, of ${all.length} connected.`,
      methodology:
        `Distinct learner-owned repositories the platform has read and found to contain at least ` +
        `${SUBSTANTIVE_FILE_THRESHOLD} files, counted once each. Repositories under the Colaberry ` +
        `organisation are excluded as company product work rather than a learner's own build. ` +
        (median === null
          ? ''
          : `The systems counted range from ${files[0]} to ${files[files.length - 1]} files, median ${median}.`),
      // A level metric: there is no prior cohort recorded to compare against, and
      // inventing one is how this would become an unfounded improvement claim.
      baseline: null,
      limitations,
      inputs,
    };
  },
};
