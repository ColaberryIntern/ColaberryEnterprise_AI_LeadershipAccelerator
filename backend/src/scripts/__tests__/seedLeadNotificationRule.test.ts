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
      action: 'notify_sales',
      entrySlug: undefined,
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

describe('the callback rule', () => {
  const callbackArgs = ['--source', 'ai-flotation', '--action', 'request_callback', '--entry', 'call_me_now'];

  it('does not demand a recipient, because a callback rings the lead', () => {
    // Asking for an email address to place a phone call would be requiring something the
    // action never uses, and the operator would rightly wonder what it was for.
    const args = parseRuleArgs(callbackArgs);
    expect(args.action).toBe('request_callback');
    expect(args.to).toBe('');
  });

  it('narrows to the entry, so only the call-me-now form dials', () => {
    // Without this the rule would fire on every ai-flotation lead and phone people who
    // filled in the written form and never asked to be called.
    expect(buildRule(parseRuleArgs(callbackArgs)).conditions)
      .toEqual({ source_slug: 'ai-flotation', entry_slug: 'call_me_now' });
  });

  it('fires request_callback and carries no email fields', () => {
    expect(buildRule(parseRuleArgs(callbackArgs)).actions).toEqual([{ type: 'request_callback' }]);
  });

  it('names itself after what it does', () => {
    expect(parseRuleArgs(callbackArgs).name).toBe('Call back on ai-flotation call_me_now');
  });

  it('rejects an action it cannot fire', () => {
    // A typo would otherwise write a rule whose action no handler matches, which
    // runAction reports as 'unknown' and nothing ever notices.
    expect(() => parseRuleArgs(['--source', 'x', '--action', 'send_smoke_signal']))
      .toThrow(/must be notify_sales or request_callback/);
  });

  it('still requires a recipient for a notification rule', () => {
    expect(() => parseRuleArgs(['--source', 'x', '--action', 'notify_sales'])).toThrow(/--to/);
  });
});

describe('buildRule', () => {
  const args = { sourceSlug: 'ai-flotation', to: 'ali@colaberry.com', name: 'Notify on ai-flotation lead', commit: false, action: 'notify_sales' as const };

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
