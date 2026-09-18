import * as fs from 'fs';
import * as path from 'path';

/**
 * T412 - the content-rules tool: dry run by default, a person's flag as the
 * authorisation, and NOT ONE write to `explorer_content_assets`.
 *
 * `sequelize` is mocked at the config boundary (CI has no DATABASE_URL), so the
 * assertions are about the SQL the script sends, the order it sends it in, and
 * what it prints. The source scan is the other half: a table it must not write
 * cannot be written by a file that never names the statement.
 */

const query = jest.fn();
const transaction = jest.fn(async (fn: (t: unknown) => Promise<unknown>) => fn({ id: 'tx' }));
jest.mock('../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => query(...a), transaction: (...a: unknown[]) => transaction(...(a as [never])) } }));

import { applyPlan, assertSafeTarget, loadAssetsByBrandSlug, loadBrands, parseArgs, run } from '../growthJourneyContentRules';
import { buildContentRulesPlan, type PlanAsset, type PlanBrand } from '../../services/growthJourney/content/contentRulesPlan';

const src = fs.readFileSync(path.join(__dirname, '..', 'growthJourneyContentRules.ts'), 'utf8');
/**
 * The scan reads CODE, not prose: the script's header explains at length why it
 * never writes `explorer_content_assets`, and a scan that counts the explanation
 * as the offence is a scan that forbids documenting the rule. Same stripper the
 * admin-routes source test uses.
 */
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const sqlSent = () => query.mock.calls.map((c) => String(c[0]).replace(/\s+/g, ' '));
const PAGE = 'https://training.colaberry.com/free-class';
const BRANDS: PlanBrand[] = [
  { tenant_id: 't-colaberry', brand_id: 'b-training', brand_slug: 'colaberry-training' },
  { tenant_id: 't-flotation', brand_id: 'b-flotation', brand_slug: 'ai-flotation' },
];
const asset = (over: Partial<PlanAsset> & { id: string }): PlanAsset => ({ asset_type: 'LESSON', title: 'Lesson', audience_tags: ['full_access'], active: true, ...over });

beforeEach(() => {
  query.mockReset().mockResolvedValue([]);
  transaction.mockClear();
  delete process.env.DATABASE_URL;
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('the guard and the flags', () => {
  it('no flag at all is a DRY RUN - the tool cannot write by being invoked', () => {
    expect(parseArgs([])).toEqual({ dryRun: true, confirmProduction: false, brandSlug: null, landingPage: null, version: 1 });
    expect(parseArgs(['--brand', 'cpn', '--landing-page', PAGE])).toMatchObject({ dryRun: true, brandSlug: 'cpn', landingPage: PAGE });
    expect(parseArgs(['--confirm-production'])).toMatchObject({ dryRun: false, confirmProduction: true });
    expect(() => parseArgs(['--wat'])).toThrow(/unknown flag/);
    expect(() => parseArgs(['positional'])).toThrow(/unexpected argument/);
    expect(() => parseArgs(['--version', '0'])).toThrow(/positive integer/);
  });

  it('a production-looking DATABASE_URL without --confirm-production is refused; a dry run is always allowed', () => {
    process.env.DATABASE_URL = 'postgres://u:p@host:5432/accelerator_prod';
    expect(() => assertSafeTarget({ dryRun: false, confirmProduction: false, brandSlug: null, landingPage: PAGE, version: 1 })).toThrow(/Refusing to write/);
    expect(() => assertSafeTarget({ dryRun: true, confirmProduction: false, brandSlug: null, landingPage: PAGE, version: 1 })).not.toThrow();
    expect(() => assertSafeTarget({ dryRun: false, confirmProduction: true, brandSlug: null, landingPage: PAGE, version: 1 })).not.toThrow();
    process.env.DATABASE_URL = 'postgres://u:p@localhost:5432/accelerator_dev1';
    expect(() => assertSafeTarget({ dryRun: false, confirmProduction: false, brandSlug: null, landingPage: PAGE, version: 1 })).not.toThrow();
  });
});

describe('the reads', () => {
  it('brands: active only, optionally one slug, as a bound replacement', async () => {
    await loadBrands('cpn');
    expect(sqlSent()[0]).toContain('FROM brands b WHERE b.status = \'active\' AND b.slug = :brandSlug');
    expect(query.mock.calls[0][1]).toMatchObject({ replacements: { brandSlug: 'cpn' } });
    query.mockClear();
    await loadBrands(null);
    expect(sqlSent()[0]).not.toContain(':brandSlug');
  });

  it('assets: only the columns the plan needs - never a body, never a URL - and a brand with no learner programme gets none', async () => {
    query.mockResolvedValueOnce([{ id: 'a-1', asset_type: 'LESSON', title: 'Week 1', audience_tags: ['full_access'], active: true }]);
    query.mockResolvedValueOnce([{ brand_slug: 'colaberry-training' }]);
    const byBrand = await loadAssetsByBrandSlug(BRANDS);
    const assetSql = sqlSent()[0];
    expect(assetSql).toContain('SELECT a.id, a.asset_type, a.title, a.audience_tags, a.active FROM explorer_content_assets a');
    expect(assetSql).not.toMatch(/a\.url|a\.summary|a\.metadata/);
    expect(byBrand['colaberry-training']).toHaveLength(1);
    expect(byBrand['ai-flotation']).toEqual([]);
    expect(sqlSent()[1]).toContain("WHERE p.kind = 'learner'");
  });
});

describe('the write', () => {
  const plan = () => buildContentRulesPlan({
    brands: [BRANDS[0]],
    assetsByBrandSlug: { 'colaberry-training': [asset({ id: 'a-1' }), asset({ id: 'a-2', audience_tags: ['free_preview', 'full_access'] })] },
    landingPageByBrandSlug: { 'colaberry-training': PAGE },
  });

  it('runs in ONE transaction, inserts each rule with ON CONFLICT DO NOTHING on the unique index, and touches no asset', async () => {
    query.mockResolvedValue([{ id: 'r-1' }]);
    const result = await applyPlan(plan());
    expect(transaction).toHaveBeenCalledTimes(1);
    const inserts = sqlSent().filter((s) => s.startsWith('INSERT INTO growth_journey_content_rules'));
    expect(inserts).toHaveLength(2);
    expect(inserts[0]).toContain('ON CONFLICT (brand_id, asset_id, version) WHERE asset_id IS NOT NULL DO NOTHING');
    expect(result).toMatchObject({ rules_created: 2, rules_existing: 0 });
    expect(sqlSent().some((s) => /UPDATE explorer_content_assets|INSERT INTO explorer_content_assets|DELETE FROM explorer_content_assets/.test(s))).toBe(false);
    for (const call of query.mock.calls) expect(call[1]).toMatchObject({ transaction: { id: 'tx' } });
  });

  it('a second run creates nothing: the conflict returns no row and the rule is reported as existing', async () => {
    query.mockResolvedValue([]); // ON CONFLICT DO NOTHING → no RETURNING row; the policy UPDATE likewise
    const result = await applyPlan(plan());
    expect(result.rules_created).toBe(0);
    expect(result.rules_existing).toBe(2);
  });

  it('the policy entry only appends a URL the row does not already carry, and a brand with no policy row is REPORTED, never created', async () => {
    query.mockImplementation(async (sql: string) => (String(sql).startsWith('UPDATE brand_offer_policies') ? [] : String(sql).trim().startsWith('SELECT id FROM brand_offer_policies') ? [] : [{ id: 'r' }]));
    const result = await applyPlan(plan());
    const policySql = sqlSent().find((s) => s.startsWith('UPDATE brand_offer_policies')) as string;
    expect(policySql).toContain('approved_landing_pages @> CAST(:page_json AS jsonb)');
    expect(policySql).toContain("status = 'active'");
    expect(sqlSent().some((s) => s.startsWith('INSERT INTO brand_offer_policies'))).toBe(false);
    expect(result.policy_rows_missing).toEqual(['colaberry-training/learner_free_training', 'colaberry-training/learner_paid_training']);
  });
});

describe('the dry run', () => {
  it('prints the counts and writes nothing at all - no transaction, no INSERT, no UPDATE', async () => {
    query.mockImplementation(async (sql: string) => {
      const s = String(sql);
      if (s.includes('FROM brands b')) return [{ tenant_id: 't-colaberry', brand_id: 'b-training', brand_slug: 'colaberry-training' }];
      if (s.includes('FROM explorer_content_assets')) return [asset({ id: 'a-1' }), asset({ id: 'a-2', audience_tags: ['free_preview', 'full_access'] }), asset({ id: 'a-3', active: false })];
      if (s.includes('FROM journey_programs')) return [{ brand_slug: 'colaberry-training' }];
      return [];
    });
    const lines: string[] = [];
    const code = await run(parseArgs(['--brand', 'colaberry-training', '--landing-page', PAGE, '--dry-run']), (l) => lines.push(l));
    expect(code).toBe(0);
    const text = lines.join('\n');
    expect(text).toContain('colaberry-training: 2 rule(s)');
    expect(text).toContain('learner_free_training: 1');
    expect(text).toContain('learner_paid_training: 1');
    expect(text).toContain('skipped (retired): 1');
    expect(text).toContain('explorer_content_assets touched: 0');
    expect(text).toContain('[dry-run] nothing written');
    expect(transaction).not.toHaveBeenCalled();
    expect(sqlSent().every((s) => s.startsWith('SELECT'))).toBe(true);
    // No asset body, no title, no address in what an operator sees.
    expect(text).not.toContain('Lesson');
    expect(text).not.toContain('@');
  });

  it('no matching brand is exit 2 with the reason, and nothing is written', async () => {
    query.mockResolvedValue([]);
    const lines: string[] = [];
    expect(await run(parseArgs(['--brand', 'nope', '--dry-run']), (l) => lines.push(l))).toBe(2);
    expect(lines.join('\n')).toContain('no active brand matches nope');
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe('the source', () => {
  it('never writes explorer_content_assets and never stamps a brand or family on an asset', () => {
    expect(code).not.toMatch(/UPDATE\s+explorer_content_assets/i);
    expect(code).not.toMatch(/INSERT\s+INTO\s+explorer_content_assets/i);
    expect(code).not.toMatch(/DELETE\s+FROM\s+explorer_content_assets/i);
    // The table is named twice in the code, and both are accounted for: the read, and the line the
    // tool PRINTS to say it touched nothing. A bare count would hide which is which.
    expect(code.match(/explorer_content_assets/g)).toHaveLength(2);
    expect(code).toMatch(/FROM explorer_content_assets a/);
    expect(code).toContain("out('explorer_content_assets touched: 0')");
    // The rule table is the only thing inserted; the policy row is the only thing updated.
    const writes: string[] = [...(code.match(/INSERT INTO (\w+)/g) ?? []), ...(code.match(/UPDATE (\w+)/g) ?? [])];
    expect(writes.sort()).toEqual(['INSERT INTO growth_journey_content_rules', 'UPDATE brand_offer_policies']);
    // And the rule is documented, not merely obeyed - the header says why the table is read-only here.
    expect(src).toMatch(/NEVER writes `explorer_content_assets`/);
  });

  it('lives outside services/explorerGrowth/content and reaches no sync, no mailer, no flags module', () => {
    expect(fs.existsSync(path.join(__dirname, '..', 'growthJourneyContentRules.ts'))).toBe(true);
    expect(code).not.toMatch(/syncTimelineCards|retireMissingCards|explorerGrowth\/content/);
    expect(code).not.toMatch(/emailService|mandrill|sendNewLeadAlert|enrollLeadInSequence|notify|axios|fetch\(/);
    expect(code).not.toMatch(/isGrowthJourneyCapabilityEnabled|growthJourneyEnabled|isExplorerFeatureEnabled/);
    // Matched on `from '...'` rather than `^import ... from '...'`: the script's import block is
    // multi-line, and the line-anchored form would match nothing and pass on an empty list.
    const imports = Array.from(code.matchAll(/from '([^']+)';/g)).map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.sort()).toEqual(['../config/database', '../services/growthJourney/content/contentRulesPlan', 'sequelize']);
  });
});
