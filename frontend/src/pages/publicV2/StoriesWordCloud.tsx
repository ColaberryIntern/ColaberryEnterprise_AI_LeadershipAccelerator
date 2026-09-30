import React from 'react';
import type { CaseStudyFilterGroup } from '../../components/caseStudy/CaseStudyFilters';

/**
 * The word cloud: the same facets as the sidebar, weighted and clickable.
 *
 * IT IS A RENDERING OF THE FILTERS, NOT A SECOND FILTER SYSTEM. Every term here
 * is a facet the sidebar also lists, and clicking one calls the SAME toggle a
 * checkbox does, writing the same URL parameter. So the two controls cannot
 * disagree, cannot drift, and there is no second source of truth to keep in
 * step - tick "typescript" in the sidebar and its word here is selected too,
 * because both read the one filter state.
 *
 * WHY IT EARNS ITS PLACE NEXT TO THE SIDEBAR. They answer different questions.
 * The sidebar answers "narrow this to exactly what I want" - it is precise,
 * grouped, and shows every option including the rare ones. The cloud answers
 * "what is in this library at all?" - one glance, weighted, no scrolling through
 * six collapsed groups. A reader who does not yet know the vocabulary cannot use
 * a sidebar well, because a sidebar assumes you know which group your word is in.
 *
 * WEIGHT IS COUNT, AND IT IS HONEST AT SMALL N. With two published records almost
 * every term has a count of 1, so `TIERS` deliberately keeps the smallest step
 * readable rather than shrinking rare terms toward invisibility: a cloud that
 * makes single-record terms unreadable would hide most of a young library. The
 * scale is relative to the largest count present, so it sharpens on its own as
 * records land rather than needing a tuning pass.
 *
 * TERMS ARE NOT INVENTED. There is no tokenizer here and no text mining. A word
 * appears only because a record declares that taxonomy value, which is the same
 * reason it appears in the sidebar and the same reason it can be filtered on.
 */

/** Font sizes, smallest first. Index chosen by share of the largest count. */
const TIERS = ['0.86rem', '0.98rem', '1.14rem', '1.34rem', '1.6rem'] as const;

export interface StoriesWordCloudProps {
  groups: readonly CaseStudyFilterGroup[];
  /** Which values are currently on, by field. */
  selected: (field: CaseStudyFilterGroup['field'], value: string) => boolean;
  onToggle: (field: CaseStudyFilterGroup['field'], value: string) => void;
  /** Fields worth showing as words. Verification and Built-by are two or three
   *  fixed values each and read as a control, not a vocabulary. */
  fields?: readonly CaseStudyFilterGroup['field'][];
}

interface CloudTerm {
  readonly field: CaseStudyFilterGroup['field'];
  readonly value: string;
  readonly label: string;
  readonly count: number;
}

export const DEFAULT_CLOUD_FIELDS = ['capability', 'stack', 'industry'] as const;

/**
 * What each colour means, printed. A cloud of three mixed vocabularies needs the
 * reader to be able to tell a capability from a language at a glance - that is
 * the job colour is doing here, so the key has to be on the page or the colour is
 * decoration pretending to be information.
 *
 * The hues come from the `--chart-*` categorical palette, which exists to
 * distinguish categories. Deliberately NOT the semantic ramps: `--amber-500` is
 * commented "warning - UI feedback only" in the token file, and an industry
 * reading as a warning is worse than an industry reading as grey.
 */
export const CLOUD_FIELD_LABELS: Readonly<Record<string, string>> = Object.freeze({
  capability: 'Capability',
  stack: 'Stack',
  industry: 'Industry',
});

export function cloudTerms(
  groups: readonly CaseStudyFilterGroup[],
  fields: readonly CaseStudyFilterGroup['field'][],
): CloudTerm[] {
  const terms: CloudTerm[] = [];
  for (const field of fields) {
    const group = groups.find((g) => g.field === field);
    if (!group) continue;
    for (const option of group.options) {
      if (option.count <= 0) continue;
      terms.push({ field, value: option.value, label: option.label, count: option.count });
    }
  }
  /* Heaviest first, then alphabetical. NOT shuffled: a cloud that reorders on
     every render makes a term the reader was about to click move under the
     cursor, and re-reading it to find the same word costs more than the visual
     interest of a scatter is worth. */
  return terms.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function tierFor(count: number, max: number): string {
  if (max <= 0) return TIERS[0];
  const share = count / max;
  const index = Math.min(TIERS.length - 1, Math.floor(share * TIERS.length));
  return TIERS[Math.max(0, index)];
}

export function StoriesWordCloud({
  groups,
  selected,
  onToggle,
  fields = DEFAULT_CLOUD_FIELDS,
}: StoriesWordCloudProps): React.ReactElement | null {
  const terms = cloudTerms(groups, fields);
  // Nothing to show is not an empty box: the facets have not loaded, or the
  // library is empty, and either way a heading over nothing reads as broken.
  if (terms.length === 0) return null;
  const max = terms[0].count;

  return (
    <div className="cbv2-stories__cloud" data-testid="stories-word-cloud">
      <div className="cbv2-stories__cloud-head">
        <div>
          <h3 className="cbv2-stories__cloud-title">What is in here</h3>
          <p className="cbv2-stories__cloud-hint">
            Every word is a filter. Bigger means more records carry it.
          </p>
        </div>
        {/* The key. Only fields that actually produced a term are listed, so it
            never promises a colour the cloud below does not contain. */}
        <ul className="cbv2-stories__cloud-key">
          {fields
            .filter((field) => terms.some((term) => term.field === field))
            .map((field) => (
              <li className="cbv2-stories__cloud-key-item" key={field} data-field={field}>
                <span className="cbv2-stories__cloud-swatch" aria-hidden="true" />
                {CLOUD_FIELD_LABELS[field] ?? field}
              </li>
            ))}
        </ul>
      </div>
      <ul className="cbv2-stories__cloud-terms">
        {terms.map((term) => {
          const on = selected(term.field, term.value);
          return (
            <li key={`${term.field}:${term.value}`}>
              <button
                type="button"
                className="cbv2-stories__cloud-term"
                style={{ fontSize: tierFor(term.count, max) }}
                aria-pressed={on}
                data-on={on ? 'true' : 'false'}
                data-field={term.field}
                onClick={() => onToggle(term.field, term.value)}
              >
                {term.label}
                {/* The count is the weight said in words, for anyone who cannot
                    use size as information. */}
                <span className="cbv2-stories__cloud-count"> {term.count}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default StoriesWordCloud;
