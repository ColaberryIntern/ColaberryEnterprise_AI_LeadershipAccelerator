/**
 * Campus v14 (C67 / C69): the board's time words and where a note sits, and the ritual body composed exactly as the server composes
 * it (communityRituals.composeBody), so a board answer reads the same everywhere.
 */
import { ageLabel, laneMeta, LANE_META, whereNow, tiltOf } from '../board/boardTime';
import { composeRitualBody, ritualValues } from '../board/boardData';
import { badgeLabel } from '../board/useBoardBadge';

const NOW = Date.parse('2026-10-26T17:00:00Z'); // Mon 12:00 PM CDT
const ago = (ms: number): string => new Date(NOW - ms).toISOString();
const MIN = 60_000; const H = 60 * MIN; const D = 24 * H;

describe('ageLabel (Central)', () => {
  it.each([
    [10_000, 'just now'],
    [12 * MIN, '12m ago'],
    [3 * H, '3h ago'],
    [24 * H, 'Yesterday'],
    [4 * D, '4d ago'],
    [6 * D + H, '6d ago'],
  ])('%i ms ago is %s', (ms, label) => {
    expect(ageLabel(ago(ms), NOW)).toBe(label);
  });
  it('a week or more shows the Central date', () => {
    expect(ageLabel('2026-10-12T15:00:00Z', NOW)).toBe('Oct 12');
  });
  it('late last night Central is Yesterday, not hours ago', () => {
    expect(ageLabel('2026-10-26T04:30:00Z', NOW)).toBe('Yesterday'); // Sun 11:30 PM CDT
  });
});

describe('whereNow (Your notes)', () => {
  it('inside 48 hours: on the cork in Fresh until then, then in its lane', () => {
    expect(whereNow({ created_at: ago(2 * H), lane: 'q' }, NOW)).toMatch(/^📍 On the cork in Fresh until .+, then in Questions$/);
  });
  it('after 48 hours: in its lane, Earlier this week', () => {
    expect(whereNow({ created_at: ago(3 * D), lane: 'wins' }, NOW)).toBe('📍 In Wins & builds · Earlier this week');
  });
});

it('the lanes read as the spec names them, Everything and Your notes first', () => {
  expect(LANE_META.map((l) => l.label)).toEqual(['Everything', 'Your notes', 'Announcements', 'Questions', 'Introductions', 'Wins & builds', 'Tips & prompts', 'Ideas & stories', 'General']);
  expect(laneMeta('intro').icon).toBe('👋');
});

it('tilts are small and stable per id', () => {
  expect(tiltOf('abc')).toBe(tiltOf('abc'));
  expect(Math.abs(tiltOf('xyz'))).toBeLessThanOrEqual(1);
});

it('the badge caps at 9+', () => {
  expect([badgeLabel(3), badgeLabel(9), badgeLabel(12)]).toEqual(['3', '9', '9+']);
});

describe('composeRitualBody: the server format', () => {
  const ritual = { icon: '🏆', name: 'Cohort Wins', week: 5, fields: [
    { key: 'built', label: 'What I built', required: true, kind: 'text' as const },
    { key: 'breakthrough', label: 'Breakthrough or hardest part', kind: 'textarea' as const },
    { key: 'skills', label: 'Skills', kind: 'list' as const },
    { key: 'link', label: 'Link', kind: 'link' as const },
  ] };
  it('heading, then one Label: value paragraph per filled non-link field', () => {
    expect(composeRitualBody(ritual, { built: 'An MCP server', breakthrough: '', skills: 'a\nb', link: 'https://example.com' }))
      .toBe('🏆 Cohort Wins · Week 5\n\nWhat I built: An MCP server\n\nSkills: a, b');
  });
  it('ritual_meta values keep lists as arrays and drop empty fields', () => {
    expect(ritualValues(ritual.fields, { built: ' An MCP server ', skills: 'a\n\nb', breakthrough: ' ' })).toEqual({ built: 'An MCP server', skills: ['a', 'b'] });
  });
});
