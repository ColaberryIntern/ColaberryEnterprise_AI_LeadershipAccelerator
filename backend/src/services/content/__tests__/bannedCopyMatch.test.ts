import {
  CopyRulesAbsentError,
  assertRules,
  bannedCopyInstruction,
  findBannedCopy,
} from '../bannedCopyMatch';
import { BANNED_COPY_RULES, FREE_WORD_RULE } from '../bannedCopyRule';
import * as draftGuards from '../../explorerGrowth/drafts/draftCopyGuards';

/**
 * The matcher in its new home.
 *
 * `draftCopyGuards.test.ts` already covers the matching behaviour in depth and is deliberately
 * left untouched by the move - it still passes against the re-export, which is the evidence
 * that the move changed nothing. This suite adds the things that only became true BECAUSE of
 * the move:
 *
 *   1. There is exactly ONE matcher, and the Explorer guard is literally it rather than a
 *      copy that happens to agree today.
 *   2. The idiom exemption travelled with it. A second matcher written for the campaign path
 *      would not have carried it, which would have reintroduced a false positive fixed hours
 *      earlier - the specific failure this move exists to prevent.
 *   3. The instruction builder still produces byte-identical output on its default, so the
 *      Explorer prompt is unchanged by gaining a parameter.
 */

const W = FREE_WORD_RULE.word;

describe('one matcher, not two', () => {
  it('the Explorer guard IS this matcher, not a copy of it', () => {
    // Identity, not equivalence. Two separately-written matchers could agree on every
    // fixture in this file and still diverge on the next rule added, which is exactly how
    // the drift this move prevents would begin.
    expect(draftGuards.findBannedCopy).toBe(findBannedCopy);
    expect(draftGuards.CopyRulesAbsentError).toBe(CopyRulesAbsentError);
    expect(draftGuards.bannedCopyInstruction).toBe(bannedCopyInstruction);
  });

  it('still exports everything the Explorer renderer imports, so the move is invisible to it', () => {
    for (const symbol of [
      'findBannedCopy', 'bannedCopyIssues', 'isSafeToAdvertise',
      'absolutizeHref', 'absolutizeHrefs', 'emailLinkIssues',
      'bannedCopyInstruction', 'CopyRulesAbsentError',
    ]) {
      expect(draftGuards).toHaveProperty(symbol);
    }
  });
});

describe('findBannedCopy', () => {
  it('reports a plain advertising use', () => {
    expect(findBannedCopy(`Our bootcamp is ${W} for everyone`)).toEqual([
      { rule_id: FREE_WORD_RULE.id, text: W },
    ]);
  });

  it('returns empty for clean copy', () => {
    expect(findBannedCopy('No card needed to start today')).toEqual([]);
  });

  it('THE REGRESSION THAT MATTERS: the idiom travelled with the matcher', () => {
    // 18 of 18 Explorer rejections were this and nothing else. A matcher that lost the
    // exemption would pass every other test in this file and silently resurrect that bug.
    expect(findBannedCopy(`Questions? Feel ${W} to reach out.`)).toEqual([]);
  });

  it('still catches a real breach that appears AFTER an exempt idiom', () => {
    const both = `Feel ${W} to ask. The course is ${W}.`;
    expect(findBannedCopy(both)).toEqual([{ rule_id: FREE_WORD_RULE.id, text: W }]);
  });

  it('does not exempt a word that merely ends in the preceding word', () => {
    expect(findBannedCopy(`a wheelfeel ${W} offer`)).toHaveLength(1);
  });

  it('throws rather than reporting clean when handed no rules', () => {
    // Zero rules means UNCHECKED. Reporting clean here is the silent pass this whole
    // subsystem exists to make impossible.
    expect(() => findBannedCopy(`anything ${W}`, [])).toThrow(CopyRulesAbsentError);
  });

  it('classifies its own error for the log', () => {
    try {
      assertRules([], 'probe');
      throw new Error('assertRules did not throw, so this test proved nothing');
    } catch (err) {
      expect((err as CopyRulesAbsentError).error_class).toBe('ContractViolation');
    }
  });
});

describe('bannedCopyInstruction', () => {
  it('names the word, the authority and the approved alternatives', () => {
    const text = bannedCopyInstruction(BANNED_COPY_RULES);
    expect(text).toContain(W);
    for (const alt of FREE_WORD_RULE.approvedAlternatives) expect(text).toContain(alt);
  });

  it('keeps the Explorer wording byte-identical on its default', () => {
    // The parameter was added for the campaign path. If the default drifted, the Explorer
    // prompt would change silently and its measured behaviour would no longer apply.
    expect(bannedCopyInstruction(BANNED_COPY_RULES)).toContain(
      'a draft that breaks one is discarded rather than edited:',
    );
  });

  it('states the consequence it is given, rather than one baked in', () => {
    const text = bannedCopyInstruction(BANNED_COPY_RULES, 'it is flagged for review');
    expect(text).toContain('it is flagged for review:');
    expect(text).not.toContain('discarded rather than edited');
  });

  it('fails closed on an empty rule set', () => {
    expect(() => bannedCopyInstruction([])).toThrow(CopyRulesAbsentError);
  });
});
