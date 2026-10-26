import { RITUALS } from '../../runtime/communityRituals';
import { ritualFromBody, ritualOf } from '../boardRitual';

/** Campus v14 B1: the ritual a post answered, from ritual_meta, else from the composed heading; never from a mid-sentence mention. */
const ALL = Object.values(RITUALS);

it('there are twelve rituals', () => {
  expect(ALL).toHaveLength(12);
});

it.each(ALL.map((r) => [r.name, r] as const))('reads %s from a composed heading', (_n, r) => {
  const body = `${r.icon} ${r.name} · Week ${r.week}\n\nWhat I built: something real`;
  expect(ritualFromBody(body)).toEqual({ key: r.key, name: r.name, icon: r.icon, week: r.week });
});

it('a free-text post is no ritual', () => {
  expect(ritualFromBody('Has anyone tried running Claude Code on a Chromebook?')).toBeNull();
  expect(ritualFromBody('')).toBeNull();
  expect(ritualFromBody(null)).toBeNull();
});

it('a body that only mentions a ritual name mid-sentence is no ritual', () => {
  expect(ritualFromBody('I loved last week\'s Roll Call · Week 1 thread, thanks all')).toBeNull();
  expect(ritualFromBody('Hot Take: the cohort should vote on demos')).toBeNull();
});

it('an unknown name in a heading-shaped line is no ritual', () => {
  expect(ritualFromBody('🎉 Party Time · Week 3\n\nnot a ritual')).toBeNull();
});

it('ritual_meta wins over the body; the post week wins over the ritual week', () => {
  expect(ritualOf({ ritual: 'cohort_wins' }, 'no heading at all', 9)).toEqual({ key: 'cohort_wins', name: 'Cohort Wins', icon: '🏆', week: 9 });
  expect(ritualOf({ ritual: 'cohort_wins' }, 'no heading', null)?.week).toBe(5);
  expect(ritualOf({ ritual: 'not_a_ritual' }, '👋 Roll Call · Week 1\n\nhi', null)?.key).toBe('roll_call');
  expect(ritualOf(null, 'plain post', null)).toBeNull();
});
