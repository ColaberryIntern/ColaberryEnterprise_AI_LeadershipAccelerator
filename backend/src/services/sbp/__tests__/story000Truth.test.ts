import { story000TruthCounts, story000TruthSection } from '../story000Truth';
import { ANGLE_TO_DIMENSION } from '../intakeTruth';
import type { UnderstandingItem } from '../../delivery/projectUnderstanding';

/**
 * What Story 000 says about the project, and especially what it admits it does
 * not know.
 */

const item = (over: Partial<UnderstandingItem> = {}): UnderstandingItem => ({
  dimension: 'problem',
  value: 'A tool that checks invoices against purchase orders.',
  classification: 'FACT',
  provenance: 'source_message',
  source_quote: 'A tool that checks invoices against purchase orders.',
  ...over,
});

const render = (items: UnderstandingItem[], revision?: number) =>
  story000TruthSection({ items, revision }).join('\n');

describe('what it says it knows', () => {
  it('separates confirmed from merely heard', () => {
    const text = render([
      item({ provenance: 'client_confirmed' }),
      item({ dimension: 'systems', value: 'Gmail and a spreadsheet.' }),
    ]);
    expect(text).toContain('Confirmed by you');
    expect(text).toContain('From what you told us, not yet confirmed');
  });

  it('labels an inference as a guess and invites correcting it', () => {
    const text = render([
      item({ classification: 'ASSUMPTION', provenance: 'ai_inferred', source_quote: undefined }),
    ]);
    expect(text).toContain('Worked out by the system, not stated by you');
    expect(text).toMatch(/Treat these as guesses/);
  });

  it('names the revision it was built from, so a stale section is visible', () => {
    expect(render([item()], 7)).toContain('revision 7');
  });

  it('says where it came from even when no revision is known', () => {
    // A legacy project has no revision, and claiming one would be inventing
    // provenance for the sake of a tidier sentence.
    const text = render([item()]);
    expect(text).toContain('what you told us at intake');
    expect(text).not.toMatch(/revision \d/);
  });

  it('uses the student\'s language for a heading, not the schema\'s', () => {
    const text = render([item({ dimension: 'approval_points', value: 'Priya signs off.' })]);
    expect(text).toContain('What a person checks before it acts');
    expect(text).not.toContain('approval_points');
  });

  it('renders nothing at all when there is no intake', () => {
    // An empty heading promising a section that is not there is worse than no
    // heading: it reads as a system that lost something.
    expect(story000TruthSection({ items: [] })).toEqual([]);
    expect(story000TruthSection({ items: [item({ value: '   ' })] })).toEqual([]);
  });
});

describe('the half that usually gets dropped', () => {
  it('lists what nobody answered, in plain language', () => {
    const text = render([item()]); // only `problem` is known
    expect(text).toContain('Still unanswered');
    expect(text).toContain('nobody has said what a person should check before this acts');
    expect(text).toContain('there is no baseline, so nothing can be measured against it later');
  });

  it('says plainly that a gap is not a mistake and does not block', () => {
    // Otherwise a student reads the list as a punchlist and invents answers to
    // clear it, which is the thing the whole intake change exists to prevent.
    const text = render([item()]);
    expect(text).toMatch(/None of these blocks the build/);
    expect(text).toMatch(/none of them is a mistake/);
    expect(text).toMatch(/cheaper than the same gap found by a/);
  });

  it('drops an angle from the list once it is answered', () => {
    const withGuardrail = render([item(), item({ dimension: 'approval_points', value: 'Priya signs off.' })]);
    expect(withGuardrail).not.toContain('nobody has said what a person should check');
  });

  it('says so when nothing is outstanding, rather than hiding the section', () => {
    const everything = Object.values(ANGLE_TO_DIMENSION).map((d) => item({ dimension: d }));
    const text = render(everything);
    expect(text).toContain('Nothing is outstanding');
    expect(text).not.toContain('Still unanswered');
  });

  it('never writes a placeholder for something nobody said', () => {
    const text = render([item()]);
    for (const filler of ['TBD', 'To be determined', 'N/A', 'Unknown value', 'null']) {
      expect(text).not.toContain(filler);
    }
  });
});

describe('the counts a surface can render without re-deriving', () => {
  it('counts each group, and the unanswered angles', () => {
    expect(story000TruthCounts([
      item({ provenance: 'client_confirmed' }),
      item({ dimension: 'systems' }),
      item({ dimension: 'actors', classification: 'ASSUMPTION', provenance: 'ai_inferred', source_quote: undefined }),
    ])).toEqual({
      confirmed: 1,
      unconfirmed: 1,
      inferred: 1,
      // problem, systems and actors are answered; the rest are not.
      unanswered: Object.keys(ANGLE_TO_DIMENSION).length - 3,
    });
  });

  it('ignores an empty value rather than counting it as known', () => {
    expect(story000TruthCounts([item({ value: '  ' })]).confirmed).toBe(0);
  });

  it('agrees with what the section renders', () => {
    // Two numbers that disagree is worse than one number, and a surface showing
    // "3 confirmed" above a list of two is the kind of thing nobody reports.
    const items = [item({ provenance: 'client_confirmed' }), item({ dimension: 'systems' })];
    const counts = story000TruthCounts(items);
    const text = render(items);
    expect(counts.confirmed).toBe((text.match(/^- \*\*/gm) ?? []).length - counts.unconfirmed);
  });
});

describe('what a story taught the project (Phase 6)', () => {
  it('renders repo evidence under its own heading, and a raised question under its own', () => {
    const text = render([
      item({ dimension: 'actors', value: 'Priya reviews every draft.', provenance: 'client_confirmed' }),
      item({ dimension: 'integrations', value: 'Reads open tickets from the Zendesk API.', provenance: 'repo_evidence', source_quote: 'src/zendesk/client.ts' }),
      item({ dimension: 'actors', value: 'STORY-003 found "The dispatcher reviews drafts.", but you confirmed "Priya reviews every draft.". Which is right?', classification: 'QUESTION', provenance: 'repo_evidence', source_quote: 'src/review.ts' }),
    ]);
    expect(text).toContain('### Found in your build, not yet confirmed by you');
    expect(text).toContain('Reads open tickets from the Zendesk API.');
    expect(text).toContain('### Questions a story raised');
    expect(text).toContain('Neither value was');
    expect(text).toContain('Which is right?');
  });

  it('tells STORY-000 how to repair forward, and not to invent', () => {
    const text = render([item({})]);
    expect(text).toContain('Forward repair, not backfill');
    expect(text).toContain('.colaberry/enrichment/STORY-000.json');
    expect(text).toContain('Do');
    expect(text).toMatch(/not invent an answer/);
  });

  it('says nothing about forward repair when nothing is outstanding', () => {
    const all = Object.values(ANGLE_TO_DIMENSION).map((d) => item({ dimension: d as UnderstandingItem['dimension'], value: 'x' }));
    expect(render(all)).not.toContain('Forward repair');
  });
});
