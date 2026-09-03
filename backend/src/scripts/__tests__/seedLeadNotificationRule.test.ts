import { buildRule, parseRuleArgs } from '../seedLeadNotificationRule';

/**
 * The first routing rule this system will ever have.
 *
 * `select count(*) from routing_rules` on production returns 0, so the shape written
 * here is the shape the engine gets judged on. Two things are worth pinning: that the
 * condition matches the way the engine actually evaluates conditions, and that
 * `--commit` cannot be assumed.
 */
describe('parseRuleArgs', () => {
  const base = ['--source', 'ai-flotation', '--to', 'ali@colaberry.com'];

  it('reads a full invocation', () => {
    expect(parseRuleArgs([...base, '--convert-url', 'https://x.test/c', '--commit'])).toEqual({
      sourceSlug: 'ai-flotation',
      to: 'ali@colaberry.com',
      name: 'Notify on ai-flotation lead',
      convertUrl: 'https://x.test/c',
      commit: true,
    });
  });

  it('defaults to a dry run', () => {
    expect(parseRuleArgs(base).commit).toBe(false);
  });

  it('only commits on the exact flag', () => {
    expect(parseRuleArgs([...base, '--commmit']).commit).toBe(false);
  });

  it('requires a source, because the rule matches on it', () => {
    expect(() => parseRuleArgs(['--to', 'a@b.test'])).toThrow(/--source/);
  });

  it('requires a recipient rather than falling back to a global setting', () => {
    // A rule that silently notifies whoever a global setting happens to name is a rule
    // nobody can reason about later.
    expect(() => parseRuleArgs(['--source', 'ai-flotation'])).toThrow(/--to/);
  });

  it('derives a readable name, and lets one be supplied', () => {
    expect(parseRuleArgs(base).name).toBe('Notify on ai-flotation lead');
    expect(parseRuleArgs([...base, '--name', 'Flotation alerts']).name).toBe('Flotation alerts');
  });
});

describe('buildRule', () => {
  const args = { sourceSlug: 'ai-flotation', to: 'ali@colaberry.com', name: 'Notify on ai-flotation lead', commit: false };

  it('matches source_slug the way the engine evaluates conditions', () => {
    // A bare key is equality in evaluateConditions. Writing `source_slug_eq` would also
    // work, but a bare key is what the engine documents.
    expect(buildRule(args).conditions).toEqual({ source_slug: 'ai-flotation' });
  });

  it('fires notify_sales by email to the given recipient', () => {
    expect(buildRule(args).actions).toEqual([
      { type: 'notify_sales', channel: 'email', to: 'ali@colaberry.com' },
    ]);
  });

  it('carries a convert link only when one is given', () => {
    expect(buildRule(args).actions[0]).not.toHaveProperty('convert_url');
    expect(buildRule({ ...args, convertUrl: 'https://x.test/c' }).actions[0])
      .toMatchObject({ convert_url: 'https://x.test/c' });
  });

  it('lets other rules for the same source still run', () => {
    expect(buildRule(args).continue_on_match).toBe(true);
  });

  it('is active, and sits mid-priority so rules can be ordered around it', () => {
    expect(buildRule(args).is_active).toBe(true);
    expect(buildRule(args).priority).toBe(100);
  });
});
