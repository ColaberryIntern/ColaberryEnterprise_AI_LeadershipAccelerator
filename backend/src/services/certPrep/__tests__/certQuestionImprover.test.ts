import fs from 'fs';
import path from 'path';
import { checkInvariants, buildImprovePrompt, ImproverItem } from '../certQuestionImprover';
import { scoreItem } from '../certQuestionRubric';

/**
 * The improver's guarantees, tested without touching the network.
 *
 * The LLM call itself is not mocked and re-asserted here — that proves the mock,
 * not the code. What is worth holding is everything AROUND the call: that a
 * candidate which changes the answer is refused, that the prompt carries the
 * measured targets rather than a hand-copied set, and that this module cannot
 * reach an approval path even if someone later wanted it to.
 */

const item = (over: Partial<ImproverItem> = {}): ImproverItem => ({
  question_key: 'A1',
  domain_id: 'D1',
  objective_id: 'D1.2',
  stem: 'An agent loop runs until the model stops requesting tools.',
  options: [
    { key: 'A', text: 'Isolation' },
    { key: 'B', text: 'Parallelism' },
    { key: 'C', text: 'Cost' },
    { key: 'D', text: 'Latency' },
  ],
  correct_keys: ['A'],
  rationale: 'Isolation is the point.',
  distractor_rationales: { B: 'no', C: 'no', D: 'no' },
  ...over,
});

describe('invariants — a rewrite must not become a different question', () => {
  it('refuses a candidate that changed how many options there are', () => {
    const after = item({ options: [{ key: 'A', text: 'one' }, { key: 'B', text: 'two' }] });
    expect(checkInvariants(item(), after)).toMatch(/option count changed/);
  });

  it('refuses a candidate that changed how many answers are correct', () => {
    // The dangerous one. The rubric measures SHAPE and has no opinion about
    // which option is right, so a silently multi-select answer would score fine.
    const after = item({ correct_keys: ['A', 'B'] });
    expect(checkInvariants(item(), after)).toMatch(/correct count changed/);
  });

  it('refuses a correct key that is not one of the options', () => {
    const after = item({ correct_keys: ['Z'] });
    expect(checkInvariants(item(), after)).toMatch(/not one of the options/);
  });

  it('refuses an empty option or an empty stem', () => {
    expect(checkInvariants(item(), item({ stem: '   ' }))).toMatch(/stem is empty/);
    const blanked = item();
    blanked.options = [...blanked.options.slice(0, 3), { key: 'D', text: '' }];
    expect(checkInvariants(item(), blanked)).toMatch(/option D is empty/);
  });

  it('refuses a wrong option left without an explanation', () => {
    // Otherwise a student who picked it learns only that it lost.
    const after = item({ distractor_rationales: { B: 'no', C: 'no' } });
    expect(checkInvariants(item(), after)).toMatch(/no rationale for wrong option D/);
  });

  it('refuses a candidate that dropped the rationale', () => {
    // `DraftRevisionInput.rationale` is required and the rubric scores whether
    // wrong options are explained, so a candidate without one cannot be written.
    // CI caught this as a type error after a local typecheck I had misread.
    expect(checkInvariants(item(), item({ rationale: null }))).toMatch(/rationale is empty/);
    expect(checkInvariants(item(), item({ rationale: '   ' }))).toMatch(/rationale is empty/);
  });

  it('accepts a genuine rewrite that keeps the shape', () => {
    const after = item({
      stem: 'Monitoring shows the orchestrator context stays flat as researchers are added.',
      options: [
        { key: 'A', text: 'Each researcher spends its own context and returns a condensed finding' },
        { key: 'B', text: 'Subagents run concurrently so the phase finishes sooner' },
        { key: 'C', text: 'Subagents can be retried one at a time after a failure' },
        { key: 'D', text: 'Each subagent may use a cheaper model for simple searches' },
      ],
    });
    expect(checkInvariants(item(), after)).toBeNull();
  });
});

describe('the prompt carries the measured targets, not a hand-copied set', () => {
  it('names the reference numbers from the rubric', () => {
    // If these were retyped here they would drift the first time the rubric
    // moved, and the improver would be aiming at numbers nothing measures.
    const prompt = buildImprovePrompt(item(), scoreItem(item()));
    expect(prompt).toContain('32-88 words');
    expect(prompt).toContain('7-35 words');
    expect(prompt).toContain('exactly 4 options');
  });

  it('tells the model what is wrong, measured, rather than "make it better"', () => {
    const prompt = buildImprovePrompt(item(), scoreItem(item()));
    expect(prompt).toMatch(/WHAT IS WRONG WITH IT, MEASURED/);
    expect(prompt).toMatch(/Stem length/);
  });

  it('forbids changing which answer is correct', () => {
    const prompt = buildImprovePrompt(item(), scoreItem(item()));
    expect(prompt).toMatch(/MUST NOT CHANGE/);
    expect(prompt).toMatch(/which answer is correct/);
  });
});

describe('structural guarantee — this module cannot approve or persist', () => {
  it('imports no approval path and no model', () => {
    // Asserted on the SOURCE with comments stripped, because a doc comment
    // saying "does not import setReviewStatus" contains that string and would
    // satisfy a naive search of the raw file. That exact mistake was made in
    // this repo before.
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'certQuestionImprover.ts'), 'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/setReviewStatus/);
    expect(src).not.toMatch(/CertQuestionRevision/);
    expect(src).not.toMatch(/sequelize/);
  });
});
