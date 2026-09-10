/**
 * The ritual-body parser is the load-bearing part of the thread panel: if it
 * extracts nothing, the post renders as an empty card and every assertion about
 * "sections" above it is vacuously true. So these tests assert the EXTRACTED
 * VALUES by name, never just a section count.
 */
import { parseRitualBody, ritualSummary } from '../ritualPostBody';

// Exactly what backend composeBody() writes for a Week 2 Skill Drop.
const SKILL_DROP = [
  '🧩 Skill Drop · Week 2',
  'My 3 skills: data quality gate, etl failed triage, data-quality-report',
  "The one that surprised me: The data-quality-gate skill validates a dataset before it ships.",
].join('\n\n');

describe('parseRitualBody — ritual posts', () => {
  it('lifts the heading out and names the ritual, week and icon', () => {
    const p = parseRitualBody(SKILL_DROP);
    expect(p.heading).toBe('🧩 Skill Drop · Week 2');
    expect(p.ritualName).toBe('Skill Drop');
    expect(p.week).toBe(2);
    expect(p.icon).toBe('🧩');
  });

  it('splits the guided answers into labelled sections with the real values', () => {
    const p = parseRitualBody(SKILL_DROP);
    expect(p.sections).toEqual([
      { label: 'My 3 skills', value: 'data quality gate, etl failed triage, data-quality-report' },
      { label: 'The one that surprised me', value: 'The data-quality-gate skill validates a dataset before it ships.' },
    ]);
  });

  it('does not repeat the heading inside the sections', () => {
    const values = parseRitualBody(SKILL_DROP).sections.map((s) => s.value);
    expect(values.join(' ')).not.toContain('Skill Drop · Week 2');
  });

  it('keeps a multi-line field value intact', () => {
    const body = '👋 Roll Call · Week 1\n\nI’m…: Dana Okoye\n\nThe one thing I want: line one\nline two';
    const p = parseRitualBody(body);
    expect(p.sections[1]).toEqual({ label: 'The one thing I want', value: 'line one\nline two' });
  });

  it('handles every ritual heading shape, including two-digit weeks', () => {
    expect(parseRitualBody('🏛 Architect Manifesto · Week 12\n\nMy stance: ship small').week).toBe(12);
    expect(parseRitualBody('🏛 Architect Manifesto · Week 12\n\nMy stance: ship small').ritualName)
      .toBe('Architect Manifesto');
  });
});

describe('parseRitualBody — plain community posts', () => {
  it('returns the post as one unlabelled section', () => {
    const p = parseRitualBody('Anyone free to pair on the MCP lab this afternoon?');
    expect(p.heading).toBeNull();
    expect(p.ritualName).toBeNull();
    expect(p.sections).toEqual([{ label: null, value: 'Anyone free to pair on the MCP lab this afternoon?' }]);
  });

  it('never invents a label from prose that happens to contain a colon', () => {
    const p = parseRitualBody('The trick: keep the first version small.');
    expect(p.sections).toEqual([{ label: null, value: 'The trick: keep the first version small.' }]);
  });

  it('keeps every paragraph of a multi-paragraph free-text post', () => {
    const p = parseRitualBody('First thought.\n\nSecond thought.');
    expect(p.sections.map((s) => s.value)).toEqual(['First thought.', 'Second thought.']);
  });

  it('does not treat a long sentence inside a ritual post as a field label', () => {
    // 48-char label ceiling: this opening clause is far longer, so it stays prose.
    const body = `🧩 Skill Drop · Week 2\n\nBefore I say anything else about what happened this week: it went badly.`;
    expect(parseRitualBody(body).sections[0].label).toBeNull();
  });
});

describe('parseRitualBody — boundaries', () => {
  it.each([null, undefined, '', '   ', '\n\n'])('returns no sections for %p', (input) => {
    const p = parseRitualBody(input as any);
    expect(p.sections).toEqual([]);
    expect(p.heading).toBeNull();
  });

  it('loses no text: every input block appears in the output', () => {
    const p = parseRitualBody(SKILL_DROP);
    const out = p.sections.map((s) => `${s.label}: ${s.value}`).join('\n\n');
    expect(out).toBe(SKILL_DROP.split('\n\n').slice(1).join('\n\n'));
  });
});

describe('ritualSummary', () => {
  it('summarises the first answer, not the ritual heading', () => {
    expect(ritualSummary(SKILL_DROP)).toBe('data quality gate, etl failed triage, data-quality-report');
  });

  it('truncates on a word boundary and marks the elision', () => {
    const s = ritualSummary('a'.repeat(10) + ' ' + 'b'.repeat(200), 40);
    expect(s.endsWith('…')).toBe(true);
    expect(s.length).toBeLessThanOrEqual(41);
  });

  it('returns an empty string for an empty body', () => {
    expect(ritualSummary('')).toBe('');
  });
});
