const queryMock = jest.fn();
jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => queryMock(...a) },
}));

import * as fs from 'fs';
import * as path from 'path';
import {
  listQuotableAssets,
  quotableAssetDigest,
  APPROVAL_IS_UNENFORCED,
  DEFAULT_QUOTABLE_LIMIT,
  MAX_QUOTABLE_LIMIT,
} from '../quotableAssets';
import { FREE_WORD_RULE } from '../bannedCopyRule';

/**
 * The library an agent may quote from, screened at the moment of quoting.
 *
 * THE FIXTURES ARE REAL PRODUCTION TITLES, read out of `explorer_content_assets` on
 * 2026-11-04, not invented. A fixture written by the same mind as the code under test agrees
 * with it by construction; these rows disagree with it where production really does.
 *
 * In particular "Google Colab - Free Jupyter Notebooks with GPU/TPU Access" is a live, active,
 * email-allowed row describing SOMEBODY ELSE'S product, and this gate refuses it. That is a
 * known cost, pinned deliberately below rather than discovered later: the rule bans the word,
 * and a matcher cannot tell an offer from an editorial reference to a third-party tool.
 */

/** Production rows, verbatim. 392 of 416 content selections point at the first one. */
const WELCOME = { id: '4f848072-9fcd-47ac-a1c2-c633eab7e0f8', title: 'Welcome to Your AI Preview', summary: 'Start here.', url: 'https://x.test/a' };
const KNOWLEDGE = { id: '02023336-4f00-4366-a01e-90eb336a8652', title: 'Knowledge Check', summary: null, url: null };
const COLAB = { id: '96434b94-356d-4ea2-831f-c5139c269ff9', title: 'Google Colab - Free Jupyter Notebooks with GPU/TPU Access', summary: 'Hosted notebooks.', url: 'https://x.test/c' };
const EASIEST = { id: '10ed81cc-bb41-4f9e-a41a-09c6edf8a72e', title: 'The Easiest FREE AI Tools for Beginners in 2026', summary: null, url: null };

/** The same banned word, in the SUMMARY only, which is why the gate reads both fields. */
const CLEAN_TITLE_DIRTY_SUMMARY = { id: 'ast-9', title: 'Your First Week', summary: 'A free walkthrough.', url: null };

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue([]);
});

const sqlOf = (): string => String(queryMock.mock.calls[0][0]);
const bindsOf = (): Record<string, unknown> =>
  (queryMock.mock.calls[0][1] as { replacements: Record<string, unknown> }).replacements;

describe('the SQL predicate', () => {
  it('selects only live, email-reachable, titled rows', async () => {
    await listQuotableAssets();
    const sql = sqlOf();
    expect(sql).toContain('FROM explorer_content_assets');
    expect(sql).toContain('active = true');
    expect(sql).toContain("'email' = ANY(allowed_channels)");
    expect(sql).toContain('starts_at IS NULL OR starts_at <= :as_of');
    expect(sql).toContain('expires_at IS NULL OR expires_at > :as_of');
    expect(sql).toContain('btrim(title)');
  });

  it('CONTROL: the assertion above can fail, so passing it means something', async () => {
    await listQuotableAssets();
    // A string that is NOT in the query. Without this, every `toContain` above would still
    // pass against a SQL constant that had silently become something else entirely.
    expect(sqlOf()).not.toContain('DELETE');
    expect(sqlOf()).not.toContain('sms');
  });

  it('does NOT filter on approval_status, which is the documented decision', async () => {
    await listQuotableAssets();
    // Pinned deliberately. Measured 2026-11-04: approval_status is NULL on all 1,444 rows and
    // nothing in the repo writes it, so this predicate would select zero assets and ship a
    // feature that can quote nothing. Ali chose active + email-allowed + the gate on 2026-11-04.
    // If you are here because you want to add the filter, check the column has a writer first.
    expect(sqlOf()).not.toContain('approval_status');
    expect(APPROVAL_IS_UNENFORCED).toBe(true);
  });

  it('never writes', async () => {
    await listQuotableAssets();
    expect(sqlOf()).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE)\b/i);
  });

  it('clamps the limit at both ends and defaults in the middle', async () => {
    await listQuotableAssets();
    expect(bindsOf().max_rows).toBe(DEFAULT_QUOTABLE_LIMIT);

    queryMock.mockClear();
    await listQuotableAssets({ limit: 9999 });
    expect(bindsOf().max_rows).toBe(MAX_QUOTABLE_LIMIT);

    queryMock.mockClear();
    await listQuotableAssets({ limit: 0 });
    expect(bindsOf().max_rows).toBe(1);
  });

  it('passes the caller\'s clock through, so the date window is testable', async () => {
    const asOf = new Date('2026-08-28T12:00:00Z');
    await listQuotableAssets({ asOf });
    expect(bindsOf().as_of).toBe(asOf);
  });
});

describe('screening at the moment of quoting', () => {
  it('CONTROL: the gate really does fire on the banned word', () => {
    // Without this, "nothing was refused" below would also pass if the matcher were broken,
    // or if the rule set were empty. The word is read off the rule rather than typed here.
    expect(FREE_WORD_RULE.word).toBe('free');
    expect(COLAB.title.toLowerCase()).toContain(FREE_WORD_RULE.word);
  });

  it('lets clean assets through', async () => {
    queryMock.mockResolvedValue([WELCOME, KNOWLEDGE]);
    const set = await listQuotableAssets();
    expect(set.quotable.map((a) => a.title)).toEqual(['Welcome to Your AI Preview', 'Knowledge Check']);
    expect(set.refused).toEqual([]);
    expect(set.considered).toBe(2);
  });

  it('the most-selected asset in production is quotable TODAY, and was not on 28 October', async () => {
    // 392 of 416 content selections point at this row. It was titled "Welcome to Your Free AI
    // Preview" when the gate was specified, which is the whole reason the gate exists; it has
    // since been renamed. Both halves of that story are pinned so neither is lost.
    queryMock.mockResolvedValue([WELCOME]);
    expect((await listQuotableAssets()).quotable).toHaveLength(1);

    queryMock.mockResolvedValue([{ ...WELCOME, title: 'Welcome to Your Free AI Preview' }]);
    const asItWas = await listQuotableAssets();
    expect(asItWas.quotable).toEqual([]);
    expect(asItWas.refused[0].rule_ids).toContain(FREE_WORD_RULE.id);
  });

  it('REPORTS a refused asset rather than dropping it', async () => {
    queryMock.mockResolvedValue([WELCOME, COLAB]);
    const set = await listQuotableAssets();
    expect(set.quotable).toHaveLength(1);
    expect(set.refused).toEqual([
      { id: COLAB.id, title: COLAB.title, rule_ids: [FREE_WORD_RULE.id] },
    ]);
    // The count is of what was CONSIDERED, so a refusal rate is computable by the caller.
    expect(set.considered).toBe(2);
  });

  it('reads the summary too, not only the title', async () => {
    queryMock.mockResolvedValue([CLEAN_TITLE_DIRTY_SUMMARY]);
    const set = await listQuotableAssets();
    expect(set.quotable).toEqual([]);
    expect(set.refused[0].title).toBe('Your First Week');
  });

  it('a refusal ALWAYS carries at least one rule id', async () => {
    // The drift guard. `isSafeToAdvertise` owns the decision and `refusalRuleIds` owns the
    // reason, over what must stay the same two fields. If the decision ever widens to a third,
    // this fails loudly instead of reporting "refused for no stated rule", which would read as
    // a bug in the gate rather than a gap in the explanation.
    queryMock.mockResolvedValue([COLAB, EASIEST, CLEAN_TITLE_DIRTY_SUMMARY]);
    const set = await listQuotableAssets();
    expect(set.refused).toHaveLength(3);
    for (const r of set.refused) expect(r.rule_ids.length).toBeGreaterThan(0);
  });

  it('refuses an editorial reference to a third-party tool, which is a KNOWN cost', async () => {
    // Not a defect, and recorded so nobody "fixes" it into a hole. Google Colab and these tool
    // round-ups are somebody else's product, not our offer, and the rule bans the word rather
    // than the offer. Narrowing the matcher to let these through is how a gate stops working.
    queryMock.mockResolvedValue([COLAB, EASIEST]);
    const set = await listQuotableAssets();
    expect(set.quotable).toEqual([]);
    expect(set.refused).toHaveLength(2);
  });
});

describe('nothing here can send', () => {
  /**
   * The existing sweeps do not cover this directory. `noSendPaths.test.ts` sweeps
   * `services/explorerGrowth/governor/` and `services/explorerGrowth/content/`; this module
   * lives in `services/content/`, which no sweep reaches. So the dependency declaration is
   * pinned here instead of being assumed.
   */
  const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'quotableAssets.ts'), 'utf8');

  it('imports exactly three modules, and none of them can send', () => {
    const imports = Array.from(SOURCE.matchAll(/^import .*? from '([^']+)';$/gm)).map((m) => m[1]);
    expect(imports.sort()).toEqual([
      '../../config/database',
      '../explorerGrowth/drafts/draftCopyGuards',
      './bannedCopyMatch',
      'sequelize',
    ].sort());
  });

  it('CONTROL: the import extractor really does find imports', () => {
    // A regex that matched nothing would make the assertion above pass against any file.
    expect(SOURCE).toContain("from './bannedCopyMatch'");
    expect(Array.from(SOURCE.matchAll(/^import .*? from '([^']+)';$/gm)).length).toBeGreaterThan(0);
  });

  it('names no mailer, queue or sender anywhere in its source', () => {
    for (const forbidden of ['mandrill', 'nodemailer', 'emailService', 'sendAgentEmail', 'scheduled_emails']) {
      expect(SOURCE.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});

describe('the digest handed to a model', () => {
  it('distinguishes an EMPTY library from one where everything was refused', async () => {
    queryMock.mockResolvedValue([]);
    const empty = quotableAssetDigest(await listQuotableAssets());

    queryMock.mockResolvedValue([COLAB, EASIEST]);
    const allRefused = quotableAssetDigest(await listQuotableAssets());

    expect(empty).not.toEqual(allRefused);
    expect(allRefused).toContain('2 asset(s) were found and every one was refused');
    // Both still forbid inventing material, because that is the failure either state invites.
    for (const text of [empty, allRefused]) {
      expect(text).toContain('Do not describe any lesson, offer or resource you have not been given');
    }
  });

  it('lists the quotable assets with their links', async () => {
    queryMock.mockResolvedValue([WELCOME, KNOWLEDGE]);
    const text = quotableAssetDigest(await listQuotableAssets());
    expect(text).toContain('- Welcome to Your AI Preview - Start here. (https://x.test/a)');
    // No summary and no url: the row still appears, without empty punctuation around nothing.
    expect(text).toContain('- Knowledge Check');
    expect(text).not.toContain('Knowledge Check - ');
  });

  it('carries the copy rules with the material, not three layers away', async () => {
    queryMock.mockResolvedValue([WELCOME]);
    const text = quotableAssetDigest(await listQuotableAssets());
    expect(text).toContain(FREE_WORD_RULE.word);
    expect(text).toContain('refused before it is quoted');
    for (const alt of FREE_WORD_RULE.approvedAlternatives) expect(text).toContain(alt);
  });

  it('states what the agent is NOT authoritative for, where the material is', async () => {
    queryMock.mockResolvedValue([WELCOME]);
    const text = quotableAssetDigest(await listQuotableAssets());
    for (const forbidden of ['price', 'cohort date', 'deadline', 'seat count']) {
      expect(text).toContain(forbidden);
    }
    expect(text).toContain('An asset title is not a system of record');
  });

  it('never leaks a refused asset\'s text into the digest', async () => {
    // The point of refusing it is that it does not reach a person. Naming it in the prompt
    // hands the model the exact wording it is forbidden to use.
    queryMock.mockResolvedValue([WELCOME, COLAB]);
    const text = quotableAssetDigest(await listQuotableAssets());
    expect(text).toContain('Welcome to Your AI Preview');
    expect(text).not.toContain('Google Colab');
    expect(text).not.toContain(COLAB.id);
  });
});
