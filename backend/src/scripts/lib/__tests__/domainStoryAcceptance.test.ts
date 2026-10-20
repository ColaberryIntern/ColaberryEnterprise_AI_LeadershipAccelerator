/* eslint-disable */
// Unit tests for the domain-story acceptance extractor (pure, deterministic).
//
// This function decides what 443 live stories get graded against, so the cases that matter
// most are the ones where it must REFUSE: an absent marker, a placeholder criterion, and a
// story whose shape it does not recognise. A migration that silently returns something
// plausible for an unparsable row is worse than one that reports the row, because the
// reported row gets looked at and the plausible one does not.
//
// Covers: happy path, whitespace collapse, every heading level as a terminator, the
// mid-sentence `#` that must NOT terminate, the first-marker-wins rule, the length floor,
// and non-string input.

const { extractCriterion, MIN_CRITERION_LENGTH } = require('../domainStoryAcceptance');

/** The real shape `agentDomainStoryTemplates.ts` renders. */
function story(criterion: string, trailing = '\n\n## Before you start\n- a blocker\n') {
  return [
    '## The agent behaviour that uses it',
    'Starting autonomy **suggest**; ceiling **act_with_review**.',
    '',
    '**First release behaviour (suggest)**',
    'It proposes, a human decides.',
    '',
    `Acceptance: ${criterion}`,
  ].join('\n') + trailing;
}

describe('extractCriterion - the happy path', () => {
  it('pulls the criterion out of a real rendered story', () => {
    const c = 'Each claim is marked verified or unverified with its file reference.';
    expect(extractCriterion(story(c))).toBe(c);
  });

  it('stops at the next heading and does not swallow it', () => {
    const out = extractCriterion(story('The same key twice writes one row.'));
    expect(out).toBe('The same key twice writes one row.');
    expect(out).not.toContain('Before you start');
    expect(out).not.toContain('#');
  });

  it('works when the criterion is the very end of the prose', () => {
    const c = 'An unauthenticated caller receives 401 rather than an empty list.';
    expect(extractCriterion(story(c, ''))).toBe(c);
  });
});

describe('extractCriterion - whitespace', () => {
  it('collapses newlines inside a multi-line criterion to single spaces', () => {
    const out = extractCriterion(story('A write failure returns\n  log_unavailable\nrather than throwing.'));
    expect(out).toBe('A write failure returns log_unavailable rather than throwing.');
  });

  it('trims surrounding whitespace', () => {
    expect(extractCriterion('Acceptance:    The dashboard loads in under two seconds.   \n'))
      .toBe('The dashboard loads in under two seconds.');
  });
});

describe('extractCriterion - heading termination', () => {
  // The template emits `## Before you start`, but a capability record is free to use any
  // level, so every level must terminate rather than only the one seen in production.
  for (const hashes of ['#', '##', '###', '####', '#####', '######']) {
    it(`terminates on a level-${hashes.length} heading`, () => {
      const out = extractCriterion(`Acceptance: The export is byte-identical on a re-run.\n${hashes} Evidence\nsomething else`);
      expect(out).toBe('The export is byte-identical on a re-run.');
    });
  }

  it('does NOT terminate on a hash used mid-sentence', () => {
    const c = 'The blocker tracked as issue #3 is resolved before promotion.';
    expect(extractCriterion(`Acceptance: ${c}`)).toBe(c);
  });

  it('does NOT terminate on a hash that starts a line but is not a heading', () => {
    // No space after the hashes, so it is not a markdown heading. A tag like `#2` on its
    // own line is part of the criterion.
    const out = extractCriterion('Acceptance: Every finding carries an id.\n#2 is the example.');
    expect(out).toBe('Every finding carries an id. #2 is the example.');
  });
});

describe('extractCriterion - it must refuse rather than guess', () => {
  it('returns null when there is no Acceptance marker at all', () => {
    expect(extractCriterion('No release behaviour is recorded yet. Defining it is the first piece of work.'))
      .toBeNull();
  });

  it('returns null for a placeholder shorter than the floor', () => {
    expect(extractCriterion('Acceptance: n/a')).toBeNull();
    expect(extractCriterion('Acceptance: TBD')).toBeNull();
  });

  it('returns null when the heading follows the marker immediately', () => {
    expect(extractCriterion('Acceptance:\n## Before you start\n- a blocker')).toBeNull();
  });

  it('treats the length floor as inclusive', () => {
    const exact = 'x'.repeat(MIN_CRITERION_LENGTH);
    expect(extractCriterion(`Acceptance: ${exact}`)).toBe(exact);
    expect(extractCriterion(`Acceptance: ${'x'.repeat(MIN_CRITERION_LENGTH - 1)}`)).toBeNull();
  });

  it('returns null for input that is not a usable string', () => {
    expect(extractCriterion('')).toBeNull();
    expect(extractCriterion(null as any)).toBeNull();
    expect(extractCriterion(undefined as any)).toBeNull();
    expect(extractCriterion(42 as any)).toBeNull();
    expect(extractCriterion({} as any)).toBeNull();
  });
});

describe('extractCriterion - determinism and first-marker-wins', () => {
  it('takes the FIRST marker when the prose somehow carries two', () => {
    // The release behaviour is rendered once, but a capability description could quote the
    // word. The first occurrence is the authored one.
    const out = extractCriterion(
      'Acceptance: The first criterion is the authored one.\n## Notes\nAcceptance: a quoted second.');
    expect(out).toBe('The first criterion is the authored one.');
  });

  it('is deterministic - same input, same output', () => {
    const s = story('The roster endpoint returns 200 with a list of members.');
    expect(extractCriterion(s)).toBe(extractCriterion(s));
  });
});
