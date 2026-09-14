import * as fs from 'fs';
import * as path from 'path';

const m = {
  resolveOfferEligibility: jest.fn(),
  ruleFindAll: jest.fn(),
};

jest.mock('../../../models', () => ({
  GrowthJourneyContentRule: { findAll: (...a: unknown[]) => m.ruleFindAll(...a) },
}));

jest.mock('../offerEligibility', () => ({
  resolveOfferEligibility: (...a: unknown[]) => m.resolveOfferEligibility(...a),
}));

import { assertContentAllowed, type ContentAllowedInput } from '../contentEligibility';

/**
 * T305 — the content gate.
 *
 * The property under test throughout: content is allowed only if the brand may
 * make the offer AND someone approved something, every refusal carries a name
 * that says which of those failed, and the absence of a declaration is a
 * fallback rather than a denial — because the declaration table ships empty and
 * a denial would have refused every asset in the registry.
 */

const AT = new Date('2026-09-14T12:00:00Z');

const ok = (over: Record<string, unknown> = {}) => ({
  allowed: true,
  reason: 'allowed',
  brand_id: 'b-train',
  offer_family: 'learner_paid_training',
  policy_id: 'pol-1',
  approved_content_ready: true,
  ...over,
});

const input = (over: Partial<ContentAllowedInput> = {}): ContentAllowedInput => ({
  brandId: 'b-train',
  tenantId: 't-col',
  offerFamily: 'learner_paid_training',
  asset: { id: 'asset-1', brand_id: null, offer_family: null, approval_status: 'approved' },
  allowUnscoped: true,
  programSlug: 'learner-training',
  state: 'ENGAGED_LEARNER',
  at: AT,
  ...over,
});

const rule = (over: Record<string, unknown> = {}) => ({
  id: 'rule-1',
  approval_status: 'approved',
  offer_family: null,
  eligible_programs: [],
  lifecycle_states: [],
  effective_from: null,
  expires_at: null,
  ...over,
});

beforeEach(() => {
  m.resolveOfferEligibility.mockReset().mockResolvedValue(ok());
  m.ruleFindAll.mockReset().mockResolvedValue([]);
});

describe('the brand boundary comes first', () => {
  it('a denied offer refuses the content, naming the policy reason', async () => {
    // §5.4's hard exclusion: AI Flotation may not offer business training, so it
    // may not cite business-training content either. Asked through the SAME
    // resolver a candidate is asked through — never re-derived here.
    m.resolveOfferEligibility.mockResolvedValue({
      allowed: false,
      reason: 'explicit_deny',
      brand_id: 'b-flot',
      offer_family: 'business_training',
      policy_id: 'pol-deny',
      approved_content_ready: false,
    });
    const v = await assertContentAllowed(
      input({ brandId: 'b-flot', offerFamily: 'business_training' }),
    );
    expect(v).toEqual({ allowed: false, reason: 'offer_not_eligible:explicit_deny', rule_id: null });
  });

  it('asks the resolver with the caller brand, family and instant', async () => {
    await assertContentAllowed(input());
    expect(m.resolveOfferEligibility).toHaveBeenCalledWith({
      brandId: 'b-train',
      offerFamily: 'learner_paid_training',
      at: AT,
    });
  });

  it('refuses before it ever looks for a declaration', async () => {
    m.resolveOfferEligibility.mockResolvedValue({ ...ok(), allowed: false, reason: 'no_policy_row' });
    await assertContentAllowed(input());
    expect(m.ruleFindAll).not.toHaveBeenCalled();
  });
});

describe('approved_content_ready finally has a reader', () => {
  it('false refuses with content_not_approved — the state of every policy row in production', async () => {
    m.resolveOfferEligibility.mockResolvedValue(ok({ approved_content_ready: false }));
    const v = await assertContentAllowed(input());
    expect(v).toEqual({ allowed: false, reason: 'content_not_approved', rule_id: null });
  });

  it('is independent of `allowed`: an allowed offer with no approved content still refuses', async () => {
    // The two are separate fields on purpose. Conflating them would make a
    // brand with an allow row look content-ready.
    m.resolveOfferEligibility.mockResolvedValue(ok({ allowed: true, approved_content_ready: false }));
    const v = await assertContentAllowed(input());
    expect(v.allowed).toBe(false);
    expect(v.reason).toBe('content_not_approved');
  });
});

describe('the policy question, asked without an asset', () => {
  it('allows when the brand may make the offer and something is approved', async () => {
    const { asset, ...rest } = input();
    void asset;
    const v = await assertContentAllowed(rest);
    expect(v).toEqual({ allowed: true, reason: 'policy_allows', rule_id: null });
  });

  it('still refuses a denied offer, and still refuses unapproved content', async () => {
    const { asset, ...rest } = input();
    void asset;
    m.resolveOfferEligibility.mockResolvedValue(ok({ allowed: false, reason: 'explicit_deny' }));
    expect(await assertContentAllowed(rest)).toMatchObject({ reason: 'offer_not_eligible:explicit_deny' });

    m.resolveOfferEligibility.mockResolvedValue(ok({ approved_content_ready: false }));
    expect(await assertContentAllowed(rest)).toMatchObject({ reason: 'content_not_approved' });
  });

  it('does NOT check asset columns that were never supplied', async () => {
    // The bug this pins: an early version passed `{}` for the asset and the
    // column checks refused every time, on a brand and an approval status that
    // had simply not been provided. A gate that always says no looks strict and
    // is broken.
    const { asset, ...rest } = input();
    void asset;
    const v = await assertContentAllowed(rest);
    expect(v.allowed).toBe(true);
    expect(v.reason).not.toContain('asset_');
  });

  it('issues NO declaration query at all', async () => {
    // It used to fetch the brand's rules and then discard them, which is how its
    // comment came to claim a collection-level check that could not happen. A
    // question that names no asset cannot consult an asset-level rule, and a
    // collection-level rule has no reader in this phase.
    const { asset, ...rest } = input();
    void asset;
    await assertContentAllowed(rest);
    expect(m.ruleFindAll).not.toHaveBeenCalled();
  });
});

describe('with no declaration, the asset own columns decide', () => {
  it('allows an approved asset this brand owns', async () => {
    const v = await assertContentAllowed(input());
    expect(v).toEqual({ allowed: true, reason: 'asset_declares_this_brand', rule_id: null });
  });

  it('NO DECLARATION IS NOT A DENIAL — the table ships empty', async () => {
    // The regression this pins: read the other way, every asset in the registry
    // is refused the day this ships, for all four programmes.
    m.ruleFindAll.mockResolvedValue([]);
    const v = await assertContentAllowed(input());
    expect(v.allowed).toBe(true);
  });

  it('refuses an asset declared to another brand', async () => {
    const v = await assertContentAllowed(
      input({ asset: { id: 'a', brand_id: 'b-other', approval_status: 'approved' } }),
    );
    expect(v.reason).toBe('asset_other_brand');
  });

  it('refuses an UNDECLARED asset when the caller does not own the Explorer era', async () => {
    // Colaberry Training passes allowUnscoped true because the pre-brand rows are
    // its own content. CPN, Enterprise and AI Flotation pass false and see none
    // of them — which is the leakage boundary stated as a unit test.
    const v = await assertContentAllowed(
      input({ brandId: 'b-cpn', allowUnscoped: false, asset: { id: 'a', brand_id: null, approval_status: 'approved' } }),
    );
    expect(v.reason).toBe('asset_unscoped_not_this_brand');
  });

  it('refuses an asset declared for a different offer family', async () => {
    const v = await assertContentAllowed(
      input({ asset: { id: 'a', brand_id: null, offer_family: 'workflow_automation', approval_status: 'approved' } }),
    );
    expect(v.reason).toBe('asset_other_offer_family');
  });

  it('refuses an asset whose programme list excludes this programme', async () => {
    const v = await assertContentAllowed(
      input({
        asset: { id: 'a', brand_id: null, approval_status: 'approved', eligible_programs: ['business-growth'] },
      }),
    );
    expect(v.reason).toBe('asset_other_program');
  });

  it('treats an EMPTY programme list as "says nothing", not as "excludes everything"', async () => {
    const v = await assertContentAllowed(
      input({ asset: { id: 'a', brand_id: null, approval_status: 'approved', eligible_programs: [] } }),
    );
    expect(v.allowed).toBe(true);
  });

  it('names an unreviewed asset as unreviewed, not as rejected', async () => {
    const v = await assertContentAllowed(
      input({ asset: { id: 'a', brand_id: null, approval_status: null } }),
    );
    expect(v.reason).toBe('asset_not_approved:none');
  });
});

describe('the columns the SQL does NOT enforce are enforced here', () => {
  // The division of labour this task overstated once and now states precisely:
  // RESOLVE_SQL filters brand_id, offer_family and eligible_programs on the rows
  // it returns; approval_status and eligible_paths are enforced only here, which
  // is why the adapter asks this question again after selection.
  it('refuses an asset whose eligible_paths exclude the offer family', async () => {
    const v = await assertContentAllowed(
      input({
        asset: { id: 'a', brand_id: null, approval_status: 'approved', eligible_paths: ['learner_free_training'] },
      }),
    );
    expect(v.reason).toBe('asset_other_path');
  });

  it('allows one whose eligible_paths name it', async () => {
    const v = await assertContentAllowed(
      input({
        asset: { id: 'a', brand_id: null, approval_status: 'approved', eligible_paths: ['learner_paid_training'] },
      }),
    );
    expect(v.allowed).toBe(true);
  });

  it('treats an empty eligible_paths as "says nothing"', async () => {
    const v = await assertContentAllowed(
      input({ asset: { id: 'a', brand_id: null, approval_status: 'approved', eligible_paths: [] } }),
    );
    expect(v.allowed).toBe(true);
  });
});

describe('access_tier finally has a reader', () => {
  it('restricted content is refused to a free-preview subject', async () => {
    m.ruleFindAll.mockResolvedValue([rule({ access_tier: 'restricted' })]);
    const v = await assertContentAllowed(input({ tier: 'free_preview' }));
    expect(v).toEqual({ allowed: false, reason: 'content_rule_restricted', rule_id: 'rule-1' });
  });

  it('and allowed to a full-access one', async () => {
    m.ruleFindAll.mockResolvedValue([rule({ access_tier: 'restricted' })]);
    const v = await assertContentAllowed(input({ tier: 'full_access' }));
    expect(v.allowed).toBe(true);
  });

  it('NULL stays permissive: not declared is not restricted', async () => {
    // The rule as a whole still had to be approved to reach this check.
    m.ruleFindAll.mockResolvedValue([rule({ access_tier: null })]);
    const v = await assertContentAllowed(input({ tier: 'free_preview' }));
    expect(v.allowed).toBe(true);
  });

  it('an unknown tier is treated as NOT full access', async () => {
    m.ruleFindAll.mockResolvedValue([rule({ access_tier: 'restricted' })]);
    const v = await assertContentAllowed(input({ tier: undefined }));
    expect(v.reason).toBe('content_rule_restricted');
  });
});

describe('when a declaration exists, the declaration decides', () => {
  it('an approved rule supersedes the asset own unreviewed columns', async () => {
    // The declaration IS the review. Without this, a fully declared asset would
    // still be refused for the state its pre-brand row was left in.
    m.ruleFindAll.mockResolvedValue([rule()]);
    const v = await assertContentAllowed(
      input({ asset: { id: 'asset-1', brand_id: null, approval_status: null } }),
    );
    expect(v).toEqual({ allowed: true, reason: 'content_rule_approved', rule_id: 'rule-1' });
  });

  it('a draft rule refuses, naming the status', async () => {
    m.ruleFindAll.mockResolvedValue([rule({ approval_status: 'draft' })]);
    const v = await assertContentAllowed(input());
    expect(v).toEqual({ allowed: false, reason: 'content_rule_not_approved:draft', rule_id: 'rule-1' });
  });

  it('a rule outside its effective window refuses', async () => {
    m.ruleFindAll.mockResolvedValue([rule({ effective_from: '2026-10-01T00:00:00Z' })]);
    const v = await assertContentAllowed(input());
    expect(v.reason).toBe('content_rule_window');
  });

  it('an expired rule refuses', async () => {
    m.ruleFindAll.mockResolvedValue([rule({ expires_at: '2026-09-01T00:00:00Z' })]);
    const v = await assertContentAllowed(input());
    expect(v.reason).toBe('content_rule_window');
  });

  it('a rule for a different offer family refuses', async () => {
    m.ruleFindAll.mockResolvedValue([rule({ offer_family: 'ai_consulting' })]);
    const v = await assertContentAllowed(input());
    expect(v.reason).toBe('content_rule_offer_family');
  });

  it('a rule whose programme list excludes this programme refuses', async () => {
    m.ruleFindAll.mockResolvedValue([rule({ eligible_programs: ['business-growth'] })]);
    const v = await assertContentAllowed(input());
    expect(v.reason).toBe('content_rule_program');
  });

  it('a rule whose lifecycle states exclude this state refuses', async () => {
    m.ruleFindAll.mockResolvedValue([rule({ lifecycle_states: ['PROBLEM_IDENTIFIED'] })]);
    const v = await assertContentAllowed(input());
    expect(v.reason).toBe('content_rule_state');
  });

  it('reads the HIGHEST version first, so a superseded declaration cannot answer', async () => {
    await assertContentAllowed(input());
    const options = m.ruleFindAll.mock.calls[0][0];
    expect(options.order).toEqual([['version', 'DESC']]);
  });

  it('a collection-level row has NO reader, and that is deliberate', async () => {
    // Nothing in Phase 3 resolves an asset's collection membership, so a rule
    // written against a collection could only be consulted by guessing. The
    // lookup keys on asset_id, so such a row is simply never returned.
    await assertContentAllowed(input());
    expect(m.ruleFindAll.mock.calls[0][0].where).toHaveProperty('asset_id', 'asset-1');
  });

  it('scopes the lookup to this brand, tenant AND asset', async () => {
    // The query-shape control: without the brand in the WHERE, another brand's
    // declaration could approve this brand's content.
    await assertContentAllowed(input());
    expect(m.ruleFindAll.mock.calls[0][0].where).toEqual({
      brand_id: 'b-train',
      tenant_id: 't-col',
      asset_id: 'asset-1',
    });
  });
});

describe('it fails closed, and says nothing a log should not carry', () => {
  it('a declaration lookup that throws refuses', async () => {
    m.ruleFindAll.mockRejectedValue(new Error('connection reset'));
    const v = await assertContentAllowed(input());
    expect(v).toEqual({ allowed: false, reason: 'content_rule_lookup_failed', rule_id: null });
  });

  it('logs the failure with ids only, through redactForLogs', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    m.ruleFindAll.mockRejectedValue(new Error('learner@example.com could not be read'));
    await assertContentAllowed(input());
    const line = String(warn.mock.calls[0]?.[0] ?? '');
    expect(line).toContain('growth_journey.content_rule_lookup_failed');
    expect(line).not.toContain('learner@example.com');
    warn.mockRestore();
  });

  it('an offer resolver that throws is not swallowed into an allow', async () => {
    // `resolveOfferEligibility` already denies on its own lookup failure, so the
    // only way an exception reaches here is a programming error — and it must
    // not become a permissive answer.
    m.resolveOfferEligibility.mockRejectedValue(new Error('boom'));
    await expect(assertContentAllowed(input())).rejects.toThrow('boom');
  });
});

describe('Explorer does not go through this gate', () => {
  it('no file under explorerGrowth imports it, by module name OR by symbol', () => {
    // If Explorer's resolver consulted this gate, every one of its learners would
    // lose their content immediately, because `approved_content_ready` is false
    // for every policy row in production. This is the structural half of the
    // header's claim.
    //
    // BOTH the module name and the exported symbols are matched. T305's verifier
    // walked through the filename-only version with a one-line renaming
    // re-export shim outside this tree - the same laundering shape T304's
    // verifier found - and a consumer that renames the import still has to call
    // the function by one of these names. What this cannot see, stated rather
    // than implied: a shim that also renames the FUNCTION (`export { x as y }`)
    // and is itself outside `explorerGrowth/`. The binding proof there is
    // narrower and stronger - `resolveContentAssets` has exactly two live call
    // sites and neither touches this gate.
    const NAMES = [/contentEligibility/, /assertContentAllowed/, /ContentVerdict/];
    const root = path.join(__dirname, '..', '..', 'explorerGrowth');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(p);
        } else if (entry.name.endsWith('.ts')) {
          const src = fs.readFileSync(p, 'utf8');
          if (NAMES.some((rx) => rx.test(src))) offenders.push(entry.name);
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });

  it('the scan is not vacuous: it really walked the Explorer tree', () => {
    const root = path.join(__dirname, '..', '..', 'explorerGrowth');
    expect(fs.existsSync(path.join(root, 'content', 'resolveContentAssets.ts'))).toBe(true);
  });
});
