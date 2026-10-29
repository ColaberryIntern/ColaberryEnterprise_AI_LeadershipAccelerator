import { AgentDisplayNameSchema, AGENT_DISPLAY_NAME_MAX } from '../agentDisplayNameSchema';

/**
 * AF10.6 schema. The properties worth the most here:
 *
 *  - the length ceiling is pinned on BOTH sides (60 accepted, 61 refused), because a one-sided
 *    boundary test passes against an off-by-one in either direction
 *  - trimming happens here, and the service's case-folding happens in SQL, so this suite owns
 *    proving the trim and says so rather than leaving the seam untested in both places
 *  - a name must contain a letter, or "***" becomes an agent identity and the uniqueness check
 *    downstream starts reserving punctuation
 *  - `.strict()` means a typo'd field is a refusal, not a silently ignored instruction
 */

const parse = (body: unknown) => AgentDisplayNameSchema.safeParse(body);

describe('AgentDisplayNameSchema', () => {
  it('accepts an ordinary name', () => {
    const r = parse({ display_name: 'Ellis' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.display_name).toBe('Ellis');
  });

  it('trims surrounding whitespace, so "  Maya  " is stored as "Maya"', () => {
    const r = parse({ display_name: '  Maya  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.display_name).toBe('Maya');
  });

  it('refuses a name that is only whitespace', () => {
    expect(parse({ display_name: '   ' }).success).toBe(false);
  });

  it('refuses an empty name', () => {
    expect(parse({ display_name: '' }).success).toBe(false);
  });

  it(`accepts exactly ${AGENT_DISPLAY_NAME_MAX} characters`, () => {
    expect(parse({ display_name: 'a'.repeat(AGENT_DISPLAY_NAME_MAX) }).success).toBe(true);
  });

  it(`refuses ${AGENT_DISPLAY_NAME_MAX + 1} characters`, () => {
    expect(parse({ display_name: 'a'.repeat(AGENT_DISPLAY_NAME_MAX + 1) }).success).toBe(false);
  });

  it('measures length AFTER trimming, so padding does not consume the budget', () => {
    const padded = `  ${'a'.repeat(AGENT_DISPLAY_NAME_MAX)}  `;
    expect(parse({ display_name: padded }).success).toBe(true);
  });

  it('refuses punctuation with no letter in it', () => {
    expect(parse({ display_name: '***' }).success).toBe(false);
  });

  it('refuses digits with no letter in it', () => {
    expect(parse({ display_name: '42' }).success).toBe(false);
  });

  it('allows digits, spaces, hyphens and apostrophes alongside letters, because real names have them', () => {
    for (const name of ['Vic 2', "O'Brien", 'Jean-Luc', 'Agent Ava']) {
      expect(parse({ display_name: name }).success).toBe(true);
    }
  });

  it('accepts a non-Latin name, because the letter rule is a requirement and not an alphabet', () => {
    expect(parse({ display_name: 'የኔ' }).success).toBe(true);
  });

  it('refuses a missing field', () => {
    expect(parse({}).success).toBe(false);
  });

  it('refuses an unknown field rather than ignoring it, so a typo is not a silent no-op', () => {
    const r = parse({ display_nme: 'Pip' });
    expect(r.success).toBe(false);
  });

  it('refuses a non-string', () => {
    expect(parse({ display_name: 42 }).success).toBe(false);
  });
});
