/**
 * The UPDATE statement builder.
 *
 * The statement this replaces set every column at once. That is the line that would have
 * written null over 683 authored acceptance lines: with acceptance always in the SET
 * clause, "whatever the plan says" meant "nothing" on every row the generator does not
 * emit acceptance for. So the property that matters here is not that the SQL is
 * well-formed -- it is that a column the reconciler preserved is ABSENT from it.
 *
 * Asserted by value rather than by letting Postgres object: the sibling migration records
 * that a shared bind placeholder across a varchar and a text column can resolve and write
 * into the wrong column silently, so the server disagreeing is not a check we can rely on.
 */

import { buildUpdateSql, updateBindFor } from '../migrateAgentDomainCapabilityLadder';
import { planProvision } from '../../services/agentDomain/agentDomainProvisionPlan';

const story = planProvision('platform').stories[0];

describe('buildUpdateSql', () => {
  it('omits a preserved column from the statement entirely', () => {
    const { sql, columns } = buildUpdateSql(['narrative']);
    expect(columns).toEqual(['narrative']);
    expect(sql).toContain('narrative = $2');
    // The whole point. Not "acceptance is set to the right thing" -- not mentioned at all.
    expect(sql).not.toContain('acceptance');
  });

  it('writes acceptance only when it is in the writable set', () => {
    expect(buildUpdateSql(['acceptance']).sql).toContain('acceptance = $2::jsonb');
  });

  it('expands title into title AND description, which is not planned separately', () => {
    const { sql, columns } = buildUpdateSql(['title']);
    expect(columns).toEqual(['title', 'description']);
    expect(sql).toContain('title = $2');
    expect(sql).toContain('description = $3');
  });

  it('gives every column its own placeholder, numbered from $2, with $1 left for the id', () => {
    const { sql, columns } = buildUpdateSql(['title', 'narrative', 'build', 'acceptance']);
    expect(columns).toHaveLength(5); // title, description, narrative, build, acceptance
    columns.forEach((_, i) => expect(sql).toContain(`$${i + 2}`));
    expect(sql).toContain('WHERE id = $1');
    // No placeholder shared between two columns.
    const used = (sql.match(/\$\d+/g) || []).filter((p) => p !== '$1');
    expect(new Set(used).size).toBe(used.length);
  });

  it('refuses to build a statement with nothing to write', () => {
    // An UPDATE with an empty SET clause is a syntax error at best and a no-op reported
    // as work at worst. The reconciler already drops these rows; this is the backstop.
    expect(() => buildUpdateSql([])).toThrow(/nothing to write/);
  });

  it('keeps bind order aligned with column order', () => {
    const { columns } = buildUpdateSql(['title', 'narrative']);
    const binds = columns.map((c) => updateBindFor(c, story));
    expect(binds[0]).toBe(story.title);
    expect(binds[1]).toBe(story.title);      // description takes the same value
    expect(binds[2]).toBe(story.narrative);
  });

  it('binds an empty planned acceptance as null rather than an empty json array', () => {
    const empty = { ...story, acceptance: [] as string[] };
    expect(updateBindFor('acceptance', empty)).toBeNull();
    const full = { ...story, acceptance: ['a criterion'] };
    expect(updateBindFor('acceptance', full)).toBe('["a criterion"]');
  });

  it('throws on a column it has no bind for, rather than binding undefined', () => {
    expect(() => updateBindFor('status', story)).toThrow(/no bind defined/);
  });
});
