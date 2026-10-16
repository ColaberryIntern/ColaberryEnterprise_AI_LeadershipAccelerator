import {
  looksTitleCase, toSentenceCase, normalizeHeadingCase, remainingTitleCaseHeadings,
} from '../landingPageHeadingCase';

/**
 * The nine headings below are not invented. They were read off the live page at
 * /lp/colaberry-training/ai-learning-platform on 2026-10-16, which is the page Sohail is
 * sending ads to. All nine were Title Case, against rule 6c, which has been in the prompt
 * since v6.
 *
 * The risk this file mostly guards is the OPPOSITE of the bug: a sentence-caser that damages a
 * name. "Learn From Sarah Chen" becoming "Learn from sarah chen" on a public page is worse than
 * every Title Case heading combined, so the proper-noun tests matter more than the rest.
 */

const LIVE_HEADINGS: Array<[string, string]> = [
  ['Start Learning AI for $0 Today', 'Start learning AI for $0 today'],
  ['AI Is No Longer Just a Future Skill', 'AI is no longer just a future skill'],
  ['Learn AI Beyond Basic Prompts', 'Learn AI beyond basic prompts'],
  ['Built for People Who Want to Start Using AI Practically', 'Built for people who want to start using AI practically'],
  ["We Don't Just Teach AI. We Help You Build With It.", "We don't just teach AI. We help you build with it."],
  ['Your Learning Path with Colaberry', 'Your learning path with Colaberry'],
  ['Your AI Learning Journey Starts Immediately', 'Your AI learning journey starts immediately'],
  ['Ready to Go Further?', 'Ready to go further?'],
  ['Start Your AI Learning Journey Today', 'Start your AI learning journey today'],
];

describe('the nine headings that are live right now', () => {
  it.each(LIVE_HEADINGS)('rewrites %s', (before, after) => {
    expect(toSentenceCase(before)).toBe(after);
  });

  it('recognises every one of them as Title Case before the fix', () => {
    // Except the two-word-ish short one, which the detector deliberately does not judge.
    const judged = LIVE_HEADINGS.filter(([before]) => looksTitleCase(before));
    expect(judged.length).toBe(LIVE_HEADINGS.length);
  });

  it('considers none of them Title Case afterwards', () => {
    const after = LIVE_HEADINGS.map(([, fixed]) => fixed).filter(looksTitleCase);
    expect(after).toEqual([]);
  });
});

describe('names survive, because unknown words are never touched', () => {
  it('leaves a person alone', () => {
    // The failure mode that would make this feature worse than the bug.
    expect(toSentenceCase('Learn From Sarah Chen')).toBe('Learn from Sarah Chen');
  });

  it('leaves brands alone without anybody registering them', () => {
    expect(toSentenceCase('Built With Colaberry and Refactored')).toBe('Built with Colaberry and Refactored');
    expect(toSentenceCase('Why Sohail Chose Basecamp')).toBe('Why Sohail chose Basecamp');
  });

  it('keeps initialisms and deliberate inner capitals', () => {
    expect(toSentenceCase('What AI and SQL Can Do')).toBe('What AI and SQL can do');
    expect(toSentenceCase('The McKinsey Report on AI')).toBe('The McKinsey report on AI');
    expect(toSentenceCase('Using PowerBI Every Day')).toBe('Using PowerBI every day');
  });

  it('never touches a token carrying digits or symbols', () => {
    expect(toSentenceCase('Start for $0 in 2026')).toBe('Start for $0 in 2026');
    expect(toSentenceCase('Get 10x Further')).toBe('Get 10x further');
  });
});

describe('sentences inside one heading', () => {
  it('capitalises again after a full stop', () => {
    expect(toSentenceCase('We Teach AI. We Also Build It.')).toBe('We teach AI. We also build it.');
  });

  it('capitalises again after a question mark', () => {
    expect(toSentenceCase('Ready to Start? Join the Next Class')).toBe('Ready to start? Join the next class');
  });
});

describe('it is safe to run anywhere, including twice', () => {
  it('is idempotent, which is what lets it sit at two boundaries', () => {
    for (const [before] of LIVE_HEADINGS) {
      const once = toSentenceCase(before);
      expect(toSentenceCase(once)).toBe(once);
    }
  });

  it('leaves correct sentence case exactly as it is', () => {
    const good = 'AI is no longer just a future skill';
    expect(toSentenceCase(good)).toBe(good);
  });

  it('handles empty and punctuation-only strings without throwing', () => {
    expect(toSentenceCase('')).toBe('');
    expect(toSentenceCase('   ')).toBe('   ');
    expect(toSentenceCase('—')).toBe('—');
  });
});

describe('the detector does not cry wolf', () => {
  it('ignores short labels, where capitals are ordinary', () => {
    expect(looksTitleCase('Start Here')).toBe(false);
    expect(looksTitleCase('Our Work')).toBe(false);
  });

  it('does not flag a heading that is only capitalised because of names', () => {
    expect(looksTitleCase('Built by Colaberry and Refactored')).toBe(false);
  });

  it('flags a genuine Title Case heading', () => {
    expect(looksTitleCase('Built For People Who Want This')).toBe(true);
  });
});

describe('walking a whole generated page', () => {
  const content = {
    hero: { headline: 'Start Learning AI for $0 Today', subhead: 'A Short Line About It', cta: { label: 'Join The Class' } },
    sections: [
      { heading: 'Learn AI Beyond Basic Prompts', items: [{ label: 'Week One Is Free' }] },
      { title: 'Ready to Go Further?' },
    ],
  };

  it('fixes every heading wherever it is nested', () => {
    const out = normalizeHeadingCase(content);
    expect(out.hero.headline).toBe('Start learning AI for $0 today');
    expect(out.hero.subhead).toBe('A short line about it');
    expect(out.sections[0].heading).toBe('Learn AI beyond basic prompts');
    expect(out.sections[1].title).toBe('Ready to go further?');
  });

  it('leaves list labels and other copy alone', () => {
    // A label is not a heading. Rule 6c is about headlines and headings, and quietly rewriting
    // body copy would be a bigger change than the one that was asked for.
    const out = normalizeHeadingCase(content);
    expect(out.hero.cta.label).toBe('Join The Class');
    expect(out.sections[0].items[0].label).toBe('Week One Is Free');
  });

  it('does not mutate the content it was given', () => {
    normalizeHeadingCase(content);
    expect(content.hero.headline).toBe('Start Learning AI for $0 Today');
  });

  it('reports nothing left to fix afterwards', () => {
    expect(remainingTitleCaseHeadings(content).length).toBeGreaterThan(0);
    expect(remainingTitleCaseHeadings(normalizeHeadingCase(content))).toEqual([]);
  });
});

describe('it never edits something that is not a word', () => {
  /**
   * Caught by two existing escaping tests, not by this file, which is the reason it is now here.
   * The first version capitalised the leading token unconditionally, so a hostile headline came
   * back as `<Script>alert(1)</script>`. The renderer still escaped it, so it was never a hole -
   * but a copy normaliser that quietly rewrites markup is wrong on its own terms, and the next
   * version of it might not be escaped by whoever calls it.
   */
  it('leaves markup exactly as it found it', () => {
    expect(toSentenceCase('<script>alert(1)</script>')).toBe('<script>alert(1)</script>');
    expect(toSentenceCase('<b>bold</b>')).toBe('<b>bold</b>');
  });

  it('leaves a leading token with digits or symbols alone', () => {
    expect(toSentenceCase('$0 to start')).toBe('$0 to start');
    expect(toSentenceCase('2026 Is The Year')).toBe('2026 is the year');
  });

  it('still capitalises an ordinary lower-case opening word', () => {
    expect(toSentenceCase('ship an AI project')).toBe('Ship an AI project');
  });
});
