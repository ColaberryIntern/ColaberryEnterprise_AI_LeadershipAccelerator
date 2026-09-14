import type { SubjectSignals } from '../../scoring/scoreVector';

/**
 * Shared fixtures for the two score suites (T306 close-out).
 *
 * NOT a `.test.ts` file, and under `fixtures/` on purpose: jest's `testMatch`
 * collects only `*.test.ts`, and `phase2SourceFiles()` skips a `fixtures`
 * directory, so this is importable without being collected or scanned. Same
 * reasoning as `__tests__/phase2Sources.ts`.
 *
 * The suites split because `scoreVector.test.ts` reached 554 lines, over
 * CLAUDE.md's 500-line hard ceiling, and that rule says the next change splits
 * the file before adding to it. One fixture module rather than two copies: a
 * duplicated `fullLead` would drift, and both suites reason about the same lead.
 */

export const AT = new Date('2026-09-14T12:00:00Z');

export const signals = (over: Partial<SubjectSignals> = {}): SubjectSignals => ({
  lead: null,
  observed: null,
  computed_at: AT,
  ...over,
});

/** A lead with every sourced input answered, for both programmes. */
export const fullLead = {
  industry: 'Manufacturing',
  annual_revenue: 25_000_000,
  employee_count: 400,
  company_size: 'enterprise',
  technology_stack: 'salesforce,snowflake',
  evaluating_90_days: true,
  maturity_score: 6,
  estimated_roi: 250_000,
  departments_impacted: 'operations,finance',
  selected_systems: 'crm,warehouse',
};
