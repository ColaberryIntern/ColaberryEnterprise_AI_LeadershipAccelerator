/**
 * AF10.6's facts: an intern names their own agent, and a name another agent already answers to
 * is refused.
 *
 * Data only, no rendering. Taken from the merged PR #3465.
 *
 * The whole ticket turns on one property of the uniqueness check, and it is the kind of property
 * that a test suite with tidy fixtures would never have defended.
 */
const TICKET = 'AF10.6';
const PR = 3465;
const MERGED_ON = '2026-10-29';

const NAMES = [
  ['Ellis', 'platform'],
  ['Maru', 'product experience'],
  ['Vic', 'sales'],
  ['Maya', 'admissions'],
  ['Pip', 'internship'],
  ['Dara', 'curriculum, already existed'],
  ['Ava', 'marketing'],
];

const ASKED = 'The seven builders chose their agents\' names weeks ago and none of them was '
  + 'stored anywhere in the product. Let an intern name their own agent, and refuse a name '
  + 'another agent already answers to.';

const DELIVERED = 'An intern names their own agent from the My Domain page, which previously '
  + 'rendered the agent as a bare UUID. The name lands on ai_agents.config.display_name: no '
  + 'migration, no schema change, no seeder change.';

/**
 * THE ONE THING TO READ. A read-only production probe found `agent_name` = "Maya" with
 * `enabled: false` -- and Maya is the name the admissions builder chose.
 */
const ENABLED_TRAP = {
  rule: 'The uniqueness check deliberately does NOT filter on enabled, and removing that property '
    + 'reintroduces the bug.',
  why: 'A disabled agent still owns its name: it can be re-enabled, it is still in the registry, '
    + 'and the org chart still renders it.',
  consequence: 'A WHERE enabled = true would allow exactly the one name this ticket exists to '
    + 'refuse -- and it would pass any test whose fixtures only held enabled rows.',
  guards: 'Two tests guard it: one behavioral, and one that reads the GENERATED SQL and fails if '
    + 'the word appears at all. The second is the one that survives a fixture change.',
};

const MATCHING = 'Four name sources are checked, self-excluded, case-insensitive and '
  + 'trim-normalized, so an agent is never refused its own name and a near-miss in casing or '
  + 'whitespace does not slip through as new.';

module.exports = { TICKET, PR, MERGED_ON, NAMES, ASKED, DELIVERED, ENABLED_TRAP, MATCHING };
