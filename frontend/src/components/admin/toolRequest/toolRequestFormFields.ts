import type { ToolRequestIssue } from '../../../services/agentDomainApi';

/**
 * AF11.11 — which field each named refusal belongs to, and which "refusals" are not faults.
 *
 * PURE, no React, so every mapping below is testable without rendering anything.
 *
 * ## Why a map, rather than one error box
 *
 * The filing route answers 400 with `issues: [{ rule, detail }]`, one entry per field that is
 * missing or wrong. On a twenty-four-field form a first submit can legitimately return a dozen,
 * and a dozen sentences stacked at the top of the page is a list the reader has to match back to
 * the inputs by hand. Each sentence is already written to be read by the person filling the form,
 * so the only thing missing was putting it next to the thing it is about.
 *
 * ## Two of the rules are ROUTES, and rendering them as errors would be a lie
 *
 * `feature_exists_request_a_grant` and `feature_exists_use_it_first` fire when the builder says
 * the product can already do this. Nothing is wrong with the request: the answer is that a build
 * is the wrong ask. They are separated here so the form can render them as a direction rather than
 * as a red field, which is the distinction `ToolRequestFacts.tsx` already makes on the review side.
 */

/** The eight groups, in the order `ToolRequestFacts.GROUPS` renders them on the review console. */
export const FORM_GROUPS = [
  {
    key: 'worth_building',
    heading: 'Worth building',
    question: 'Who reads it, what number judges it, and what the app cannot already do',
    fields: ['acts_on_output', 'judged_threshold', 'judged_measured_from', 'tried_in_product', 'missing_from_product'],
  },
  { key: 'who', heading: 'Who', question: 'Which agent is asking, in whose domain', fields: ['agent_id'] },
  { key: 'what', heading: 'What', question: 'The tool, and what it would read and produce', fields: ['tool_name', 'purpose', 'reads', 'produces'] },
  // AF12.1 — the three words are named in the question, because this is the group where a
  // builder most often collapses them. A CAPABILITY is the standing thing the agent can do, a
  // TASK is the piece of work being taken off somebody's hands, and a TOOL is one of possibly
  // several things the task needs.
  { key: 'what_for', heading: 'What for', question: 'The capability it serves, the task it is part of, and what is manual today', fields: ['capability_id', 'task_unblocked', 'task_key', 'manual_today'] },
  { key: 'when', heading: 'When', question: 'By when, and how often it would run', fields: ['needed_by', 'run_frequency'] },
  { key: 'where', heading: 'Where', question: 'The blast radius, which is the thing being approved', fields: ['touches'] },
  { key: 'which_data', heading: 'Which data', question: 'Sandbox or production, and which datasets a grant would be written against', fields: ['environment', 'read_datasets'] },
  { key: 'how', heading: 'How', question: 'What it writes, what it changes, and whether that can be undone', fields: ['inputs', 'writes', 'side_effects', 'reversible', 'reversibility_note'] },
] as const;

/**
 * Every refusal the contract can return, mapped to the field it is about.
 *
 * Derived by reading `ToolRequestRefusal` in `backend/src/services/agentDomain/
 * toolRequestContract.ts` top to bottom. A rule absent from this map is NOT dropped: `issuesByField`
 * collects unmapped rules under `__form`, which the form renders above the fields. That is the
 * important property, because a rule added to the contract later would otherwise vanish from the
 * screen silently, and a test asserts the fallback rather than trusting the map to stay complete.
 */
export const RULE_FIELD: Record<string, string> = {
  // The pairing between a request and its detail. Nothing the reader can fix in a field.
  tool_request_detail_missing: '__form',
  tool_request_on_a_change: '__form',
  duplicate_open_request: '__form',
  // WHO
  agent_missing: 'agent_id',
  agent_roster_absent: 'agent_id',
  agent_not_yours: 'agent_id',
  domain_missing: '__form',
  // WHAT
  tool_name_missing: 'tool_name',
  more_than_one_tool: 'tool_name',
  purpose_missing: 'purpose',
  reads_undeclared: 'reads',
  produces_undeclared: 'produces',
  reads_and_produces_both_empty: 'reads',
  // WORTH BUILDING
  acts_on_output_missing: 'acts_on_output',
  actor_roster_absent: 'acts_on_output',
  acts_on_output_not_a_person: 'acts_on_output',
  judged_threshold_missing: 'judged_threshold',
  judged_threshold_has_no_number: 'judged_threshold',
  judged_measured_from_missing: 'judged_measured_from',
  tried_in_product_missing: 'tried_in_product',
  tried_in_product_unknown: 'tried_in_product',
  missing_from_product_missing: 'missing_from_product',
  // WHICH DATA
  read_datasets_undeclared: 'read_datasets',
  dataset_roster_absent: 'read_datasets',
  read_datasets_not_catalogued: 'read_datasets',
  production_reads_unscoped: 'read_datasets',
  // WHAT FOR
  capability_missing: 'capability_id',
  capability_roster_absent: 'capability_id',
  capability_not_found: 'capability_id',
  task_unblocked_missing: 'task_unblocked',
  task_key_missing: 'task_key',
  task_key_malformed: 'task_key',
  manual_today_missing: 'manual_today',
  // WHEN
  needed_by_missing: 'needed_by',
  needed_by_not_a_date: 'needed_by',
  run_frequency_missing: 'run_frequency',
  run_frequency_unknown: 'run_frequency',
  // WHERE
  touches_missing: 'touches',
  // WHICH DATA, the enum half
  environment_missing: 'environment',
  environment_unknown: 'environment',
  // HOW
  inputs_undeclared: 'inputs',
  writes_undeclared: 'writes',
  side_effects_missing: 'side_effects',
  reversibility_undeclared: 'reversible',
};

/**
 * The two answers that are a DIRECTION rather than a fault.
 *
 * Both mean the same thing in different words: the product can already do this, so a build is the
 * wrong request. The form shows them as a route, keeps what was typed, and does not color any
 * field red, because nothing the builder entered is wrong.
 */
export const ROUTE_RULES: Record<string, { heading: string; next: string }> = {
  feature_exists_request_a_grant: {
    heading: 'This is a grant, not a build',
    next: 'You said you have already done this in the app by hand. That means the thing exists and '
      + 'your agent simply has not been given it. Ask for the grant instead: it is a much shorter '
      + 'request and it needs no scope sheet.',
  },
  feature_exists_use_it_first: {
    heading: 'Use it once before asking for it',
    next: 'You said the app can already do this but you have not tried it. Go and use it, confirm '
      + 'it does what you need, then ask for your agent to be given the thing you just used. If it '
      + 'turns out it cannot do what you need, come back and say what was missing.',
  },
};

/**
 * Every field the form draws, so a Zod path naming something this form has no input for falls
 * through to the catch-all instead of being attached to an input that does not exist, where it
 * would never be rendered at all.
 *
 * Declared BEFORE `issuesByField` because that function reads it.
 */
export const KNOWN_FIELDS: ReadonlySet<string> = new Set(
  FORM_GROUPS.flatMap((g) => [...g.fields] as string[]),
);

export interface GroupedIssues {
  /** Field name to the issues about it. `__form` holds anything with no field of its own. */
  readonly byField: Record<string, ToolRequestIssue[]>;
  /** The route answers, which are not errors. */
  readonly routes: Array<{ rule: string; heading: string; next: string; detail: string }>;
}

/**
 * Sort a refusal into per-field buckets plus the routes.
 *
 * Zod issues are handled too. A body that fails the shape schema never reaches the contract, so its
 * `issues` carry `path`/`message` rather than `rule`/`detail`, and the path is prefixed with
 * `tool_request`. Stripping that prefix is what lets a Zod length failure land on the same input as
 * the contract's own refusal for the same field, instead of in the catch-all.
 */
export function issuesByField(issues: ToolRequestIssue[]): GroupedIssues {
  const byField: Record<string, ToolRequestIssue[]> = {};
  const routes: GroupedIssues['routes'] = [];

  for (const issue of issues) {
    const route = ROUTE_RULES[issue.rule];
    if (route) {
      routes.push({ rule: issue.rule, ...route, detail: issue.detail });
      continue;
    }
    // A contract rule maps directly. Anything else is treated as a Zod path and reduced to its
    // last segment, which is kept only if this form actually draws a field by that name.
    const mapped = RULE_FIELD[issue.rule];
    const guess = mapped ?? issue.rule.split('.').pop() ?? '';
    const field = mapped ?? (KNOWN_FIELDS.has(guess) ? guess : '__form');
    (byField[field] ??= []).push(issue);
  }

  return { byField, routes };
}
