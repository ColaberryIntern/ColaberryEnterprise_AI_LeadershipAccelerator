import { checkContent, type ContentUnderReview } from '../brandGovernance';
import {
  BASE_RULE_SET,
  EM_DASH_RULE,
  FREE_CLAIM_RULE,
  RuleSetConflictError,
  canonicalize,
  publishRuleSetIfChanged,
  ruleSetsEqual,
  type RuleSetDraft,
} from '../brandGovernanceSeed';

/**
 * The rule set, and the publisher that puts it in the table once and only once.
 *
 * WHAT IS REAL HERE AND WHAT IS NOT. Only the Sequelize MODEL is faked; `publishRules`,
 * `getCurrentRules`, the Zod write-boundary schema and `checkContent` are the production code.
 * The fake is a table, not a stub: it keeps rows, answers `findOne` with the highest version
 * for a brand, and REJECTS a second insert at the same (brand_id, version) exactly as the
 * unique index `brand_governance_rules_brand_version_unique` does in production (confirmed
 * present there on 2026-10-06). A stub that always said yes would prove the publisher calls a
 * function; this proves what happens when two publishers collide.
 *
 * IT ALSO RE-ORDERS KEYS ON READ, on demand. The column is `jsonb`, and Postgres does not
 * return object keys in the order they were written. That single fact is what decides whether
 * re-running the publisher is idempotent or quietly stacks a v2, v3, v4, so the fake can be
 * told to shuffle, and a test turns it on.
 */

jest.mock('../../../models/BrandGovernanceRule', () => {
  interface Row {
    tenant_id: string;
    brand_id: string;
    version: number;
    rules: Record<string, unknown>;
    published_by: string | null;
    note: string | null;
  }

  const rows: Row[] = [];
  const state = {
    /** Reverse every object's key order on the way out, imitating a jsonb round trip. */
    shuffleKeysOnRead: false,
    /** Throw this once on the next create, then clear. */
    failNextCreateWith: null as Error | null,
    /**
     * Run once just before the next insert is checked, then clear. This is how the race is
     * staged honestly: a competing publisher's row appears AFTER the publisher under test has
     * read the current version and BEFORE its own insert, so the unique index is what refuses
     * it. Pre-seeding the row instead would be a different scenario entirely - the publisher
     * would see it on the first read and never reach the insert, which is exactly what the
     * first version of this test accidentally asserted.
     */
    beforeCreate: null as null | (() => void),
  };

  const reverseKeys = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(reverseKeys);
    if (value && typeof value === 'object') {
      const src = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(src).reverse()) out[k] = reverseKeys(src[k]);
      return out;
    }
    return value;
  };

  return {
    __esModule: true,
    default: {
      __rows: rows,
      __state: state,
      __reset: (): void => {
        rows.length = 0;
        state.shuffleKeysOnRead = false;
        state.failNextCreateWith = null;
        state.beforeCreate = null;
      },
      findOne: async (opts: { where: { brand_id: string } }): Promise<Row | null> => {
        const matches = rows
          .filter((r) => r.brand_id === opts.where.brand_id)
          .sort((a, b) => b.version - a.version);
        const row = matches[0];
        if (!row) return null;
        return state.shuffleKeysOnRead
          ? { ...row, rules: reverseKeys(row.rules) as Record<string, unknown> }
          : row;
      },
      create: async (attrs: Row): Promise<Row> => {
        if (state.beforeCreate) {
          const hook = state.beforeCreate;
          state.beforeCreate = null;
          hook();
        }
        if (state.failNextCreateWith) {
          const err = state.failNextCreateWith;
          state.failNextCreateWith = null;
          throw err;
        }
        if (rows.some((r) => r.brand_id === attrs.brand_id && r.version === attrs.version)) {
          const err = new Error(
            'duplicate key value violates unique constraint "brand_governance_rules_brand_version_unique"',
          ) as Error & { name: string; original: { code: string } };
          err.name = 'SequelizeUniqueConstraintError';
          err.original = { code: '23505' };
          throw err;
        }
        rows.push(attrs);
        return attrs;
      },
    },
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const table = require('../../../models/BrandGovernanceRule').default as {
  __rows: Array<{ brand_id: string; version: number; rules: Record<string, unknown> }>;
  __state: { shuffleKeysOnRead: boolean; failNextCreateWith: Error | null; beforeCreate: null | (() => void) };
  __reset: () => void;
};

const TENANT = 'bf959c27-67af-4ab0-9879-bffffe8bd990';
const BRAND = '10ebfb01-dc51-450d-bbef-a2c10e42efa8'; // Colaberry Training, in production

/**
 * Stage a competing publisher that wins the race for `version` with `rules`.
 *
 * `shapedAs` overrides the error the insert then fails with. Real Sequelize sets the name AND
 * an `original`/`parent`, but a wrapped or re-serialised error may carry only one of the three,
 * which is why `isUniqueViolation` tests three shapes - and why each is exercised separately
 * below. Breaking any one disjunct must fail a test; with only the fully-populated error in
 * play, two of the three were unchecked and a mutation to them left the suite green.
 */
function competingPublisherWins(version: number, rules: RuleSetDraft, shapedAs?: Error): void {
  table.__state.beforeCreate = () => {
    table.__rows.push({ brand_id: BRAND, version, rules: { ...rules, version } } as never);
    if (shapedAs) table.__state.failNextCreateWith = shapedAs;
  };
}

const UNIQUE_VIOLATION_SHAPES: Array<[string, () => Error]> = [
  ['name only', () => Object.assign(new Error('duplicate key'), { name: 'SequelizeUniqueConstraintError' })],
  ['original.code only', () => Object.assign(new Error('duplicate key'), { original: { code: '23505' } })],
  ['parent.code only', () => Object.assign(new Error('duplicate key'), { parent: { code: '23505' } })],
];

beforeEach(() => table.__reset());

describe('publishRuleSetIfChanged', () => {
  it('HAPPY: the first publish writes version 1 and stores the authored rules', async () => {
    const out = await publishRuleSetIfChanged(TENANT, BRAND, BASE_RULE_SET, 'dri@colaberry.com', 'initial');
    expect(out).toEqual({ brandId: BRAND, action: 'published', version: 1, reason: 'first-publish' });
    expect(table.__rows).toHaveLength(1);
    expect(table.__rows[0].rules).toEqual({ ...BASE_RULE_SET, version: 1 });
  });

  it('IDEMPOTENCY: running it again changes nothing and writes no second row', async () => {
    await publishRuleSetIfChanged(TENANT, BRAND, BASE_RULE_SET, null, null);
    const second = await publishRuleSetIfChanged(TENANT, BRAND, BASE_RULE_SET, null, null);
    const third = await publishRuleSetIfChanged(TENANT, BRAND, BASE_RULE_SET, null, null);
    expect(second).toEqual({ brandId: BRAND, action: 'unchanged', version: 1, reason: 'identical-to-current' });
    expect(third).toEqual(second);
    expect(table.__rows).toHaveLength(1);
  });

  it('IDEMPOTENCY: a jsonb key re-order on read is not a change', async () => {
    // The one that decides whether this is idempotent at all. A plain JSON.stringify
    // comparison passes the test above (same object, same key order in memory) and then
    // publishes a pointless new version on every real run, because the database hands the
    // keys back in its own order. Only the canonical comparison survives this.
    await publishRuleSetIfChanged(TENANT, BRAND, BASE_RULE_SET, null, null);
    table.__state.shuffleKeysOnRead = true;
    const again = await publishRuleSetIfChanged(TENANT, BRAND, BASE_RULE_SET, null, null);
    expect(again.action).toBe('unchanged');
    expect(again.version).toBe(1);
    expect(table.__rows).toHaveLength(1);
  });

  it('FALSE-HEALTHY GUARD: an all-empty draft against an empty table still publishes v1', async () => {
    // `getCurrentRules` returns EMPTY_RULES with version 0 when a brand has no row at all, and
    // EMPTY_RULES is canonically identical to an empty draft. Compare without checking for
    // that sentinel and the publisher reports "unchanged, version 0" for a brand it has never
    // written - a brand with NO governance, reported as already in the state we wanted.
    const empty: RuleSetDraft = {
      voice: { tone: '', guidance: '' },
      approvedOffers: [],
      requiredDisclosures: [],
      prohibitedClaims: [],
      protectedTerms: [],
      audienceExclusions: [],
      allowedLinkDomains: [],
      requiredApprovers: [],
    };
    const out = await publishRuleSetIfChanged(TENANT, BRAND, empty, null, null);
    expect(out).toEqual({ brandId: BRAND, action: 'published', version: 1, reason: 'first-publish' });
    expect(table.__rows).toHaveLength(1);
  });

  it('a genuine change publishes the next version and leaves the old one intact', async () => {
    await publishRuleSetIfChanged(TENANT, BRAND, BASE_RULE_SET, null, null);
    const changed: RuleSetDraft = { ...BASE_RULE_SET, allowedLinkDomains: ['colaberry.com'] };
    const out = await publishRuleSetIfChanged(TENANT, BRAND, changed, null, 'added link domains');
    expect(out).toEqual({ brandId: BRAND, action: 'published', version: 2, reason: 'rules-changed' });
    expect(table.__rows.map((r) => r.version)).toEqual([1, 2]);
    expect(table.__rows[0].rules.allowedLinkDomains).toEqual([]);
  });

  it('is per brand: publishing for one brand does not satisfy another', async () => {
    const other = 'c2f60ebc-3174-462f-9aed-e831c3beab64'; // Colaberry Enterprise
    await publishRuleSetIfChanged(TENANT, BRAND, BASE_RULE_SET, null, null);
    const out = await publishRuleSetIfChanged(TENANT, other, BASE_RULE_SET, null, null);
    expect(out).toEqual({ brandId: other, action: 'published', version: 1, reason: 'first-publish' });
    expect(table.__rows).toHaveLength(2);
  });

  it('RACE, same intent: the loser of the unique index reports unchanged and does not retry', async () => {
    // Two publishers read version 1 together and both aim at version 2. The index fails one.
    // Its re-read finds the winner published the SAME rules, so the end state is the one it
    // wanted: report unchanged, write nothing, do not increment again.
    await publishRuleSetIfChanged(TENANT, BRAND, BASE_RULE_SET, null, null);
    const changed: RuleSetDraft = { ...BASE_RULE_SET, allowedLinkDomains: ['colaberry.com'] };
    competingPublisherWins(2, changed);

    const out = await publishRuleSetIfChanged(TENANT, BRAND, changed, null, null);
    expect(out).toEqual({ brandId: BRAND, action: 'unchanged', version: 2, reason: 'concurrent-identical' });
    expect(table.__rows).toHaveLength(2);
  });

  it.each(UNIQUE_VIOLATION_SHAPES)('RACE: a unique violation shaped as "%s" is recognised', async (_label, make) => {
    await publishRuleSetIfChanged(TENANT, BRAND, BASE_RULE_SET, null, null);
    const changed: RuleSetDraft = { ...BASE_RULE_SET, allowedLinkDomains: ['colaberry.com'] };
    competingPublisherWins(2, changed, make());
    const out = await publishRuleSetIfChanged(TENANT, BRAND, changed, null, null);
    expect(out).toEqual({ brandId: BRAND, action: 'unchanged', version: 2, reason: 'concurrent-identical' });
  });

  it('RACE: an error that is NOT a unique violation is not mistaken for one', async () => {
    // The other side of the same recogniser. A deadlock is not a duplicate, and reporting it
    // as `concurrent-identical` would claim the rules were published when they were not.
    await publishRuleSetIfChanged(TENANT, BRAND, BASE_RULE_SET, null, null);
    const changed: RuleSetDraft = { ...BASE_RULE_SET, allowedLinkDomains: ['colaberry.com'] };
    competingPublisherWins(2, changed, Object.assign(new Error('deadlock detected'), { original: { code: '40P01' } }));
    await expect(publishRuleSetIfChanged(TENANT, BRAND, changed, null, null)).rejects.toThrow(/deadlock detected/);
  });

  it('RACE, different intent: raises a conflict instead of stacking a version nobody authored', async () => {
    await publishRuleSetIfChanged(TENANT, BRAND, BASE_RULE_SET, null, null);
    competingPublisherWins(2, { ...BASE_RULE_SET, allowedLinkDomains: ['refactored.ai'] });

    const mine: RuleSetDraft = { ...BASE_RULE_SET, allowedLinkDomains: ['colaberry.com'] };
    // One attempt, both assertions on the SAME rejection. Calling it twice would consume the
    // staged race on the first call and let the second one simply succeed at version 3, which
    // is what the first version of this test did - it passed while proving nothing.
    const err = await publishRuleSetIfChanged(TENANT, BRAND, mine, null, null).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RuleSetConflictError);
    expect((err as RuleSetConflictError).message).toMatch(/version 2 .*different rules/);
    expect((err as RuleSetConflictError).errorClass).toBe('ContractViolation');
    expect(table.__rows).toHaveLength(2);
  });

  it('FAILURE: an unreachable database is re-thrown with its error_class and writes nothing', async () => {
    const dbDown = new Error('connect ECONNREFUSED 10.0.0.1:5432') as Error & { code: string };
    dbDown.code = 'ECONNREFUSED';
    table.__state.failNextCreateWith = dbDown;
    await expect(publishRuleSetIfChanged(TENANT, BRAND, BASE_RULE_SET, null, null))
      .rejects.toThrow(/\[UpstreamUnavailable\]/);
    expect(table.__rows).toEqual([]);
  });

  it('FAILURE: a rule whose pattern will not compile is refused as a ValidationError', async () => {
    // The real `publishRules` compiles every pattern before writing. An uncompilable rule is
    // worse than no rule because it looks like coverage, and `checkContent` would report it as
    // a violation against its own id forever.
    const bad: RuleSetDraft = {
      ...BASE_RULE_SET,
      prohibitedClaims: [{ id: 'broken', pattern: '([unclosed', reason: 'x' }],
    };
    await expect(publishRuleSetIfChanged(TENANT, BRAND, bad, null, null))
      .rejects.toThrow(/\[ValidationError\].*invalid pattern/);
    expect(table.__rows).toEqual([]);
  });

  it('FAILURE: the Zod write boundary refuses a malformed rule shape', async () => {
    const bad = { ...BASE_RULE_SET, requiredDisclosures: [{ id: 'd', text: '', when: 'always' }] } as unknown as RuleSetDraft;
    await expect(publishRuleSetIfChanged(TENANT, BRAND, bad, null, null))
      .rejects.toThrow(/\[ValidationError\]/);
    expect(table.__rows).toEqual([]);
  });
});

describe('canonicalize / ruleSetsEqual', () => {
  it('ignores object key order and array order, and nothing else', () => {
    expect(canonicalize({ b: 1, a: 2 })).toEqual(canonicalize({ a: 2, b: 1 }));
    expect(JSON.stringify(canonicalize(['b', 'a']))).toBe(JSON.stringify(canonicalize(['a', 'b'])));
    expect(JSON.stringify(canonicalize({ a: [1, 2] }))).not.toBe(JSON.stringify(canonicalize({ a: [1, 3] })));
    const reordered: RuleSetDraft = { ...BASE_RULE_SET, prohibitedClaims: [EM_DASH_RULE, FREE_CLAIM_RULE] };
    expect(ruleSetsEqual(BASE_RULE_SET, reordered)).toBe(true);
    expect(ruleSetsEqual(BASE_RULE_SET, { ...BASE_RULE_SET, audienceExclusions: ['minors'] })).toBe(false);
  });

  it('the "arrays are sets" claim is true of the ENGINE, not just of the comparison', () => {
    // The canonical form treats rule arrays as sets. That is only safe because nothing in
    // `checkContent` is order-sensitive. This pins that reading: if a future rule ever starts
    // depending on order, this fails rather than the comment being quietly wrong.
    const content = contentOf('Our free class uses a long dash — like that, from Cola Berry.');
    const forward = checkContent(content, { ...BASE_RULE_SET, version: 1 });
    const reversed = checkContent(content, {
      ...BASE_RULE_SET,
      version: 1,
      prohibitedClaims: [...BASE_RULE_SET.prohibitedClaims].reverse(),
      protectedTerms: [...BASE_RULE_SET.protectedTerms].reverse(),
    });
    expect(new Set(reversed.violations.map((v) => `${v.kind}:${v.ruleId}`)))
      .toEqual(new Set(forward.violations.map((v) => `${v.kind}:${v.ruleId}`)));
    expect(reversed.ok).toBe(forward.ok);
  });
});

function contentOf(body: string, overrides: Partial<ContentUnderReview> = {}): ContentUnderReview {
  return {
    body,
    disclosure: '',
    links: [],
    isPaid: false,
    aiGenerated: false,
    hasOffer: false,
    kinds: [],
    ...overrides,
  };
}

describe('what the rule set does to real content', () => {
  const RULES = { ...BASE_RULE_SET, version: 1 };

  it('refuses the one production body that matches, by rule id, as a BLOCK', () => {
    // content_items 481b1247-36e1-4251-83fc-02ff9377f916, draft, Colaberry Training, read from
    // production on 2026-10-06. This is the whole measured blast radius of the free-word rule.
    const result = checkContent(
      contentOf('Enhance your skills with our free AI class designed specifically for working professionals.'),
      RULES,
    );
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      expect.objectContaining({ kind: 'prohibited_claim', ruleId: FREE_CLAIM_RULE.id, severity: 'block' }),
    ]);
    expect(result.violations[0].message).toContain('807.172(d)');
    expect(result.violations[0].message).toContain('$0 to start');
  });

  it('accepts the approved phrasings', () => {
    for (const body of [
      'Our AI class is $0 to start. No card needed.',
      'Join the next cohort. No card needed to begin.',
    ]) {
      expect(checkContent(contentOf(body), RULES)).toMatchObject({ ok: true, violations: [] });
    }
  });

  it('does not fire on words that merely contain the banned one', () => {
    const r = checkContent(contentOf('Academic freedom, used freely by freelance architects.'), RULES);
    expect(r.violations).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('blocks an em-dash and a misspelt company name, and only WARNS on a case slip', () => {
    expect(checkContent(contentOf(`A dash ${String.fromCharCode(0x2014)} here.`), RULES).violations)
      .toEqual([expect.objectContaining({ ruleId: EM_DASH_RULE.id, severity: 'block' })]);

    const misspelt = checkContent(contentOf('Cola Berry trains architects.'), RULES);
    expect(misspelt.ok).toBe(false);
    expect(misspelt.violations).toEqual([
      expect.objectContaining({ kind: 'protected_term', ruleId: 'Colaberry', severity: 'block' }),
    ]);

    // A case slip is a warning, so it does NOT stop a publish - the engine separates the two
    // on purpose, and the rule set must not accidentally promote one to the other.
    const lowercase = checkContent(contentOf('colaberry trains architects.'), RULES);
    expect(lowercase.violations).toEqual([
      expect.objectContaining({ kind: 'protected_term', severity: 'warn' }),
    ]);
    expect(lowercase.ok).toBe(true);

    // And the correct spelling is clean, which is the bug the engine's own header records.
    expect(checkContent(contentOf('Colaberry trains architects.'), RULES).violations).toEqual([]);
  });

  it('reports the rules version it judged by, so an approval can be read back', () => {
    expect(checkContent(contentOf('anything'), RULES).rulesVersion).toBe(1);
    expect(checkContent(contentOf('anything'), { ...RULES, version: 7 }).rulesVersion).toBe(7);
  });

  it('leaves the warn-only offer rule warn-only', () => {
    // `approvedOffers` is non-empty in this set, which arms the `unapproved_cta` check for any
    // content declaring an offer. It must stay a warning: 0 production rows declare
    // metadata.hasOffer today, and making it a block would gate a surface nobody has measured.
    const r = checkContent(contentOf('Join the next cohort today.', { hasOffer: true }), RULES);
    expect(r.violations).toEqual([expect.objectContaining({ kind: 'unapproved_cta', severity: 'warn' })]);
    expect(r.ok).toBe(true);
  });

  it('adds no gate of its own: the empty rule lists stay empty', () => {
    // Each of these BLOCKS on absence rather than presence, so a non-empty value here would
    // refuse existing content the moment it was published. They are empty deliberately.
    expect(BASE_RULE_SET.requiredDisclosures).toEqual([]);
    expect(BASE_RULE_SET.allowedLinkDomains).toEqual([]);
    expect(BASE_RULE_SET.requiredApprovers).toEqual([]);
    const r = checkContent(
      contentOf('A clean body.', { links: ['https://example.test/x'], kinds: ['paid'], isPaid: true }),
      RULES,
    );
    expect(r.violations).toEqual([]);
    expect(r.requiredApproverRoles).toEqual([]);
  });
});
