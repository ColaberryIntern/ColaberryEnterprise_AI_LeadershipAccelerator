/**
 * The merged queue's rules.
 *
 * Two of these are about promises this screen makes to a builder rather than about arithmetic:
 * that a tool row is never offered a control the server would refuse, and that the order is by
 * waiting rather than by arrival. The second is the one that failed in production — a eleven-day
 * request sat under every newer arrival on a page nobody scrolled.
 */
import type { ChangeRequest } from '../../../services/agentDomainApi';
import {
  CHANGE_VERBS,
  TOOL_CONSOLE_HREF,
  TOOL_VERB_NAMES,
  ageBand,
  ageDays,
  ageLabel,
  matchesFilter,
  oldestFirst,
  queueHeadline,
  verbsFor,
} from '../approvalQueueModel';

const NOW = new Date('2026-11-25T18:00:00Z');

function req(over: Partial<ChangeRequest> = {}): ChangeRequest {
  return {
    id: 'id-1',
    kind: 'change',
    domain_key: 'platform',
    title: 'A request',
    description: null,
    status: 'submitted',
    requested_by_identity: 'builder@example.com',
    requested_at: '2026-11-23T18:00:00Z',
    approved_by_identity: null,
    approved_at: null,
    declined_reason: null,
    ...over,
  } as ChangeRequest;
}

describe('verbsFor', () => {
  it('offers a change request its two verbs', () => {
    expect(verbsFor('change')).toBe(CHANGE_VERBS);
    expect(verbsFor('change').map((v) => v.key)).toEqual(['approved', 'declined']);
  });

  it('offers a TOOL grant none, because three of its five verbs need a field a row has not got', () => {
    // send_back needs missing_field, assign_existing_tool needs assigned_tool_name, and a request
    // with a decision package refuses a verb that disagrees with the option it names. Offering
    // buttons here would move the refusal to the moment of deciding, which is the failure the
    // tool console exists to end.
    expect(verbsFor('tool')).toEqual([]);
  });

  it('still NAMES the five verbs, so the row says what is available where', () => {
    expect(TOOL_VERB_NAMES.map((v) => v.label)).toEqual([
      'Approve to build', 'Use an existing tool', 'Send back', 'Deny', 'Nothing',
    ]);
    expect(TOOL_CONSOLE_HREF).toBe('/admin/tool-requests');
  });

  it('marks exactly the verbs the server refuses without words', () => {
    expect(CHANGE_VERBS.filter((v) => v.needsReason).map((v) => v.key)).toEqual(['declined']);
  });
});

describe('ageDays', () => {
  it('floors to whole days', () => {
    expect(ageDays('2026-11-23T05:00:00Z', NOW)).toBe(2);
  });

  it('returns null rather than 0 when there is no usable date', () => {
    expect(ageDays(null, NOW)).toBeNull();
    expect(ageDays('not a date', NOW)).toBeNull();
  });

  it('clamps a future timestamp to 0 instead of going negative', () => {
    expect(ageDays('2026-12-01T00:00:00Z', NOW)).toBe(0);
  });
});

describe('ageBand and ageLabel', () => {
  it('keeps the thresholds this page already used: amber at 2, red at 5', () => {
    expect(ageBand(0)).toBe('fresh');
    expect(ageBand(1)).toBe('fresh');
    expect(ageBand(2)).toBe('ageing');
    expect(ageBand(4)).toBe('ageing');
    expect(ageBand(5)).toBe('overdue');
    expect(ageBand(12)).toBe('overdue');
    expect(ageBand(null)).toBe('none');
  });

  it('always has words, so colour is never the only signal', () => {
    expect(ageLabel(0)).toBe('today');
    expect(ageLabel(1)).toBe('1 day');
    expect(ageLabel(12)).toBe('12 days');
    expect(ageLabel(null)).toBe('no date');
  });
});

describe('oldestFirst', () => {
  it('puts the longest wait at the top, whatever order the server sent', () => {
    const rows = [
      req({ id: 'new', requested_at: '2026-11-23T18:00:00Z' }),
      req({ id: 'old', requested_at: '2026-11-13T18:00:00Z' }),
      req({ id: 'mid', requested_at: '2026-11-18T07:15:00Z' }),
    ];
    expect([...rows].sort(oldestFirst).map((r) => r.id)).toEqual(['old', 'mid', 'new']);
  });

  it('POSITIVE CONTROL: that is not the order it was given', () => {
    const rows = [
      req({ id: 'new', requested_at: '2026-11-23T18:00:00Z' }),
      req({ id: 'old', requested_at: '2026-11-13T18:00:00Z' }),
    ];
    expect(rows.map((r) => r.id)).toEqual(['new', 'old']);
  });

  it('treats a missing date as oldest rather than dropping it to the bottom', () => {
    const rows = [req({ id: 'dated' }), req({ id: 'undated', requested_at: null })];
    expect([...rows].sort(oldestFirst)[0].id).toBe('undated');
  });
});

describe('matchesFilter', () => {
  const mine = new Set(['id-mine']);

  it('shows everything under all', () => {
    expect(matchesFilter(req(), 'all', mine)).toBe(true);
    expect(matchesFilter(req({ kind: 'tool' }), 'all', mine)).toBe(true);
  });

  it('splits by kind without hiding either from the full list', () => {
    expect(matchesFilter(req({ kind: 'tool' }), 'tool', mine)).toBe(true);
    expect(matchesFilter(req({ kind: 'tool' }), 'change', mine)).toBe(false);
    expect(matchesFilter(req({ kind: 'change' }), 'change', mine)).toBe(true);
  });

  it('decides "mine" by id, never by matching an email string', () => {
    expect(matchesFilter(req({ id: 'id-mine' }), 'mine', mine)).toBe(true);
    // Same person by email, different request: still not one of the viewer's own ids.
    expect(matchesFilter(req({ id: 'id-other' }), 'mine', mine)).toBe(false);
  });
});

describe('queueHeadline', () => {
  it('leads with the longest wait, because the count is not what went wrong', () => {
    const rows = [
      req({ id: 'a', requested_at: '2026-11-13T18:21:00Z' }),
      req({ id: 'b', requested_at: '2026-11-23T15:52:00Z' }),
    ];
    expect(queueHeadline(rows, NOW))
      .toBe('2 decisions are yours. The longest has waited 11 days. Nothing here starts a build.');
  });

  it('says so plainly when nothing is waiting', () => {
    expect(queueHeadline([], NOW)).toBe('Nothing is waiting on you.');
  });

  it('does not manufacture urgency when everything is fresh', () => {
    expect(queueHeadline([req({ requested_at: '2026-11-25T06:00:00Z' })], NOW))
      .toBe('1 decision is yours. Nothing here starts a build.');
  });

  it('always says that nothing starts a build, which is the page’s standing promise', () => {
    expect(queueHeadline([req()], NOW)).toContain('Nothing here starts a build.');
  });
});
