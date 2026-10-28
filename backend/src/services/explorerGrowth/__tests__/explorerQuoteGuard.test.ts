import * as fs from 'fs';
import * as path from 'path';

import {
  scanQuotedCopy,
  wasChecked,
  type QuoteCopyRule,
  type QuotableField,
} from '../explorerQuoteGuard';

// Importing the canonical rule is legal HERE and illegal in the guard itself:
// `bannedCopyScanner` pulls in the TypeScript compiler, a devDependency, and
// `frontendCopyLint.test.ts` fails the build if any non-test file under
// `backend/src` imports it. Pinning the guard to the real rule from the test is
// what lets the guard hold no word list of its own without the two drifting.
import { FREE_WORD_RULE } from '../../content/bannedCopyScanner';

const RULES: QuoteCopyRule[] = [FREE_WORD_RULE];

/**
 * The five titles that actually matched in production on 2026-10-28, out of the
 * 467 active, email-allowed assets. Exactly ONE is a genuine violation. They
 * are written out in full because the ratio is the argument for flagging rather
 * than filtering, and a ratio stated in a comment rots while a list does not.
 */
const PRODUCTION_MATCHES = {
  genuineViolation: 'Welcome to Your Free AI Preview',
  hyphenatedTechnicalTerm: 'Efficient Reasoning with Training-Free Contrastive Decoding',
  otherCompanysProduct: 'Free AI Coding Assistant That Actually Competes With Claude',
  otherCompanysProduct2: 'Google Colab - Free Jupyter Notebooks with GPU/TPU Access',
  otherCompanysTools: 'The Easiest FREE AI Tools for Beginners in 2026',
} as const;

const titleField = (text: string | null | undefined): QuotableField[] => [{ field: 'title', text }];

describe('explorerQuoteGuard', () => {
  describe('the rule it is pinned to', () => {
    it('uses the repo-wide declaration rather than a second copy of the word', () => {
      // If someone edits the canonical rule, this fails here and names the guard
      // as a consumer, which is the whole reason the guard takes rules as data.
      expect(FREE_WORD_RULE.id).toBe('tac-807-172-d-free');
      expect(FREE_WORD_RULE.approvedAlternatives).toEqual(['$0 to start', 'No card needed']);
      expect(FREE_WORD_RULE.reason).toContain('807.172(d)');
    });
  });

  describe('happy path', () => {
    it('flags our own offering, which is the one that actually breaks the rule', () => {
      const result = scanQuotedCopy(titleField(PRODUCTION_MATCHES.genuineViolation), RULES);

      expect(result.rulesApplied).toBe(1);
      expect(wasChecked(result)).toBe(true);
      expect(result.flags).toHaveLength(1);
      expect(result.flags[0].ruleId).toBe('tac-807-172-d-free');
      expect(result.flags[0].field).toBe('title');
      expect(result.flags[0].matched).toBe('Free');
      expect(result.flags[0].approvedAlternatives).toEqual(['$0 to start', 'No card needed']);
    });

    it('reports the matched text with its original casing, so SHOUTED copy is visible', () => {
      const result = scanQuotedCopy(titleField(PRODUCTION_MATCHES.otherCompanysTools), RULES);
      expect(result.flags[0].matched).toBe('FREE');
    });

    it('carries an excerpt, so a reviewer can judge usage without opening the record', () => {
      const result = scanQuotedCopy(titleField(PRODUCTION_MATCHES.genuineViolation), RULES);
      expect(result.flags[0].excerpt).toContain('Welcome to Your Free AI Preview');
    });
  });

  describe('it flags, it does not filter', () => {
    it('flags all five production matches, four of which are legitimate', () => {
      // This is the test that documents the design. A FILTER here would remove
      // four perfectly good references to other companies' products and one
      // hyphenated technical term, and would be wrong four times out of five.
      for (const [label, title] of Object.entries(PRODUCTION_MATCHES)) {
        const result = scanQuotedCopy(titleField(title), RULES);
        expect({ label, flags: result.flags.length }).toEqual({ label, flags: 1 });
      }
    });

    it('flags a hyphenated compound, and that is a known false positive, not a bug', () => {
      // "Training-Free" is a term of art. A hyphen is a word boundary, so the
      // rule fires. Narrowing the matcher to avoid it would also stop it firing
      // on genuinely hyphenated marketing copy, so the human resolves this one.
      const result = scanQuotedCopy(titleField(PRODUCTION_MATCHES.hyphenatedTechnicalTerm), RULES);
      expect(result.flags).toHaveLength(1);
      expect(result.flags[0].matched).toBe('Free');
    });
  });

  describe('boundaries', () => {
    it('does not fire inside a longer word that means something else', () => {
      for (const text of ['freedom of choice', 'freely available', 'carefree afternoons', 'freeform']) {
        const result = scanQuotedCopy(titleField(text), RULES);
        expect({ text, flags: result.flags.length }).toEqual({ text, flags: 0 });
      }
    });

    it('reports every occurrence when the word appears more than once', () => {
      const result = scanQuotedCopy(titleField('Free tools, free advice, free forever'), RULES);
      expect(result.flags).toHaveLength(3);
      expect(result.flags.map((f) => f.matched)).toEqual(['Free', 'free', 'free']);
    });

    it('skips empty, null and undefined text without throwing', () => {
      const result = scanQuotedCopy(
        [
          { field: 'title', text: '' },
          { field: 'summary', text: null },
          { field: 'cta', text: undefined },
        ],
        RULES,
      );
      expect(result.flags).toEqual([]);
      expect(result.rulesApplied).toBe(1);
      expect(wasChecked(result)).toBe(true);
    });

    it('escapes a regex metacharacter in a rule word instead of treating it as a pattern', () => {
      const dotted: QuoteCopyRule = {
        id: 'test-metachar',
        word: 'a.b',
        reason: 'test',
        approvedAlternatives: [],
      };
      expect(scanQuotedCopy(titleField('a.b'), [dotted]).flags).toHaveLength(1);
      // Unescaped, "a.b" as a pattern would also match "axb".
      expect(scanQuotedCopy(titleField('axb'), [dotted]).flags).toHaveLength(0);
    });
  });

  describe('zero rules means unchecked, never clean', () => {
    it('reports rulesApplied 0 and refuses to look checked', () => {
      const result = scanQuotedCopy(titleField(PRODUCTION_MATCHES.genuineViolation), []);

      // No flags, because nothing was applied - and the text plainly violates.
      expect(result.flags).toEqual([]);
      expect(result.rulesApplied).toBe(0);
      // The distinction a caller must branch on.
      expect(wasChecked(result)).toBe(false);
    });
  });

  describe('idempotency', () => {
    it('produces an identical result when run twice on the same input', () => {
      const fields = [
        { field: 'title', text: PRODUCTION_MATCHES.genuineViolation },
        { field: 'summary', text: PRODUCTION_MATCHES.otherCompanysProduct },
      ];
      expect(scanQuotedCopy(fields, RULES)).toEqual(scanQuotedCopy(fields, RULES));
    });

    it('does not mutate the rules or the fields it is given', () => {
      const fields: QuotableField[] = [{ field: 'title', text: PRODUCTION_MATCHES.genuineViolation }];
      const rulesCopy = JSON.parse(JSON.stringify(RULES));
      scanQuotedCopy(fields, RULES);
      scanQuotedCopy(fields, RULES);
      expect(JSON.parse(JSON.stringify(RULES))).toEqual(rulesCopy);
      expect(fields).toEqual([{ field: 'title', text: PRODUCTION_MATCHES.genuineViolation }]);
    });
  });

  describe('what the module is not allowed to reach', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'explorerQuoteGuard.ts'), 'utf8');

    it('does not import the scanner, which would drag a compiler into production', () => {
      // Control first: a mis-aimed read must not be able to pass as a clean scan.
      expect(source).toContain('scanQuotedCopy');
      expect(/(?:from|require\s*\()\s*['"][^'"]*bannedCopyScanner/.test(source)).toBe(false);
    });

    it('imports nothing at all, so it cannot acquire a dependency by accident', () => {
      expect(/^\s*import\s/m.test(source)).toBe(false);
    });

    it('cannot send and cannot write', () => {
      // Looks for an IMPORT, not for the name. The looser "the file mentions it"
      // form is the mistake `frontendCopyLint.test.ts` records failing on a prose
      // mention in a header - and it bit here too: this module's docblock names
      // `brandGovernanceService` and the models deliberately, to explain why it
      // does NOT import them. A substring check would fail on the explanation,
      // and the natural "fix" would be to delete the explanation. A name in a
      // comment cannot send an email; only an import can.
      const importsOf = (spec: string): boolean =>
        new RegExp(`(?:from|require\\s*\\()\\s*['"][^'"]*${spec}`, 'i').test(source);

      // Control: the matcher must be able to return true for something.
      expect(importsOf('anything')).toBe(false);
      expect(/(?:from|require\s*\()\s*['"]/.test("import x from 'models';")).toBe(true);

      for (const forbidden of ['emailService', 'mandrill', 'nodemailer', 'sequelize', 'models']) {
        expect({ forbidden, imported: importsOf(forbidden) }).toEqual({ forbidden, imported: false });
      }
      for (const verb of ['.create(', '.update(', '.destroy(', '.save(']) {
        expect(source).not.toContain(verb);
      }
    });
  });
});
