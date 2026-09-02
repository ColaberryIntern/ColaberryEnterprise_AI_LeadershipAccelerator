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
  extractStatedPurpose,
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

describe('editorialising — one bounded repair, everything else rejected', () => {
  it('strips the reflexive adjective and keeps the claim', () => {
    // Measured: 3 of 4 real generations were rejected on "comprehensive" alone, despite
    // the prompt banning it by name. Deleting the adjective cannot introduce a claim, it
    // can only remove one, which is why this single repair is safe.
    expect(validateNarrative('He built a comprehensive test suite.').narrative)
      .toBe('He built a test suite.');
    expect(validateNarrative('It has an extensive evaluation harness.').narrative)
      .toBe('It has an evaluation harness.');
    expect(validateNarrative('Robust logging was added.').narrative)
      .toBe('logging was added.');
  });

  it('rejects any OTHER unearnable word rather than stripping it', () => {
    // A general strip would mean publishing prose reshaped by code nobody read.
    for (const bad of [
      'The work shows a commitment to quality.',
      'A meticulous approach to testing.',
      'He is a proficient engineer.',
      'Showcasing his ability to ship.',
      'An elegant solution to intake.',
    ]) {
      expect(validateNarrative(bad)).toEqual({ narrative: null, reason: 'editorialised' });
    }
  });

  it('still rejects markup, before any repair is attempted', () => {
    expect(validateNarrative('# A comprehensive heading').reason).toBe('malformed');
  });

  it('leaves prose that earned its words untouched', () => {
    const text = 'Quincy built CoreOps for the Oklahoma Turnpike Authority. '
      + 'The system includes an MCP server and a prompt library.';
    expect(validateNarrative(text).narrative).toBe(text);
  });

  it('does not leave double spaces behind', () => {
    expect(validateNarrative('He built a comprehensive suite.').narrative)
      .not.toMatch(/ {2}/);
  });
});

describe('extractStatedPurpose — the WHY, from their own requirements document', () => {
  // A real document's opening, boilerplate and all.
  const DOC = [
    '# Autonomous Freight — Build Guide',
    '',
    '**Version:** v1  ',
    '**Date:** 2026-04-13  ',
    '**Status:** Final  ',
    '',
    '---',
    '',
    '# Chapter 1: Executive Summary',
    '',
    '> **Chapter purpose**: This chapter provides the design intent and implementation',
    '',
    '## Vision & Strategy',
    '',
    'The vision of this project is to create a software solution that addresses the',
    'fragmented workflow challenges faced by freight brokers.',
    '',
    '### Objectives',
    '1. **Automating Operations**',
  ].join('\n');

  it('lifts the vision and drops the template', () => {
    const out = extractStatedPurpose(DOC)!;
    expect(out).toContain('freight brokers');
    expect(out).not.toContain('Chapter 1');
    expect(out).not.toContain('Chapter purpose');
    expect(out).not.toContain('Version:');
    expect(out).not.toContain('#');
  });

  it('caps its length — 255KB cannot reach a prompt', () => {
    const huge = 'This project exists to solve a real and specific operational problem. '.repeat(500);
    expect(extractStatedPurpose(huge)!.length).toBeLessThanOrEqual(1000);
  });

  it('returns null rather than a fragment when there is nothing to lift', () => {
    for (const bad of [null, undefined, 42, '', '   ', '# Only a heading', '> just a quote']) {
      expect(extractStatedPurpose(bad as any)).toBeNull();
    }
  });

  it('reaches the evidence block, labelled as their own words', () => {
    const block = buildEvidenceBlock(input({
      project: { name: 'Autonomous Freight', requirements_document: DOC },
    }));
    expect(block).toContain('Stated purpose, from their own requirements document:');
    expect(block).toContain('freight brokers');
  });

  it('is absent from the evidence block when no document exists', () => {
    expect(buildEvidenceBlock(input({ project: { name: 'CoreOps' } })))
      .not.toContain('Stated purpose');
  });
});
