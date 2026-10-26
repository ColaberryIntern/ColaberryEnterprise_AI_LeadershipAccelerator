import { cutTitle, noteText, withLabel } from '../boardText';

/** Campus v14 B2: a note's title and excerpt; never the "<Ritual> - Week n" heading. */
const base = { locked: false, min_level: 1, ritual_key: null, ritual_values: null };

it('a ritual post: the first required field with its label, the rest as the excerpt (links left out)', () => {
  const t = noteText({ ...base, body: '🏆 Cohort Wins · Week 5\n\nWhat I built: x', ritual_key: 'cohort_wins',
    ritual_values: { built: 'A read-only MCP server', breakthrough: 'stdio transport', tip: 'verify first', link: 'https://example.com/x' } });
  expect(t).toEqual({ title: 'What I built: A read-only MCP server', excerpt: 'stdio transport · verify first' });
});

it('a label ending in an ellipsis reads straight on', () => {
  expect(withLabel("I'm…", 'Dana Okoye, Ops Director')).toBe("I'm Dana Okoye, Ops Director");
  const t = noteText({ ...base, body: '👋 Roll Call · Week 1\n\n…', ritual_key: 'roll_call', ritual_values: { intro: 'Dana Okoye', want: 'Monday brief' } });
  expect(t.title).toBe("I'm Dana Okoye");
  expect(t.excerpt).toBe('Monday brief');
});

it('list values are joined', () => {
  const t = noteText({ ...base, body: 'x', ritual_key: 'skill_drop', ritual_values: { skills: ['invoice-parser', 'tone-checker'] } });
  expect(t.title).toBe('My 3 skills: invoice-parser, tone-checker');
});

it('another post: the first sentence is the title, the rest the excerpt', () => {
  expect(noteText({ ...base, body: 'How do I fix this timeout? It 429s under load.' })).toEqual({ title: 'How do I fix this timeout?', excerpt: 'It 429s under load.' });
});

it('a long first sentence is cut on a word with an ellipsis, under 90 characters', () => {
  const long = 'This is a very long first sentence that keeps going and going well past the ninety character limit we have set here';
  const t = noteText({ ...base, body: long });
  expect(t.title.length).toBeLessThanOrEqual(90);
  expect(t.title.endsWith('…')).toBe(true);
  expect(long.startsWith(t.title.slice(0, -1))).toBe(true);
  expect(cutTitle('short')).toBe('short');
});

it('never shows the ritual heading, even without guided values', () => {
  const t = noteText({ ...base, body: '⚖️ Hot Take · Week 10\n\nAgree. Tier by reversibility.', ritual_key: 'hot_take' });
  expect(t.title).toBe('Agree.');
  expect(`${t.title} ${t.excerpt}`).not.toMatch(/Week 10/);
});

it('a locked post has no text, only what unlocks it', () => {
  expect(noteText({ ...base, body: null, locked: true, min_level: 4 })).toEqual({ title: 'Unlocks at level 4', excerpt: '' });
});
