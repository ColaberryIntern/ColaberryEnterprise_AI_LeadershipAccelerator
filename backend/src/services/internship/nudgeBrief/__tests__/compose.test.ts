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

  /**
   * Someone waiting on a decision gets an ACKNOWLEDGEMENT and nothing else.
   *
   * This replaces a test that asserted the opposite, and the old behaviour is the reason:
   * the composer opened "Answering your message first.", quoted the intern's own email back at
   * them, and then never answered it, because the answer is a judgement and no judgement is in the
   * database. On 10 Nov 2026 Quincy received exactly that, with the quote cut off mid-word at
   * "the live expor" because `open_questions[].text` is a truncated snippet, followed by a
   * statistics dump and a presentation prompt he had not asked for.
   *
   * A short honest note that a person finishes beats a long one that looks complete and says
   * nothing.
   */
  describe('someone waiting on a decision', () => {
    const waiting = (over = {}) => composeBrief({
      intern: intern({
        first_name: 'Quincy',
        triage: { tier: 'blocked_waiting_on_ali', reason: 'waiting' },
        open_questions: [{ received_at: '2026-11-10T04:41:30.000Z', subject: 'PR #2 and the Aleem access', text: 'Should I wait for the platform sync and the live expor', kind: 'question' }],
        ...over,
      }),
      deadline: null,
      now: NOW,
    });

    it('names the question by subject and date, and says plainly it is unanswered', () => {
      const b = waiting();
      expect(b.body).toContain('"PR #2 and the Aleem access"');
      expect(b.body).toContain('still sitting with me and I have not answered it yet');
      expect(b.subject).toBe('Re: PR #2 and the Aleem access');
    });

    /** Never quote their own words back: the snippet is truncated and it reads as not listening. */
    it('does NOT quote the question text, which is a truncated snippet', () => {
      expect(waiting().body).not.toContain('Should I wait for the platform sync');
      expect(waiting().body).not.toContain('Answering your message first.');
    });

    it('does not staple on an artifact ask they never asked for', () => {
      expect(waiting().body).not.toContain('Demo Walkthrough');
      expect(waiting().body).not.toContain('The prompt is attached');
    });

    it('does not dump statistics at someone who is blocked on us', () => {
      const b = waiting();
      expect(b.body).not.toContain('Where you are:');
      expect(b.body).not.toContain('Training is at week');
    });

    /** The card has to say this out loud, or the row looks like an ordinary review. */
    it('warns that this one needs a human answer', () => {
      expect(waiting().warnings.join(' ')).toContain('needs YOUR answer');
    });

    it('stays short enough to be finished by hand', () => {
      expect(waiting().body.length).toBeLessThan(600);
    });
  });

  /**
   * `most_urgent` and its overflow are written for Ali's dashboard, ABOUT the intern. Pasting them
   * into a message addressed TO the intern flips the audience: Quincy, who was waiting on Ali, was
   * told "You owe a reply".
   */
  it('never addresses dashboard items to the intern', () => {
    for (const tier of ['overdue_backlog', 'quiet', 'on_track', 'no_project_at_day_N'] as TriageTier[]) {
      const b = composeBrief({
        intern: intern({
          triage: { tier, reason: 'because' },
          most_urgent: { kind: 'reply', label: 'You owe a reply', detail: 'The Capability Map (0d waiting)' },
          most_urgent_overflow: [{ kind: 'next', label: 'Up next', detail: 'Agent watch R2' } as never],
        }),
        deadline: null,
        now: NOW,
      });
      expect(b.body).not.toContain('What the platform has against your name');
      expect(b.body).not.toContain('You owe a reply');
    }
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

/**
 * Nothing in a message to an intern may be written ABOUT them.
 *
 * On 10 Nov 2026 ten of thirteen live briefs opened with the dashboard narrative, in the third
 * person: "Quincy, Quincy is well underway on Platform Automation and Reliability ... Their last
 * build work was 3 days ago." Same root cause as the dashboard lines removed alongside it.
 */
describe('the message is written TO the intern, never about them', () => {
  const tiers: TriageTier[] = ['no_project_at_day_N', 'never_started_building', 'overdue_backlog', 'quiet', 'on_track', 'blocked_waiting_on_ali'];

  it('never refers to the intern in the third person', () => {
    for (const tier of tiers) {
      const b = composeBrief({
        intern: intern({
          first_name: 'Quincy', name: 'Quincy Nkwain Ninying',
          narrative: 'Quincy is well underway on Platform Automation. Their last build work was 3 days ago.',
          triage: { tier, reason: 'because' },
        }),
        deadline: null,
        now: NOW,
      });
      const afterGreeting = b.body.slice(b.body.indexOf('\n'));
      expect(afterGreeting).not.toContain('Quincy is');
      expect(afterGreeting).not.toMatch(/\bTheir\b/);
      expect(b.body).not.toContain('well underway');
    }
  });

  /** The facts the narrative carried are already said in the second person, so nothing is lost. */
  it('still says where they are, addressed to them', () => {
    const b = composeBrief({ intern: intern({ triage: { tier: 'on_track', reason: 'fine' } }), deadline: null, now: NOW });
    expect(b.body).toContain('Where you are:');
  });
});
