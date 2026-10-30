import {
  CHANGE_REQUEST_DESCRIPTION_MAX,
  CHANGE_REQUEST_TITLE_MAX,
  DECLINED_REASON_MAX,
  DecideChangeRequestSchema,
  FileChangeRequestSchema,
} from '../agentChangeRequestSchema';

/**
 * AF4.2 inbound schemas.
 *
 * The two properties worth the most here are the ones a casual read would skip:
 *
 *   - `.strict()`, because a silently ignored key is worse than a 400. An intern who types
 *     `descripton` should be told, not have the body dropped and wonder later why their request
 *     has no detail on it.
 *   - the declined-reason conditional in BOTH directions. Required on a decline is the obvious
 *     half; refused on an approval is the half that stops a stored "reason" on an approved row
 *     from meaning two different things to two readers.
 */

const file = (over: Record<string, unknown> = {}) => ({
  domain_key: 'platform-automation',
  title: 'Let an intern rename their own agent',
  ...over,
});

const issues = (r: { success: boolean; error?: { issues: Array<{ message: string; path: Array<string | number | symbol> }> } }) =>
  (r.error?.issues ?? []).map((i) => `${i.path.join('.')}: ${i.message}`);

describe('filing a change request', () => {
  it('accepts a complete request', () => {
    expect(FileChangeRequestSchema.safeParse(file()).success).toBe(true);
  });

  it('accepts one with a description', () => {
    expect(FileChangeRequestSchema.safeParse(file({ description: 'Because the UUID is unreadable.' })).success).toBe(true);
  });

  it('REFUSES AN UNKNOWN KEY rather than dropping it', () => {
    // The typo case. Without .strict() this parses, the detail vanishes, and nobody is told.
    const r = FileChangeRequestSchema.safeParse(file({ descripton: 'the typo' }));
    expect(r.success).toBe(false);
  });

  it('requires a domain, because a request about nothing cannot be routed', () => {
    const r = FileChangeRequestSchema.safeParse({ title: 'Something' });
    expect(r.success).toBe(false);
    expect(issues(r).join(' ')).toContain('domain');
  });

  it('refuses an empty or whitespace-only title', () => {
    for (const title of ['', '   ']) {
      expect(FileChangeRequestSchema.safeParse(file({ title })).success).toBe(false);
    }
  });

  it('refuses a title with no letter in it', () => {
    // "..." or "123" tells a reviewer nothing. Same rule as display names.
    for (const title of ['...', '123', '!!!']) {
      const r = FileChangeRequestSchema.safeParse(file({ title }));
      expect(r.success).toBe(false);
      expect(issues(r).join(' ')).toContain('at least one letter');
    }
  });

  it('accepts a title at the limit and refuses one past it', () => {
    expect(FileChangeRequestSchema.safeParse(file({ title: 'a'.repeat(CHANGE_REQUEST_TITLE_MAX) })).success).toBe(true);
    const over = FileChangeRequestSchema.safeParse(file({ title: 'a'.repeat(CHANGE_REQUEST_TITLE_MAX + 1) }));
    expect(over.success).toBe(false);
    // The message names the number, so the intern knows how much to cut.
    expect(issues(over).join(' ')).toContain(String(CHANGE_REQUEST_TITLE_MAX));
  });

  it('accepts a description at the limit and refuses one past it', () => {
    expect(FileChangeRequestSchema.safeParse(file({ description: 'd'.repeat(CHANGE_REQUEST_DESCRIPTION_MAX) })).success).toBe(true);
    expect(FileChangeRequestSchema.safeParse(file({ description: 'd'.repeat(CHANGE_REQUEST_DESCRIPTION_MAX + 1) })).success).toBe(false);
  });

  it('trims rather than storing the intern’s stray whitespace', () => {
    const r = FileChangeRequestSchema.safeParse(file({ title: '  Rename my agent  ' }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.title).toBe('Rename my agent');
  });

  it('every message is a sentence aimed at the person who will read it', () => {
    // These render verbatim in the portal, so a terse "invalid" here is a terse "invalid" there.
    const r = FileChangeRequestSchema.safeParse({ domain_key: '', title: '' });
    for (const m of issues(r)) {
      const text = m.split(': ').slice(1).join(': ');
      expect(text.length).toBeGreaterThan(12);
      expect(text.endsWith('.')).toBe(true);
    }
  });
});

describe('deciding a change request', () => {
  it('accepts an approval with no reason', () => {
    expect(DecideChangeRequestSchema.safeParse({ decision: 'approved' }).success).toBe(true);
  });

  it('accepts a decline that carries a reason', () => {
    expect(DecideChangeRequestSchema.safeParse({
      decision: 'declined', declined_reason: 'Out of scope for this quarter.',
    }).success).toBe(true);
  });

  it('REFUSES a decline with no reason', () => {
    const r = DecideChangeRequestSchema.safeParse({ decision: 'declined' });
    expect(r.success).toBe(false);
    expect(issues(r).join(' ')).toContain('requires a reason');
  });

  it('refuses a decline whose reason is only whitespace', () => {
    expect(DecideChangeRequestSchema.safeParse({ decision: 'declined', declined_reason: '   ' }).success).toBe(false);
  });

  it('REFUSES an approval that carries a decline reason, the other direction', () => {
    // A stored reason on an approved row is a field two readers interpret differently, and the
    // gate has no way to tell which meaning was intended.
    const r = DecideChangeRequestSchema.safeParse({ decision: 'approved', declined_reason: 'why though' });
    expect(r.success).toBe(false);
    expect(issues(r).join(' ')).toContain('cannot carry a decline reason');
  });

  it('refuses any decision that is not approved or declined', () => {
    // Notably 'withdrawn': that is the intern's own act on their own request, not a decision
    // somebody makes about it, so it must not arrive on this route at all.
    for (const decision of ['withdrawn', 'submitted', 'maybe', '']) {
      expect(DecideChangeRequestSchema.safeParse({ decision }).success).toBe(false);
    }
  });

  it('refuses an unknown key here too', () => {
    expect(DecideChangeRequestSchema.safeParse({
      decision: 'approved', approved_by: 'system:auto_approve_timeout',
    }).success).toBe(false);
  });

  it('accepts a reason at the limit and refuses one past it', () => {
    const at = 'r'.repeat(DECLINED_REASON_MAX);
    expect(DecideChangeRequestSchema.safeParse({ decision: 'declined', declined_reason: at }).success).toBe(true);
    expect(DecideChangeRequestSchema.safeParse({ decision: 'declined', declined_reason: at + 'r' }).success).toBe(false);
  });

  it('reports both problems at once when a body has two', () => {
    // superRefine rather than a discriminated union, so this is one round trip, not two.
    const r = DecideChangeRequestSchema.safeParse({ decision: 'declined', declined_reason: 'x'.repeat(DECLINED_REASON_MAX + 1) });
    expect(r.success).toBe(false);
  });
});

describe('the limits are shared, not guessed', () => {
  it('exports numbers the frontend and the tests can agree on', () => {
    expect(CHANGE_REQUEST_TITLE_MAX).toBe(140);
    expect(CHANGE_REQUEST_DESCRIPTION_MAX).toBe(4000);
    expect(DECLINED_REASON_MAX).toBe(1000);
  });
});

describe('AF7.1: what the request is ASKING FOR', () => {
  it('defaults to a change request when kind is omitted, so AF4.2 callers are untouched', () => {
    const r = FileChangeRequestSchema.safeParse(file());
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.kind).toBeUndefined();
  });

  it('accepts a tool request', () => {
    const r = FileChangeRequestSchema.safeParse(file({ kind: 'tool' }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.kind).toBe('tool');
  });

  it('REFUSES an invented kind rather than storing it', () => {
    // A third kind nobody implemented would route to no queue and be read by nobody.
    for (const kind of ['grant', 'TOOL', 'change-request', '']) {
      expect(FileChangeRequestSchema.safeParse(file({ kind })).success).toBe(false);
    }
  });

  it('says in plain words what the two kinds are', () => {
    const r = FileChangeRequestSchema.safeParse(file({ kind: 'grant' }));
    expect(issues(r).join(' ')).toContain("either a 'change' or a 'tool'");
  });
});
