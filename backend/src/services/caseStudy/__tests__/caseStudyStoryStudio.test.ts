/**
 * Story Studio — the six properties this feature is not allowed to lose.
 *
 * WHAT THIS SUITE IS FOR. Checkpoint C added an AI drafting path to a system
 * whose publish gate exists because it once shipped invented client
 * quotations. The six assertions below are not a summary of the feature; they
 * are the six ways it could betray that history, each written so that the
 * mechanism preventing it has to be REMOVED for the test to pass.
 *
 *   1. AI cannot publish.
 *   2. AI-generated text cannot reach a public projection unapproved.
 *   3. A chart cannot carry its own numbers.
 *   4. A quote without consent cannot publish.
 *   5. Storyline text never becomes a verified claim.
 *   6. An approved published snapshot does not mutate when a draft changes.
 *
 * PURE AND STATIC WHERE POSSIBLE. Several of these are proved by reading the
 * SOURCE TEXT of the modules that would have to change, in the style of this
 * repository's existing contract suites — because the property is "there is no
 * code path", and the only honest way to assert the absence of a path is to
 * look for it. Every source-reading assertion carries a NON-VACUITY check, so a
 * grep that matches nothing because the file moved cannot pass silently.
 *
 * `jest.ci.config.ts` excludes suites that open a database. This one opens
 * none: it imports pure functions and reads files.
 */
/**
 * THE MODEL LAYER IS MOCKED TO NOTHING, AND THAT IS DELIBERATE.
 *
 * One assertion below imports `caseStudyAiDraftStore` to prove its actor guard
 * really fires. That module imports `../../models`, which instantiates every
 * Sequelize model in the repository — 25 seconds of module loading, and with no
 * `DATABASE_URL` configured it is exactly the class of import that put 25 other
 * suites on `jest.ci.config.ts`'s ignore-list. A guard that lands on that list
 * never runs in CI, which is how the 2026-08-22 model-parity bug survived.
 *
 * So the model layer is stubbed and this suite stays pure: it reads source text
 * and calls pure functions, opens no connection, and is therefore eligible to
 * run on every pull request. The stub is empty because nothing here touches a
 * model — the actor guard rejects before any query is reached, which is itself
 * part of what the test proves.
 */
jest.mock('../../../models', () => ({}));
jest.mock('../../../config/database', () => ({
  sequelize: { query: jest.fn().mockResolvedValue([]) },
}));

import fs from 'fs';
import path from 'path';
import {
  quoteHasConsent, quoteIsPublishable, STORY_ELEMENT_STATUS_META, STORY_ELEMENT_STATUSES,
  isPublishableStatus, REPO_STRUCTURAL_LIMITS,
} from '../../../types/caseStudyStory';
import type { CaseStudyQuote } from '../../../types/caseStudyStory';
import { generateStoryDraft, PROPOSABLE_PATHS } from '../caseStudyStoryDraftGenerator';
import { classifyAiForbiddenPath } from '../caseStudyProvenance';
import { collectNarrative } from '../caseStudyPublishClaimScan';

const SERVICES = path.join(__dirname, '..');
const SRC = path.join(__dirname, '..', '..', '..');
const read = (rel: string): string => fs.readFileSync(path.join(SRC, rel), 'utf8');

/* ══════════════════════════ 1. AI CANNOT PUBLISH ══════════════════════════ */

describe('1. AI cannot publish', () => {
  it('the draft store never imports a publish, approve or projection module', () => {
    const source = read('services/caseStudy/caseStudyAiDraftStore.ts');
    const imports = source.split('\n').filter((l) => /^\s*import /.test(l)).join('\n');

    // Non-vacuity: the file must actually have imports, or this passes by
    // examining an empty string.
    expect(imports.length).toBeGreaterThan(100);

    expect(imports).not.toContain('caseStudyPublicationService');
    expect(imports).not.toContain('caseStudyPublicProjection');
    expect(imports).not.toContain('caseStudyPublishGate');
    expect(imports).not.toMatch(/publishCaseStudy|approveSnapshot/);
  });

  it('the generator writes nothing at all — it imports no model and no store', () => {
    const source = read('services/caseStudy/caseStudyStoryDraftGenerator.ts');
    const imports = source.split('\n').filter((l) => /^\s*import /.test(l)).join('\n');
    expect(imports.length).toBeGreaterThan(50);
    expect(imports).not.toContain('../../models');
    expect(imports).not.toContain('caseStudyAiDraftStore');
    expect(imports).not.toContain('caseStudySnapshotStore');
  });

  it('no Studio route publishes, approves or unpublishes', () => {
    const source = read('routes/admin/caseStudyStudioRoutes.ts');
    // Non-vacuity: it must really be the routes file.
    expect(source).toContain("router.post('/api/admin/case-studies/:id/story-draft'");
    expect(source).not.toContain('publishCaseStudy');
    expect(source).not.toContain('unpublishCaseStudy');
    expect(source).not.toContain('approveSnapshot');
  });

  /**
   * ASSERTED AGAINST THE SOURCE RATHER THAN BY CALLING IT, AND THE TRADE IS
   * WORTH NAMING.
   *
   * The behavioural version — import `promoteDraft`, call it with a blank
   * actor, expect a ValidationError — is a better test in isolation. It cannot
   * be had cheaply here: `caseStudyAiDraftStore` imports
   * `caseStudyAdminStore`, which imports `models/CaseStudy` DIRECTLY rather
   * than through the barrel, so mocking the barrel does not stop Sequelize
   * initialising, and with no `DATABASE_URL` the import throws. Making it work
   * would mean mocking nine model modules by path, and the suite would then be
   * one refactor away from landing on `jest.ci.config.ts`'s ignore-list — where
   * it would stop running on pull requests entirely.
   *
   * A guard that runs on every PR and reads the source beats a better guard
   * that CI skips. The structure it checks is specific: the guard must come
   * FIRST in the function, before any row is loaded, so a blank actor cannot
   * reach a database at all.
   */
  it('promotion refuses a blank actor before it loads anything', () => {
    const source = read('services/caseStudy/caseStudyAiDraftStore.ts');
    const fn = source.slice(
      source.indexOf('export async function promoteDraft'),
      source.indexOf('export async function rejectDraft'),
    );
    expect(fn.length).toBeGreaterThan(500); // non-vacuity

    const guardAt = fn.indexOf('input.actor.trim().length === 0');
    const firstQueryAt = fn.indexOf('DraftModel.findOne');
    expect(guardAt).toBeGreaterThan(-1);
    expect(firstQueryAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(firstQueryAt);
    expect(fn).toContain("'ValidationError'");

    // And `actor` has no default anywhere in the signature, so there is no
    // service-account fallback a caller could rely on.
    expect(fn).not.toMatch(/actor\s*[:=]\s*['"`]/);
  });
});

/* ══════ 2. AI TEXT CANNOT REACH A PUBLIC PROJECTION UNAPPROVED ══════ */

describe('2. AI-generated text cannot reach a public projection unapproved', () => {
  it('the public projection never reads the AI draft table', () => {
    const projection = read('services/caseStudy/caseStudyPublicProjection.ts');
    const sections = read('services/caseStudy/caseStudyPublicSections.ts');
    const store = read('services/caseStudy/caseStudyPublicStore.ts');

    // Non-vacuity: these are really the projection modules.
    expect(projection).toContain('caseStudyPublicProjection');
    expect(sections.length).toBeGreaterThan(1000);

    for (const source of [projection, sections, store]) {
      expect(source).not.toContain('CaseStudyAiDraft');
      expect(source).not.toContain('case_study_ai_drafts');
      expect(source).not.toContain('caseStudyAiDraftStore');
    }
  });

  it('the generator refuses every one of the six forbidden field classes', async () => {
    const forbidden = [
      'heroMetrics[0].valueDisplay',
      'identity.organizationDisplayName',
      'identity.productionStatus',
      'contributors[0].consentRecordedAt',
      'measurement.metrics[0].methodology',
      'situation.quote',
    ];
    // Non-vacuity: each of these must genuinely classify as forbidden, or the
    // refusal below would be proving something about the allowlist instead.
    for (const p of forbidden) expect(classifyAiForbiddenPath(p)).not.toBeNull();

    const result = await generateStoryDraft({
      recordTitle: 'Test record',
      storyline: null,
      proofs: [],
      engine: async () => forbidden.map((p) => ({
        path: p, value: 'a plausible sentence', rationale: 'because',
      })),
    });

    expect(result.proposals).toEqual([]);
    expect(result.refused).toHaveLength(forbidden.length);
  });

  it('the proposable allowlist contains no forbidden path', () => {
    expect(PROPOSABLE_PATHS.length).toBeGreaterThan(3);
    for (const p of PROPOSABLE_PATHS) {
      expect(classifyAiForbiddenPath(p)).toBeNull();
    }
  });

  it('"generated" is not a publishable status, and the vocabulary is exactly five words', () => {
    expect(STORY_ELEMENT_STATUSES).toHaveLength(5);
    expect(isPublishableStatus('generated')).toBe(false);
    expect(isPublishableStatus('needs_evidence')).toBe(false);
    expect(isPublishableStatus('hidden')).toBe(false);
    expect(isPublishableStatus('verified')).toBe(true);
    expect(isPublishableStatus('human_approved')).toBe(true);
    expect(Object.keys(STORY_ELEMENT_STATUS_META).sort())
      .toEqual([...STORY_ELEMENT_STATUSES].sort());
  });

  it('the claim scan now reaches the structured free-text fields it used to miss', () => {
    const paths = collectNarrative({
      identity: { standfirst: 'x', summary: 'y', programLabel: 'a programme' },
      heroMetrics: [{
        key: 'k', label: 'a label', valueDisplay: '40%',
        measurement: { methodology: 'measured 40% faster', limitations: ['a limit'] },
      }],
      measurement: { metrics: [{ key: 'm', label: 'another label' }] },
      architecture: { integrations: ['an integration'], dataStores: ['a store'] },
      contributors: [{ role: 'a role' }],
    } as never).map((t) => t.path);

    // Non-vacuity, and the point of the change: these were UNSCANNED before.
    expect(paths).toContain('heroMetrics[0].measurement.methodology');
    expect(paths).toContain('heroMetrics[0].label');
    expect(paths).toContain('identity.programLabel');
    expect(paths).toContain('contributors[0].role');
    expect(paths).toContain('architecture.dataStores[0]');
    expect(paths).toContain('heroMetrics[0].measurement.limitations[0]');

    // And the deliberate exclusion still holds: valueDisplay is the verified
    // figure itself, and scanning it would report every metric as an unbacked
    // claim about itself.
    expect(paths).not.toContain('heroMetrics[0].valueDisplay');
  });
});

/* ══════════════ 3. A CHART CANNOT CARRY ITS OWN NUMBERS ══════════════ */

describe('3. A chart cannot carry its own numbers', () => {
  const VALUE_BEARING = /\b(values|data|numbers|series|datapoints|numericValue|value_display)\b/i;

  it('the chart DDL declares no value-bearing column', () => {
    const ddl = read('db/ensureCaseStudyStoryAssets.ts');
    const table = ddl.slice(
      ddl.indexOf('CREATE TABLE IF NOT EXISTS case_study_charts'),
      ddl.indexOf('cs_charts_by_case_study'),
    );
    // Non-vacuity: we really extracted the chart table and it really has columns.
    expect(table).toContain('metric_keys');
    expect(table).toContain('chart_type');
    expect(table.length).toBeGreaterThan(200);

    const columnLines = table.split('\n')
      .filter((l) => /^\s+[a-z_]+\s+(UUID|VARCHAR|TEXT|BOOLEAN|TIMESTAMPTZ|INTEGER)/.test(l));
    expect(columnLines.length).toBeGreaterThan(5);
    for (const line of columnLines) {
      // `metric_keys` is the reference list, not a value list.
      if (line.includes('metric_keys')) continue;
      expect(line).not.toMatch(VALUE_BEARING);
    }
  });

  it('the chart model declares no value attribute', () => {
    const model = read('models/CaseStudyChart.ts');
    expect(model).toContain("tableName: 'case_study_charts'");
    const init = model.slice(model.indexOf('CaseStudyChart.init('));
    expect(init.length).toBeGreaterThan(200);
    expect(init).not.toMatch(/^\s*(values|data|series|numbers)\s*:/m);
  });

  it('the chart request schema is strict, so an extra values key is a 400', () => {
    const routes = read('routes/admin/caseStudyStudioRoutes.ts');
    const schema = routes.slice(
      routes.indexOf('const chartBody = z.object('),
      routes.indexOf('const chartApprovalBody'),
    );
    expect(schema).toContain('metricKeys');
    expect(schema).toContain('.strict()');
    expect(schema).not.toMatch(/values\s*:/);
  });

  it('the chart type carries metric KEYS and nothing numeric', () => {
    const types = read('types/caseStudyStory.ts');
    const iface = types.slice(
      types.indexOf('export interface CaseStudyChartSpec'),
      types.indexOf('/* ────────────────────────────────────────────────── the repo proof ──── */'),
    );
    expect(iface).toContain('metricKeys');
    expect(iface.length).toBeGreaterThan(100);
    expect(iface).not.toMatch(/readonly (values|data|series|numbers)\b/);
  });
});

/* ═══════════ 4. A QUOTE WITHOUT CONSENT CANNOT PUBLISH ═══════════ */

describe('4. A quote without consent cannot publish', () => {
  const base = {
    id: 'q1', caseStudyId: 'c1', text: 'They did good work.',
    source: 'client_confirmation' as const,
    verificationClass: 'verified' as const,
    approved: true, reviewedBy: 'reviewer', reviewedAt: null, createdAt: '2026-01-01T00:00:00Z',
  };

  it('a named quote with no consent timestamp is not publishable', () => {
    const quote = {
      ...base,
      attribution: {
        displayMode: 'named', displayName: 'A Person', role: 'CTO',
        kind: 'client_team', consentRecordedAt: '',
      },
    } as unknown as CaseStudyQuote;
    expect(quoteHasConsent(quote)).toBe(false);
    expect(quoteIsPublishable(quote)).toBe(false);
  });

  it('a named quote WITH consent is publishable — so the rule is about consent, not naming', () => {
    const quote = {
      ...base,
      attribution: {
        displayMode: 'named', displayName: 'A Person', role: 'CTO',
        kind: 'client_team', consentRecordedAt: '2026-01-01T00:00:00Z',
      },
    } as unknown as CaseStudyQuote;
    expect(quoteIsPublishable(quote)).toBe(true);
  });

  it('an unapproved quote is not publishable however well attributed', () => {
    const quote = {
      ...base, approved: false,
      attribution: { displayMode: 'anonymous', kind: 'client_team' },
    } as unknown as CaseStudyQuote;
    expect(quoteIsPublishable(quote)).toBe(false);
  });

  it('a pending verification class is not publishable', () => {
    const quote = {
      ...base, verificationClass: 'pending',
      attribution: { displayMode: 'anonymous', kind: 'client_team' },
    } as unknown as CaseStudyQuote;
    expect(quoteIsPublishable(quote)).toBe(false);
  });

  it('the database refuses a named quote with no consent, independently of the type', () => {
    const ddl = read('db/ensureCaseStudyStoryAssets.ts');
    expect(ddl).toContain('cs_quotes_named_requires_consent');
    expect(ddl).toContain("attribution_mode <> 'named'");
    expect(ddl).toContain('consent_recorded_at IS NOT NULL');
  });

  it('nothing in the quote service or its route can generate quote text', () => {
    const service = read('services/caseStudy/caseStudyQuoteService.ts');
    const routes = read('routes/admin/caseStudyStudioRoutes.ts');
    expect(service).toContain('createQuote');
    expect(service).not.toContain('generateStoryDraft');
    expect(service).not.toContain('DraftEngine');
    expect(routes).not.toMatch(/quotes\/generate|generateQuote/);
  });
});

/* ═══ 5. STORYLINE TEXT NEVER BECOMES A VERIFIED CLAIM ═══ */

describe('5. Storyline text never becomes a verified claim', () => {
  it('the storyline table is neither the record nor the snapshot', () => {
    const ddl = read('db/ensureCaseStudyStoryAssets.ts');
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS case_study_storylines');
    // The core ten-table DDL must be untouched by it.
    const core = read('db/ensureCaseStudySchema.ts');
    expect(core.length).toBeGreaterThan(1000);
    expect(core).not.toContain('storyline');
  });

  it('no projection, section builder or claim scan module mentions a storyline', () => {
    for (const rel of [
      'services/caseStudy/caseStudyPublicProjection.ts',
      'services/caseStudy/caseStudyPublicSections.ts',
      'services/caseStudy/caseStudyPublicStore.ts',
      'services/caseStudy/caseStudyPublishClaimScan.ts',
      'services/caseStudy/caseStudySnapshotBuilder.ts',
      'services/caseStudy/caseStudySnapshotSections.ts',
    ]) {
      const source = read(rel);
      expect(source.length).toBeGreaterThan(500); // non-vacuity
      expect(source.toLowerCase()).not.toContain('storyline');
    }
  });

  it('the generator refuses to emit the storyline back as a proposed value', async () => {
    const storyline = 'We want to show that the migration paid for itself in a quarter.';
    const result = await generateStoryDraft({
      recordTitle: 'Test record',
      storyline,
      proofs: [],
      engine: async () => [{
        path: 'identity.summary', value: storyline, rationale: 'echoing the direction',
      }],
    });
    expect(result.proposals).toEqual([]);
    expect(result.refused).toHaveLength(1);
    expect(result.refused[0].reason).toContain('storyline verbatim');
  });

  it('a storyline path is not in the claim scan surface, because it is not in content', () => {
    const paths = collectNarrative({
      identity: { standfirst: 'x' },
      heroMetrics: [],
    } as never).map((t) => t.path);
    expect(paths.length).toBeGreaterThan(0); // non-vacuity
    expect(paths.some((p) => p.includes('storyline'))).toBe(false);
  });
});

/* ═ 6. AN APPROVED PUBLISHED SNAPSHOT DOES NOT MUTATE ON A DRAFT CHANGE ═ */

describe('6. An approved published snapshot does not mutate when a draft changes', () => {
  it('promotion goes through applyHumanOverride, which persists a NEW draft version', () => {
    const store = read('services/caseStudy/caseStudyAiDraftStore.ts');
    expect(store).toContain('applyHumanOverride');
    // It must not reach the snapshot store directly, which is where an in-place
    // mutation would have to be written.
    expect(store).not.toContain('persistCaseStudySnapshot');
    expect(store).not.toContain('CaseStudySnapshotModel');

    const review = read('services/caseStudy/caseStudyAdminReview.ts');
    expect(review).toContain('applyHumanOverride');
    // The override path persists with status 'draft' — never 'approved', and
    // never an update of the row under review.
    const fn = review.slice(review.indexOf('export async function applyHumanOverride'));
    expect(fn.length).toBeGreaterThan(500);
    expect(fn).toContain("status: 'draft'");
  });

  /**
   * COMMENTS ARE STRIPPED FIRST, AND THAT IS THE WHOLE POINT OF THIS TEST.
   *
   * The first version asserted `toContain('updatedAt: false')` over the raw
   * file. `CaseStudySnapshot.ts:13` is a doc comment reading "`updatedAt:
   * false` is therefore load bearing" — so the assertion matched the PROSE
   * ABOUT the option and passed happily with the option itself deleted. It was
   * caught by mutation: removing `updatedAt: false,` from the init options left
   * the suite green.
   *
   * That is precisely the failure class `STORY_STUDIO_TEST_PLAN.md` §1.1 is
   * written against — a test that cannot fail, green, guarding nothing. The
   * repair is structural: strip comments, then look inside the options object
   * rather than anywhere in the file.
   */
  it('the snapshot model is immutable by construction — no updated_at to write', () => {
    const raw = read('models/CaseStudySnapshot.ts');
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments, including the doc header
      .replace(/^\s*\/\/.*$/gm, '');      // line comments

    // Non-vacuity: stripping must leave real code behind, not an empty string.
    expect(code).toContain("tableName: 'case_study_snapshots'");
    expect(code.length).toBeGreaterThan(400);
    // And it must genuinely have removed the prose that fooled the first version.
    expect(raw).toContain('is therefore load');
    expect(code).not.toContain('is therefore load');

    expect(code).toContain('updatedAt: false,');
  });

  it('promoting writes the human as the actor, never the model', () => {
    const store = read('services/caseStudy/caseStudyAiDraftStore.ts');
    const fn = store.slice(store.indexOf('export async function promoteDraft'));
    expect(fn.length).toBeGreaterThan(500);
    expect(fn).toContain('actor: input.actor');
    // The generator's identity is recorded in the NOTE, so the machine's part
    // stays visible without becoming the accountable party.
    expect(fn).toContain('row.generated_by');
    expect(fn).not.toMatch(/actor:\s*row\.generated_by/);
  });
});

/* ═════════════════ supporting: the honesty half is required ═════════════════ */

describe('the repo proof always states what it cannot prove', () => {
  it('declares four structural limits that are properties of git, not of a repo', () => {
    expect(REPO_STRUCTURAL_LIMITS).toHaveLength(4);
    const joined = REPO_STRUCTURAL_LIMITS.join(' ').toLowerCase();
    expect(joined).toContain('business outcome');
    expect(joined).toContain('client or organisation identity');
    expect(joined).toContain('production usage');
  });

  it('the proof builder appends them on every path, including failure', () => {
    const source = fs.readFileSync(path.join(SERVICES, 'caseStudyRepoProof.ts'), 'utf8');
    // Two spread sites: the failure return and the success return. If a third
    // return is ever added without one, this count goes down and fails.
    const spreads = source.split('...REPO_STRUCTURAL_LIMITS').length - 1;
    expect(spreads).toBe(2);
    const returns = source.split('cannotProve:').length - 1;
    expect(returns).toBe(2);
  });
});
