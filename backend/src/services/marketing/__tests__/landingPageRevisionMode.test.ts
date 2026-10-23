import {
  isRevisionMode, modeMismatchNotice, readsAsRedesignRequest, revisionInstruction,
} from '../landingPageRevisionMode';

/**
 * The bug being fixed: "rebuild this under the new design" was answered with almost no change.
 *
 * The revise path ended every request with "leave everything else alone", which is right for an
 * adjustment and a contradiction for a redesign - and the model resolved the contradiction by
 * doing nearly nothing. It was diagnosed once already and blamed on prompt v6, which was fine.
 * The ceiling was here.
 */

describe('adjusting is still the default, and still says the same thing', () => {
  it('sends the original instruction, so existing revisions behave exactly as before', () => {
    const lines = revisionInstruction('tweak', 'Make the headline about the mentor review');
    expect(lines.join('\n')).toContain('leave everything else alone');
    expect(lines.join('\n')).toContain('Make the headline about the mentor review');
  });

  it('does not offer the model permission to restructure', () => {
    const text = revisionInstruction('tweak', 'Drop the FAQ').join('\n');
    expect(text).not.toMatch(/redesign|rebuilt|structure/i);
  });
});

describe('rebuilding frees the shape', () => {
  const text = revisionInstruction('redesign', 'Rebuild this under the new design').join('\n');

  it('tells the model the previous shape is not a constraint', () => {
    expect(text).toContain('REBUILT');
    expect(text).toContain('the previous shape is not');
    expect(text).toMatch(/structure/);
  });

  it('never tells it to leave everything else alone - that was the cap', () => {
    expect(text).not.toContain('leave everything else alone');
  });

  it('carries the operator direction through', () => {
    expect(text).toContain('Rebuild this under the new design');
  });
});

describe('rebuilding does NOT free the facts', () => {
  const text = revisionInstruction('redesign', 'Start over with a cleaner layout').join('\n');

  it('holds the facts to the brief, so a redesign is not a route to a new claim', () => {
    // Without this, "redesign" becomes the cheapest way to get an invented number onto a public
    // page - the one thing this whole pipeline is built to prevent.
    expect(text).toContain('may NOT change: the facts');
    expect(text).toMatch(/number, date, price, name and claim/);
    expect(text).toMatch(/do not[\s\S]*introduce a specific the brief does not support/);
  });

  it('refuses to carry forward an already-unsupported specific', () => {
    expect(text).toContain('already unsupported');
  });
});

describe('telling the operator when the two controls disagree', () => {
  it.each([
    'Redesign this page',
    'rebuild it under the new design',
    'Can we start over from scratch?',
    'Give it a new layout',
    'restructure the whole page',
    'scrap it and try a different design',
  ])('recognises %s as a rebuild request', (feedback) => {
    expect(readsAsRedesignRequest(feedback)).toBe(true);
  });

  it.each([
    'Make the headline about the mentor review',
    'Drop the FAQ section',
    'Fix the picture links',
    'Change the price to $199',
    'The eyebrow should say Week 1',
  ])('does not flag %s, which is an ordinary edit', (feedback) => {
    // A false positive here nags on every normal revision, which trains the operator to ignore
    // the notice - and the notice is the entire point.
    expect(readsAsRedesignRequest(feedback)).toBe(false);
  });

  it('says nothing about empty feedback', () => {
    expect(readsAsRedesignRequest('')).toBe(false);
    expect(readsAsRedesignRequest('   ')).toBe(false);
  });

  it('explains what will happen rather than what the operator did wrong', () => {
    const notice = modeMismatchNotice();
    expect(notice).toContain('leave everything it was not asked about alone');
    expect(notice).toContain('Rebuild');
    expect(notice).not.toMatch(/error|invalid|wrong/i);
  });
});

describe('the mode guard', () => {
  it('accepts only the two real modes', () => {
    expect(isRevisionMode('tweak')).toBe(true);
    expect(isRevisionMode('redesign')).toBe(true);
    for (const bad of ['TWEAK', 'rebuild', '', null, undefined, 1, {}]) {
      expect(isRevisionMode(bad)).toBe(false);
    }
  });
});
