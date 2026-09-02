import fs from 'fs';
import path from 'path';
import { automatedTestFiles } from '../automatedTestFiles';
import { productionSystemsDeclared } from '../productionSystemsDeclared';
import { METRIC_DEFINITIONS, findMetricDefinition } from '../metricDefinitions';
import type { MetricRepoInput, MetricRunContext } from '../metricDefinition';
import type { CaseStudyRepoFacts } from '../../caseStudyRepoAnalyzer';

/**
 * D2 and D3, and the claim Stage 3 exists to test.
 *
 * `METRIC_PROVENANCE_PIPELINE.md` §9: "Zero new mechanism. This stage is the
 * proof that a new metric is a new DEFINITION, not a new FEATURE — and if it is
 * not, Stage 1 got the interface wrong." The last describe block checks that
 * literally, against the files.
 *
 * NO DATABASE, NO NETWORK, NO CLOCK — `compute` is pure, same as D1.
 */

function repo(ref: string, derived: Record<string, unknown>): MetricRepoInput {
  return {
    ref,
    facts: {
      repoOwner: 'acme',
      repoName: ref,
      repoUrl: `https://github.com/acme/${ref}`,
      metadata: { createdAt: '2026-01-01T00:00:00Z' },
      derived: { deploymentUrl: null, testFileCount: 0, hasCi: false, ...derived },
    } as unknown as CaseStudyRepoFacts,
  };
}

function ctx(over: Partial<MetricRunContext> = {}): MetricRunContext {
  return {
    caseStudyId: 'cs-1',
    correlationId: 'cid',
    repositories: [],
    unreadableRepoCount: 0,
    pinnedCommitSha: 'abc1234',
    pinnedCommitAt: '2026-03-01T00:00:00Z',
    ...over,
  };
}

describe('production_systems_declared', () => {
  it('declares an honest contract', () => {
    expect(productionSystemsDeclared.key).toBe('production_systems_declared');
    // `adoption`, deliberately not a production-status claim: a declared
    // homepage is what a team published about itself, not proof of traffic.
    expect(productionSystemsDeclared.metricType).toBe('adoption');
    expect(productionSystemsDeclared.verificationMethod).toBe('repo');
  });

  it('counts repositories declaring a deployment, and carries the denominator', () => {
    const result = productionSystemsDeclared.compute(ctx({
      repositories: [
        repo('atlas', { deploymentUrl: 'https://atlas.example.com' }),
        repo('beacon', { deploymentUrl: 'https://beacon.example.com' }),
        repo('quiet', { deploymentUrl: null }),
      ],
    }));
    expect(result.numericValue).toBe(2);
    // "2" alone invites a reader to supply their own denominator.
    expect(result.valueDisplay).toBe('2 of 3');
  });

  it('ignores a homepage that is only whitespace', () => {
    const result = productionSystemsDeclared.compute(ctx({
      repositories: [repo('atlas', { deploymentUrl: '   ' })],
    }));
    expect(result.numericValue).toBe(0);
  });

  it('always states that a declaration is not proof of traffic', () => {
    const result = productionSystemsDeclared.compute(ctx({
      repositories: [repo('atlas', { deploymentUrl: 'https://atlas.example.com' })],
    }));
    expect(result.limitations.join(' ')).toContain('not proof of live traffic');
  });

  it('never puts a deployment URL in the record', () => {
    // A deployment URL is repository identity by another name, and gate rule 11
    // refuses prose carrying the identity of a withheld repository.
    const result = productionSystemsDeclared.compute(ctx({
      repositories: [repo('atlas', { deploymentUrl: 'https://secret-client.example.com' })],
    }));
    const everything = JSON.stringify(result);
    expect(everything).not.toContain('secret-client');
    expect(everything).not.toContain('https://');
    expect(result.inputs.declaring_repo_refs).toEqual(['atlas']);
  });

  it('excludes unreadable repositories from BOTH halves, and says so', () => {
    const result = productionSystemsDeclared.compute(ctx({
      repositories: [repo('atlas', { deploymentUrl: 'https://a.example.com' })],
      unreadableRepoCount: 3,
    }));
    expect(result.valueDisplay).toBe('1 of 1');
    expect(result.sample).toContain('1 of 4');
    expect(result.limitations.join(' ')).toContain('excluded from both halves');
  });

  it('returns null, not zero, when nothing could be analysed', () => {
    const result = productionSystemsDeclared.compute(ctx({ repositories: [] }));
    expect(result.numericValue).toBeNull();
    expect(result.numericValue).not.toBe(0);
  });
});

describe('automated_test_files', () => {
  it('declares an honest contract', () => {
    expect(automatedTestFiles.key).toBe('automated_test_files');
    expect(automatedTestFiles.metricType).toBe('quality');
    expect(automatedTestFiles.verificationMethod).toBe('repo');
  });

  it('sums test files and reports CI alongside', () => {
    const result = automatedTestFiles.compute(ctx({
      repositories: [
        repo('atlas', { testFileCount: 40, hasCi: true }),
        repo('beacon', { testFileCount: 5, hasCi: false }),
      ],
    }));
    expect(result.numericValue).toBe(45);
    expect(result.valueDisplay).toBe('45 files');
    // A test that never runs proves less than one that does, so the CI count
    // travels with the figure rather than beside it somewhere else.
    expect(result.sample).toContain('1 running continuous integration');
    expect(result.methodology).toContain('continuous integration');
  });

  it('publishes a genuine zero rather than refusing', () => {
    // "No automated tests" is a fact about the work, not a failure to measure
    // it. Only an unanalysable set returns null.
    const result = automatedTestFiles.compute(ctx({
      repositories: [repo('atlas', { testFileCount: 0 })],
    }));
    expect(result.numericValue).toBe(0);
    expect(result.valueDisplay).toBe('0 files');
  });

  it('says "1 file", not "1 files"', () => {
    const result = automatedTestFiles.compute(ctx({
      repositories: [repo('atlas', { testFileCount: 1 })],
    }));
    expect(result.valueDisplay).toBe('1 file');
  });

  it('always states that a file count is not coverage', () => {
    // Non-negotiable per the scope document, so it is generated on every run
    // rather than left to an author to remember.
    const result = automatedTestFiles.compute(ctx({
      repositories: [repo('atlas', { testFileCount: 40, hasCi: true })],
    }));
    expect(result.limitations[0]).toContain('not coverage');
  });

  it('names how many repositories have no tests at all', () => {
    const result = automatedTestFiles.compute(ctx({
      repositories: [
        repo('atlas', { testFileCount: 40 }),
        repo('beacon', { testFileCount: 0 }),
        repo('quiet', { testFileCount: 0 }),
      ],
    }));
    // 40 across three repositories reads very differently once you know two of
    // them contribute nothing.
    expect(result.limitations.join(' ')).toContain('2 of the 3');
    expect(result.inputs.repos_with_no_tests).toBe(2);
  });

  it('returns null when nothing could be analysed', () => {
    expect(automatedTestFiles.compute(ctx({ repositories: [] })).numericValue).toBeNull();
  });

  it('is stable across repeated runs and input order', () => {
    const repos = [
      repo('atlas', { testFileCount: 40, hasCi: true }),
      repo('beacon', { testFileCount: 5 }),
    ];
    const a = automatedTestFiles.compute(ctx({ repositories: repos }));
    const b = automatedTestFiles.compute(ctx({ repositories: [...repos].reverse() }));
    expect(a.numericValue).toBe(b.numericValue);
    expect(a.valueDisplay).toBe(b.valueDisplay);
  });
});

describe('the registry', () => {
  it('carries every definition, with unique keys', () => {
    const keys = METRIC_DEFINITIONS.map((d) => d.key);
    // Exact and ordered: this catches an accidental removal as well as an
    // addition, and an addition SHOULD land here so the count below stays honest.
    expect(keys).toEqual([
      'delivery_elapsed_days', 'production_systems_declared', 'automated_test_files',
      'systems_built_by_learners',
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('resolves the new definitions by key', () => {
    expect(findMetricDefinition('automated_test_files')).toBe(automatedTestFiles);
    expect(findMetricDefinition('production_systems_declared')).toBe(productionSystemsDeclared);
  });
});

describe('THE STAGE 3 CLAIM: a new metric is a definition, not a feature', () => {
  const DIR = path.join(__dirname, '..');
  const read = (f: string): string => fs.readFileSync(path.join(DIR, f), 'utf8');

  /**
   * The shared machinery. If adding a definition required editing any of these,
   * the interface leaked and Stage 1 got the boundary wrong — which is precisely
   * the question §9 says this stage exists to answer.
   */
  const SHARED = [
    'metricDefinition.ts', 'metricRunner.ts', 'metricRunStore.ts', 'metricRunContext.ts',
    'metricPromotion.ts',
  ];

  it('needs no knowledge of any specific metric in the shared machinery', () => {
    for (const file of SHARED) {
      const src = read(file);
      expect(src).not.toContain('production_systems_declared');
      expect(src).not.toContain('automated_test_files');
      // D1 is named in `metricDefinition.ts` only inside prose explaining the
      // interface, never in code — so the same assertion holds for it too.
      expect(src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')).not.toContain('delivery_elapsed_days');
    }
    // Non-vacuity: the files were actually read.
    expect(read('metricRunner.ts').length).toBeGreaterThan(1000);
  });

  it('is wired in by exactly one line each in the registry', () => {
    const registry = read('metricDefinitions.ts');
    expect(registry).toContain('productionSystemsDeclared,');
    expect(registry).toContain('automatedTestFiles,');
  });

  it('reaches the product with no UI change, because the panel reads the registry', () => {
    // The definition dropdown is populated from METRIC_DEFINITION_KEYS via the
    // definitions endpoint, so both new metrics are runnable in the admin panel
    // without a line of frontend work.
    expect(METRIC_DEFINITIONS.map((d) => d.key)).toHaveLength(4);
  });
});
