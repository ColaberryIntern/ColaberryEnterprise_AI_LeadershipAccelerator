import { emptyForm, fromEvent, toInput, validate } from '../eventForm';
import { attentionNotes, dateChip, whenLabel, audienceLabel, STATUS_META } from '../eventDisplay';
import type { HubEvent } from '../../../../../services/commsHubApi';

/** CH3.1/CH3.2 pure rules: the form's validation and conversion, and every label the list shows. */
const EV: HubEvent = {
  id: '55555555-5555-4555-8555-555555555555', title: 'Demo Tuesday', event_type: 'session', audience: { kind: 'all_members' }, status: 'scheduled',
  starts_at: '2026-11-25T00:00:00.000Z', ends_at: '2026-11-25T01:00:00.000Z',
  central: { date: '2026-11-24', start_time: '18:00', end_time: '19:00', label: 'Nov 24, 6:00 PM CST' },
  repeat_rule: { freq: 'weekly', until: '2026-12-29' }, next_occurrence_at: '2026-11-25T00:00:00.000Z', upcoming_preview: [],
  join_url: 'https://zoom.us/j/1', registration_url: null, hosts: [{ name: 'Aleem', role: 'Design' }], description: 'Builders demo.',
  placement: { calendar: true, events_page: true, campus_rail: false }, thumbnail_id: null, broadcast_occurrence_id: null,
  created_at: '2026-11-20T00:00:00.000Z', updated_at: '2026-11-20T00:00:00.000Z',
};

describe('CH3.2 form rules', () => {
  it('an empty form names every required field', () => {
    expect(Object.keys(validate(emptyForm())).sort()).toEqual(['date', 'start_time', 'title']);
  });

  it('end before start, a repeat without its last date, an empty cohort pick, a bad link and a nameless host are each caught', () => {
    const f = { ...fromEvent(EV), end_time: '17:00', repeat: 'weekly' as const, repeat_until: '', audienceKind: 'cohorts' as const, cohort_ids: [], join_url: 'zoom.us/j/1', hosts: [{ name: ' ' }] };
    expect(Object.keys(validate(f)).sort()).toEqual(['cohort_ids', 'end_time', 'hosts', 'join_url', 'repeat_until']);
    expect(validate({ ...fromEvent(EV), repeat_until: '2026-11-01' }).repeat_until).toMatch(/on or after/);
  });

  it('a loaded event round-trips into the same API input, Central clock untouched', () => {
    expect(validate(fromEvent(EV))).toEqual({});
    expect(toInput(fromEvent(EV), 'scheduled')).toEqual({
      title: 'Demo Tuesday', event_type: 'session', audience: { kind: 'all_members' }, date: '2026-11-24', start_time: '18:00', end_time: '19:00',
      repeat: { freq: 'weekly', until: '2026-12-29' }, join_url: 'https://zoom.us/j/1', registration_url: null,
      hosts: [{ name: 'Aleem', role: 'Design' }], description: 'Builders demo.', placement: { calendar: true, events_page: true, campus_rail: false }, status: 'scheduled',
    });
  });

  it('blank optional fields become null, a blank role is dropped, cohorts are sent when chosen', () => {
    const input = toInput({ ...fromEvent(EV), end_time: '', join_url: '  ', description: '', hosts: [{ name: 'Sai', role: ' ' }], repeat: 'none', audienceKind: 'cohorts', cohort_ids: ['c1'] }, 'draft');
    expect(input).toMatchObject({ end_time: null, join_url: null, description: null, repeat: null, hosts: [{ name: 'Sai' }], audience: { kind: 'cohorts', cohort_ids: ['c1'] }, status: 'draft' });
  });
});

describe('CH3.1 labels', () => {
  it('the date chip and the when-line are on the Central clock with the zone written out', () => {
    expect(dateChip(new Date('2026-11-25T00:00:00Z'))).toEqual({ day: '24', month: 'NOV' });
    expect(whenLabel(EV)).toBe('Tue, Nov 24 · 6:00 PM CST · weekly');
    expect(whenLabel({ ...EV, next_occurrence_at: '2026-07-14T23:00:00.000Z', repeat_rule: null })).toBe('Tue, Jul 14 · 6:00 PM CDT');
  });

  it('audience, attention notes and status words', () => {
    expect(audienceLabel(EV)).toBe('All open cohorts');
    expect(audienceLabel({ audience: { kind: 'cohorts', cohort_ids: ['a', 'b'] } })).toBe('2 cohorts');
    expect(attentionNotes(EV)).toEqual(['Needs a thumbnail']);
    expect(attentionNotes({ ...EV, status: 'draft' })).toEqual(['Needs a thumbnail', 'Not on the platform yet']);
    expect(attentionNotes({ ...EV, thumbnail_id: '66666666-6666-4666-8666-666666666666' })).toEqual([]);
    expect(new Set(Object.values(STATUS_META).map((m) => m.label)).size).toBe(5);
  });
});
