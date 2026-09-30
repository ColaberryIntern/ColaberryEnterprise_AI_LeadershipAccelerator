import fs from 'fs';
import path from 'path';
import { hasEvidenceContext } from '../storyDetailV2Model';
import { metric } from '../../../components/caseStudy/__fixtures__/caseStudyPublicFixtures';

/**
 * The one thing that makes hero-metric suppression SAFE.
 *
 * `heroMetricsFor()` drops a figure carrying no baseline, sample, methodology or
 * limitation, because section 23 calls a high-impact number without evidence
 * context incomplete. `storyDetailV2Model.ts` states the consequence plainly:
 * the figure is *"DROPPED FROM THE HERO, not from the page: it still renders in
 * the measurement section when the record carries it there."*
 *
 * That sentence is load-bearing. Suppression is defensible only because the
 * number survives somewhere a reader can still see it. If a hero metric could
 * exist that is NOT also in `measurement.metrics`, suppression would silently
 * delete an approved, publisher-chosen figure from the published page — and
 * nothing anywhere would fail.
 *
 * T018's verification confirmed the invariant holds today and that **no test
 * asserted it**, calling that the highest-value follow-up from the task. This
 * file is that assertion. It is deliberately separate from
 * `StoryDetailV2.test.tsx`, which is already past CLAUDE.md's 500-line ceiling
 * and may not be grown without being split first.
 *
 * Two halves, because the guarantee has two halves:
 *   1. the STRUCTURAL invariant, pinned at the backend that builds both lists;
 *   2. the PREDICATE boundary, so "contextless" keeps meaning what it means.
 */

const HERE = __dirname;
const SRC = path.join(HERE, '..', '..', '..');
const SECTIONS = path.join(
  SRC, '..', '..', 'backend', 'src', 'services', 'caseStudy', 'caseStudySnapshotSections.ts',
);

/* ------------------------------------------------ 1. structural invariant --- */

describe('every hero metric is also a measurement metric, at the source', () => {
  it('the backend section builder is readable from here', () => {
    // Non-vacuity. A wrong path makes every source assertion below pass against
    // an empty string, which is the failure mode this whole file exists to
    // prevent in the first place.
    expect(fs.existsSync(SECTIONS)).toBe(true);
  });

  it('derives BOTH lists from the same array, so one cannot escape the other', () => {
    const source = fs.readFileSync(SECTIONS, 'utf8');

    // `all` is the deduplicated, sorted set of every metric on the record.
    expect(source).toMatch(/const all = \[\.\.\.byKey\.values\(\)\]/);

    // The hero list is a FILTER of that array - a subset by construction, not
    // by convention. This is the whole invariant: `filter` cannot invent a
    // member, so `heroMetrics` can never contain a metric absent from `all`.
    expect(source).toMatch(/const heroMetrics = all\.filter\(/);

    // ...and the measurement section publishes `all` itself, unnarrowed. If this
    // ever became a filtered or mapped copy, the subset relationship would break
    // and a suppressed hero figure would have nowhere left to render.
    expect(source).toMatch(/metrics: all\b/);
  });

  it('does not publish a narrowed measurement list under a name that looks whole', () => {
    const source = fs.readFileSync(SECTIONS, 'utf8');
    // The specific regression this guards: `metrics: all.filter(...)` or
    // `metrics: publishable` would still read naturally at the call site and
    // would still typecheck, while quietly making suppression lossy.
    expect(source).not.toMatch(/metrics: all\.(filter|slice|map)\(/);
  });
});

/* -------------------------------------------------- 2. predicate boundary --- */

describe('what counts as evidence context', () => {
  const CONTEXTLESS = { baseline: null, sample: null, methodology: null, limitations: [] };

  it('a figure with none of the four is contextless', () => {
    expect(hasEvidenceContext(metric(CONTEXTLESS))).toBe(false);
  });

  it('the default fixture DOES carry context, so the case above is not the only one', () => {
    // Guard-the-guard: if `metric()` were contextless too, a broken predicate
    // that always returned false would satisfy the test above and look correct.
    expect(hasEvidenceContext(metric())).toBe(true);
  });

  it.each([
    ['baseline', { baseline: 'approximately 300 per quarter' }],
    ['sample', { sample: 'eight distribution sites' }],
    ['methodology', { methodology: 'Counted from the client inventory export.' }],
    ['limitations', { limitations: ['One season of data.'] }],
  ])('any one of the four alone is enough: %s', (_name, only) => {
    // Each field is tested in isolation because the predicate is an OR chain.
    // A typo collapsing it to `&&` would demand all four and silently suppress
    // most real figures - every one of these four cases catches that, and the
    // combined default fixture above catches none of it.
    expect(hasEvidenceContext(metric({ ...CONTEXTLESS, ...only }))).toBe(true);
  });

  it('treats an empty limitations array as no context, not as context', () => {
    // `limitations` is the one field whose empty value is truthy as an object.
    // `!!metric.limitations` would be true for `[]`, making every figure look
    // contexted and disabling suppression entirely.
    expect(hasEvidenceContext(metric({ ...CONTEXTLESS, limitations: [] }))).toBe(false);
  });
});
