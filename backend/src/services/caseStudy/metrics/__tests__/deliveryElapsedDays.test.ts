import { deliveryElapsedDays } from '../deliveryElapsedDays';
import { elapsedDays } from '../metricDefinition';
import type { MetricRepoInput, MetricRunContext } from '../metricDefinition';
import type { CaseStudyRepoFacts } from '../../caseStudyRepoAnalyzer';

/**
 * D1 — `delivery_elapsed_days`.
 *
 * NO DATABASE, NO NETWORK, NO CLOCK. `compute` is pure by design, so this suite
 * needs no fixture database and no fake timers: every input arrives in the
 * context. That is also what makes the idempotency assertion below meaningful
 * rather than circular.
 */

const SHA = 'abcdef1234567890abcdef1234567890abcdef12';

/** Only the fields this metric reads; the rest of the facts are irrelevant here. */
function repo(ref: string, createdAt: string | null): MetricRepoInput {
  return {
    ref,
    facts: { metadata: { createdAt } } as unknown as CaseStudyRepoFacts,
  };
}

function ctx(over: Partial<MetricRunContext> = {}): MetricRunContext {
  return {
    caseStudyId: 'cs-1',
    correlationId: 'cid-d1',
    repositories: [repo('ref-a', '2026-01-01T00:00:00Z')],
    unreadableRepoCount: 0,
    pinnedCommitSha: SHA,
    pinnedCommitAt: '2026-01-12T00:00:00Z',
    ...over,
  };
}

describe('delivery_elapsed_days', () => {
  describe('the contract the runner depends on', () => {
    it('declares a stable key, a version, and an honest verification method', () => {
      expect(deliveryElapsedDays.key).toBe('delivery_elapsed_days');
      expect(deliveryElapsedDays.version).toBe(1);
      expect(deliveryElapsedDays.metricType).toBe('delivery');
      // `repo`, not `platform` or `self`: both ends are readable from the
      // repositories at a recorded sha, so the figure is checkable from outside
      // this platform. The publish gate refuses `verified` + `self` outright.
      expect(deliveryElapsedDays.verificationMethod).toBe('repo');
    });
  });

  describe('the happy path', () => {
    it('measures earliest creation to the pinned commit date', () => {
      const result = deliveryElapsedDays.compute(ctx());
      expect(result.numericValue).toBe(11);
      expect(result.valueDisplay).toBe('11 days');
      expect(result.unit).toBe('days');
    });

    it('takes the EARLIEST creation date, not the first repository listed', () => {
      const result = deliveryElapsedDays.compute(
        ctx({
          repositories: [
            repo('ref-late', '2026-01-06T00:00:00Z'),
            repo('ref-early', '2026-01-01T00:00:00Z'),
            repo('ref-mid', '2026-01-03T00:00:00Z'),
          ],
        })
      );
      expect(result.numericValue).toBe(11);
      expect(result.inputs.earliest_repo_ref).toBe('ref-early');
    });

    it('says "1 day", not "1 days"', () => {
      const result = deliveryElapsedDays.compute(ctx({ pinnedCommitAt: '2026-01-02T00:00:00Z' }));
      expect(result.valueDisplay).toBe('1 day');
    });

    it('floors rather than rounds', () => {
      // 10 days and 23 hours is not 11 days. A metric that rounds up is a metric
      // that occasionally publishes a number the repository cannot support.
      const result = deliveryElapsedDays.compute(ctx({ pinnedCommitAt: '2026-01-11T23:00:00Z' }));
      expect(result.numericValue).toBe(10);
    });

    it('generates a methodology naming both fixed ends', () => {
      const result = deliveryElapsedDays.compute(ctx());
      expect(result.methodology).toContain('2026-01-01T00:00:00Z');
      expect(result.methodology).toContain('2026-01-12T00:00:00Z');
      expect(result.methodology).toContain(SHA.slice(0, 7));
    });

    it('has no baseline, because it is a level metric', () => {
      // Null is the correct answer, not a missing one. Inventing a comparison
      // period is how a level metric becomes an unfounded "N% improvement".
      expect(deliveryElapsedDays.compute(ctx()).baseline).toBeNull();
    });

    it('always carries the limitation that creation is not project start', () => {
      const result = deliveryElapsedDays.compute(ctx());
      expect(result.limitations.join(' ')).toContain('not project start');
    });
  });

  describe('refusals, which must stay distinguishable from a zero', () => {
    it('returns null — not 0 — when no repository is analysable', () => {
      const result = deliveryElapsedDays.compute(ctx({ repositories: [] }));
      // The distinction is the whole point: "took zero days" is a spectacular
      // claim and "could not be measured" is an absence. Collapsing them
      // publishes the first when only the second is true.
      expect(result.numericValue).toBeNull();
      expect(result.numericValue).not.toBe(0);
      expect(result.valueDisplay).toBe('Not computed');
      expect(result.methodology).toContain('no start date');
    });

    it('returns null when no analysable repository reports a creation date', () => {
      const result = deliveryElapsedDays.compute(ctx({ repositories: [repo('ref-a', null)] }));
      expect(result.numericValue).toBeNull();
      expect(result.methodology).toContain('no start date');
    });

    it('returns null when the snapshot pins no readable commit date', () => {
      const result = deliveryElapsedDays.compute(ctx({ pinnedCommitAt: null }));
      expect(result.numericValue).toBeNull();
      expect(result.methodology).toContain('no end date');
    });

    it('refuses rather than reporting negative time when the commit predates creation', () => {
      const result = deliveryElapsedDays.compute(ctx({ pinnedCommitAt: '2025-12-01T00:00:00Z' }));
      expect(result.numericValue).toBeNull();
      expect(result.methodology).toContain('predates');
    });

    it('ignores an unparseable creation date rather than producing NaN', () => {
      const result = deliveryElapsedDays.compute(
        ctx({
          repositories: [repo('ref-bad', 'not a date'), repo('ref-good', '2026-01-01T00:00:00Z')],
        })
      );
      expect(result.numericValue).toBe(11);
      expect(result.inputs.dated_repo_count).toBe(1);
    });
  });

  describe('the denominator tells the truth about what it could not read', () => {
    it('discloses unreadable repositories in the sample and the limitations', () => {
      const result = deliveryElapsedDays.compute(ctx({ unreadableRepoCount: 3 }));
      // "1 of 4", never "1 of 1". A denominator that silently excludes what it
      // could not read is the difference between a measurement and a flattering
      // subset of one.
      expect(result.sample).toContain('1 of 4');
      expect(result.limitations.join(' ')).toContain('3 of 4');
      expect(result.limitations.join(' ')).toContain('may predate');
    });

    it('discloses analysable repositories that carried no creation date', () => {
      const result = deliveryElapsedDays.compute(
        ctx({ repositories: [repo('a', '2026-01-01T00:00:00Z'), repo('b', null)] })
      );
      expect(result.limitations.join(' ')).toContain('1 analysable repositories reported no creation date');
    });
  });

  describe('identity never reaches generated prose', () => {
    it('puts no owner, name or URL into any string a metric row will carry', () => {
      // `methodology`, `sample` and `limitations` are stored on the metric row
      // and can reach a published page. Publish gate rule 11 refuses a snapshot
      // whose prose carries the identity of a withheld repository — a metric
      // that names one in its own methodology creates the leak the gate then has
      // to catch. Not writing it is better than catching it.
      const secret = { ref: 'opaque-ref-1', facts: {
        repoOwner: 'acme',
        repoName: 'secret-thing',
        repoUrl: 'https://github.com/acme/secret-thing',
        metadata: { createdAt: '2026-01-01T00:00:00Z' },
      } as unknown as CaseStudyRepoFacts };
      const result = deliveryElapsedDays.compute(ctx({ repositories: [secret], unreadableRepoCount: 1 }));
      const prose = [result.methodology, result.sample, result.valueDisplay, ...result.limitations].join(' ');
      expect(prose).not.toContain('acme');
      expect(prose).not.toContain('secret-thing');
      expect(prose).not.toContain('github.com');
      // And the assertion is not passing over empty strings.
      expect(result.methodology.length).toBeGreaterThan(40);
    });

    it('records only the opaque ref in the run inputs', () => {
      const result = deliveryElapsedDays.compute(ctx());
      expect(result.inputs.earliest_repo_ref).toBe('ref-a');
      expect(JSON.stringify(result.inputs)).not.toContain('github.com');
    });
  });

  describe('idempotency, which the pipeline requires rather than hopes for', () => {
    it('returns a byte-identical result when run twice on the same context', () => {
      const input = ctx();
      const first = deliveryElapsedDays.compute(input);
      const second = deliveryElapsedDays.compute(input);
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    });

    it('does not depend on the wall clock', () => {
      // The end of the measurement is the pinned commit, never "now". If this
      // ever changes, the same snapshot returns a larger number every day and
      // every published figure silently rots.
      const before = deliveryElapsedDays.compute(ctx());
      const realNow = Date.now;
      Date.now = () => Date.parse('2030-01-01T00:00:00Z');
      try {
        expect(JSON.stringify(deliveryElapsedDays.compute(ctx()))).toBe(JSON.stringify(before));
      } finally {
        Date.now = realNow;
      }
    });

    it('is unaffected by the order the repositories arrive in', () => {
      const repos = [
        repo('a', '2026-01-05T00:00:00Z'),
        repo('b', '2026-01-01T00:00:00Z'),
        repo('c', '2026-01-09T00:00:00Z'),
      ];
      const forward = deliveryElapsedDays.compute(ctx({ repositories: repos }));
      const reversed = deliveryElapsedDays.compute(ctx({ repositories: [...repos].reverse() }));
      expect(JSON.stringify(reversed)).toBe(JSON.stringify(forward));
    });
  });

  describe('elapsedDays', () => {
    it('counts whole days', () => {
      expect(elapsedDays('2026-01-01T00:00:00Z', '2026-01-12T00:00:00Z')).toBe(11);
    });

    it('is zero within the same day', () => {
      // A genuine zero, distinct from the null a refusal returns.
      expect(elapsedDays('2026-01-01T01:00:00Z', '2026-01-01T23:00:00Z')).toBe(0);
    });

    it('returns null on an unparseable input rather than NaN', () => {
      expect(elapsedDays('nonsense', '2026-01-12T00:00:00Z')).toBeNull();
      expect(elapsedDays('2026-01-01T00:00:00Z', 'nonsense')).toBeNull();
    });

    it('returns null rather than a negative number when the end precedes the start', () => {
      expect(elapsedDays('2026-01-12T00:00:00Z', '2026-01-01T00:00:00Z')).toBeNull();
    });

    it('is unaffected by the offsets the two timestamps are expressed in', () => {
      // Same two instants, written in different zones. A metric that answers
      // differently depending on how GitHub formatted the string is not a
      // measurement of anything.
      expect(elapsedDays('2026-01-01T00:00:00Z', '2026-01-12T00:00:00Z')).toBe(
        elapsedDays('2025-12-31T19:00:00-05:00', '2026-01-12T05:00:00+05:00')
      );
    });
  });
});
