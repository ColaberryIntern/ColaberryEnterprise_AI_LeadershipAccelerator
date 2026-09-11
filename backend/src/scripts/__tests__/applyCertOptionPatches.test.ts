import { applyPatch, literal } from '../applyCertOptionPatches';

/**
 * The applier edits source files, so the property that matters is that it
 * changes exactly the literal it was asked to and nothing else — including
 * when the text carries apostrophes, backslashes or a dollar sign.
 */
const file = `
  item('CCARF-D3-01', 'D3', 'D3.1', 'S2', 'medium',
    'A stem that mentions the option text: Split the conventions.',
    [['A', 'Split the conventions into per-directory CLAUDE.md files'],
     ['B', 'Reorganise the root file so it\\'s easier to locate'],
     ['C', 'Shorten the root file'],
     ['D', 'Add a preamble at the top']],
    ['A'],
`;

describe('applyCertOptionPatches', () => {
  it('replaces exactly the quoted literal, not a bare-text mention in the stem', () => {
    const out = applyPatch(file, {
      question_key: 'CCARF-D3-01',
      old_text: 'Split the conventions into per-directory CLAUDE.md files',
      new_text: 'Split the conventions into per-directory CLAUDE.md files so each rule sits with its code',
    });
    expect(out.occurrences).toBe(1);
    expect(out.source).toContain("['A', 'Split the conventions into per-directory CLAUDE.md files so each rule sits with its code']");
    expect(out.source).toContain('A stem that mentions the option text: Split the conventions.');
  });

  it('matches an apostrophe as the file escapes it', () => {
    const out = applyPatch(file, {
      question_key: 'CCARF-D3-01',
      old_text: "Reorganise the root file so it's easier to locate",
      new_text: "Reorganise the root file so it's easier to locate, and say who owns each section",
    });
    expect(out.occurrences).toBe(1);
    expect(out.source).toContain("['B', 'Reorganise the root file so it\\'s easier to locate, and say who owns each section']");
  });

  it('does not expand $& in the replacement', () => {
    const out = applyPatch(file, { question_key: 'k', old_text: 'Shorten the root file', new_text: 'Cap the budget at $500 & stop' });
    expect(out.source).toContain("['C', 'Cap the budget at $500 & stop']");
  });

  it('refuses a literal that is absent or repeated', () => {
    expect(applyPatch(file, { question_key: 'k', old_text: 'not here', new_text: 'x' }).occurrences).toBe(0);
    const twice = file + file;
    const out = applyPatch(twice, { question_key: 'k', old_text: 'Shorten the root file', new_text: 'x' });
    expect(out.occurrences).toBe(2);
    expect(out.source).toBe(twice);
  });

  it('escapes backslashes and quotes when building the literal', () => {
    expect(literal("it's a \\ path")).toBe("'it\\'s a \\\\ path'");
  });
});
