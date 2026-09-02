import fs from 'fs';
import path from 'path';
import { SUBSTANTIVE_FILE_THRESHOLD, systemsBuiltByLearners } from '../systemsBuiltByLearners';
import { toLearnerSystem } from '../learnerSystemsSource';
import type { MetricLearnerSystem, MetricRunContext } from '../metricDefinition';

/**
 * `systems_built_by_learners` — the first PLATFORM-derived definition.
 *
 * WHY IT EXISTS. Three repository-derived metrics were run against the training
 * record and all three answered questions nobody asked: a test-file total that
 * was 96% the platform's own monorepo, a delivery span anchored on that
 * monorepo's age, and a deployment count that was really reporting an unset
 * GitHub metadata field. The claim the record makes is that people without a
 * technical background finish able to build a system, and the honest measurement
 * of that is how many systems exist.
 *
 * The assertions that matter most are the ones about what this CANNOT do: it
 * counts systems and must never become a claim about a person, because the
 * consent axis for publishing learner data does not exist yet.
 */

const sys = (ref: string, fileCount: number, treeRead = true): MetricLearnerSystem =>
  ({ ref, fileCount, treeRead });

function ctx(learnerSystems: MetricLearnerSystem[]): MetricRunContext {
  return {
    caseStudyId: 'cs-1',
    correlationId: 'cid',
    repositories: [],
    unreadableRepoCount: 0,
    pinnedCommitSha: null,
    pinnedCommitAt: null,
    learnerSystems,
  };
}

describe('systems_built_by_learners', () => {
  it('declares itself PLATFORM-derived, not repo-derived', () => {
    expect(systemsBuiltByLearners.key).toBe('systems_built_by_learners');
    expect(systemsBuiltByLearners.metricType).toBe('scale');
    // `repo` would imply a third party could re-read one commit and reproduce
    // the figure. They cannot: it is a count across many repositories the
    // platform observed, and `platform` is the only member that names that.
    expect(systemsBuiltByLearners.verificationMethod).toBe('platform');
  });

  it('counts distinct systems above the substance threshold', () => {
    const result = systemsBuiltByLearners.compute(ctx([
      sys('a', 125), sys('b', 23), sys('c', 289), sys('d', 81),
    ]));
    expect(result.numericValue).toBe(4);
    expect(result.valueDisplay).toBe('4 systems');
  });

  it('excludes a placeholder repository, and says how many it dropped', () => {
    // GitHub's demo repo is one file. Counting it as a system a learner built
    // would be the single easiest way to inflate this figure.
    const result = systemsBuiltByLearners.compute(ctx([sys('real', 125), sys('demo', 1)]));
    expect(result.numericValue).toBe(1);
    expect(result.limitations.join(' ')).toContain('1 read repositories fell below the file threshold');
  });

  it('excludes a connected repository the platform has never read', () => {
    const result = systemsBuiltByLearners.compute(ctx([sys('read', 125), sys('unread', 0, false)]));
    expect(result.numericValue).toBe(1);
    expect(result.limitations.join(' ')).toContain('never been read');
    expect(result.inputs.connected_system_count).toBe(2);
    expect(result.inputs.observed_system_count).toBe(1);
  });

  it('reports the unfiltered count alongside, so the threshold cannot do the work quietly', () => {
    const result = systemsBuiltByLearners.compute(ctx([
      sys('a', 125), sys('b', 2), sys('c', 3),
    ]));
    // A reader can see 3 were connected and 1 counted, and judge the filter.
    expect(result.inputs.connected_system_count).toBe(3);
    expect(result.inputs.substantive_system_count).toBe(1);
    expect(result.inputs.substantive_file_threshold).toBe(SUBSTANTIVE_FILE_THRESHOLD);
  });

  it('describes the spread rather than a bare count', () => {
    const result = systemsBuiltByLearners.compute(ctx([
      sys('a', 23), sys('b', 125), sys('c', 289),
    ]));
    // "19 systems" alone says nothing about whether they are real. The range and
    // median are what make the number legible.
    expect(result.methodology).toContain('23');
    expect(result.methodology).toContain('289');
    expect(result.inputs.median_file_count).toBe(125);
  });

  it('says plainly that it counts systems, not people', () => {
    const result = systemsBuiltByLearners.compute(ctx([sys('a', 125), sys('b', 60)]));
    // One learner may have built two. Reading this as a headcount is the most
    // likely misuse, so the limitation leads with it.
    expect(result.limitations[0]).toContain('not people');
    expect(result.limitations[0]).toContain('not a headcount');
  });

  it('returns null, not zero, when nothing has been read', () => {
    const result = systemsBuiltByLearners.compute(ctx([sys('a', 0, false)]));
    expect(result.numericValue).toBeNull();
    expect(result.numericValue).not.toBe(0);
    expect(result.valueDisplay).toBe('Not computed');
  });

  it('has no baseline, because no prior cohort is recorded', () => {
    expect(systemsBuiltByLearners.compute(ctx([sys('a', 125)])).baseline).toBeNull();
  });

  it('says "1 system", not "1 systems"', () => {
    expect(systemsBuiltByLearners.compute(ctx([sys('a', 125)])).valueDisplay).toBe('1 system');
  });

  describe('what it must never be able to say', () => {
    it('carries no owner, repository name or learner identity anywhere in its output', () => {
      const result = systemsBuiltByLearners.compute(ctx([sys('opaque-ref-1', 125)]));
      const everything = JSON.stringify(result);
      for (const identifier of ['github.com', '@', 'enrollment', 'Architect-Workspace', 'DataBuddy']) {
        expect(everything).not.toContain(identifier);
      }
      // And the assertion is not passing over an empty object.
      expect(result.methodology.length).toBeGreaterThan(40);
    });

    it('is given no field from which a per-learner figure could be derived', () => {
      // The guarantee is structural, not editorial: the context type carries a
      // ref and a file count and nothing else, so a later edit cannot turn this
      // into a claim about a named person — the data is simply not there.
      const source = fs.readFileSync(
        path.join(__dirname, '..', 'learnerSystemsSource.ts'), 'utf8'
      );
      // COMMENTS ARE PROSE, NOT FIELDS. The doc comment on this interface
      // mentions the owner and name that go into the hash, and a scan that
      // cannot tell prose from code fails on a comment that merely NAMES the
      // thing it forbids. Strip comments first, then read the field list.
      const stripped = source
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ');
      const iface = stripped.slice(
        stripped.indexOf('export interface MetricLearnerSystem'),
        stripped.indexOf('}', stripped.indexOf('export interface MetricLearnerSystem'))
      );
      expect(iface).toContain('ref');
      expect(iface).toContain('fileCount');
      expect(iface).not.toContain('owner');
      expect(iface).not.toContain('name');
      expect(iface).not.toContain('enrollment');
      // Non-vacuity: the slice really is the interface.
      expect(iface.length).toBeGreaterThan(50);
    });

    it('emits EXACTLY three fields, whatever the database row contains', () => {
      // The assertion that actually holds the line. A mutation adding
      // `enrollmentId` to the loader's output passed every other test AND
      // `tsc --noEmit` — the tests never reach the loader, and an excess
      // property survives an inferred `.map()`. Asserting the exact key set of
      // a pure mapping is the only version a later edit cannot walk past.
      const row = {
        repo_owner: 'someone', repo_name: 'their-workspace',
        file_count: 125, tree_read: true,
        // Fields a real row carries that must NOT come through.
        enrollment_id: 'enr-123', access_token_encrypted: 'secret',
      } as never;
      const out = toLearnerSystem(row);
      expect(Object.keys(out).sort()).toEqual(['fileCount', 'ref', 'treeRead']);
      const serialised = JSON.stringify(out);
      expect(serialised).not.toContain('someone');
      expect(serialised).not.toContain('their-workspace');
      expect(serialised).not.toContain('enr-123');
      expect(serialised).not.toContain('secret');
      // The ref is a one-way hash, so two systems stay distinguishable without
      // either being nameable.
      expect(out.ref).toHaveLength(16);
      expect(out.ref).not.toBe(toLearnerSystem({ ...row, repo_name: 'other' } as never).ref);
    });

    it('excludes company repositories from the learner count', () => {
      // Interns contribute to Colaberry's own products. Counting those as "a
      // system a learner built" would make the figure mean two things at once.
      const source = fs.readFileSync(
        path.join(__dirname, '..', 'learnerSystemsSource.ts'), 'utf8'
      );
      expect(source).toContain('colaberryintern');
      expect(source).toContain('octocat');
    });
  });
});
