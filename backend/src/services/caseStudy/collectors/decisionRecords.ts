import {
  isExcluded, skip,
  type Collector, type CollectorInput, type CollectorResult,
} from './collectorTypes';
import type { CaseStudyMetricMember } from '../../../types/caseStudy';

/** Where teams actually keep decision records, in order of how common each is. */
const DECISION_DIRECTORIES = ['docs/decisions/', 'docs/adr/', 'docs/architecture/decisions/', 'adr/', 'decisions/'];

const MAX_MEMBERS = 24;

/**
 * `decision_records` - decisions written down as they were made.
 *
 * WHY THIS IS WORTH COUNTING. It is one of the few things a repository can
 * prove about how a team worked rather than what it produced. A decision record
 * is dated, committed, and was written before the outcome was known.
 *
 * WHY THE MEMBERS TRAVEL WITH THE COUNT. "14 decision records" asks a reader to
 * take it on faith. Fourteen titles do not, and a title is the cheapest possible
 * evidence: it says what was decided without opening anything.
 *
 * WHAT IT CANNOT SHOW, and this is the limitation that matters: a written
 * decision is not a good decision, and a repository can hold fourteen records
 * for choices nobody followed.
 */
export const decisionRecordsCollector: Collector = {
  key: 'decision_records',
  shape: 'count',
  label: 'Decisions written down as they were made',
  needsCommits: false,

  collect(input: CollectorInput): CollectorResult {
    if (input.tree.paths.length === 0) return skip('empty_tree', 'the tree read returned no paths');
    if (input.tree.truncated) {
      return skip('tree_truncated', 'the tree was truncated, so any count would be a floor');
    }

    const found = input.tree.paths.filter((path) => {
      const lower = path.toLowerCase();
      if (isExcluded(lower) || !lower.endsWith('.md')) return false;
      if (lower.endsWith('/readme.md') || lower === 'readme.md') return false;
      if (DECISION_DIRECTORIES.some((dir) => lower.startsWith(dir) || lower.includes(`/${dir}`))) return true;
      const base = lower.slice(lower.lastIndexOf('/') + 1);
      return base.startsWith('adr-') || base.startsWith('adr_');
    }).sort();

    if (found.length === 0) {
      // A repository with no decision records has no metric, not a metric of
      // zero. Zero would render as a claim about the team; silence is the truth.
      return skip('no_decision_records', 'no path matches a decision record convention');
    }

    const members: CaseStudyMetricMember[] = found.slice(0, MAX_MEMBERS).map((path) => ({
      name: titleOf(path),
    }));

    return {
      ok: true,
      output: {
        shape: 'count',
        payload: { shape: 'count', value: found.length, members },
        valueDisplay: `${found.length}`,
        unit: found.length === 1 ? 'record' : 'records',
        numericValue: found.length,
        methodology: `Counted from the repository tree at ${input.sha}. A markdown file counts `
          + 'if it sits in a decision-record directory or its filename begins with an ADR '
          + 'prefix. Readme files are excluded.',
        limitations: [
          'A written decision is not a correct decision, and a record does not prove anybody followed it.',
          ...(found.length > MAX_MEMBERS
            ? [`The list below shows the first ${MAX_MEMBERS} of ${found.length}.`]
            : []),
        ],
        reproduceCommand: `git ls-tree -r --name-only ${input.sha} -- docs/decisions docs/adr adr decisions`,
      },
    };
  },
};

/** `docs/decisions/0004-pin-the-sha.md` reads better as "Pin the sha". */
function titleOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/i, '');
  const withoutIndex = base.replace(/^[0-9]+[-_]/, '').replace(/^adr[-_]/i, '');
  const words = withoutIndex.split(/[-_]+/).filter(Boolean).join(' ');
  if (!words) return base;
  return words.charAt(0).toUpperCase() + words.slice(1);
}
