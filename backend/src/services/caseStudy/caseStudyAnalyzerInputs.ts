import type { AnalyzeRepositoryInput } from './caseStudyRepoAnalyzer';
import type { CaseStudyRepositoryRecord } from './caseStudyRepoRecord';

/**
 * caseStudyAnalyzerInputs — turning attached repositories into analyzer inputs.
 *
 * WHY THIS IS A FUNCTION AND NOT FOUR LINES INLINE. It began as four lines
 * inline, duplicated in `caseStudySyncService` and `metrics/metricRunner`. That
 * duplication is exactly how the two surfaces drift: the sync learns to pass a
 * path scope, the metric runner does not, and a Case Study then TELLS a scoped
 * story while REPORTING whole-repository figures underneath it. Nobody reads
 * that as a bug — the prose and the numbers each look fine on their own.
 *
 * One function, one test, both callers. A mutation that drops the scope here
 * fails a unit test instead of surviving to production as a number that is
 * merely disappointing rather than obviously wrong.
 */
export interface AnalyzerInputOptions {
  readonly correlationId: string;
  /** Injected in tests. Production omits it and the client uses global fetch. */
  readonly fetchImpl?: typeof fetch;
}

export function analyzerInputsFor(
  records: readonly CaseStudyRepositoryRecord[],
  options: AnalyzerInputOptions,
): AnalyzeRepositoryInput[] {
  return records.map((record) => ({
    owner: record.repoOwner,
    repo: record.repoName,
    correlationId: options.correlationId,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    // SPREAD, not `pathScope: record.pathScope ?? []`. An explicit empty array
    // and an absent field are the same instruction to the analyzer, but they are
    // not the same object — and these inputs are compared, logged and hashed.
    ...(record.pathScope && record.pathScope.length > 0 ? { pathScope: record.pathScope } : {}),
  }));
}
