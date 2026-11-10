import { findPromises, DEADLINE_LEADS_WITHIN_DAYS } from '../compose';
import { daysUntil } from '../deadline';
import type { SidecarIntern } from '../../portfolioReport/sidecar/types';

const NOW = new Date('2026-11-10T12:00:00Z');

function intern(over: Partial<SidecarIntern> = {}): SidecarIntern {
  return {
    name: 'Omolola Makinde', first_name: 'Omolola', enrollment_id: 'e1',
    track: 'gov', track_label: 'Saratoga Springs RFP', link: null, day: 50,
    status: { key: 'attention', label: 'Needs attention' }, chips: [],
    narrative: 'Nearly complete on the Saratoga build.', narrative_from_model: false, story: '',
    project: { name: 'Saratoga Springs RFP', id: 'p1', kind: 'gov', repo_url: null, command_center_url: null, stage: 'discovery' },
    stories_verified: 16, stories_total: 17, percent_built: 91, overdue_tasks: 6,
    training: { weeks_completed: 0, weeks_total: 12, gate_cleared: false, gate_done: 0, gate_of: 3 },
    days_since_build_work: 4, build_work_in_window: true,
    counts: { verified: 10, commits: 11, asks: 2, blockers: 1, replies_from_ali: 4, stuck_events: 2, training_days: 12 },
    most_urgent: { kind: 'late', label: 'Late', detail: 'Record Your Project Introduction' },
    most_urgent_overflow: [], timeline: [], asking_you: [], asking_you_from_model: false,
    open_questions: [], nudge: 'Clear the overdue first.', artifacts: [],
    artifacts_raw_count: 0, artifacts_real_count: 0,
    asks: [{ key: 'demo_walkthrough', name: 'Demo Walkthrough', why: 'because', prompt: 'PROMPT BODY', nudge: 'Could you put together a Demo Walkthrough.' }],
    triage: { tier: 'overdue_backlog', reason: '6 tasks are past their due date.' },
    pacing: { day: 50, program_day_total: 84, program_day_total_basis: null, expected_training_week: 7, expected_basis: 'day_count', actual_training_week: 0, weeks_behind: 7 },
    last_ask: null, delta: null,
    ...over,
  } as SidecarIntern;
}

describe('findPromises', () => {
  it('surfaces a dated commitment from our own last outbound', () => {
    const p = findPromises(intern({
      last_ask: {
        sent_at: '2026-11-09T19:49:37.000Z', from: 'ali@colaberry.com', subject: 'Re: R2',
        body_text: 'Your method is right. I am getting you the exact answer, by Tuesday. Do not write the rules yet.',
        body_truncated: false, satisfied: null, satisfied_by: null,
      },
    }));
    expect(p).toHaveLength(1);
    expect(p[0].quote).toContain('by Tuesday');
  });

  it('returns nothing when the last outbound makes no dated commitment', () => {
    expect(findPromises(intern({
      last_ask: {
        sent_at: '2026-11-09T19:49:37.000Z', from: 'ali@colaberry.com', subject: 'Re: R2',
        body_text: 'Read, and it is the strongest case study on the board.',
        body_truncated: false, satisfied: null, satisfied_by: null,
      },
    }))).toEqual([]);
  });
});

describe('daysUntil', () => {
  it('counts whole days and is 0 on the due date', () => {
    expect(daysUntil('2026-11-12', NOW)).toBe(2);
    expect(daysUntil('2026-11-10', NOW)).toBe(0);
    expect(daysUntil('2026-11-08', NOW)).toBe(-2);
  });

  it('keeps a two week deadline inside the window that makes it lead', () => {
    expect(daysUntil('2026-11-24', NOW)).toBeLessThanOrEqual(DEADLINE_LEADS_WITHIN_DAYS);
  });
});
