import { composeBrief, findPromises, DEADLINE_LEADS_WITHIN_DAYS } from '../compose';
import { daysUntil } from '../deadline';
import { briefProblems, TIER_RANK } from '../types';
import type { SidecarIntern, TriageTier } from '../../portfolioReport/sidecar/types';

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

describe('composeBrief', () => {
  it('leads with days remaining when a case study deadline is close, not with the tier', () => {
    const b = composeBrief({
      intern: intern(),
      deadline: { what: 'case study package', dueOn: '2026-11-12', daysLeft: 2, outstanding: ['Record Your Project Introduction', 'Record Your Working-System Demo'] },
      now: NOW,
    });
    expect(b.subject).toBe('2 days to your case study package');
    expect(b.body.startsWith('Omolola,')).toBe(true);
    // American order, matching the house style for everything that goes to a student.
    expect(b.body).toContain('2 days. Your case study package is due on November 12.');
    expect(b.body).toContain('Record Your Working-System Demo');
  });

  it('falls back to the tier when there is no deadline', () => {
    const b = composeBrief({ intern: intern(), deadline: null, now: NOW });
    expect(b.subject).toContain('overdue');
    expect(b.body).toContain('6 tasks are past their due date.');
  });

  it('answers the question first for someone waiting on a reply', () => {
    const b = composeBrief({
      intern: intern({
        first_name: 'Mihret',
        triage: { tier: 'blocked_waiting_on_ali', reason: 'waiting' },
        open_questions: [{ received_at: '2026-11-10T04:41:30.000Z', subject: 'PR #2 and the Aleem access', text: 'Should I wait for the platform sync?', kind: 'question' }],
      }),
      deadline: null,
      now: NOW,
    });
    expect(b.body).toContain('Answering your message first.');
    expect(b.body.indexOf('Should I wait for the platform sync?')).toBeLessThan(b.body.indexOf('Demo Walkthrough'));
    expect(b.subject).toBe('Re: PR #2 and the Aleem access');
  });

  it('does not put a day-50 no-project intern in the same shape as a quiet builder', () => {
    const noProject = composeBrief({ intern: intern({ project: null, triage: { tier: 'no_project_at_day_N', reason: 'Day 50 with no project.' } }), deadline: null, now: NOW });
    const quiet = composeBrief({ intern: intern({ triage: { tier: 'quiet', reason: 'No commit in 5 days.' } }), deadline: null, now: NOW });
    expect(noProject.body).toContain('do not have a project yet');
    expect(quiet.body).not.toContain('do not have a project yet');
    expect(TIER_RANK.no_project_at_day_N).toBeLessThan(TIER_RANK.quiet);
  });

  it('never produces a body the sender would refuse', () => {
    const tiers: TriageTier[] = ['no_project_at_day_N', 'never_started_building', 'blocked_waiting_on_ali', 'overdue_backlog', 'quiet', 'on_track'];
    for (const tier of tiers) {
      const b = composeBrief({ intern: intern({ triage: { tier, reason: 'because' } }), deadline: null, now: NOW });
      expect(briefProblems(b.body)).toEqual([]);
    }
  });

  it('warns rather than asserts when the project carries no repository URL', () => {
    const b = composeBrief({ intern: intern(), deadline: null, now: NOW });
    expect(b.warnings.join(' ')).toContain('github_connections');
  });

  it('is deterministic: the same intern composes byte-identical twice', () => {
    const i = intern();
    expect(composeBrief({ intern: i, deadline: null, now: NOW }).body)
      .toBe(composeBrief({ intern: i, deadline: null, now: NOW }).body);
  });

  it('attaches the ask prompt as a .md rather than pasting it into the body', () => {
    const b = composeBrief({ intern: intern(), deadline: null, now: NOW });
    expect(b.attachment).toEqual({ filename: 'demo-walkthrough.md', prompt: 'PROMPT BODY' });
    expect(b.body).not.toContain('PROMPT BODY');
    expect(b.body).toContain('demo-walkthrough.md');
  });
});

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
