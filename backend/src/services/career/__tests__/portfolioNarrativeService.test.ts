/**
 * portfolioNarrativeService — the pure parts, and the refusals.
 *
 * The generation call itself is not unit-tested against a live model; what is tested is
 * everything that decides WHETHER to generate and whether the result may be published.
 * Those are the parts that keep a model from putting a claim on a student's page that the
 * student cannot defend.
 */
import {
  hasEnoughToSay,
  buildEvidenceBlock,
  validateNarrative,
  type NarrativeInput,
} from '../portfolioNarrativeService';

const skill = (label: string, ...basis: string[]) =>
  ({ skill_id: 'system_design' as const, label, basis });

const input = (over: Partial<NarrativeInput> = {}): NarrativeInput => ({
  full_name: 'Emmanuel Sane',
  project: { name: 'CoreOps', problem: 'Manual intake took three days', what_it_does: 'Routes intake' },
  skills: [skill('System design', 'Built both a server and a client surface')],
  signals: null,
  ...over,
});

describe('hasEnoughToSay', () => {
  it('is false when there is nothing but a name', () => {
    expect(hasEnoughToSay(input({ project: null, skills: [] }))).toBe(false);
  });

  it('is false for one skill and no project facts', () => {
    // A paragraph built from a single observation says nothing, and saying nothing at
    // length is worse than silence on a page whose value is that it can be believed.
    expect(hasEnoughToSay(input({ project: null }))).toBe(false);
  });

  it('is true for two skills, or one skill plus a real project', () => {
    expect(hasEnoughToSay(input({ project: null, skills: [skill('A', 'x'), skill('B', 'y')] })))
      .toBe(true);
    expect(hasEnoughToSay(input())).toBe(true);
  });

  it('does not throw when skills is junk', () => {
    expect(() => hasEnoughToSay(input({ skills: undefined as any }))).not.toThrow();
    expect(hasEnoughToSay(input({ skills: 'nope' as any, project: null }))).toBe(false);
  });
});

describe('buildEvidenceBlock', () => {
  it('hands over the project facts and the skill bases, and nothing else', () => {
    const block = buildEvidenceBlock(input({
      project: { name: 'CoreOps', organization: 'Oklahoma Turnpike Authority', problem: 'Manual intake' },
      skills: [skill('Governance', 'Built a governance engine')],
      signals: {
        languages: [{ name: 'TypeScript', files: 108 }],
        structure: ['backend', 'frontend'],
        practices: {
          containerised: true, tested: true, documented: false,
          continuous_integration: false, typed: true, full_stack: true,
        },
        file_count: 277,
      },
    }));
    expect(block).toContain('CoreOps');
    expect(block).toContain('Oklahoma Turnpike Authority');
    expect(block).toContain('TypeScript (108 files)');
    expect(block).toContain('Built a governance engine');
    // Only observed practices are named; the false ones are not offered as absences for
    // the model to editorialise about.
    expect(block).toContain('containerised');
    expect(block).not.toContain('documented');
  });

  it('omits absent facts rather than sending empty labels', () => {
    const block = buildEvidenceBlock(input({ project: { name: 'CoreOps' }, signals: null }));
    expect(block).toContain('Project: CoreOps');
    expect(block).not.toContain('Built for:');
    expect(block).not.toContain('Sector:');
  });

  it('never includes an assessment count', () => {
    // The band this feature replaces. It must not reach the model either, or the model
    // will happily write "240 pieces of evidence" back out as prose.
    const block = buildEvidenceBlock(input()).toLowerCase();
    for (const w of ['evidence_count', 'pieces of evidence', 'proficiency', 'confidence']) {
      expect(block).not.toContain(w);
    }
  });
});

describe('validateNarrative — reject, never repair', () => {
  it('accepts plain prose', () => {
    const text = 'Emmanuel built CoreOps, a system that routes intake automatically.\n\n'
      + 'The repository contains a server and a client surface, with tests committed.';
    expect(validateNarrative(text)).toEqual({ narrative: text });
  });

  it('rejects anything that is not a non-empty string', () => {
    for (const bad of [null, undefined, 42, {}, [], '', '   ']) {
      expect(validateNarrative(bad as any).narrative).toBeNull();
    }
  });

  it('rejects output over the character ceiling', () => {
    // Past this it stops being a summary and becomes filler that buries the artefacts.
    expect(validateNarrative('x'.repeat(901)).reason).toBe('malformed');
    expect(validateNarrative('x'.repeat(899)).narrative).not.toBeNull();
  });

  it('rejects markup rather than stripping it', () => {
    // A model that returned headings was not following instruction. Silently reshaping
    // its output would publish prose nobody inspected in the form it will appear.
    for (const bad of [
      '# A heading\n\nSome prose.',
      '- a bullet\n- another',
      'See [the repo](https://github.com/x/y).',
      'Visit https://example.com for more.',
      '* starred bullet',
    ]) {
      expect(validateNarrative(bad)).toEqual({ narrative: null, reason: 'malformed' });
    }
  });

  it('does not mistake a hyphen mid-sentence for a bullet', () => {
    const text = 'He built an intake router - it replaced a manual process.';
    expect(validateNarrative(text).narrative).toBe(text);
  });
});
