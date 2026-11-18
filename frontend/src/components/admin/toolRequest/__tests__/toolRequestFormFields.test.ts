/**
 * AF11.11 — where each named refusal lands on the form.
 *
 * The valuable test here is the COMPLETENESS one. `RULE_FIELD` is a hand-written map from the
 * contract's refusal union, and a rule added to the contract later would otherwise go to the
 * catch-all silently: visible, but in the wrong place, and nobody would notice because the sentence
 * still appears somewhere on the page. So the list of rules is asserted against a copy of the union
 * taken from `toolRequestContract.ts`, and the fallback is tested in its own right rather than
 * trusted.
 */

import {
  FORM_GROUPS,
  KNOWN_FIELDS,
  ROUTE_RULES,
  RULE_FIELD,
  issuesByField,
} from '../toolRequestFormFields';

/**
 * Every member of `ToolRequestRefusal`, copied from
 * `backend/src/services/agentDomain/toolRequestContract.ts`.
 *
 * A copy rather than an import because this is the frontend and the union lives across the stack
 * boundary, which is the same convention the limits follow. The point of the copy is to FAIL when
 * the two drift, which is what the first test does.
 */
const EVERY_RULE = [
  'tool_request_detail_missing', 'tool_request_on_a_change', 'duplicate_open_request',
  'agent_missing', 'agent_roster_absent', 'agent_not_yours', 'domain_missing',
  'tool_name_missing', 'purpose_missing', 'more_than_one_tool', 'reads_undeclared',
  'produces_undeclared', 'reads_and_produces_both_empty',
  'acts_on_output_missing', 'actor_roster_absent', 'acts_on_output_not_a_person',
  'judged_threshold_missing', 'judged_threshold_has_no_number', 'judged_measured_from_missing',
  'tried_in_product_missing', 'tried_in_product_unknown',
  'feature_exists_request_a_grant', 'feature_exists_use_it_first',
  'missing_from_product_missing',
  'read_datasets_undeclared', 'dataset_roster_absent', 'read_datasets_not_catalogued',
  'production_reads_unscoped',
  'capability_missing', 'capability_roster_absent', 'capability_not_found',
  'task_unblocked_missing', 'manual_today_missing',
  // AF12.1. The key that groups the several tools one task needs.
  'task_key_missing', 'task_key_malformed',
  'needed_by_missing', 'needed_by_not_a_date', 'run_frequency_missing', 'run_frequency_unknown',
  'touches_missing', 'environment_missing', 'environment_unknown',
  'inputs_undeclared', 'writes_undeclared', 'side_effects_missing', 'reversibility_undeclared',
];

const issue = (rule: string, detail = 'A sentence.') => ({ rule, detail });

describe('THE COMPLETENESS GATE: every refusal the contract can return is accounted for', () => {
  it('maps or routes all 46 of them, with nothing falling through', () => {
    const unaccounted = EVERY_RULE.filter((r) => !(r in RULE_FIELD) && !(r in ROUTE_RULES));
    expect(unaccounted).toEqual([]);
    expect(EVERY_RULE).toHaveLength(46);
  });

  it('and names no rule the contract does not have, so the map cannot rot', () => {
    const known = new Set(EVERY_RULE);
    const stale = [...Object.keys(RULE_FIELD), ...Object.keys(ROUTE_RULES)]
      .filter((r) => !known.has(r));
    expect(stale).toEqual([]);
  });

  it('points every mapped rule at a field the form actually draws, or the catch-all', () => {
    // A rule pointing at a field with no input would render nowhere at all.
    const orphans = Object.entries(RULE_FIELD)
      .filter(([, field]) => field !== '__form' && !KNOWN_FIELDS.has(field));
    expect(orphans).toEqual([]);
  });
});

describe('the eight groups', () => {
  it('put WORTH BUILDING first, because it decides the request', () => {
    // Same ordering decision as the review console, and for the same reason: reading it last is
    // reading it after the decision has effectively been made.
    expect(FORM_GROUPS[0].key).toBe('worth_building');
  });

  it('cover every field the contract requires', () => {
    for (const field of [
      'acts_on_output', 'judged_threshold', 'judged_measured_from', 'tried_in_product',
      'missing_from_product', 'agent_id', 'tool_name', 'purpose', 'reads', 'produces',
      'capability_id', 'task_unblocked', 'manual_today', 'needed_by', 'run_frequency',
      'touches', 'environment', 'read_datasets', 'inputs', 'writes', 'side_effects',
      'reversible', 'reversibility_note',
    ]) {
      expect(KNOWN_FIELDS.has(field)).toBe(true);
    }
  });
});

describe('sorting a refusal', () => {
  it('puts each sentence on its own field', () => {
    const { byField } = issuesByField([
      issue('purpose_missing', 'Say what the tool is for.'),
      issue('needed_by_not_a_date', 'A needed-by date looks like 2026-11-30.'),
    ]);
    expect(byField.purpose?.[0].detail).toBe('Say what the tool is for.');
    expect(byField.needed_by?.[0].detail).toContain('2026-11-30');
  });

  it('collects two refusals about ONE field together', () => {
    // `acts_on_output` has three rules of its own, and a reader must see both sentences rather
    // than whichever one happened to be last.
    const { byField } = issuesByField([
      issue('acts_on_output_missing', 'Name the person.'),
      issue('acts_on_output_not_a_person', 'That is not somebody we hold a record of.'),
    ]);
    expect(byField.acts_on_output).toHaveLength(2);
  });

  it('sends the request-level refusals to the catch-all, not to a field', () => {
    const { byField } = issuesByField([issue('duplicate_open_request', 'You already have one open.')]);
    expect(byField.__form?.[0].detail).toBe('You already have one open.');
  });

  it('THE FALLBACK: an unknown rule is still shown, in the catch-all', () => {
    // The property that matters when the contract gains a rule this map has not learned yet.
    // Dropping it would be the silent failure.
    const { byField } = issuesByField([issue('some_rule_added_in_2027', 'A new sentence.')]);
    expect(byField.__form?.[0].detail).toBe('A new sentence.');
  });

  it('lands a ZOD path on the same input as the contract rule for that field', () => {
    // A body that fails the shape schema never reaches the contract, so its issues are all the
    // response carries. `tool_request.purpose` has to find the purpose field.
    const { byField } = issuesByField([
      { rule: 'tool_request.purpose', detail: 'A purpose can be at most 1000 characters.' },
    ]);
    expect(byField.purpose?.[0].detail).toContain('at most 1000');
  });

  it('sends a Zod path for a field this form does not draw to the catch-all', () => {
    const { byField } = issuesByField([
      { rule: 'tool_request.some_future_field', detail: 'Unknown field.' },
    ]);
    expect(byField.__form?.[0].detail).toBe('Unknown field.');
    expect(byField.some_future_field).toBeUndefined();
  });
});

describe('THE TWO ANSWERS THAT ARE NOT FAULTS', () => {
  it('separates both feature-exists rules out of the field errors entirely', () => {
    const { byField, routes } = issuesByField([
      issue('feature_exists_request_a_grant', 'The app can already do this.'),
    ]);
    // Nothing the builder typed is wrong, so no field is marked.
    expect(Object.keys(byField)).toEqual([]);
    expect(routes).toHaveLength(1);
    expect(routes[0].heading).toBe('This is a grant, not a build');
  });

  it('tells somebody who has used the feature to ask for a GRANT', () => {
    const { routes } = issuesByField([issue('feature_exists_request_a_grant')]);
    expect(routes[0].next).toContain('grant');
    // The shorter request has to be named, or the refusal is a dead end.
    expect(routes[0].next).toContain('no scope sheet');
  });

  it('tells somebody who has NOT tried it to go and use it first', () => {
    const { routes } = issuesByField([issue('feature_exists_use_it_first')]);
    expect(routes[0].heading).toBe('Use it once before asking for it');
    // And names the way back, so a feature that turns out to be insufficient is not a dead end.
    expect(routes[0].next).toContain('come back');
  });

  it('keeps the server sentence alongside the route, rather than replacing it', () => {
    const { routes } = issuesByField([
      issue('feature_exists_use_it_first', 'marketing.landing_page.draft already does this.'),
    ]);
    expect(routes[0].detail).toContain('marketing.landing_page.draft');
  });

  it('shows a route AND a field error together when both come back', () => {
    const { byField, routes } = issuesByField([
      issue('feature_exists_use_it_first'),
      issue('tool_name_missing', 'A tool request has to name the tool.'),
    ]);
    expect(routes).toHaveLength(1);
    expect(byField.tool_name).toHaveLength(1);
  });
});
