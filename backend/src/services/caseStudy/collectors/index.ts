import { createHash } from 'crypto';
import { CASE_STUDY_COLLECTOR_KEYS } from '../../../types/caseStudy';
import type { CaseStudyCollectorKey } from '../../../types/caseStudy';
import { commitSpanCollector } from './commitSpan';
import { commitsPerWeekCollector } from './commitsPerWeek';
import { decisionRecordsCollector } from './decisionRecords';
import { modulesWithTestsCollector } from './modulesWithTests';
import { testFilesCollector } from './testFiles';
import type { Collector, CollectorInput, CollectorResult } from './collectorTypes';

export * from './collectorTypes';

/**
 * The registry. A manifest names a key; only these five routines exist.
 *
 * NOTHING RUNS UNLESS AN AUTHOR REGISTERED IT. The registry is a lookup, never
 * a loop over every collector: a repository is not measured on five axes
 * because it happens to be attached, it is measured on the ones its own
 * manifest asked for.
 */
const REGISTRY: Readonly<Record<CaseStudyCollectorKey, Collector>> = {
  test_files: testFilesCollector,
  modules_with_tests: modulesWithTestsCollector,
  decision_records: decisionRecordsCollector,
  commit_span: commitSpanCollector,
  commits_per_week: commitsPerWeekCollector,
};

export function findCollector(key: string): Collector | null {
  return (REGISTRY as Record<string, Collector | undefined>)[key] ?? null;
}

export const allCollectors = (): readonly Collector[] =>
  CASE_STUDY_COLLECTOR_KEYS.map((key) => REGISTRY[key]);

/** True when any registered key needs a commit log, so the sync fetches one once. */
export const needsCommitLog = (keys: readonly string[]): boolean =>
  keys.some((key) => findCollector(key)?.needsCommits === true);

export interface RunCollectorResult {
  readonly key: CaseStudyCollectorKey;
  readonly result: CollectorResult;
  /**
   * Present only on success. A stable digest of the PAYLOAD, which is what the
   * sync compares at the same sha to tell a re-run from drift.
   *
   * Hashing the payload rather than the rendered value is deliberate: the
   * display string can change when a label is reworded, and that is not drift.
   * A different numerator at the same commit is.
   */
  readonly outputHash?: string;
}

export function runCollector(key: string, input: CollectorInput): RunCollectorResult | null {
  const collector = findCollector(key);
  if (!collector) return null;
  const result = collector.collect(input);
  if (!result.ok) return { key: collector.key, result };
  return { key: collector.key, result, outputHash: hashPayload(result.output.payload) };
}

/**
 * A digest that does not move when a key order does.
 *
 * `JSON.stringify` preserves insertion order, so two structurally identical
 * payloads built by different code paths would hash differently and read as
 * drift. Sorting keys at every level removes that false positive.
 */
export function hashPayload(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}
